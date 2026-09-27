import type { WallChain } from './scene.ts';

/**
 * Plany map scenariusza „Nocna zmiana” (`testy.md` 4.6) — współrzędne odczytane
 * z obrazów w `VTT_E2E_MATERIALS` (linijka co 10 px na powiększonych wycinkach,
 * T3b 26.09). Same liczby, bez grafiki: obrazy nie trafiają do repo.
 *
 * Punkty styku są wspólnymi końcami łańcuchów, nigdy środkiem cudzego odcinka:
 * szczelina na styku „T” przepuszcza światło i wzrok, a pierwszy klik łańcucha
 * w środek istniejącej ściany ją zaznacza zamiast zacząć rysunek.
 */

/** `SmallRestaurant-33x24.png`, 1470 × 1070, kratka 33 × 24 (44,5 px). */
export const KNAJPA = {
  file: 'mapy/SmallRestaurant-33x24.png',
  width: 1470,
  height: 1070,
  columns: 33,
  walls: [
    // Obrys: zachód do okna, północ z łazienkami, wschód do wejścia bocznego.
    {
      kind: 'wall',
      points: [
        [44, 265],
        [44, 178],
        [44, 44],
        [132, 44],
        [225, 44],
        [1248, 44],
        [1248, 89],
      ],
    },
    {
      kind: 'door',
      points: [
        [1248, 89],
        [1248, 218],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1248, 218],
        [1248, 266],
        [1248, 445],
        [1248, 492],
      ],
    },
    // Łazienki i magazyn przy wschodniej ścianie.
    {
      kind: 'door',
      points: [
        [1248, 492],
        [1248, 535],
      ],
    },
    {
      kind: 'door',
      points: [
        [1248, 535],
        [1248, 575],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1248, 575],
        [1248, 622],
        [1248, 668],
      ],
    },
    {
      kind: 'door',
      points: [
        [1248, 668],
        [1248, 710],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1248, 710],
        [1248, 801],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1248, 445],
        [1420, 445],
        [1420, 535],
        [1420, 622],
        [1420, 801],
        [1248, 801],
        [1201, 801],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1248, 535],
        [1420, 535],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1248, 622],
        [1420, 622],
      ],
    },
    // Tylne drzwi kuchni (rygiel dokłada krok 3.9) i południe kuchni.
    {
      kind: 'door',
      points: [
        [1201, 801],
        [1159, 801],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1159, 801],
        [666, 801],
        [666, 753],
      ],
    },
    // Drzwi wahadłowe z sali do kuchni.
    {
      kind: 'door',
      points: [
        [666, 753],
        [666, 667],
      ],
    },
    {
      kind: 'wall',
      points: [
        [666, 667],
        [666, 534],
        [666, 445],
        [666, 266],
        [933, 266],
        [1248, 266],
      ],
    },
    // Biuro i socjalny, korytarz, przedsionek łazienek.
    {
      kind: 'wall',
      points: [
        [933, 266],
        [933, 445],
      ],
    },
    {
      kind: 'wall',
      points: [
        [666, 445],
        [757, 445],
      ],
    },
    {
      kind: 'door',
      points: [
        [757, 445],
        [800, 445],
      ],
    },
    {
      kind: 'wall',
      points: [
        [800, 445],
        [933, 445],
        [1050, 445],
      ],
    },
    {
      kind: 'door',
      points: [
        [1050, 445],
        [1108, 445],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1108, 445],
        [1157, 445],
        [1248, 445],
      ],
    },
    {
      kind: 'door',
      points: [
        [1157, 445],
        [1157, 490],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1157, 490],
        [1157, 534],
        [1157, 575],
        [1248, 575],
      ],
    },
    {
      kind: 'wall',
      points: [
        [666, 534],
        [1073, 534],
      ],
    },
    {
      kind: 'door',
      points: [
        [1073, 534],
        [1113, 534],
      ],
    },
    {
      kind: 'wall',
      points: [
        [1113, 534],
        [1157, 534],
      ],
    },
    // Toalety w północno-zachodnim rogu.
    {
      kind: 'wall',
      points: [
        [132, 44],
        [132, 178],
      ],
    },
    {
      kind: 'wall',
      points: [
        [44, 178],
        [88, 178],
      ],
    },
    {
      kind: 'door',
      points: [
        [88, 178],
        [132, 178],
      ],
    },
    {
      kind: 'door',
      points: [
        [132, 178],
        [172, 178],
      ],
    },
    {
      kind: 'wall',
      points: [
        [172, 178],
        [225, 178],
        [225, 44],
      ],
    },
    // Przeszklenia sali i drzwi na taras.
    {
      kind: 'window',
      points: [
        [44, 265],
        [44, 760],
      ],
    },
    {
      kind: 'wall',
      points: [
        [44, 760],
        [44, 801],
        [87, 801],
      ],
    },
    {
      kind: 'window',
      points: [
        [87, 801],
        [177, 801],
      ],
    },
    {
      kind: 'door',
      points: [
        [177, 801],
        [270, 801],
      ],
    },
    {
      kind: 'window',
      points: [
        [270, 801],
        [666, 801],
      ],
    },
  ] satisfies WallChain[],
  /** Środek tylnych drzwi kuchni — dwuklik otwiera kartę z ryglem. */
  backDoor: { x: 1180, y: 801 },
  /** Drzwi na taras — wejście drużyny. */
  frontDoor: { x: 223, y: 801 },
  /** Środek drzwi wahadłowych z sali do kuchni (klik otwiera i zamyka). */
  swingDoor: { x: 666, y: 710 },
  /** Lampa nad salą i lampa nad tarasem; kuchnia i bar zostają w ciemności. */
  lights: [
    { x: 330, y: 500 },
    { x: 400, y: 920 },
  ],
  spawn: { x: 400, y: 960 },
  note: { x: 1000, y: 360 },
} as const;

/** `IndustrialAreaGate-40x30.png`, 1448 × 1086, kratka 40 × 30 (36,2 px). */
export const BRAMA = {
  file: 'mapy/IndustrialAreaGate-40x30.png',
  width: 1448,
  height: 1086,
  columns: 40,
  /** Betonowy mur z bramą na drodze i płot z rur przy magazynie. */
  barriers: [
    {
      kind: 'barrier',
      points: [
        [0, 467],
        [660, 467],
      ],
    },
    {
      kind: 'barrier',
      points: [
        [897, 467],
        [1194, 467],
      ],
    },
  ] satisfies WallChain[],
  gate: [
    {
      kind: 'gate',
      points: [
        [660, 467],
        [897, 467],
      ],
    },
  ] satisfies WallChain[],
  fence: [
    {
      kind: 'barrier',
      points: [
        [1194, 325],
        [1194, 467],
        [1194, 690],
      ],
    },
  ] satisfies WallChain[],
  walls: [
    {
      kind: 'wall',
      points: [
        [1150, 0],
        [1150, 325],
        [1194, 325],
        [1448, 325],
      ],
    },
    {
      kind: 'wall',
      points: [
        [105, 0],
        [105, 360],
        [0, 360],
      ],
    },
  ] satisfies WallChain[],
  /** Czerwony kontener na parkingu (w przybliżeniu prostokąt). */
  cover: { from: { x: 300, y: 505 }, to: { x: 430, y: 690 } },
  /** Skrzynka sterowania przy prawym słupku bramy, od strony drogi. */
  accessPoint: { x: 905, y: 505 },
  spawn: { x: 720, y: 1000 },
  note: { x: 1300, y: 200 },
  /**
   * T5 (kratka 36,2 px, bariera na y = 467 przecina dół wiersza 12): wieżyczka
   * pod narożnikiem magazynu, Strażnik przy budce szlabanu, klamka bramy
   * w środku jej odcinka.
   */
  turret: { x: 1140, y: 344 },
  guard: { x: 561, y: 380 },
  gateHandle: { x: 778, y: 467 },
  /** Strefa ostrzału wieżyczki — wschodnia część placu za bramą. */
  turretZone: { from: { x: 905, y: 335 }, to: { x: 1150, y: 462 } },
  /** Podłoga elektryczna między bramą a budką Strażnika. */
  floorZone: { from: { x: 583, y: 362 }, to: { x: 650, y: 465 } },
  /** Mgła: droga od miejsca startu z linią bramy (inaczej gracz jej nie dostaje), potem pas placu. */
  roadReveal: { from: { x: 560, y: 440 }, to: { x: 1000, y: 1080 } },
  yardReveal: { from: { x: 662, y: 360 }, to: { x: 898, y: 470 } },
  /** Parking na zachodzie — zostaje pod mgłą (odmowa `MOVE_INTO_FOG`). */
  inFog: { x: 300, y: 800 },
} as const;
