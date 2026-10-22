/** Preis- und Paketlogik (Vorgaben N, Punkte 64–74).
 *
 *  Grundsätze:
 *  - Preis pro Lernsprache, nicht pro App (Vorgabe 64).
 *  - A1 + A2 sind gratis und bleiben es — volle SRS-Funktion, kein Demo (65).
 *  - Jahresabo zeigt den Monatspreis daneben und «2 Monate gratis» (72).
 *  - Keine Scheinsperre, keine Fake-Verknappung, keine Streak-Strafen (73, 74).
 */

export type Cadence = 'month' | 'year' | 'lifetime' | 'bundle'

export interface Plan {
  id: string
  cadence: Cadence
  title: string
  price: number
  perMonth?: number
  saving?: string
  note?: string
  highlight?: boolean
}

export const CURRENCY = 'CHF'

/** Einzelsprache. Bewusst nur Deutsch aktiv — jede weitere Sprache ist ein
 *  eigener Markt mit eigener Zahlungsbereitschaft (Vorgabe 64). */
export const PRICES_DE: Plan[] = [
  { id: 'de-month', cadence: 'month', title: 'Monatlich', price: 4.90, note: 'Jederzeit kündbar' },
  {
    id: 'de-year', cadence: 'year', title: 'Jährlich', price: 39,
    perMonth: 3.25, saving: '2 Monate gratis', highlight: true,
    note: 'Zahlt sich ab dem 8. Monat aus',
  },
  { id: 'de-life', cadence: 'lifetime', title: 'Lifetime', price: 89, note: 'Einmal zahlen, dauerhaft nutzen' },
]

/** Sprach-Bundle: alle Sprachen. Anker = drei Einzelabos (67). */
export const PRICE_BUNDLE: Plan = {
  id: 'all-year', cadence: 'bundle', title: 'Alle Sprachen', price: 89,
  perMonth: 7.42, note: 'Drei Einzelabos kosten CHF 117',
}

export const PRICE_LIFETIME_ALL = 189

export interface FieldPack {
  id: string
  title: string
  note: string
}

/** Berufsfeld-Pakete (Vorgabe 69). Preis pro Sprache und Branche. */
export const FIELD_PACKS: FieldPack[] = [
  { id: 'pflege', title: 'Pflege', note: 'Spital, Heimpflege, Hausarzt' },
  { id: 'bau', title: 'Bau', note: 'Baustelle, Handwerk, Werkzeug' },
  { id: 'gastro', title: 'Gastronomie', note: 'Küche, Service, Kantine' },
  { id: 'logistik', title: 'Logistik', note: 'Lager, Lieferung, Versand' },
  { id: 'buero', title: 'Büro', note: 'Administration, Termine' },
  { id: 'reinigung', title: 'Reinigung', note: 'Gebäude, Hygiene' },
  { id: 'sicherheit', title: 'Sicherheit', note: 'Objektschutz, Anweisungen' },
]

export const PRICE_FIELD_PACK = 9

/** Was ist ohne Bezahlung nutzbar — und bleibt es. */
export const FREE_INCLUDES = [
  'A1 und A2 komplett',
  'Spaced Repetition ohne Limit',
  'Alle Übungsrichtungen (verstehen und sprechen)',
  'Fortschritt lokal und mit Konto',
]

export const PRO_INCLUDES = [
  'B1 und höher',
  'Alle Berufsfeld-Pakete inklusive',
  'Regionale Varianten (CH, AT, DE)',
  'Unbegrenzte Wiederholungen über alle Stufen',
]

export interface CompanyTier {
  seats: string
  pricePerSeat: number
  note?: string
}

/** B2B: Sitzlizenzen ab 10 Sitzen, Jahresrechnung (Vorgabe 71). */
export const COMPANY_TIERS: CompanyTier[] = [
  { seats: '10–49', pricePerSeat: 5, note: 'Jahresrechnung' },
  { seats: '50–199', pricePerSeat: 4.5, note: 'Jahresrechnung, auf Anfrage' },
  { seats: '200+', pricePerSeat: 4, note: 'Rahmenvertrag' },
]

/** Jahresgesamtpreis einer Sitzstaffel. */
export function companyYearly(seats: number, pricePerSeat: number) {
  return Math.round(seats * pricePerSeat * 12)
}

/** Zahlungsmittel Schweiz (Vorgabe 73). Rechnung nur B2B. */
export const PAYMENT_METHODS = ['TWINT', 'Kreditkarte', 'Apple Pay', 'Google Pay']

export function formatCHF(n: number) {
  return `${CURRENCY} ${n.toFixed(2).replace('.', '.')}`
}

/** Preis sauber mit Komma, aber ohne unnötige Nullen bei glatten Beträgen. */
export function priceLabel(n: number) {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2)
  return `${CURRENCY} ${s}`
}

/** Jahresvorteil gegenüber 12 Monatsraten (Vorgabe 72). */
export function yearlySaving(monthly: number, yearly: number) {
  return Math.round((monthly * 12 - yearly) * 100) / 100
}
