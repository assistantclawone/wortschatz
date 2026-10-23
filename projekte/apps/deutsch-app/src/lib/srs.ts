import type { CardState, Entry, Settings } from '../types'

export const DEFAULT_SETTINGS: Settings = {
  native: 'en',
  explain: 'auto',   // 'auto' = Muttersprache; sonst Sprachcode
  evalMode: 'einfach',
  cardTypes: 'beides',
  textInput: true,
  direction: 'beides',
  newPerDay: 10,
  reviewsPerDay: 120,
  targetPerDay: 20,
  daysPerWeek: 5,
  cats: ['alltag', 'behoerden', 'arbeit', 'gesundheit', 'wohnen', 'einkaufen',
         'reisen', 'familie', 'bildung', 'freizeit', 'telefon', 'bank',
         'gastro', 'handwerk', 'technik', 'pflege', 'logistik', 'bau', 'buero', 'recht'],
  regions: ['CH', 'AT', 'DE', 'INT'],
  slang: true,
  vulgar: false,
  theme: 'dark',
  audio: true,
  timer: true,
  order: 'rank',
  maxLevel: 'A1',
  audioMode: 'manual',
  autoplay: false,
}

export const LEARNING_STEPS_MIN = [1, 10, 1440]   // Vorgabe 43: 1 Min -> 10 Min -> 1 Tag
export const GRADUATING_DAYS = 1
export const RELEARN_MIN = 10               // Vorgabe 44
export const MAX_INTERVAL = 365             // Vorgabe 45
export const EASY_BONUS = 1.3               // Vorgabe 47
export const START_EASE = 2.5

const DAY = 86_400_000
const MIN = 60_000

export type Rating = 'again' | 'hard' | 'good' | 'easy' | 'right' | 'wrong'

export function cardId(entryId: string, dir: 'rec' | 'prod', kind: 'wort' | 'satz') {
  return `${entryId}:${dir}:${kind}`
}

export function makeCard(entryId: string, dir: 'rec' | 'prod', kind: 'wort' | 'satz'): CardState {
  return {
    id: cardId(entryId, dir, kind),
    entryId, dir, kind,
    stage: 0,
    interval: 0,
    ease: START_EASE,
    due: Date.now(),
    reps: 0,
    lapses: 0,
    recCorrect: 0,
    prodCorrect: 0,
  }
}

/** Nächster Fälligkeitszeitpunkt nach Anki-Logik, evidenzbasiert angepasst. */
export function schedule(card: CardState, rating: Rating, now = Date.now()):
  { card: CardState; delayMs: number; label: string } {
  const c: CardState = { ...card }
  const wasNew = c.stage === 0
  c.reps += 1

  // Neue Karte: Lernschritte 1 Min -> 10 Min -> 1 Tag
  if (wasNew) {
    if (rating === 'again' || rating === 'wrong') {
      c.stage = 0
      c.reps = 0
      c.lapses += 1
      c.due = now + LEARNING_STEPS_MIN[0] * MIN
      return { card: c, delayMs: LEARNING_STEPS_MIN[0] * MIN, label: '1 Min' }
    }
    if (rating === 'hard') {
      c.due = now + LEARNING_STEPS_MIN[1] * MIN
      return { card: c, delayMs: LEARNING_STEPS_MIN[1] * MIN, label: '10 Min' }
    }
    // good/easy/right
    if (rating === 'easy') {
      c.stage = 1
      c.interval = 2
      c.due = now + 2 * DAY
      return { card: c, delayMs: 2 * DAY, label: '2 Tage' }
    }
    // Lernschritt-Fortschritt: erster Durchgang -> 10 Min, danach -> 1 Tag (Vorgabe 43)
    if (c.reps < 2) {
      c.due = now + LEARNING_STEPS_MIN[1] * MIN
      return { card: c, delayMs: LEARNING_STEPS_MIN[1] * MIN, label: '10 Min' }
    }
    c.stage = 1
    c.interval = GRADUATING_DAYS
    c.due = now + GRADUATING_DAYS * DAY
    return { card: c, delayMs: GRADUATING_DAYS * DAY, label: '1 Tag' }
  }

  // Wiederholungskarte
  if (rating === 'again' || rating === 'wrong') {
    c.lapses += 1
    c.ease = Math.max(1.3, c.ease - 0.2)
    c.interval = Math.max(1, Math.round(c.interval * 0.4))
    c.due = now + RELEARN_MIN * MIN
    return { card: c, delayMs: RELEARN_MIN * MIN, label: '10 Min' }
  }
  if (rating === 'hard') {
    c.ease = Math.max(1.3, c.ease - 0.15)
    c.interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(c.interval * 1.2)))
  } else if (rating === 'easy') {
    c.ease = Math.min(3.2, c.ease + 0.15)
    c.interval = Math.min(MAX_INTERVAL, Math.round(c.interval * c.ease * EASY_BONUS))
  } else {
    c.interval = Math.min(MAX_INTERVAL, Math.round(c.interval * c.ease))
  }
  c.interval = Math.min(MAX_INTERVAL, Math.max(1, c.interval))
  c.due = now + c.interval * DAY
  return { card: c, delayMs: c.interval * DAY, label: c.interval === 1 ? '1 Tag' : `${c.interval} Tage` }
}

/** Vorschau-Labels für die vier Buttons (Anki-Stil). */
export function previewLabels(card: CardState): Record<Rating, string> {
  const out = {} as Record<Rating, string>
  for (const r of ['again', 'hard', 'good', 'easy'] as Rating[]) {
    out[r] = schedule(card, r, Date.now()).label
  }
  return out
}

/** Sichtbarkeitsfilter nach Einstellungen (Tags, Region, Slang, Vulgär). */
export function isVisible(e: Entry, s: Settings): boolean {
  if (e.vulgar && !s.vulgar) return false
  if (e.slang && !s.slang) return false
  if (!e.region.some(r => s.regions.includes(r))) return false
  if (!e.cats.some(c => s.cats.includes(c))) return false
  return true
}

/** Ist diese Karte heute fällig? */
export function isDue(c: CardState, now = Date.now()) {
  return c.due <= now
}

export function isNew(c: CardState) {
  return c.stage === 0 && c.reps === 0
}

/** Tippfehler-Toleranz (Vorgabe 28). */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[.,!?;:„“"'«»()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tippfehler gelten NICHT automatisch als richtig (Renato 19.10.2026).
 *  Eine Eingabe, die nur «fast» passt (1 Zeichen), wird als falsch bewertet —
 *  der Hinweis «kleiner Tippfehler» steht separat in der Oberfläche. */
export function isExactAnswer(a: string, b: string) {
  return normalize(a) === normalize(b)
}

/** Nur für den Hinweis «knapp daneben», NICHT für die Bewertung. */
export function fuzzyEqual(a: string, b: string) {
  const x = normalize(a)
  const y = normalize(b)
  if (x === y) return true
  if (Math.abs(x.length - y.length) > 1) return false
  // Levenshtein <= 1
  let i = 0, j = 0, diff = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; continue }
    if (++diff > 1) return false
    if (x.length > y.length) i++
    else if (x.length < y.length) j++
    else { i++; j++ }
  }
  return diff + (x.length - i) + (y.length - j) <= 1
}

/** Tageszähler-Schlüssel */
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Zeichen-Diff fuer die Korrektur-Anzeige (Renato 18.10.2026).
 *  'wrong' = falsch getippt, 'missing' = fehlt in der Eingabe, 'extra' = zu viel getippt. */
export type DiffSeg = { text: string; kind: 'ok' | 'wrong' | 'missing' | 'extra' }

export function diffChars(userRaw: string, targetRaw: string): DiffSeg[] {
  const a = userRaw.trim()
  const b = targetRaw.trim()
  const n = a.length, m = b.length
  const segs: DiffSeg[] = []
  const push = (text: string, kind: DiffSeg['kind']) => {
    if (!text) return
    const last = segs[segs.length - 1]
    if (last && last.kind === kind) last.text += text
    else segs.push({ text, kind })
  }
  if (!n) return b ? [{ text: b, kind: 'missing' }] : []
  if (!m) return [{ text: a, kind: 'extra' }]

  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }

  type Op = { t: string; k: DiffSeg['kind'] }
  const rev: Op[] = []
  let i = n, j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      rev.push({ t: a[i - 1], k: 'ok' }); i--; j--
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      rev.push({ t: a[i - 1], k: 'wrong' }); i--; j--
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      rev.push({ t: b[j - 1], k: 'missing' }); j--
    } else {
      rev.push({ t: a[i - 1], k: 'extra' }); i--
    }
  }
  for (const op of rev.reverse()) push(op.t, op.k)
  return segs
}

/** Editier-Distanz (Levenshtein) — nur für die Übereinstimmungsanzeige.
 *  Renato 19.10.2026: wie bei Anki Grün/Rot zeigen, aber nicht urteilen. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Anki-Stil (Renato 19.10.2026): Zeichen-Darstellung wie AnkiDroid.
 *  Anki compare_answer():
 *  - verglichen wird zeichenweise in der Reihenfolge (Kombinationen zählen als eines)
 *  - Lösung: getroffen grün, falsch getippt rot, fehlend dunkelgrau
 *  - Eingabe: getroffen grün, falsch/zu viel rot, fehlend dunkelgrau
 *  - Gross/klein und Umlaute zählen als Treffer
 *  - Leerzeichenfehler werden nicht markiert (nur Positionen)
 *  Grundlage: Anki rslib/src/backend/... compare_answer (diff_char_iter).
 */
export type AnkiDiff = { target: DiffSeg[]; input: DiffSeg[] }

function ankiFold(ch: string): string {
  const low = ch.toLowerCase()
  return low
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/é|è|ê/g, 'e').replace(/á|à|â/g, 'a').replace(/í|ì|î/g, 'i')
    .replace(/ó|ò|ô/g, 'o').replace(/ú|ù|û/g, 'u')
}

export function ankiDiff(inputRaw: string, targetRaw: string): AnkiDiff {
  // Anki entfernt führende/abschliessende Leerzeichen, ignoriert Leerzeichenfehler
  const a = inputRaw.trim()
  const b = targetRaw.trim()
  const n = a.length, m = b.length

  const matches = (x: string, y: string) =>
    x === ' ' && y === ' ' ? true : ankiFold(x) === ankiFold(y)

  // LCS-Tabelle (Anki arbeitet mit einem vergleichbaren Diff)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = matches(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const target: DiffSeg[] = []
  const input: DiffSeg[] = []
  const add = (list: DiffSeg[], text: string, kind: DiffSeg['kind']) => {
    const last = list[list.length - 1]
    if (last && last.kind === kind) last.text += text
    else list.push({ text, kind })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (matches(a[i], b[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      add(input, a[i], 'ok'); add(target, b[j], 'ok'); i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Eingabe hat hier ein Zeichen, die Lösung nicht -> rot in der Eingabe
      add(input, a[i], 'extra'); i++
    } else {
      // Lösung hat hier ein Zeichen, die Eingabe nicht -> dunkelgrau
      add(target, b[j], 'missing'); j++
    }
  }
  while (i < n) { add(input, a[i], 'extra'); i++ }
  while (j < m) { add(target, b[j], 'missing'); j++ }

  // AnkiDroid zeigt BEIDE Zeilen gleich lang: dort, wo der Eingabe ein Zeichen
  // fehlt, steht in der Eingabe ein dunkelgrauer Platzhalter («missing»).
  // Renato 19.10.2026: Zeile für Zeile vergleichbar machen.
  return { target, input }
}
