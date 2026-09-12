/**
 * Geometria oprawy żetonu: obrączka punktów wytrzymałości i to, co się o nią
 * opiera (zlecenie MG, 12.09.2026).
 *
 * Osobno od `TokenNode`, z tego samego powodu, co `camera.ts` osobno od
 * renderera: to czysta arytmetyka, a `TokenNode` ciągnie za sobą całe Pixi.
 * Tutaj da się ją sprawdzić liczbami, a tam zostaje samo rysowanie.
 *
 * Decyzja, która trzyma cały ten plik: **obrączka leży poza portretem.** Do
 * 12.09 biegła wewnątrz obwódki właściciela, czyli po samym brzegu twarzy —
 * i tę twarz zasłaniała. MG wybrał wypchnięcie paska na zewnątrz, wprost ze
 * świadomością ceny: figura wystaje wtedy poza swoją kratkę o szerokość paska,
 * więc dwie stojące ramię w ramię potrafią się obrączkami zetknąć. Odrzucony
 * wariant — zwężenie portretu tak, by pasek zmieścił się w kratce — kosztowałby
 * ~12% średnicy twarzy na każdej figurze, także tej bez PW.
 */

/** Szerokość obwódki właściciela; liczona tu, bo od niej zaczyna się oprawa. */
export const RING_WIDTH = 3;

/**
 * Promień **osi** obwódki właściciela (zielona/niebieska/czerwona).
 *
 * Od 12.09 (druga poprawka tego dnia, zlecenie MG) obwódka leży **poza**
 * portretem: zajmuje pas `[extent/2, extent/2 + RING_WIDTH]`, czyli wysuwa się
 * poza kratkę dokładnie o własną grubość — tę samą znaną liczbę, o której MG
 * napisał wprost. Powód jest ten sam, dla którego wcześniej tego dnia wyjechał
 * pasek PW: kreska rysowana po brzegu twarzy zjadała górne piksele portretu
 * i kadru nie dało się do nich dowieźć.
 */
export function ownerRingRadius(extent: number): number {
  return extent / 2 + RING_WIDTH / 2;
}

/**
 * Dokąd sięga sam portret — promień maski, którą przycina się grafikę figury.
 *
 * **Równo połowa kratki**, bo obwódka zeszła na zewnątrz: krążek portretu jest
 * dokładnie tym kołem, które kadr obiecuje pokazać, i nic już na nim nie leży.
 * Pytanie „czy któryś z okręgów zasłania avatara" ma jedną, sprawdzalną
 * odpowiedź — pyta o to `token-ring.test.ts`.
 */
export function portraitRadius(extent: number): number {
  return extent / 2;
}

/** Szerokość obrączki PW w pikselach świata. */
export function hpRingWidth(extent: number): number {
  return Math.max(4, extent * 0.07);
}

/**
 * Grubość ciemnej koszulki po każdej stronie obrączki.
 *
 * Pasek wyjechał poza figurę, czyli wprost na rysunek mapy — a ten bywa
 * i czarny, i rdzawy, i piaskowy. Bez obrysu zielone na jasnym betonie
 * przestaje być paskiem, a zaczyna być plamą.
 */
export function hpRingCasing(extent: number): number {
  return Math.max(1, extent * 0.015);
}

/** Prześwit między obwódką właściciela a obrączką — żeby nie zlały się w jedną. */
export function hpRingGap(extent: number): number {
  return Math.max(1, extent * 0.02);
}

/**
 * Promień **osi** obrączki PW: tuż za obwódką właściciela, z prześwitem.
 *
 * Obwódka kończy się na `extent / 2 + RING_WIDTH` (od 12.09 leży poza
 * portretem), więc pasek zaczyna się dopiero za nią — inaczej zjadłby prześwit
 * i obie kreski zlałyby się w jedną grubą obręcz.
 */
export function hpRingRadius(extent: number): number {
  return extent / 2 + RING_WIDTH + hpRingGap(extent) + hpRingWidth(extent) / 2;
}

/**
 * Dokąd sięga cała oprawa figury — obrączka z koszulką, a bez niej sama
 * obwódka właściciela.
 *
 * Czytają to trzy rysunki naraz i każdy z innego powodu: aureola tury musi
 * zostać *na zewnątrz* paska (leży pod nim w kolejności rysowania, więc pasek
 * by ją zamalował), klin kierunku musi się za paskiem *zaczynać* (leży nad nim,
 * więc wycinałby w nim dziurę), a podpis figury musi zejść *pod* niego.
 */
export function furnitureRadius(extent: number, hasHp: boolean): number {
  if (!hasHp) return extent / 2 + RING_WIDTH;
  return hpRingRadius(extent) + hpRingWidth(extent) / 2 + hpRingCasing(extent);
}

/**
 * Promień okienka, które **własna** figura gracza wycina w mgle wojny
 * (zlecenie MG, 12.09.2026).
 *
 * Serwer od 17a obiecuje jedno: „gracz nigdy nie traci swojej postaci z mapy"
 * — `concealedFrom` zwalnia z filtra mgły każdego, kto steruje figurą. Renderer
 * tej obietnicy nie dotrzymywał: `fogSprite` leży nad warstwą żetonów i przy
 * scenie `fog` bez odsłoniętych kształtów jest czarny i nieprzezroczysty, więc
 * zamalowywał figurę razem z mapą. Gracz wchodził na scenę i widział czerń,
 * mimo że jego kamera była wykadrowana dokładnie na nim.
 *
 * MG wybrał wielkość okienka wprost: **krąg mniej więcej trzech kratek**, czyli
 * promień półtorej. Nie sama figura — gracz ma widzieć, na co wchodzi — ale też
 * nie pół pokoju: mgła zostaje wszędzie indziej i dalej należy do MG.
 *
 * Argumentem jest `furniture`, czyli to samo „dokąd sięga figura", które liczy
 * `furnitureRadius` — okienko nigdy nie bywa ciaśniejsze niż sama figura
 * z oprawą i pół kratki zapasu, co ma znaczenie dla żetonu 4 × 4.
 */
export const FOG_PEEP_GRID_RADIUS = 1.5;

export function fogPeepRadius(furniture: number, gridSizePx: number): number {
  // Dzielenie przez `FOG_PEEP_CORE_RATIO` jest tu sednem: zanik brzegu ma
  // zaczynać się **za** figurą, więc to promień pełnego wycięcia (figura
  // z oprawą i ćwierć kratki zapasu) wyznacza, dokąd sięga całe okienko.
  // Bez tego żeton 2 × 2 i większy oglądałby własne brzegi przez mgłę.
  const core = furniture + gridSizePx / 4;
  return Math.max(gridSizePx * FOG_PEEP_GRID_RADIUS, core / FOG_PEEP_CORE_RATIO);
}

/**
 * Dokąd sięga **pełne** wycięcie, zanim zacznie się zanik brzegu — ułamek
 * promienia okienka.
 *
 * Pierwsza wersja rozmywała brzeg pierścieniami o malejącej sile i MG odrzucił
 * to od razu: przy pięciu stopniach widać było **koncentryczne okręgi**, czyli
 * dokładnie to, czego rozmycie miało nie robić. Zanik idzie więc tą samą drogą,
 * co światło i pamięć mapy z 18b/18c — gradientem wypalonym na kanwie — a stąd
 * zostaje sama liczba: do trzech czwartych promienia mgły nie ma wcale, dalej
 * gaśnie gładko do zera na samym brzegu.
 */
export const FOG_PEEP_CORE_RATIO = 0.75;
