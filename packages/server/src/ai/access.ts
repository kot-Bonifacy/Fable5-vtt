import type { AiAccessReason, AiStatus, RulesIndexStatus } from '@vtt/shared';
import {
  aiAccessReasonText,
  emptyRulesIndexStatus,
  journalCollection,
  knowledgeCollection,
  publicAiStatus,
} from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type {
  AiChatRequest,
  AiGateway,
  AiStreamEvent,
  RagCollectionStats,
  RagDocumentInput,
  RagResult,
  RagSearchFilter,
  RulesSearchResult,
} from './gateway.js';

/**
 * AI właściciela (etap 44d): kto i kiedy może pytać gateway.
 *
 * Gateway stoi na PC właściciela serwera i obsługuje jedną kampanię naraz.
 * **Prawo do AI** ma kampania z konta MG właściciela (zawsze) albo kampania MG,
 * który spełnia trzy warunki naraz: zgoda właściciela (`User.aiAccess`),
 * włączony przełącznik „Udostępniam AI” i obecny właściciel (gniazdo któregoś
 * konta z flagą albo karencja po ostatnim). **Dzierżawę** trzyma jedna
 * trwająca sesja: pierwsza uprawniona, aż do końca albo utraty prawa; potem
 * następna. Kampania w przygotowaniu (bez sesji) dostaje pojedyncze żądania
 * tylko wtedy, gdy AI nikt nie trzyma (decyzja MG z 04.10).
 *
 * Przełącznik, obecność i dzierżawa są w pamięci procesu: restart i każde nowe
 * wejście właściciela po karencji zaczynają od „nie udostępniam”.
 *
 * Każde żądanie do gatewaya idzie przez `forCampaign(id)` — kod gry nie ma
 * dostępu do `AiGateway` inaczej niż przez tę bramę.
 */

/** Kampania w pamięci bramy — przeładowana przez `refresh()`. */
export interface AiCampaignEntry {
  id: string;
  name: string;
  gmLogin: string;
  /** Kampania z konta MG właściciela: AI bez zgody, przełącznika i obecności. */
  ownerCampaign: boolean;
  /** MG kampanii ma zgodę właściciela (i nie jest zablokowany). */
  granted: boolean;
  /** Start trwającej sesji (ms) albo null — przygotowanie. */
  sessionStartedAt: number | null;
}

export interface AiAccessOptions {
  /** Karencja po zniknięciu ostatniego gniazda właściciela (decyzja MG: 2 min). */
  ownerGraceMs: number;
  /** Własny limit generacji, gdy wołający nie podał sygnału (`AI_TIMEOUT`, #46). */
  requestTimeoutMs: number;
}

/** Warunki prawa do AI poza dzierżawą; null — kampania ma prawo. */
export function aiEntitlement(
  entry: AiCampaignEntry,
  state: { sharing: boolean; ownerPresent: boolean },
): AiAccessReason | null {
  if (entry.ownerCampaign) return null;
  if (!entry.granted) return 'no-consent';
  if (!state.ownerPresent) return 'owner-absent';
  if (!state.sharing) return 'sharing-off';
  return null;
}

/**
 * Kto trzyma AI po zmianie: obecny posiadacz, dopóki jego sesja trwa i ma
 * prawo; inaczej najwcześniej rozpoczęta uprawniona sesja (decyzja MG 11).
 */
export function pickLeaseHolder(
  entries: Iterable<AiCampaignEntry>,
  current: string | null,
  entitled: (entry: AiCampaignEntry) => boolean,
): string | null {
  const running = [...entries]
    .filter((entry) => entry.sessionStartedAt !== null && entitled(entry))
    .sort((a, b) => a.sessionStartedAt! - b.sessionStartedAt! || a.id.localeCompare(b.id));
  if (current && running.some((entry) => entry.id === current)) return current;
  return running[0]?.id ?? null;
}

/** Kto ogląda status — od tego zależy, ile się dowie. */
export interface AiStatusViewer {
  gm: boolean;
  owner: boolean;
}

export class AiAccess {
  private campaigns = new Map<string, AiCampaignEntry>();
  private sharing = false;
  private readonly ownerSockets = new Set<string>();
  private graceTimer: NodeJS.Timeout | null = null;
  private holder: string | null = null;
  private readonly streams = new Map<string, Set<AbortController>>();
  private readonly listeners = new Set<() => void>();
  private chain: Promise<void> = Promise.resolve();
  /** Nieznane id już raz zgłoszone do przeładowania — bez pętli odświeżeń. */
  private readonly missing = new Set<string>();

  constructor(
    private readonly prisma: PrismaClient,
    readonly gateway: AiGateway,
    private readonly options: AiAccessOptions,
  ) {}

  /* ---------------------------- stan ---------------------------- */

  /** Przeładowuje kampanie z bazy (sesje, zgody, właściciele) i liczy dzierżawę od nowa. */
  refresh(): Promise<void> {
    this.chain = this.chain
      .then(() => this.load())
      .catch(() => undefined)
      .then(() => this.recompute());
    return this.chain;
  }

  private async load(): Promise<void> {
    const rows = await this.prisma.campaign.findMany({
      select: {
        id: true,
        name: true,
        sessionStartedAt: true,
        gm: { select: { login: true, name: true, owner: true, aiAccess: true, blockedAt: true } },
      },
    });
    const next = new Map<string, AiCampaignEntry>();
    for (const row of rows) {
      next.set(row.id, {
        id: row.id,
        name: row.name,
        gmLogin: row.gm?.login ?? row.gm?.name ?? '',
        ownerCampaign: row.gm?.owner === true,
        granted: row.gm?.aiAccess === 'granted' && row.gm.blockedAt === null,
        sessionStartedAt: row.sessionStartedAt?.getTime() ?? null,
      });
    }
    this.campaigns = next;
    this.missing.clear();
  }

  ownerPresent(): boolean {
    return this.ownerSockets.size > 0 || this.graceTimer !== null;
  }

  sharingOn(): boolean {
    return this.sharing;
  }

  leaseHolder(): AiCampaignEntry | null {
    return this.holder ? (this.campaigns.get(this.holder) ?? null) : null;
  }

  /** Trwająca sesja z konta MG właściciela (najwyżej jedna — jeden MG, jedna sesja). */
  ownerSession(): AiCampaignEntry | null {
    for (const entry of this.campaigns.values()) {
      if (entry.ownerCampaign && entry.sessionStartedAt !== null) return entry;
    }
    return null;
  }

  /** Czy kampania może teraz pytać AI; null — może, inaczej powód (bez stanu gatewaya). */
  verdict(campaignId: string): AiAccessReason | null {
    const entry = this.campaigns.get(campaignId);
    if (!entry) {
      // Kampania założona po ostatnim przeładowaniu — odmowa teraz, prawda za chwilę.
      if (!this.missing.has(campaignId)) {
        this.missing.add(campaignId);
        void this.refresh();
      }
      return 'no-consent';
    }
    const denied = aiEntitlement(entry, {
      sharing: this.sharing,
      ownerPresent: this.ownerPresent(),
    });
    if (denied) return denied;
    if (entry.sessionStartedAt !== null) return this.holder === entry.id ? null : 'busy';
    return this.holder === null ? null : 'busy';
  }

  /** Status AI dla gniazda kampanii — `available` już po bramie, powód tylko dla MG. */
  statusFor(campaignId: string | null, viewer: AiStatusViewer): AiStatus {
    const base = this.gateway.getStatus();
    if (!campaignId) return viewer.gm ? base : publicAiStatus(base);
    const reason: AiAccessReason | null = base.available ? this.verdict(campaignId) : 'offline';
    const available = reason === null;
    if (!viewer.gm) return { ...publicAiStatus(base), available };
    const entry = this.campaigns.get(campaignId);
    // Diagnostyka PC właściciela (model, VRAM, błędy) — dla właściciela i MG ze zgodą.
    const diagnostics = viewer.owner || entry?.ownerCampaign === true || entry?.granted === true;
    return { ...(diagnostics ? base : publicAiStatus(base)), available, reason };
  }

  /* -------------------------- zmiany ---------------------------- */

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Gniazdo konta z flagą właściciela (dowolna rola) — obecność. */
  ownerConnected(socketId: string): void {
    const wasPresent = this.ownerPresent();
    this.ownerSockets.add(socketId);
    if (this.graceTimer) {
      // F5 w karencji: przełącznik zostaje, jak był.
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (!wasPresent) this.recompute();
  }

  ownerDisconnected(socketId: string): void {
    if (!this.ownerSockets.delete(socketId)) return;
    if (this.ownerSockets.size > 0 || this.graceTimer) return;
    this.graceTimer = setTimeout(() => this.expireGrace(), this.options.ownerGraceMs);
    this.graceTimer.unref?.();
  }

  /** Koniec karencji: właściciel zniknął na dobre, przełącznik gaśnie. */
  expireGrace(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    if (this.ownerSockets.size > 0) return;
    this.sharing = false;
    this.recompute();
  }

  setSharing(on: boolean): void {
    this.sharing = on;
    this.recompute();
  }

  /**
   * „Przejmij AI” (decyzja MG z 04.10): tylko dla trwającej sesji z konta MG
   * właściciela. Zgody tamtego MG nie cofa — jego sesja dostaje AI z powrotem,
   * gdy sesja właściciela się skończy.
   */
  takeOver(): 'NO_OWN_SESSION' | null {
    const own = this.ownerSession();
    if (!own) return 'NO_OWN_SESSION';
    this.holder = own.id;
    this.recompute();
    return null;
  }

  private recompute(): void {
    const state = { sharing: this.sharing, ownerPresent: this.ownerPresent() };
    this.holder = pickLeaseHolder(
      this.campaigns.values(),
      this.holder,
      (entry) => aiEntitlement(entry, state) === null,
    );
    // Odebranie AI w trakcie strumienia kończy się jak pad gatewaya: wołający
    // dostaje zdarzenie błędu, tura bota wraca do MG, stół gra dalej.
    for (const [campaignId, controllers] of this.streams) {
      const reason = this.verdict(campaignId);
      if (!reason) continue;
      for (const controller of controllers) controller.abort(reason);
    }
    for (const listener of this.listeners) listener();
  }

  stop(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.listeners.clear();
  }

  /* --------------------------- brama ---------------------------- */

  forCampaign(campaignId: string): CampaignAi {
    return new CampaignAi(this, campaignId);
  }

  /** @internal Rejestr strumieni kampanii — do przerwania po utracie prawa. */
  trackStream(campaignId: string, controller: AbortController): () => void {
    let set = this.streams.get(campaignId);
    if (!set) {
      set = new Set();
      this.streams.set(campaignId, set);
    }
    set.add(controller);
    return () => {
      set.delete(controller);
      if (set.size === 0) this.streams.delete(campaignId);
    };
  }

  /** @internal */
  get requestTimeoutMs(): number {
    return this.options.requestTimeoutMs;
  }
}

/** Odmowa RAG-u bramą — ten sam kształt co porażka gatewaya. */
function deniedRag(reason: AiAccessReason): {
  ok: false;
  error: { code: 'AI_UNAVAILABLE'; detail: string };
} {
  return { ok: false, error: { code: 'AI_UNAVAILABLE', detail: aiAccessReasonText(reason) } };
}

/**
 * Brama AI jednej kampanii — to samo API co `AiGateway`, ale każde żądanie
 * najpierw sprawdza prawo kampanii i dzierżawę. Odmowa nie wychodzi do
 * gatewaya wcale i wraca tym samym kształtem, co jego porażka
 * (`AI_UNAVAILABLE` z powodem po polsku).
 */
export class CampaignAi {
  constructor(
    private readonly access: AiAccess,
    readonly campaignId: string,
  ) {}

  /** Powód odmowy albo null (bez stanu gatewaya — ten mówi `getStatus`). */
  denial(): AiAccessReason | null {
    return this.access.verdict(this.campaignId);
  }

  /** Status po bramie, w widoku MG — serwer czyta z niego `available` i `contextSize`. */
  getStatus(): AiStatus {
    return this.access.statusFor(this.campaignId, { gm: true, owner: true });
  }

  /**
   * Kolekcja RAG-u tej kampanii albo wspólny podręcznik — nic innego. Druga
   * zapora obok nazw liczonych z `campaignId` w kodzie gry: zapytanie jednej
   * kampanii nie przeczyta cudzej pamięci ani bazy wiedzy.
   */
  private ownCollection(collection: string): boolean {
    return (
      collection === 'rulebook' ||
      collection === knowledgeCollection(this.campaignId) ||
      collection === journalCollection(this.campaignId)
    );
  }

  async *streamChat(request: AiChatRequest, signal?: AbortSignal): AsyncGenerator<AiStreamEvent> {
    const denied = this.denial();
    if (denied) {
      yield { type: 'error', code: 'AI_UNAVAILABLE', detail: aiAccessReasonText(denied) };
      return;
    }
    const lease = new AbortController();
    // Wołający bez sygnału („Graj turę”) dostaje własny limit — jak w gatewayu (#46).
    const timeout = signal ? null : AbortSignal.timeout(this.access.requestTimeoutMs);
    const combined = AbortSignal.any([signal ?? timeout!, lease.signal]);
    const release = this.access.trackStream(this.campaignId, lease);
    const lost = (): AiStreamEvent => ({
      type: 'error',
      code: 'AI_UNAVAILABLE',
      detail: aiAccessReasonText(lease.signal.reason as AiAccessReason),
    });
    const timedOut = (): AiStreamEvent => ({
      type: 'error',
      code: 'AI_TIMEOUT',
      detail: `${Math.round(this.access.requestTimeoutMs / 1000)} s`,
    });
    try {
      for await (const event of this.access.gateway.streamChat(request, combined)) {
        if (lease.signal.aborted && !signal?.aborted) {
          yield lost();
          return;
        }
        if (timeout?.aborted && event.type === 'error') {
          yield timedOut();
          return;
        }
        yield event;
      }
    } catch (error) {
      if (lease.signal.aborted && !signal?.aborted) {
        yield lost();
        return;
      }
      if (timeout?.aborted) {
        yield timedOut();
        return;
      }
      throw error;
    } finally {
      release();
    }
  }

  async countTokens(text: string): Promise<number | null> {
    if (this.denial()) return null;
    return this.access.gateway.countTokens(text);
  }

  async searchRules(
    question: string,
    topK: number,
    collection: string | string[] = 'rulebook',
    filter?: RagSearchFilter,
  ): Promise<RagResult<RulesSearchResult>> {
    const denied = this.denial();
    if (denied) return deniedRag(denied);
    const scope = (Array.isArray(collection) ? collection : [collection]).filter((name) =>
      this.ownCollection(name),
    );
    return this.access.gateway.searchRules(question, topK, scope, filter);
  }

  async indexDocuments(
    collection: string,
    documents: RagDocumentInput[],
  ): ReturnType<AiGateway['indexDocuments']> {
    const denied = this.denial();
    if (denied) return deniedRag(denied);
    if (!this.ownCollection(collection)) return deniedRag('no-consent');
    return this.access.gateway.indexDocuments(collection, documents);
  }

  async forgetDocuments(collection: string, sources: string[]): Promise<RagResult<number>> {
    const denied = this.denial();
    if (denied) return deniedRag(denied);
    if (!this.ownCollection(collection)) return deniedRag('no-consent');
    return this.access.gateway.forgetDocuments(collection, sources);
  }

  async forgetOrphans(collection: string, alive: Set<string>): Promise<number | null> {
    if (this.denial() || !this.ownCollection(collection)) return null;
    return this.access.gateway.forgetOrphans(collection, alive);
  }

  async collectionStatus(collection: string): Promise<RagCollectionStats> {
    const denied = this.denial() ?? (this.ownCollection(collection) ? null : 'no-consent');
    if (denied) {
      return {
        chunks: 0,
        documents: 0,
        indexedAt: null,
        ready: false,
        reason: aiAccessReasonText(denied),
      };
    }
    return this.access.gateway.collectionStatus(collection);
  }

  async rulesStatus(): Promise<RulesIndexStatus> {
    const denied = this.denial();
    if (denied) return { ...emptyRulesIndexStatus(), reason: aiAccessReasonText(denied) };
    return this.access.gateway.rulesStatus();
  }

  async indexRulebook(): ReturnType<AiGateway['indexRulebook']> {
    const denied = this.denial();
    if (denied) return deniedRag(denied);
    return this.access.gateway.indexRulebook();
  }
}
