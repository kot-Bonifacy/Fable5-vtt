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
 * Obwódka jest kreską o szerokości `RING_WIDTH`, więc zajmuje pas
 * `[extent/2 − RING_WIDTH, extent/2]` — dokładnie tyle, ile zostaje między
 * przyciętym portretem a krawędzią kratki.
 */
export function ownerRingRadius(extent: number): number {
  return extent / 2 - RING_WIDTH / 2;
}

/**
 * Dokąd sięga sam portret — promień maski, którą przycina się grafikę figury.
 *
 * Kończy się **tam, gdzie zaczyna się obwódka**, nie pod nią: pytanie „czy
 * któryś z okręgów zasłania avatara" ma mieć jedną, sprawdzalną odpowiedź
 * (pyta o to `token-ring.test.ts`). Grafika jest przycinana do tego koła, więc
 * wszystko, co leży dalej, leży na mapie, a nie na twarzy.
 */
export function portraitRadius(extent: number): number {
  return ownerRingRadius(extent) - RING_WIDTH / 2;
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
 * Koło portretu ma promień `extent / 2` (obwódka kończy się dokładnie na
 * krawędzi kratki), więc wszystko powyżej tej liczby jest już na zewnątrz
 * avatara — i o to w tej zmianie chodziło.
 */
export function hpRingRadius(extent: number): number {
  return extent / 2 + hpRingGap(extent) + hpRingWidth(extent) / 2;
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
  if (!hasHp) return extent / 2 - RING_WIDTH / 2;
  return hpRingRadius(extent) + hpRingWidth(extent) / 2 + hpRingCasing(extent);
}
