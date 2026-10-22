// =====================================================================
// backend.ts — dünner Supabase-Client für Wortschatz
//
// Ziele:
//   * Kein Zwang: ohne VITE_SUPABASE_URL/ANON_KEY ist die App reiner Offline-Modus.
//   * Kein Crash, keine Endlos-Retries, kein Secret im Bundle (nur anon key).
//   * Fortschritt: Last-Write-Wins PRO KARTE über updated_at (ms), nie Totalüberschreiben.
//   * Lernlogik bleibt in srs.ts — hier wird nur transportiert.
//
// Bewusste Entscheidung: KEINE supabase-js-Abhängigkeit. Stattdessen direkt
// gegen die REST-/Auth-Endpunkte (PostgREST + GoTrue). Das hält den
// IIFE-Bundle klein (Vite baut ein einziges app.js für GitHub Pages).
// =====================================================================

import type { CardState } from '../types'
import { loadCards, saveCards, loadUser, saveUser } from './storage'
import type { User } from './storage'

/* ----------------------------- Konfiguration ----------------------------- */

interface EnvLike { env?: Record<string, string | undefined> }
const ENV = ((import.meta as unknown as EnvLike).env ?? {}) as Record<string, string | undefined>

const SUPABASE_URL = (ENV.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const SUPABASE_ANON_KEY = (ENV.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** Ist ein Backend konfiguriert? Ohne Rückgabewert false läuft alles lokal. */
export function backendConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/* ------------------------------- Fehler ---------------------------------- */

export type BackendErrorCode =
  | 'not_configured'
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'conflict'
  | 'unknown'
  | 'code_not_found'
  | 'code_inactive'
  | 'code_expired'
  | 'user_already_redeemed'
  | 'seat_limit_reached'
  | 'other_active_code'
  | 'invalid_code'

export class BackendError extends Error {
  code: BackendErrorCode
  status: number
  constructor(code: BackendErrorCode, status = 0, message?: string) {
    super(message ?? code)
    this.name = 'BackendError'
    this.code = code
    this.status = status
  }
}

/* -------------------------------- Session -------------------------------- */

export interface Session {
  accessToken: string
  refreshToken: string
  /** Ablauf in ms seit Epoch */
  expiresAt: number
  email: string
  userId: string
}

const K_SESSION = 'ws.session.v1'

/** Netter Klartext für UI-Meldungen (deutsch). */
export function errorText(code: BackendErrorCode): string {
  switch (code) {
    case 'not_configured': return 'Cloud ist nicht konfiguriert – Fortschritt bleibt lokal.'
    case 'network': return 'Keine Verbindung – Fortschritt bleibt lokal und wird später synchronisiert.'
    case 'auth': return 'Anmeldung ungültig oder abgelaufen. Bitte erneut anmelden.'
    case 'rate_limit': return 'Zu viele Versuche – bitte kurz warten.'
    case 'server': return 'Serverfehler – bitte später nochmals versuchen.'
    case 'conflict': return 'Der Code konnte nicht eingelöst werden.'
    case 'code_not_found': return 'Dieser Code existiert nicht.'
    case 'code_inactive': return 'Dieser Code ist nicht mehr gültig.'
    case 'code_expired': return 'Dieser Code ist abgelaufen.'
    case 'user_already_redeemed': return 'Dieser Code wurde bereits eingelöst.'
    case 'seat_limit_reached': return 'Das Kontingent dieses Codes ist aufgebraucht.'
    case 'other_active_code': return 'Es ist bereits ein Code aktiv. Bitte zuerst abwarten.'
    case 'invalid_code': return 'Der Code hat ein ungültiges Format.'
    default: return 'Unbekannter Fehler.'
  }
}

/* ------------------------------ Low-Level -------------------------------- */

const DEFAULT_TIMEOUT_MS = 12_000

async function request(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  if (!backendConfigured()) throw new BackendError('not_configured')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS)
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${init.token ?? SUPABASE_ANON_KEY}`,
    ...(init.headers as Record<string, string> | undefined),
  }
  try {
    return await fetch(`${SUPABASE_URL}${path}`, { ...init, headers, signal: ctrl.signal })
  } catch {
    // Ein einzelner Versuch — kein Retry-Loop (bewusst: Akku/Daten sparen).
    throw new BackendError('network')
  } finally {
    clearTimeout(timer)
  }
}

async function readJson<T>(r: Response): Promise<T> {
  try { return (await r.json()) as T } catch { return {} as T }
}

function mapAuthStatus(status: number): BackendErrorCode {
  if (status === 429) return 'rate_limit'
  if (status === 400 || status === 401 || status === 403) return 'auth'
  if (status >= 500) return 'server'
  return 'unknown'
}

/* ------------------------------- Session -------------------------------- */

interface GoTrueSession {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user?: { id?: string; email?: string }
}

function sessionFromPayload(p: GoTrueSession, fallbackEmail = ''): Session | null {
  if (!p.access_token || !p.refresh_token || !p.user?.id) return null
  const expiresAt = p.expires_at
    ? p.expires_at * 1000
    : Date.now() + (p.expires_in ?? 3600) * 1000
  return {
    accessToken: p.access_token,
    refreshToken: p.refresh_token,
    expiresAt,
    email: p.user.email ?? fallbackEmail,
    userId: p.user.id,
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(K_SESSION)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s.accessToken || !s.refreshToken || !s.userId) return null
    return s
  } catch { return null }
}

function storeSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(K_SESSION, JSON.stringify(s))
    else localStorage.removeItem(K_SESSION)
  } catch { /* Speicher voll / privater Modus — ignorieren */ }
}

/** Aktuelle Session; wird bei Bedarf still erneuert (einmalig, kein Loop). */
export async function getSession(): Promise<Session | null> {
  const s = loadSession()
  if (!s) return null
  if (s.expiresAt - 60_000 > Date.now()) return s
  try {
    const r = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refreshToken }),
    })
    if (!r.ok) { storeSession(null); return null }
    const fresh = sessionFromPayload(await readJson<GoTrueSession>(r), s.email)
    if (!fresh) { storeSession(null); return null }
    storeSession(fresh)
    return fresh
  } catch {
    // Offline: alte Session behalten, Aufrufer entscheidet (Daten bleiben lokal).
    return s
  }
}

/* --------------------------------- Login --------------------------------- */

/** Magic Link per E-Mail anfordern. Kein Passwort, keine Registrierung durch Renato nötig. */
export async function signInWithMagicLink(emailRaw: string): Promise<void> {
  if (!backendConfigured()) throw new BackendError('not_configured')
  const email = emailRaw.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BackendError('unknown', 0, 'invalid_email')

  const r = await request('/auth/v1/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      create_user: true,
      // Zurück auf die App, ohne Hash — der Link bringt die Session im Fragment mit.
      // Immer die echte Herkunft der laufenden Seite verwenden — nie eine
      // eingebaute URL. Sonst landet der Link auf localhost (Entwicklungsrechner)
      // und auf dem Handy in einer Fehlerseite.
      options: {
        email_redirect_to: (() => {
          const href = window.location.href.split('#')[0].split('?')[0]
          return href.endsWith('/') ? href : href + '/'
        })(),
      },
    }),
  })
  if (!r.ok) throw new BackendError(mapAuthStatus(r.status), r.status)
}

/** Passwort-Anmeldung. Fehlercode 400 = falsche Daten oder noch kein Passwort gesetzt. */
export async function signInWithPassword(emailRaw: string, password: string): Promise<Session> {
  if (!backendConfigured()) throw new BackendError('not_configured')
  const email = emailRaw.trim().toLowerCase()
  const r = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await readJson<GoTrueSession>(r)
  if (!r.ok || !data?.access_token) {
    const raw = (data as { error_description?: string; msg?: string } | null)
    const msg = (raw?.error_description ?? raw?.msg ?? '').toLowerCase()
    if (r.status === 429) throw new BackendError('rate_limit', r.status)
    if (msg.includes('invalid')) throw new BackendError('auth', r.status, 'wrong_credentials')
    if (msg.includes('confirm')) throw new BackendError('auth', r.status, 'email_not_confirmed')
    throw new BackendError(mapAuthStatus(r.status), r.status)
  }
  const session = sessionFromPayload(data, email)!
  storeSession(session)
  return session
}

/** Konto mit Passwort anlegen. Existiert die E-Mail schon, kommt ein Hinweis statt Doppelkonto. */
export async function signUpWithPassword(emailRaw: string, password: string): Promise<{ needsConfirm: boolean }> {
  if (!backendConfigured()) throw new BackendError('not_configured')
  const email = emailRaw.trim().toLowerCase()
  const r = await request('/auth/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await readJson<GoTrueSession & { user?: { identities?: unknown[] } }>(r)
  if (!r.ok) {
    const raw = (data as { error_description?: string; msg?: string; error_code?: string } | null)
    const msg = `${raw?.error_description ?? ''} ${raw?.msg ?? ''} ${raw?.error_code ?? ''}`.toLowerCase()
    if (r.status === 429) throw new BackendError('rate_limit', r.status)
    if (msg.includes('weak') || msg.includes('password')) throw new BackendError('auth', r.status, 'weak_password')
    if (msg.includes('registered') || msg.includes('exists')) throw new BackendError('auth', r.status, 'email_taken')
    throw new BackendError(mapAuthStatus(r.status), r.status)
  }
  if (data?.access_token) {
    const s = sessionFromPayload(data, email)
    if (s) storeSession(s)
    return { needsConfirm: false }
  }
  return { needsConfirm: true }
}

/** Nach einer Anmeldung sofort den Cloud-Stand holen und zusammenführen. */
export async function afterSignIn(): Promise<Record<string, CardState> | null> {
  try {
    const r = await syncProgress()
    return r.cards ?? null
  } catch { return null }
}

/** Setzt ein Passwort für den angemeldeten Nutzer (Wechsel vom Link- zum Passwort-Login). */
export async function setPassword(password: string): Promise<void> {
  const session = await getSession()
  if (!session) throw new BackendError('auth', 401)
  const r = await request('/auth/v1/user', {
    method: 'PUT',
    token: session.accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!r.ok) {
    if (r.status === 429) throw new BackendError('rate_limit', r.status)
    throw new BackendError('auth', r.status, 'weak_password')
  }
}

/** «Passwort vergessen» — schickt eine Zurücksetz-Mail auf die hinterlegte Adresse. */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  if (!backendConfigured()) throw new BackendError('not_configured')
  const email = emailRaw.trim().toLowerCase()
  const r = await request('/auth/v1/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      redirect_to: (() => {
        const href = window.location.href.split('#')[0].split('?')[0]
        return href.endsWith('/') ? href : href + '/'
      })(),
    }),
  })
  if (!r.ok) {
    if (r.status === 429) throw new BackendError('rate_limit', r.status)
    throw new BackendError(mapAuthStatus(r.status), r.status)
  }
}

/**
 * Magic-Link-Rückkehr auswerten: Supabase hängt
 *   #access_token=…&refresh_token=…&expires_at=…&type=magiclink
 * an die URL. Fragmente werden NICHT an Server gesendet — gut für GitHub Pages.
 * Gibt die Session zurück und räumt die URL auf (history.replaceState).
 */
export function consumeMagicLink(): Session | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const type = params.get('type')
  // Supabase legt den Typ je nach Fluss als type=magiclink|signup|recovery ab,
  // in neueren Versionen fehlt er bei Magic Links — dann an access_token erkennen.
  const isAuthReturn =
    type === 'magiclink' || type === 'signup' || type === 'recovery' ||
    (!type && Boolean(params.get('access_token') || params.get('error')))
  if (!isAuthReturn) return null

  const err = params.get('error_description') ?? params.get('error')
  const sess = err
    ? null
    : sessionFromPayload({
        access_token: params.get('access_token') ?? undefined,
        refresh_token: params.get('refresh_token') ?? undefined,
        expires_at: Number(params.get('expires_at') ?? 0) || undefined,
        // Fallback, falls Supabase nur expires_in liefert
        expires_in: Number(params.get('expires_in') ?? 0) || undefined,
        user: {
          id: params.get('provider_token') ? undefined : decodeJwtSub(params.get('access_token')),
          email: params.get('email') ?? undefined,
        },
      })

  // Fragment aus der Adresszeile entfernen (Token nicht in der History lassen)
  try {
    const clean = window.location.pathname + window.location.search
    window.history.replaceState(null, '', clean)
  } catch { /* egal */ }

  if (sess) {
    storeSession(sess)
    const u: User = { email: sess.email }
    saveUser(u)
  }
  return sess
}

/** Liest `sub` (user id) aus einem JWT, ohne Signaturprüfung — nur für die Anzeige. */
function decodeJwtSub(token: string | null): string | undefined {
  if (!token) return undefined
  const part = token.split('.')[1]
  if (!part) return undefined
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { sub?: string; email?: string }
    return payload.sub ?? undefined
  } catch { return undefined }
}

export async function signOut(): Promise<void> {
  const s = loadSession()
  storeSession(null)
  saveUser(null)
  if (!s || !backendConfigured()) return
  try {
    await request('/auth/v1/logout', { method: 'POST', token: s.accessToken })
  } catch {
    // Offline/abgelaufen: lokal ist die Session schon weg — reicht.
  }
}

/* ------------------------------ Fortschritt ------------------------------ */

/** Zeilenform, wie sie in public.progress liegt (snake_case). */
interface ProgressRow {
  card_key: string
  stage: number
  due: number
  reps: number
  ease: number
  lapses: number
  interval: number
  updated_at: number
}

/** Karten-Zeitstempel getrennt vom Lernstand (docs: updated_at pro Karte). */
const K_STAMPS = 'ws.cardstamps.v1'

type Stamps = Record<string, number>

export function loadStamps(): Stamps {
  try {
    const raw = localStorage.getItem(K_STAMPS)
    return raw ? (JSON.parse(raw) as Stamps) : {}
  } catch { return {} }
}

function saveStamps(s: Stamps): void {
  try { localStorage.setItem(K_STAMPS, JSON.stringify(s)) } catch { /* ignore */ }
}

/** Zeitstempel einer Karte setzen — nach jeder Antwort aufrufen. */
export function touchCard(cardKey: string, at = Date.now()): void {
  const s = loadStamps()
  s[cardKey] = at
  saveStamps(s)
}

function toRow(key: string, c: CardState, updatedAt: number): ProgressRow {
  return {
    card_key: key,
    stage: c.stage,
    due: Math.round(c.due),
    reps: c.reps,
    ease: Math.round(c.ease * 100) / 100,
    lapses: c.lapses,
    interval: c.interval,
    updated_at: updatedAt,
  }
}

function fromRow(r: ProgressRow): CardState {
  // card_key = "<entryId>:<dir>:<kind>" (siehe srs.cardId)
  const parts = String(r.card_key).split(':')
  const entryId = parts[0] ?? ''
  const dir = parts[1] === 'prod' ? 'prod' : 'rec'
  const kind = parts[2] === 'satz' ? 'satz' : 'wort'
  return {
    id: r.card_key,
    entryId,
    dir,
    kind,
    stage: Number(r.stage) || 0,
    interval: Number(r.interval) || 0,
    ease: Number(r.ease) || 2.5,
    due: Number(r.due) || 0,
    reps: Number(r.reps) || 0,
    lapses: Number(r.lapses) || 0,
    recCorrect: 0,   // nicht in der Cloud (nur lokal, Lernlogik)
    prodCorrect: 0,
  }
}

/**
 * Merge-Ergebnis: pro Karte gewinnt der höhere updated_at (Last-Write-Wins).
 * Nie Totalüberschreiben: lokale Karten, die remote fehlen, bleiben erhalten.
 */
export function mergeCards(
  local: Record<string, CardState>,
  localStamps: Stamps,
  remote: ProgressRow[],
): { cards: Record<string, CardState>; stamps: Stamps; pulled: number; pushed: number } {
  const cards: Record<string, CardState> = { ...local }
  const stamps: Stamps = { ...localStamps }
  let pulled = 0
  let pushed = 0

  for (const row of remote) {
    const key = row.card_key
    if (!key) continue
    const localAt = stamps[key] ?? 0
    const remoteAt = Number(row.updated_at) || 0
    if (remoteAt > localAt) {
      // Remote ist neuer: übernehmen (Lernfelder, nicht recCorrect/prodCorrect)
      const prev = cards[key]
      const next = fromRow(row)
      cards[key] = {
        ...next,
        recCorrect: prev?.recCorrect ?? 0,
        prodCorrect: prev?.prodCorrect ?? 0,
      }
      stamps[key] = remoteAt
      pulled++
    } else if (localAt > remoteAt) {
      pushed++
    }
  }
  // Karten, die nur lokal existieren, zählen ebenfalls als «zu pushen»
  for (const key of Object.keys(cards)) {
    if (!(key in stamps)) stamps[key] = 0
    if (!remote.some((r) => r.card_key === key)) pushed++
  }
  return { cards, stamps, pulled, pushed }
}

export interface SyncResult {
  ok: boolean
  offline?: boolean
  pulled: number
  pushed: number
  /** Zusammengeführter Stand (lokal + Cloud) — direkt in den React-State übernehmbar. */
  cards?: Record<string, CardState>
  error?: BackendErrorCode
}

/**
 * Sync: erst pullen (alle Karten, Free-Tier-taugliche Mengen), pro Karte mergen,
 * dann nur die neueren/fehlenden lokal geänderten Karten pushen (upsert).
 * Ohne Session/Config: sofort { ok:false, offline:true } — kein Netzverkehr.
 */
export async function syncProgress(): Promise<SyncResult> {
  if (!backendConfigured()) return { ok: false, offline: true, pulled: 0, pushed: 0 }
  const session = await getSession()
  if (!session) return { ok: false, offline: true, pulled: 0, pushed: 0 }

  const PAGE = 1000
  const remote: ProgressRow[] = []
  try {
    for (let from = 0; from < 20; from++) {
      const to = from * PAGE + PAGE - 1
      const r = await request(
        `/rest/v1/progress?select=card_key,stage,due,reps,ease,lapses,interval,updated_at&order=card_key.asc&offset=${from * PAGE}&limit=${PAGE}`,
        { token: session.accessToken, headers: { Range: `${from * PAGE}-${to}` } },
      )
      if (!r.ok) return { ok: false, pulled: 0, pushed: 0, error: mapAuthStatus(r.status) }
      const page = await readJson<ProgressRow[]>(r)
      if (!Array.isArray(page) || page.length === 0) break
      remote.push(...page)
      if (page.length < PAGE) break
    }
  } catch (e) {
    return {
      ok: false, offline: true, pulled: 0, pushed: 0,
      error: e instanceof BackendError ? e.code : 'network',
    }
  }

  const local = loadCards()
  const localStamps = loadStamps()
  const merged = mergeCards(local, localStamps, remote)

  // Lokal anwenden
  saveCards(merged.cards)
  saveStamps(merged.stamps)

  // Push: nur Karten, deren lokaler Stempel pro Zeitstempel gewinnen bzw. remote fehlen
  const remoteStamps = new Map<string, number>()
  for (const r of remote) remoteStamps.set(r.card_key, Number(r.updated_at) || 0)

  const rows: ProgressRow[] = []
  for (const [key, card] of Object.entries(merged.cards)) {
    const at = merged.stamps[key] ?? 0
    const rAt = remoteStamps.get(key)
    if (rAt === undefined || at > rAt) rows.push(toRow(key, card, at || Date.now()))
  }

  if (rows.length) {
    try {
      const resp = await request('/rest/v1/progress?on_conflict=user_id,card_key', {
        method: 'POST',
        token: session.accessToken,
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows.map((r) => ({ ...r, user_id: session.userId }))),
      })
      if (!resp.ok) return {
        ok: false, pulled: merged.pulled, pushed: 0, error: mapAuthStatus(resp.status),
      }
    } catch (e) {
      return {
        ok: merged.pulled > 0, offline: true, pulled: merged.pulled, pushed: 0,
        error: e instanceof BackendError ? e.code : 'network',
      }
    }
  }

  return { ok: true, pulled: merged.pulled, pushed: rows.length, cards: merged.cards }
}

/* --------------------------- Bewertung protokollieren ------------------- */

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy' | 'right' | 'wrong'

/**
 * Bewertung als Zeile in public.reviews ablegen (Auswertung).
 * Fail-silent: Statistik ist nice-to-have, Lernen darf nie blockieren.
 */
export async function logReview(cardKey: string, rating: ReviewRating): Promise<boolean> {
  if (!backendConfigured()) return false
  const s = loadSession()
  if (!s) return false
  try {
    const r = await request('/rest/v1/reviews', {
      method: 'POST',
      token: s.accessToken,
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: s.userId, card_key: cardKey, rating }),
    })
    return r.ok
  } catch { return false }
}

/* ------------------------------ Code einlösen --------------------------- */

export interface RedeemResult {
  ok: boolean
  plan?: string
  validUntil?: string | null
  language?: string
  error?: BackendErrorCode
}

/**
 * Gutschein-/Firmen-Code einlösen. Die Prüfung (Ablauf, Kontingent,
 * Einmalgebrauch) passiert AUSSCHLIESSLICH serverseitig in der Edge Function.
 */
export async function redeemCode(codeRaw: string): Promise<RedeemResult> {
  if (!backendConfigured()) return { ok: false, error: 'not_configured' }
  const code = codeRaw.trim().toUpperCase().replace(/\s+/g, '')
  if (!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(code)) return { ok: false, error: 'invalid_code' }

  const s = await getSession()
  if (!s) return { ok: false, error: 'auth' }

  try {
    const r = await request('/functions/v1/redeem-code', {
      method: 'POST',
      token: s.accessToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = await readJson<{ ok?: boolean; reason?: string; plan?: string; validUntil?: string | null; language?: string }>(r)
    if (r.ok && body.ok) {
      return { ok: true, plan: body.plan, validUntil: body.validUntil ?? null, language: body.language }
    }
    const reason = body.reason as BackendErrorCode | undefined
    if (reason) return { ok: false, error: reason }
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'auth' }
    if (r.status === 429) return { ok: false, error: 'rate_limit' }
    return { ok: false, error: r.status >= 500 ? 'server' : 'conflict' }
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.code : 'network' }
  }
}

/* ------------------------------- Anzeige -------------------------------- */

export interface ProfileInfo {
  plan: string
  planValidUntil: string | null
  activeLanguage: string
}

/** Eigenes Profil lesen (Plan/Laufzeit für die Anzeige). */
export async function fetchProfile(): Promise<ProfileInfo | null> {
  if (!backendConfigured()) return null
  const s = await getSession()
  if (!s) return null
  try {
    const r = await request(
      `/rest/v1/profiles?select=plan,plan_valid_until,active_language&id=eq.${encodeURIComponent(s.userId)}&limit=1`,
      { token: s.accessToken },
    )
    if (!r.ok) return null
    const rows = await readJson<{ plan?: string; plan_valid_until?: string | null; active_language?: string }[]>(r)
    const row = Array.isArray(rows) ? rows[0] : undefined
    if (!row) return null
    return {
      plan: row.plan ?? 'free',
      planValidUntil: row.plan_valid_until ?? null,
      activeLanguage: row.active_language ?? 'de',
    }
  } catch { return null }
}

/** Ist eine Session vorhanden? (für UI: «angemeldet als …») */
export function currentUserEmail(): string | null {
  return loadSession()?.email ?? loadUser()?.email ?? null
}
