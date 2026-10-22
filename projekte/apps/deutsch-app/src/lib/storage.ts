// Storage: lokal + optional Cloud-Sync. Kein Zwang zum Login (Vorgabe 3: Fortschritt gespeichert)
import type { CardState, Settings } from '../types'
import { DEFAULT_SETTINGS } from './srs'

const K_SETTINGS = 'ws.settings.v1'
const K_CARDS = 'ws.cards.v1'
const K_DAILY = 'ws.daily.v1'
const K_USER = 'ws.user.v1'

export interface DailyCounter { date: string; newDone: number; reviewDone: number }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(K_SETTINGS)
    if (!raw) return DEFAULT_SETTINGS
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings
    // Selbstheilung: alte oder beschädigte Einstellungen dürfen den Lernstart
    // nicht lahmlegen. Leere Listen werden auf den Standard zurückgesetzt,
    // sonst ist kein einziges Wort sichtbar ("Jetzt lernen" zeigt sofort "alles erledigt").
    if (!Array.isArray(s.cats) || s.cats.length === 0) s.cats = [...DEFAULT_SETTINGS.cats]
    if (!Array.isArray(s.regions) || s.regions.length === 0) s.regions = [...DEFAULT_SETTINGS.regions]
    if (typeof s.newPerDay !== 'number' || s.newPerDay < 1) s.newPerDay = DEFAULT_SETTINGS.newPerDay
    if (typeof s.reviewsPerDay !== 'number' || s.reviewsPerDay < 1) s.reviewsPerDay = DEFAULT_SETTINGS.reviewsPerDay
    if (!LEVELS_SAFE.includes(s.maxLevel)) s.maxLevel = DEFAULT_SETTINGS.maxLevel
    return s
  } catch { return DEFAULT_SETTINGS }
}

const LEVELS_SAFE = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function saveSettings(s: Settings) {
  localStorage.setItem(K_SETTINGS, JSON.stringify(s))
}

export function loadCards(): Record<string, CardState> {
  try {
    const raw = localStorage.getItem(K_CARDS)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveCards(c: Record<string, CardState>) {
  localStorage.setItem(K_CARDS, JSON.stringify(c))
}

export function loadDaily(today: string): DailyCounter {
  try {
    const raw = localStorage.getItem(K_DAILY)
    const d: DailyCounter = raw ? JSON.parse(raw) : { date: today, newDone: 0, reviewDone: 0 }
    if (d.date !== today) return { date: today, newDone: 0, reviewDone: 0 }
    return d
  } catch { return { date: today, newDone: 0, reviewDone: 0 } }
}

export function saveDaily(d: DailyCounter) {
  localStorage.setItem(K_DAILY, JSON.stringify(d))
}

export interface User { email: string; name?: string }

export function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(K_USER)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveUser(u: User | null) {
  if (u) localStorage.setItem(K_USER, JSON.stringify(u))
  else localStorage.removeItem(K_USER)
}

/** Export für Backup / Gerätewechsel */
export function exportAll() {
  return JSON.stringify({
    settings: loadSettings(),
    cards: loadCards(),
    daily: localStorage.getItem(K_DAILY),
    user: loadUser(),
    exportedAt: new Date().toISOString(),
  }, null, 2)
}

/**
 * Cloud-Sync (Vorgabe 3: Login speichert Fortschritt geräteübergreifend).
 * Backend ist optional: ist VITE_API_URL gesetzt, wird gegen einen schlanken
 * JSON-Sync-Endpunkt synchronisiert; ohne Konfiguration bleibt alles lokal.
 */
const API = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? ''

export const cloudEnabled = () => Boolean(API)

export interface Snapshot {
  settings: Settings
  cards: Record<string, CardState>
  daily: DailyCounter
  user: User | null
  updatedAt: number
}

export function snapshot(): Snapshot {
  return {
    settings: loadSettings(),
    cards: loadCards(),
    daily: loadDaily(new Date().toISOString().slice(0, 10)),
    user: loadUser(),
    updatedAt: Date.now(),
  }
}

export function applySnapshot(s: Partial<Snapshot>) {
  if (s.settings) saveSettings({ ...DEFAULT_SETTINGS, ...s.settings })
  if (s.cards) saveCards(s.cards)
  if (s.daily) saveDaily(s.daily)
  if (s.user) saveUser(s.user)
}

/** Push an den Sync-Endpunkt. Fehler werden geschluckt — lokal bleibt die Wahrheit. */
export async function pushCloud(user: User, snap: Snapshot): Promise<boolean> {
  if (!API) return false
  try {
    const r = await fetch(`${API}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, snapshot: snap }),
    })
    return r.ok
  } catch { return false }
}

/** Pull beim Login. Gibt den entfernten Stand zurück, falls vorhanden. */
export async function pullCloud(email: string): Promise<Snapshot | null> {
  if (!API) return null
  try {
    const r = await fetch(`${API}/progress?email=${encodeURIComponent(email)}`)
    if (!r.ok) return null
    const d = await r.json()
    return (d?.snapshot ?? null) as Snapshot | null
  } catch { return null }
}

export function importAll(json: string) {
  const d = JSON.parse(json)
  if (d.settings) localStorage.setItem(K_SETTINGS, JSON.stringify(d.settings))
  if (d.cards) localStorage.setItem(K_CARDS, JSON.stringify(d.cards))
  if (d.daily) localStorage.setItem(K_DAILY, d.daily)
  if (d.user) localStorage.setItem(K_USER, JSON.stringify(d.user))
}
