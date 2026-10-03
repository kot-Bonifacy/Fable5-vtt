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

/**
 * Najcieńsza obwódka właściciela — figura bez PW i podgląd kadru. Z obrączką PW
 * obwódka ma szerokość paska (`ownerRingWidth`).
 */
export const RING_WIDTH = 3;

/**
 * Szerokość obwódki właściciela.
 *
 * Od 03.10 (#71, decyzja MG) obwódka z obrączką PW jest tak gruba jak pasek
 * i leży **na zewnątrz** niego. Do tej pory była trzypikselową kreską pod
 * zielonym paskiem i przy stole nie dało się odróżnić figury NPC od figury
 * gracza — wróg i sojusznik nosili tę samą zieloną obrączkę.
 */
export function ownerRingWidth(extent: number, hasHp: boolean): number {
  return hasHp ? Math.max(RING_WIDTH, hpRingWidth(extent)) : RING_WIDTH;
}

/**
 * Promień **osi** obwódki właściciela (zielona/niebieska/czerwona).
 *
 * Bez obrączki PW obwódka leży tuż **poza** portretem (12.09, zlecenie MG):
 * zajmuje pas `[extent/2, extent/2 + RING_WIDTH]`. Z obrączką — od 03.10 (#71)
 * — dopiero za paskiem i jego koszulką: kolor „czyja figura” jest najdalej od
 * twarzy, więc czyta się pierwszy, a pasek PW dalej dotyka portretu.
 */
export function ownerRingRadius(extent: number, hasHp = false): number {
  const inner = hasHp
    ? hpRingRadius(extent) + hpRingWidth(extent) / 2 + hpRingCasing(extent)
    : extent / 2;
  return inner + ownerRingWidth(extent, hasHp) / 2;
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

/**
 * Promień **osi** obrączki PW: tuż za portretem, za ciemną koszulką.
 *
 * Od 03.10 (#71) pasek leży bliżej twarzy niż obwódka właściciela — koszulka
 * zaczyna się na brzegu maski portretu, a obwódka siada na zewnątrz paska.
 */
export function hpRingRadius(extent: number): number {
  return extent / 2 + hpRingCasing(extent) + hpRingWidth(extent) / 2;
}

/**
 * Dokąd sięga cała oprawa figury — zewnętrzna krawędź obwódki właściciela,
 * która od 03.10 (#71) leży za obrączką PW.
 *
 * Czytają to trzy rysunki naraz i każdy z innego powodu: aureola tury musi
 * zostać *na zewnątrz* paska (leży pod nim w kolejności rysowania, więc pasek
 * by ją zamalował), klin kierunku musi się za paskiem *zaczynać* (leży nad nim,
 * więc wycinałby w nim dziurę), a podpis figury musi zejść *pod* niego.
 */
export function furnitureRadius(extent: number, hasHp: boolean): number {
  return ownerRingRadius(extent, hasHp) + ownerRingWidth(extent, hasHp) / 2;
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

/**
 * Wymiary grotu kierunku (27j, kształt grotu z 26.09) — długość od brzegu
 * oprawy do czubka i połowa rozpiętości skrzydeł, w pikselach świata.
 *
 * Tutaj, a nie w `TokenNode`, bo od 26.09 czyta je także uchwyt obrotu:
 * uchwytem jest **sam grot** — bez patyka wbitego w środek portretu (MG:
 * „cienka biała kreska idąca od środka tokenu") i bez kropki na czubku.
 */
export function noseLength(extent: number): number {
  // 26.09 powiększony z 0,22 kratki (MG: „lepiej większy grot") — przy stole
  // żeton ma kilkadziesiąt pikseli ekranu i dawny grot był kilkupikselowym
  // ząbkiem, na którym nie było widać ani kształtu, ani koloru obrysu.
  return Math.max(12, extent * 0.3);
}

export function noseHalfWidth(extent: number): number {
  return Math.max(8, extent * 0.2);
}

/** Prześwit między brzegiem oprawy a nasadą grotu. */
export const NOSE_GAP = 1;

/**
 * Wierzchołki grotu z wcięciem (26.09) — czubek, skrzydło, wcięcie, skrzydło —
 * jako płaska lista dla `Graphics.poly`.
 *
 * Wspólne dla grotu na figurze (`TokenNode`) i dla bladego zarysu, którym
 * nakładka zaznaczenia pokazuje, że figurę bez kierunku da się obrócić.
 * `angle` w radianach ekranu (0 = w prawo), `base` — promień nasady.
 */
export function nosePolygon(
  cx: number,
  cy: number,
  angle: number,
  base: number,
  extent: number,
): number[] {
  const tip = noseLength(extent);
  const half = noseHalfWidth(extent);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Prostopadła do kierunku — oś skrzydeł grotu.
  const px = -dy;
  const py = dx;
  return [
    cx + dx * (base + tip),
    cy + dy * (base + tip),
    cx + dx * base + px * half,
    cy + dy * base + py * half,
    cx + dx * (base + tip * 0.42),
    cy + dy * (base + tip * 0.42),
    cx + dx * base - px * half,
    cy + dy * base - py * half,
  ];
}
