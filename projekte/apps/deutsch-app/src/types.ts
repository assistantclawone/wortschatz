// Typen — sprachneutral gebaut (Vorgabe 63/57)
export type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type Region = 'CH' | 'AT' | 'DE' | 'INT'

export type Category =
  | 'alltag' | 'behoerden' | 'arbeit' | 'gesundheit' | 'wohnen'
  | 'einkaufen' | 'reisen' | 'familie' | 'bildung' | 'freizeit'
  | 'telefon' | 'bank' | 'gastro' | 'handwerk' | 'technik'
  | 'pflege' | 'logistik' | 'bau' | 'buero' | 'recht'

export interface Entry {
  id: string
  de: string           // Wort oder Phrase (Deutsch) — bei mehreren Bedeutungen: eigene id
  meaning: string      // kurze deutsche Abgrenzung der Bedeutung, z.B. "Sitzbank"
  // Erklaerung der Bedeutung in allen Lernsprachen (Deutsch = 'meaning').
  // Fehlt eine Sprache, wird auf Deutsch zurueckgefallen (Renato 19.10.2026).
  meaningTr?: Record<string, string>
  rank: number         // Häufigkeitsrang 1 = häufigstes
  level: CEFR
  cats: Category[]
  region: Region[]
  slang?: boolean
  vulgar?: boolean
  sentence: string     // Beispielsatz mit Lücke {{ }}
  sentenceFull: string // vollständiger Satz
  // Übersetzungen: Sprache -> Übersetzung des Eintrags
  tr: Record<string, string>
  // Übersetzung des Lückensatzes (optional)
  trSentence?: Record<string, string>
}

export interface Settings {
  native: string
  // Sprache der Erklaerungen: 'auto' = Muttersprache (Renato 19.10.2026)
  explainLang?: string
  // Sprache der Erklaerungen: '' / 'auto' = Muttersprache, sonst ein Sprachcode
  // (auch 'de' = Deutsch). Renato 19.10.2026.
  explain?: string
  evalMode: 'einfach' | 'erweitert'
  cardTypes: 'wort' | 'satz' | 'beides'
  textInput: boolean
  direction: 'rezeptiv' | 'beides' | 'produktiv'
  newPerDay: number
  reviewsPerDay: number
  cats: Category[]
  regions: Region[]
  slang: boolean
  vulgar: boolean
  theme: 'dark' | 'light'
  audio: boolean
  timer: boolean
  order: 'rank' | 'random'   // Wortreihenfolge: nach Häufigkeit oder gemischt
  maxLevel: CEFR             // aktuelles Niveau auf der Leiter (A1 -> A2 -> B1 ...)
  audioMode: 'manual' | 'afterInput' | 'afterReveal'  // Sprachausgabe: nur Knopf / nach Eingabe / nach Loesung
  autoplay: boolean          // Kompatibilitaet mit alten Einstellungen
}

export interface CardState {
  id: string              // entryId + ':' + typ + ':' + richtung
  entryId: string
  dir: 'rec' | 'prod'
  kind: 'wort' | 'satz'
  stage: number           // 0 = neu, 1 = rezeptiv gelernt, 2 = produktiv freigeschaltet
  interval: number        // Tage
  ease: number
  due: number             // Timestamp ms
  reps: number
  lapses: number
  recCorrect: number      // für Freischaltung Produktion
  prodCorrect: number
}
