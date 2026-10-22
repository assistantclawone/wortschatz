import { WORDS_A1 } from './words-a1'
import { WORDS_A2 } from './words-a2'
import { WORDS_B1 } from './words-b1'
import { WORDS_B2 } from './words-b2'
import type { Entry } from '../types'

export const ALL_WORDS: Entry[] = [...WORDS_A1, ...WORDS_A2, ...WORDS_B1, ...WORDS_B2]

export const BY_LEVEL = {
  A1: ALL_WORDS.filter(w => w.level === 'A1'),
  A2: ALL_WORDS.filter(w => w.level === 'A2'),
  B1: ALL_WORDS.filter(w => w.level === 'B1'),
  B2: ALL_WORDS.filter(w => w.level === 'B2'),
  C1: ALL_WORDS.filter(w => w.level === 'C1'),
  C2: ALL_WORDS.filter(w => w.level === 'C2'),
}

export const BY_ID = new Map(ALL_WORDS.map(w => [w.id, w]))

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

export function levelIndex(l: string) {
  const i = LEVELS.indexOf(l as typeof LEVELS[number])
  return i < 0 ? 0 : i
}

/** Bereichs-Niveau aus der Häufigkeitsposition (Rank).
 *  Die Stufen sind strikt getrennt, damit die Leiter wirklich steigt:
 *  A1 = Rang 1–600, A2 = 601–1500, B1 = 1501–3000.
 *  (Die Goethe-Wortlisten sind thematisch sortiert, nicht nach Häufigkeit —
 *   deshalb liefert der Rang die Stufe, nicht die Listenposition.)
 *  Quelle: Frequenzrang (hermitdave/FrequencyWords, OpenSubtitles 2018) +
 *  Goethe-Wortlisten A1/A2 als Abdeckungskontrolle. */
export const RANK_BANDS: { level: (typeof LEVELS)[number]; from: number; to: number }[] = [
  { level: 'A1', from: 1, to: 600 },
  { level: 'A2', from: 601, to: 1500 },
  { level: 'B1', from: 1501, to: 3000 },
];

export function levelForRank(rank: number): string {
  for (const b of RANK_BANDS) if (rank >= b.from && rank <= b.to) return b.level
  return LEVELS[LEVELS.length - 1]
}

/** Nächstes Ziellevel (Aufstieg) / darunter (Abstieg) — Vorgaben 7 & 8 */
export function levelUp(l: string) {
  return LEVELS[Math.min(LEVELS.length - 1, levelIndex(l) + 1)]
}
export function levelDown(l: string) {
  return LEVELS[Math.max(0, levelIndex(l) - 1)]
}
