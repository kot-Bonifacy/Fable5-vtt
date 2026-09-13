import { useEffect, type ReactNode } from 'react';
import {
  ROLE_GM,
  sceneObjectAccusative,
  type CoverView,
  type DefenseZoneView,
  type DrawingView,
  type LightView,
  type MapNoteView,
  type NetAccessPointView,
  type SceneObjectKind,
  type SceneObjectRef,
  type WallView,
} from '@vtt/shared';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCoverStore } from '../stores/coverStore.js';
import { useDrawingStore } from '../stores/drawingStore.js';
import { useLightStore } from '../stores/lightStore.js';
import { useNetRunStore } from '../stores/netRunStore.js';
import { useNoteStore } from '../stores/noteStore.js';
import { useSceneCardStore } from '../stores/sceneCardStore.js';
import { useWallStore } from '../stores/wallStore.js';
import { useZoneStore } from '../stores/zoneStore.js';
import { SceneCardCover } from './SceneCardCover.js';
import { SceneCardDrawing } from './SceneCardDrawing.js';
import { SceneCardLight } from './SceneCardLight.js';
import { SceneCardNetPoint } from './SceneCardNetPoint.js';
import { SceneCardNote } from './SceneCardNote.js';
import { SceneCardWall } from './SceneCardWall.js';
import { SceneCardZone } from './SceneCardZone.js';
import { IconLamp, IconSocket, IconWall, IconCover, IconPencil, IconPin } from './MapIcons.js';

/**
 * Karta obiektu sceny — jedno okno na siedem rodzajów (etap 27l).
 *
 * 27k dało **jeden gest** na wszystko, co stoi na mapie („warstwa → klik →
 * `Delete`"); to jest **jedno miejsce**, w którym się to coś ogląda i zmienia.
 * Do tej sesji karty miały trzy różne domy i cztery rodzaje obiektów nie miały
 * karty w ogóle: właściwości ściany, osłony, światła i rysunku ustawiało się
 * **zanim** się je postawiło, a po fakcie zostawało kasowanie i stawianie od
 * nowa.
 *
 * Okno jest jedno i ma jeden klucz w `useWindowPlacement`: karta lampy otwiera
 * się tam, gdzie MG zostawił kartę ściany. To jest celowe — „to samo okno" z
 * kryteriów etapu znaczy także „to samo miejsce na ekranie", a karta obiektu
 * jest z natury czymś, co się otwiera i zamyka dziesiątki razy w jednej sesji
 * przygotowań.
 *
 * Kosz mówi tym samym zdaniem, co `Delete` z 27k, bo to jest ta sama droga:
 * `deleteSceneObject` w `MapArea`. Karta nie kasuje sama — umowa kodu z 27k
 * mówi, że jest **jedna** droga usuwania obiektu ze sceny.
 */

const ICONS: Record<SceneObjectKind, ReactNode> = {
  wall: <IconWall />,
  cover: <IconCover />,
  zone: <span aria-hidden>⚠</span>,
  light: <IconLamp />,
  netpoint: <IconSocket />,
  note: <IconPin />,
  drawing: <IconPencil />,
};

export interface SceneObjectCardProps {
  /**
   * Kasowanie idzie tą samą drogą, którą idzie `Delete` — funkcja przychodzi
   * z `MapArea`, żeby nie było drugiego miejsca, które wie, jak usunąć obiekt
   * ze sceny (umowa kodu z 27k).
   */
  onDelete: (ref: SceneObjectRef) => void;
}

export function SceneObjectCard({ onDelete }: SceneObjectCardProps) {
  const open = useSceneCardStore((s) => s.open);
  const noteDraft = useSceneCardStore((s) => s.noteDraft);
  const close = useSceneCardStore((s) => s.close);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;

  const walls = useWallStore((s) => s.walls);
  const covers = useCoverStore((s) => s.covers);
  const zones = useZoneStore((s) => s.zones);
  const lights = useLightStore((s) => s.lights);
  const points = useNetRunStore((s) => s.accessPoints);
  const notes = useNoteStore((s) => s.notes);
  const drawings = useDrawingStore((s) => s.drawings);

  const placement = useWindowPlacement('scene-object', () => ({
    x: Math.max(12, window.innerWidth - 380),
    y: 96,
  }));

  /**
   * Obiekt spod otwartej karty razem z tym, co ramka musi o nim wiedzieć.
   *
   * `switch` po `SceneObjectKind` zamiast drabinki warunków, bo kompilator
   * pilnuje na nim kompletu — ósmy rodzaj dopisany do `SCENE_OBJECT_KINDS` nie
   * skompiluje się, dopóki nie dostanie tu swojej karty. To jest ten sam
   * mechanizm, którym 27k wymusza kompletność kasowania.
   */
  function findSceneObject(
    ref: SceneObjectRef,
  ): { title: string; body: ReactNode; canDelete: boolean } | null {
    switch (ref.kind) {
      case 'wall': {
        const wall = walls.find((entry) => entry.id === Number(ref.id));
        return wall && isGm
          ? { title: wallTitle(wall), body: <SceneCardWall wall={wall} />, canDelete: true }
          : null;
      }
      case 'cover': {
        const cover: CoverView | undefined = covers.find((entry) => entry.id === Number(ref.id));
        return cover && isGm
          ? { title: cover.name, body: <SceneCardCover cover={cover} />, canDelete: true }
          : null;
      }
      case 'zone': {
        const zone: DefenseZoneView | undefined = zones.find(
          (entry) => entry.id === Number(ref.id),
        );
        return zone && isGm
          ? { title: zone.name, body: <SceneCardZone zone={zone} />, canDelete: true }
          : null;
      }
      case 'light': {
        const light: LightView | undefined = lights.find((entry) => entry.id === Number(ref.id));
        return light && isGm
          ? {
              title: light.enabled ? 'Światło' : 'Światło (zgaszone)',
              body: <SceneCardLight light={light} />,
              canDelete: true,
            }
          : null;
      }
      case 'netpoint': {
        const point: NetAccessPointView | undefined = points.find(
          (entry) => entry.id === Number(ref.id),
        );
        // Jedyna karta, którą widzi **gracz** — „podłączyć się?" jest pytaniem
        // do niego. Kosza nie dostaje: gniazd nie kasuje nikt poza MG.
        return point
          ? {
              title: point.name,
              body: <SceneCardNetPoint point={point} onClose={close} />,
              canDelete: isGm,
            }
          : null;
      }
      case 'note': {
        const note: MapNoteView | undefined = notes[String(ref.id)];
        return note && isGm
          ? {
              title: 'Notatka MG',
              body: <SceneCardNote note={note} onClose={close} />,
              canDelete: true,
            }
          : null;
      }
      case 'drawing': {
        const drawing: DrawingView | undefined = drawings[Number(ref.id)];
        if (!drawing) return null;
        // Ta sama reguła, którą wymusza serwer: swoje kreski są twoje, mapa
        // należy do MG.
        const mine = drawing.authorId === user?.id;
        return {
          title: drawingTitle(drawing),
          body: <SceneCardDrawing drawing={drawing} />,
          canDelete: isGm || mine,
        };
      }
    }
  }

  const found = open ? findSceneObject(open) : null;

  // Obiekt zniknął spod otwartej karty — skasował go drugi MG, przyszedł
  // `Ctrl+Z`, albo scena się przełączyła. Karta bez obiektu nie ma czego
  // pokazać, więc zamyka się sama, zamiast zostawać pustą ramką.
  useEffect(() => {
    if (open && !found) close();
  }, [open, found, close]);

  if (noteDraft) {
    return (
      <CardFrame
        placement={placement}
        kind="note"
        icon={ICONS.note}
        title="Nowa notatka MG"
        onClose={close}
        body={<SceneCardNote draft={noteDraft} onClose={close} />}
      />
    );
  }

  if (!open || !found) return null;

  return (
    <CardFrame
      key={`${open.kind}:${open.id}`}
      placement={placement}
      kind={open.kind}
      icon={ICONS[open.kind]}
      title={found.title}
      onClose={close}
      onDelete={found.canDelete ? () => onDelete(open) : undefined}
      deleteLabel={`Usuń ${sceneObjectAccusative(open.kind)} ze sceny — Ctrl+Z cofa`}
      body={found.body}
    />
  );
}

const WALL_TITLES: Record<WallView['kind'], string> = {
  wall: 'Ściana',
  door: 'Drzwi',
  window: 'Okno',
  barrier: 'Bariera',
  gate: 'Brama',
};

function wallTitle(wall: WallView): string {
  if (wall.kind === 'wall' || wall.kind === 'barrier') return WALL_TITLES[wall.kind];
  // „Brama" is the one feminine opening; „drzwi" and „okno" share the -e.
  const state =
    wall.kind === 'gate'
      ? wall.open
        ? 'otwarta'
        : 'zamknięta'
      : wall.open
        ? 'otwarte'
        : 'zamknięte';
  return `${WALL_TITLES[wall.kind]} — ${state}`;
}

const DRAWING_TITLES: Record<DrawingView['shape']['kind'], string> = {
  path: 'Kreska',
  rect: 'Prostokąt',
  ellipse: 'Elipsa',
  text: 'Etykieta',
};

function drawingTitle(drawing: DrawingView): string {
  if (drawing.shape.kind === 'text') return `Etykieta „${drawing.shape.text}”`;
  return DRAWING_TITLES[drawing.shape.kind];
}

/**
 * Ramka: belka do przeciągania, ✕, treść i stopka z koszem. Jedna dla
 * wszystkich siedmiu kart — to jest dosłownie zdanie „to samo okno, to samo
 * zamykanie" z kryteriów etapu, zapisane raz.
 */
function CardFrame({
  placement,
  kind,
  icon,
  title,
  body,
  onClose,
  onDelete,
  deleteLabel,
}: {
  placement: ReturnType<typeof useWindowPlacement>;
  kind: SceneObjectKind;
  icon: ReactNode;
  title: string;
  body: ReactNode;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <section
      ref={placement.ref}
      className="scene-card"
      data-kind={kind}
      style={placement.style}
      aria-label={`Karta obiektu: ${title}`}
      onKeyDown={(event) => {
        // `Esc` **z wnętrza karty**, bo globalna drabina go tam nie dostaje:
        // pierwszy warunek jej obsługi odrzuca każdy klawisz naciśnięty w polu
        // tekstowym, a karta notatki sama ustawia kursor w treści. Do 27l robił
        // to własny listener `NoteEditor`; po scaleniu kart musiał trafić tutaj,
        // inaczej notatki nie dało się zamknąć klawiszem (błąd znaleziony przy
        // oględzinach 24.08).
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="scene-card-header" {...placement.dragProps}>
        <span className="scene-card-icon" aria-hidden>
          {icon}
        </span>
        <span className="scene-card-title">{title}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={onClose}
          title="Zamknij kartę (Esc)"
          aria-label="Zamknij kartę"
        >
          ✕
        </button>
      </div>
      <div className="scene-card-body">{body}</div>
      {onDelete && (
        <div className="scene-card-foot">
          <button
            type="button"
            className="small-button character-delete"
            title={deleteLabel}
            onClick={onDelete}
          >
            Usuń
          </button>
          <span className="scene-card-hint">…albo klawisz Delete. Ctrl+Z cofa.</span>
        </div>
      )}
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
