// Verwaltung: Codes erzeugen/verlängern/sperren, Firmen-Kontingente.
// Alle Schreibvorgänge laufen über SECURITY-DEFINER-Funktionen in der Datenbank,
// die selbst prüfen, ob der Aufrufer Admin ist. Der Browser kann Codes nicht
// direkt erzeugen — auch nicht mit gefälschten Anfragen.
import { getSession, backendConfigured } from './backend'

export interface CodeRow {
  code: string
  kind: 'voucher' | 'seat'
  language: string
  valid_until: string | null
  seat_limit: number
  used: number
  status: 'active' | 'revoked' | 'exhausted'
  note: string | null
  created_at: string
}

export interface OrgRow {
  org_id: string
  name: string
  seats: number
  used: number
  price_per_seat: number
  created_at: string
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!backendConfigured()) throw new Error('Backend nicht konfiguriert.')
  const s = await getSession()
  if (!s) throw new Error('Bitte zuerst anmelden.')
  const url = (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_URL
  const key = (import.meta as unknown as { env: Record<string, string> }).env.VITE_SUPABASE_ANON_KEY
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${s.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error('Keine Berechtigung für die Verwaltung.')
    throw new Error(text.slice(0, 200) || `Fehler ${r.status}`)
  }
  return (text ? JSON.parse(text) : null) as T
}

/** Ist der angemeldete Nutzer Verwalter? */
export async function isAdmin(): Promise<boolean> {
  try {
    const r = await rpc<boolean>('is_app_admin', {})
    return r === true
  } catch { return false }
}

export async function createCodes(opts: {
  count: number
  kind: 'voucher' | 'seat'
  language?: string
  days: number | null
  orgId?: string | null
  seatLimit?: number
  note?: string
}): Promise<CodeRow[]> {
  return rpc<CodeRow[]>('admin_create_codes', {
    p_count: opts.count,
    p_kind: opts.kind,
    p_language: opts.language ?? 'de',
    p_days: opts.days,
    p_org: opts.orgId ?? null,
    p_seat_limit: opts.seatLimit ?? 1,
    p_note: opts.note ?? null,
  })
}

export async function listCodes(limit = 300): Promise<CodeRow[]> {
  return rpc<CodeRow[]>('admin_list_codes', { p_limit: limit })
}

export async function extendCode(code: string, days: number): Promise<void> {
  await rpc('admin_extend_code', { p_code: code, p_days: days })
}

export async function setCodeStatus(code: string, status: 'active' | 'revoked'): Promise<void> {
  await rpc('admin_set_code_status', { p_code: code, p_status: status })
}

export async function createOrg(name: string, seats: number, price: number): Promise<void> {
  await rpc('org_create', { p_name: name, p_seats: seats, p_price: price })
}

export async function orgOverview(): Promise<OrgRow[]> {
  return rpc<OrgRow[]>('org_overview', {})
}

/** Codes als Textdatei-Inhalt (eine pro Zeile) für Excel/Mail. */
export function codesAsText(rows: CodeRow[]): string {
  return rows.map(r => r.code).join('\n')
}
