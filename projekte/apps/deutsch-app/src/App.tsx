import React, { Component, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CardState, Entry, Settings } from './types'
import {
  DEFAULT_SETTINGS, isVisible, isDue, isNew, makeCard, cardId,
  schedule, previewLabels, fuzzyEqual, isExactAnswer, diffChars, todayKey, normalize, levenshtein, ankiDiff,
} from './lib/srs'
import type { Rating } from './lib/srs'
import {
  loadCards, saveCards, loadSettings, saveSettings,
  loadDaily, saveDaily, loadUser, saveUser, exportAll,
  loadHistory, saveHistory, streak, goalPercent,
} from './lib/storage'
import type { User, DailyCounter } from './lib/storage'
import { ALL_WORDS, BY_ID, LEVELS, levelIndex } from './data'
import { submitFeedback, feedbackAsText, loadFeedback } from './lib/feedback'
import { isAdmin, createCodes, listCodes, extendCode, setCodeStatus, createOrg, orgOverview, codesAsText } from './lib/admin'
import {
  PRICES_DE, PRICE_BUNDLE, PRICE_LIFETIME_ALL, FIELD_PACKS, PRICE_FIELD_PACK,
  FREE_INCLUDES, PRO_INCLUDES, COMPANY_TIERS, PAYMENT_METHODS,
  companyYearly, priceLabel, yearlySaving, formatCHF,
} from './lib/pricing'
import type { CodeRow, OrgRow } from './lib/admin'
import { touchCard, logReview, signInWithMagicLink, signInWithPassword, signUpWithPassword, setPassword, requestPasswordReset, signOut, getSession, consumeMagicLink, syncProgress, afterSignIn, fetchProfile, redeemCode, backendConfigured, errorText } from './lib/backend'
import type { BackendError } from './lib/backend'

/* ============================ Hilfen ============================ */

const LANGS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' }, { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' }, { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' }, { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' }, { code: 'ru', name: 'Русский' },
  { code: 'pl', name: 'Polski' }, { code: 'uk', name: 'Українська' },
]

const CAT_LABELS: Record<string, string> = {
  alltag: 'Alltag', behoerden: 'Behörden', arbeit: 'Arbeit', gesundheit: 'Gesundheit',
  wohnen: 'Wohnen', einkaufen: 'Einkaufen', reisen: 'Reisen', familie: 'Familie',
  bildung: 'Bildung', freizeit: 'Freizeit', telefon: 'Telefon', bank: 'Bank',
  gastro: 'Gastronomie', handwerk: 'Handwerk', technik: 'Technik', pflege: 'Pflege',
  logistik: 'Logistik', bau: 'Bau', buero: 'Büro', recht: 'Recht',
}

function speak(text: string, on: boolean) {
  if (!on || !('speechSynthesis' in window)) return
  try {
    const u = new SpeechSynthesisUtterance(text.replace('{{ }}', ''))
    u.lang = 'de-CH'
    u.rate = 0.9
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch { /* still ok */ }
}

/* ============================ App ============================ */

type View = 'setup' | 'trainer' | 'stats' | 'settings' | 'admin' | 'preise'

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [cards, setCards] = useState<Record<string, CardState>>({})
  const [daily, setDaily] = useState<DailyCounter>({ date: todayKey(), newDone: 0, reviewDone: 0 })
  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<View>('setup')
  const [admin, setAdmin] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    setCards(loadCards())
    setDaily(loadDaily(todayKey()))
    setUser(loadUser())
    setReady(true)
  }, [])

  // Sitzung aus Supabase wiederherstellen: Magic-Link-Rueckkehr pruefen, sonst
  // bestehende Sitzung laden. Danach Fortschritt mit der Cloud zusammenfuehren.
  useEffect(() => {
    if (!backendConfigured()) return
    let alive = true
    ;(async () => {
      const fromLink = consumeMagicLink()
      const session = fromLink ?? (await getSession())
      if (!alive || !session) return
      setUser({ email: session.email, name: session.email.split('@')[0] })
      saveUser({ email: session.email, name: session.email.split('@')[0] })
      const merged = await syncProgress()
      if (!alive) return
      if (merged?.cards) setCards(merged.cards)
      setAdmin(await isAdmin())
    })().catch(() => { /* offline: lokal weiter */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings.theme, ready])

  // persist
  useEffect(() => { if (ready) saveSettings(settings) }, [settings, ready])
  useEffect(() => { if (ready) saveCards(cards) }, [cards, ready])
  useEffect(() => { if (ready) saveDaily(daily) }, [daily, ready])

  if (!ready) return <div className="app" />

  const patch = (p: Partial<Settings>) => setSettings(s => ({ ...s, ...p }))

  return (
    <div className="app">
      <ErrorBoundary>
      <div className="topbar">
        <h1>Wortschatz</h1>
        <span className="spacer" />
        {view !== 'trainer' && (
          <button className="icon-btn" onClick={() => setView('stats')} title="Fortschritt">📊</button>
        )}
        {view !== 'settings' && (
          <button className="icon-btn" onClick={() => setView('settings')} title="Einstellungen">⚙️</button>
        )}
        {view !== 'setup' && view !== 'trainer' && (
          <button className="icon-btn" onClick={() => setView('setup')} title="Start">🏠</button>
        )}
        {admin && view !== 'admin' && (
          <button className="icon-btn" onClick={() => setView('admin')} title="Verwaltung">🔑</button>
        )}
        {view !== 'preise' && (
          <button className="icon-btn" onClick={() => setView('preise')} title="Preise">💳</button>
        )}
      </div>

      {view === 'setup' && <Setup settings={settings} patch={patch} user={user}
        setUser={setUser} setCards={setCards} onStart={() => setView('trainer')} />}
      {view === 'trainer' && <Trainer settings={settings} patch={patch} cards={cards} setCards={setCards}
        daily={daily} setDaily={setDaily} onExit={() => setView('setup')} />}
      {view === 'stats' && <Stats cards={cards} settings={settings} onBack={() => setView('setup')} />}
      {view === 'settings' && <SettingsView settings={settings} patch={patch} user={user}
        setUser={setUser} onBack={() => setView('setup')} />}
      {view === 'admin' && <AdminView onBack={() => setView('setup')} />}
      {view === 'preise' && <PricingView settings={settings} user={user} onBack={() => setView('setup')} />}
      </ErrorBoundary>
    </div>
  )
}

/** Zeigt einen lesbaren Fehler statt einer schwarzen Seite (Renato 19.10.2026). */
class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="card">
          <h2>Da ist etwas schiefgelaufen</h2>
          <p className="subtle" style={{ wordBreak: 'break-word' }}>
            {String(this.state.err?.message ?? this.state.err)}
          </p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }}
            onClick={() => { this.setState({ err: null }); location.reload() }}>
            Neu laden
          </button>
        </div>
      </div>
    )
  }
}

/* ============================ Setup ============================ */

function Setup({ settings, patch, user, setUser, setCards, onStart }: {
  settings: Settings; patch: (p: Partial<Settings>) => void
  user: User | null; setUser: (u: User | null) => void
  setCards: React.Dispatch<React.SetStateAction<Record<string, CardState>>>
  onStart: () => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMsg, setAuthMsg] = useState('')
  const [authMode, setAuthMode] = useState<'magic' | 'password' | 'signup'>('magic')
  const [admin, setAdmin] = useState(false)
  const [password, setPassword1] = useState('')
  const visible = useMemo(() => ALL_WORDS.filter(e => isVisible(e, settings)), [settings])

  const byLevel = LEVELS.map(l => ({
    l, n: visible.filter(e => e.level === l).length,
  }))

  return (
    <div className="container">
      <div className="card">
        <h2>Deutsch lernen — sofort loslegen</h2>
        <p className="subtle">Kein Download, kein Setup. Wort für Wort nach Häufigkeit,
          mit Spaced Repetition wie Anki — nur einfacher.</p>

        <div className="field">
          <label>Meine Muttersprache</label>
          <select className="select" value={settings.native}
            onChange={e => patch({ native: e.target.value })}>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Was möchtest du lernen?</label>
          <div className="chips">
            {(['rezeptiv', 'beides', 'produktiv'] as const).map(d => (
              <button key={d} className={`chip ${settings.direction === d ? 'on' : 'off'}`}
                onClick={() => patch({ direction: d })}>
                {d === 'rezeptiv' ? 'Nur verstehen' : d === 'beides' ? 'Verstehen + sprechen' : 'Nur sprechen'}
              </button>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: 8, fontSize: 13 }}>
            «Verstehen + sprechen» ist der empfohlene Standard: erst erkennen, dann produzieren.
          </p>
        </div>

        <div className="field">
          <label>Mein Lernplan</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {[10, 20, 30, 50].map(n => (
              <button key={n} className={`chip ${(settings.targetPerDay ?? 20) === n ? 'on' : 'off'}`}
                onClick={() => patch({ targetPerDay: n })}>
                {n} Wörter/Tag
              </button>
            ))}
          </div>
          <div className="chips">
            {[3, 5, 6, 7].map(n => (
              <button key={n} className={`chip ${(settings.daysPerWeek ?? 5) === n ? 'on' : 'off'}`}
                onClick={() => patch({ daysPerWeek: n })}>
                {n} Tage/Woche
              </button>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: 8, fontSize: 13 }}>
            {(settings.targetPerDay ?? 20)} Wörter an {(settings.daysPerWeek ?? 5)} Tagen pro Woche
            — das sind rund {Math.round((settings.targetPerDay ?? 20) * (settings.daysPerWeek ?? 5) / 7)} Wörter pro Tag im Schnitt.
          </p>
        </div>

        <div className="field">
          <label>Wortschatz</label>
          <div className="chips">
            {byLevel.map(b => (
              <span key={b.l} className="chip" style={{ background: 'var(--surface-2)' }}>
                {b.l}: {b.n}
              </span>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-block" onClick={onStart} style={{ marginTop: 12 }}>
          Jetzt lernen
        </button>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17 }}>Anmelden</h2>
        <p className="subtle" style={{ fontSize: 14 }}>
          Mit Konto ist dein Fortschritt auf jedem Gerät da. Ohne Konto bleibt er in diesem Browser.
        </p>
        {user ? (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="chip on">{user.email}</span>
            <button className="btn btn-ghost" onClick={async () => { await signOut(); setUser(null) }}>Abmelden</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['password', 'signup'] as const).map(m => (
                <button key={m} className={`btn ${authMode === m ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ flex: 1, fontSize: 14 }}
                  onClick={() => { setAuthMode(m); setAuthMsg('') }}>
                  {m === 'password' ? 'Anmelden' : 'Registrieren'}
                </button>
              ))}
            </div>

            <div className="field">
              <label>E-Mail</label>
              <input className="answer-input" style={{ textAlign: 'left', fontSize: 16 }}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="name@beispiel.ch" type="email" autoComplete="email" />
            </div>

            {(authMode === 'password' || authMode === 'signup') && (
              <div className="field">
                <label>Passwort</label>
                <input className="answer-input" style={{ textAlign: 'left', fontSize: 16 }}
                  value={password} onChange={e => setPassword1(e.target.value)}
                  placeholder="mindestens 8 Zeichen" type="password"
                  autoComplete={authMode === 'password' ? 'current-password' : 'new-password'} />
              </div>
            )}

            <button className="btn btn-primary btn-block"
              disabled={!email.includes('@') || (authMode === 'password' && password.length < 8) || authBusy}
              onClick={async () => {
                setAuthBusy(true); setAuthMsg('')
                try {
                  if (authMode === 'magic') {
                    await signInWithMagicLink(email)
                    setAuthMsg('Link verschickt. Öffne die E-Mail und klicke auf den Link — du landest wieder hier und bist angemeldet.')
                  } else if (authMode === 'password') {
                    const s = await signInWithPassword(email, password)
                    setUser({ email: s.email, name: s.email.split('@')[0] })
                    saveUser({ email: s.email, name: s.email.split('@')[0] })
                    setAuthMsg('')
                    setPassword1('')
                    // Cloud-Stand direkt nach dem Anmelden zusammenführen,
                    // damit vorhandener Fortschritt sofort da ist.
                    const cloud = await afterSignIn()
                    if (cloud) setCards(cloud)
                  } else {
                    const s = await signUpWithPassword(email, password)
                    setAuthMsg(s.needsConfirm
                      ? 'Konto angelegt. Bitte bestätige die E-Mail, die gerade verschickt wurde.'
                      : 'Konto angelegt — du bist angemeldet.')
                    if (!s.needsConfirm) {
                      const cur = await getSession()
                      if (cur) {
                        setUser({ email: cur.email, name: cur.email.split('@')[0] })
                        saveUser({ email: cur.email, name: cur.email.split('@')[0] })
                        const cloud = await afterSignIn()
                        if (cloud) setCards(cloud)
                      }
                    }
                    setPassword1('')
                  }
                } catch (err) {
                  const e = err as BackendError
                  const detail = (e as unknown as { detail?: string })?.detail
                  setAuthMsg(
                    detail === 'wrong_credentials' ? 'E-Mail oder Passwort stimmt nicht. Noch kein Passwort gesetzt? Dann «Passwort vergessen» nutzen oder den Link-Weg wählen.'
                    : detail === 'weak_password' ? 'Passwort zu schwach — mindestens 8 Zeichen.'
                    : detail === 'email_taken' ? 'Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setze das Passwort zurück.'
                    : detail === 'email_not_confirmed' ? 'Bitte zuerst die E-Mail mit dem Bestätigungslink öffnen.'
                    : errorText(e?.code ?? 'network'))
                } finally { setAuthBusy(false) }
              }}>
              {authBusy ? 'Bitte warten …'
                : authMode === 'magic' ? 'Anmelde-Link per E-Mail schicken'
                : authMode === 'password' ? 'Mit Passwort anmelden'
                : 'Konto erstellen'}
            </button>

            {authMsg && <p className="subtle" style={{ marginTop: 8 }}>{authMsg}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ fontSize: 14, textDecoration: 'underline' }}
                onClick={() => { setAuthMode(m => m === 'magic' ? 'password' : 'magic'); setAuthMsg('') }}>
                {authMode === 'magic' ? 'Lieber mit Passwort' : 'Lieber mit Link (ohne Passwort)'}
              </button>
              {authMode === 'password' && (
                <button className="btn btn-ghost" style={{ fontSize: 14, textDecoration: 'underline' }} onClick={async () => {
                    if (!email.includes('@')) { setAuthMsg('Bitte zuerst die E-Mail eintragen.'); return }
                    setAuthBusy(true); setAuthMsg('')
                    try { await requestPasswordReset(email); setAuthMsg('Zurücksetz-Mail verschickt — Link in der Mail öffnen.') }
                    catch (err) { setAuthMsg(errorText((err as BackendError)?.code ?? 'network')) }
                    finally { setAuthBusy(false) }
                  }}>Passwort vergessen</button>
              )}
            </div>
            <p className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
              {authMode === 'magic'
                ? 'Kein Passwort nötig. Der Link ist 60 Minuten gültig.'
                : 'Mindestens 8 Zeichen. Das Konto gilt für alle Geräte.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ============================ Trainer ============================ */

interface QueueItem { entry: Entry; card: CardState; dir: 'rec' | 'prod'; kind: 'wort' | 'satz'; level?: string }

function Trainer({ settings, patch, cards, setCards, daily, setDaily, onExit }: {
  settings: Settings; patch: (p: Partial<Settings>) => void
  cards: Record<string, CardState>
  setCards: React.Dispatch<React.SetStateAction<Record<string, CardState>>>
  daily: DailyCounter; setDaily: React.Dispatch<React.SetStateAction<DailyCounter>>
  onExit: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [idx, setIdx] = useState(0)
  // Aktuelle Karte — bewusst hier oben, damit alle Hooks damit rechnen koennen.
  const current: QueueItem | undefined = queue[idx]
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [hint, setHint] = useState<null | boolean>(null)
  const [audioNudged, setAudioNudged] = useState(false)
  const [levelHits, setLevelHits] = useState(0)
  const [fbOpen, setFbOpen] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [lastLevel, setLastLevel] = useState(0)
  const [sessionDone, setSessionDone] = useState(0)
  const [tick, setTick] = useState(0)
  // Lernplan-Anzeige im Trainer (Renato 23.10.2026): Tagesziel + Streak sichtbar,
  // damit das Ziel nicht nur in den Einstellungen steht.
  const [history, setHistory] = useState<Record<string, number>>(() => loadHistory())
  const dayTarget = Math.max(1, settings.targetPerDay ?? 20)
  const todayDone = history[todayKey()] || 0
  const serientage = streak(history, dayTarget)
  // Fehlerkartei (Renato 23.10.2026): falsch beantwortete Karten kommen am
  // Sessionende noch einmal — Korrekturlernen direkt nach dem Fehler.
  const [mistakes, setMistakes] = useState<QueueItem[]>([])
  const [inMistakeRound, setInMistakeRound] = useState(false)
  // WICHTIG: Alle Hooks muessen VOR jedem fruehzeitigen return stehen,
  // sonst aendert sich die Hook-Reihenfolge und React rendert eine schwarze
  // Seite (Renato 19.10.2026). Darum stehen die Sprech-Zustaende hier oben.
  const [listening, setListening] = useState(false)
  const [speechErr, setSpeechErr] = useState('')
  const recRef = useRef<{ stop: () => void } | null>(null)
  // Bewertung: nur die exakte Uebereinstimmung zaehlt als richtig. Ein Tippfehler
  // wird als falsch gewertet und deutlich markiert (Renato 19.10.2026).
  const [typoClose, setTypoClose] = useState(false)
  const [matchScore, setMatchScore] = useState(0)

  // Saemtliche Hooks muessen VOR jedem fruehzeitigen return stehen und
  // duerfen nie von einer fehlenden Karte abhaengen (Renato 19.10.2026).
  const curEntry: Entry | undefined = current?.entry
  const curCard: CardState | undefined = current?.card
  const curDir = current?.dir ?? 'rec'
  const curKind = current?.kind ?? 'wort'
  const checkTarget = !curEntry
    ? ''
    : curKind === 'satz'
      ? (curDir === 'rec'
          ? (() => {
              const parts = curEntry.sentence.split('{{ }}')
              const full = curEntry.sentenceFull
              const before = parts[0] ?? ''
              const after = parts[1] ?? ''
              const gap = full.slice(before.length, full.length - after.length).trim()
              return gap || curEntry.de
            })()
          : curEntry.sentenceFull)
      : curDir === 'rec'
        ? (curEntry.tr[settings.native] ?? '')
        : curEntry.de


  // Wie stark stimmt die Eingabe mit der Lösung überein? (0..1, nur Anzeige)
  const typedMatch = useMemo(() => {
    const a = normalize(typed)
    const b = normalize(checkTarget)
    if (!a || !b) return 0
    if (a === b) return 1
    const d = levenshtein(a, b)
    return Math.max(0, 1 - d / Math.max(a.length, b.length))
  }, [typed, checkTarget])
  // Anki-artige Gegenüberstellung (nur Anzeige, keine Bewertung)
  const typedDiff = useMemo(
    () => ankiDiff(typed, checkTarget),
    [typed, checkTarget],
  )

  // Timer für «fällig in»
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Queue bauen
  useEffect(() => {
    setQueue(buildQueue(settings, cards, daily))
  }, [])


  useEffect(() => {
    setRevealed(false); setTyped(''); setHint(null); setTypoClose(false); setMatchScore(0)
    setAudioNudged(false)
    if (current) {
      setStartedAt(Date.now())
      // Kein Auto-Audio mehr beim Kartenwechsel (Renato 18.10.2026):
      // erst nach Eingabe oder nach dem Aufdecken, sonst nur per Play-Knopf.
    }
  }, [idx, current?.card.id])

  if (!queue.length) {
    // Diagnose statt Sackgasse (Renato 18.10.2026): Der Nutzer muss sehen,
    // WARUM nichts kommt — und mit einem Klick weiterlernen können.
    const sichtbar = ALL_WORDS.filter(en => isVisible(en, settings)).length
    // Fehlerkartei vor der Abschlussmeldung (Renato 23.10.2026):
    // falsch beantwortete Karten kommen zuerst noch einmal dran.
    if (mistakes.length > 0 && !inMistakeRound) {
      return (
        <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Fehlerkartei: {mistakes.length} Karten 🔁</h2>
            <p className="subtle">
              Diese Wörter hast du heute falsch beantwortet. Jetzt noch einmal —
              genau hier wirkt die Korrektur am besten.
            </p>
            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }}
              onClick={() => { setInMistakeRound(true); setQueue(mistakes); setMistakes([]); setIdx(0); setRevealed(false); setTyped('') }}>
              Fehlerkartei starten
            </button>
            <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }}
              onClick={() => setMistakes([])}>Später</button>
            <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onExit}>Beenden</button>
          </div>
        </div>
      )
    }
    const grund = sichtbar === 0
      ? 'Deine Filter lassen gerade kein einziges Wort übrig (Lebensbereiche oder Regionen sind alle abgewählt).'
      : `Tageslimit erreicht: ${daily.newDone} neue Karten und ${daily.reviewDone} Wiederholungen heute.`
    return (
      <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Gerade keine Karte 🎉</h2>
          <p className="subtle">{grund}</p>
          <p className="subtle" style={{ fontSize: 13 }}>
            Sichtbare Wörter insgesamt: {sichtbar} · Warteschlange: {queue.length}
          </p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }}
            onClick={() => { setDaily(d => ({ ...d, newDone: 0, reviewDone: 0 })); setQueue(buildQueue(settings, cards, { ...daily, newDone: 0, reviewDone: 0 })) }}>
            Trotzdem weiterlernen
          </button>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onExit}>Zurück</button>
        </div>
      </div>
    )
  }

  const e = current.entry
  const nativeLang = settings.native

  const kindLabel = current.kind === 'satz' ? 'Beispielsatz' : 'Wort'
  const dirLabel = current.dir === 'rec' ? 'Deutsch → ' + langName(nativeLang) : langName(nativeLang) + ' → Deutsch'

  const front = current.dir === 'rec'
    ? (current.kind === 'wort' ? e.de : e.sentence.replace('{{ }}', '…'))
    : (current.kind === 'wort'
        ? (e.tr[nativeLang] ?? e.de)
        : (e.trSentence?.[nativeLang] ?? e.sentence.replace('{{ }}', '…')))

  const back = current.dir === 'rec'
    ? (current.kind === 'wort' ? (e.tr[nativeLang] ?? '—') : e.sentenceFull)
    : (current.kind === 'wort' ? e.de : e.sentenceFull)

  const grade = (rating: Rating) => {
    const result = schedule(current.card, rating)
    const next = { ...result.card }
    if (rating === 'right' || rating === 'good' || rating === 'easy') {
      next.recCorrect = current.dir === 'rec' ? next.recCorrect + 1 : next.recCorrect
      next.prodCorrect = current.dir === 'prod' ? next.prodCorrect + 1 : next.prodCorrect
    }
    if (rating === 'wrong' || rating === 'again') {
      next.lapses += 1
    }
    // Produktion freischalten (Vorgabe 36)
    if (current.dir === 'rec' && current.kind === 'wort' && next.recCorrect >= 2
        && settings.direction !== 'rezeptiv') {
      const pid = cardId(e.id, 'prod', 'wort')
      if (!cards[pid]) {
        const prodCard = makeCard(e.id, 'prod', 'wort')
        prodCard.stage = 1
        prodCard.due = Date.now()
        setCards(c => ({ ...c, [pid]: prodCard }))
      }
    }
    // Satzkarte freischalten, sobald Wort sitzt
    if (current.kind === 'wort' && next.reps >= 3 && settings.cardTypes !== 'wort') {
      const sid = cardId(e.id, current.dir, 'satz')
      if (!cards[sid]) {
        const sc = makeCard(e.id, current.dir, 'satz')
        sc.stage = 1
        sc.due = Date.now()
        setCards(c => ({ ...c, [sid]: sc }))
      }
    }

    setCards(c => ({ ...c, [current.card.id]: next }))
    // Cloud-Sync: Zeitstempel pro Karte setzen (LWW) + Bewertung protokollieren.
    // Beides ist fail-silent — ohne Backend/Login bleibt alles lokal.
    touchCard(current.card.id)
    void logReview(current.card.id, rating)
    if (isNew(current.card)) setDaily(d => ({ ...d, newDone: d.newDone + 1 }))
    else setDaily(d => ({ ...d, reviewDone: d.reviewDone + 1 }))

    // Fehlerkartei: falsch beantwortete Karte für die Schlussrunde merken.
    // Ein Eintrag bleibt nur einmal drin, damit die Runde nicht endlos wird.
    if (rating === 'wrong' || rating === 'again') {
      setMistakes(m => (m.some(q => q.entry.id === e.id && q.dir === current.dir && q.kind === current.kind)
        ? m
        : [...m, { entry: e, card: next, dir: current.dir, kind: current.kind }]))
    }

    // Niveau-Leiter: richtig -> nächste Stufe, falsch -> auf dem Niveau bleiben
    // (Vorgabe Renato 18.10.2026): A1 haeufigstes -> richtig -> A2 haeufigstes -> ...
    const passed = rating === 'right' || rating === 'good' || rating === 'easy'
    const entryLvl = levelIndex(e.level)
    const curLvl = levelIndex(settings.maxLevel)
    // richtig -> eine Stufe hoch, falsch -> eine Stufe runter (Renato 18.10.2026)
    if (passed) {
      // Erst hochsteigen, wenn das aktuelle Niveau sicher sitzt (mind. 5 Karten
      // dieses Niveaus in dieser Session richtig) — sonst wird der Stoff
      // abgeschnitten, bevor er gelernt ist (Evidenz-Audit 18.10.2026).
      if (entryLvl >= curLvl && curLvl < LEVELS.length - 1 && levelHits + 1 >= 5) {
        patch({ maxLevel: LEVELS[curLvl + 1] })
        setLevelHits(0)
      } else if (entryLvl >= curLvl) {
        setLevelHits(n => n + 1)
      }
    } else {
      if (curLvl > 0) patch({ maxLevel: LEVELS[curLvl - 1] })
    }
    setLastLevel(entryLvl)

    const rest = queue.filter((_, i) => i !== idx)
    // Wenn sofort fällig (Nochmal/Falsch), wieder einfügen — randomisiert
    const delay = result.delayMs
    if (delay < 60 * 60 * 1000 && (rating === 'again' || rating === 'wrong' || rating === 'hard')) {
      const pos = Math.min(rest.length, 3 + Math.floor(Math.random() * 4))
      rest.splice(pos, 0, { ...current, card: next })
    }
    setQueue(rest)
    setIdx(0)
    setSessionDone(x => x + 1)
    // Tages-Historie: Grundlage für Tagesziel-Ring und Streak (Renato 23.10.2026).
    setHistory(h => {
      const key = todayKey()
      const next = { ...h, [key]: (h[key] || 0) + 1 }
      saveHistory(next)
      return next
    })
  }

  const reveal = () => {
    setRevealed(true)
    if (settings.audio && settings.audioMode === 'afterReveal' && !audioNudged) {
      setAudioNudged(true)
      speak(current.entry.de, true)
    }
  }

  // --- Sprechen: Spracherkennung im Browser (Web Speech API, kein Server, keine Kosten)
  const speechAvailable = typeof window !== 'undefined' &&
    Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)

  const startListening = () => {
    if (!speechAvailable) { setSpeechErr('Dein Browser kann keine Sprache aufnehmen. Nutze Chrome oder Safari.'); return }
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'de-CH'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    setSpeechErr('')
    setListening(true)
    rec.onresult = (ev: any) => {
      let text = ''
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript + ' '
      setTyped(text.trim())
    }
    rec.onerror = (ev: any) => {
      setListening(false)
      setSpeechErr(ev?.error === 'not-allowed'
        ? 'Mikrofon nicht erlaubt. Im Browser die Berechtigung geben.'
        : ev?.error === 'no-speech' ? 'Nichts gehört — nochmals probieren.'
        : 'Aufnahme fehlgeschlagen.')
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start() } catch { setListening(false) }
  }

  const stopListening = () => {
    try { recRef.current?.stop() } catch { /* schon beendet */ }
    setListening(false)
  }

  const checkTyped = () => {
    if (!typed.trim()) return
    const exact = isExactAnswer(typed, checkTarget)
    const close = !exact && checkTarget.length > 3 && fuzzyEqual(typed, checkTarget)
    setTypoClose(close)
    setHint(exact)
    setMatchScore(typedMatch)
    setRevealed(true)
    if (settings.audio && settings.audioMode === 'afterInput' && !audioNudged) {
      setAudioNudged(true)
      speak(current.entry.de, true)
    }
  }

  // Wo wird getippt? (Vorgabe 25/26 + 37: Satzproduktion braucht ein Eingabefeld)
  //  * produktive Wortkarte: Zielfremdsprache in Deutsch
  //  * produktive Satzkarte: ganzer Satz auf Deutsch
  //  * rezeptive Satzkarte: Lueckentext — das fehlende Wort wird ergaenzt
  const inputActive = settings.textInput && (
    (current.dir === 'prod' && (current.kind === 'wort' || current.kind === 'satz')) ||
    (current.dir === 'rec' && current.kind === 'satz')
  )



  const labels = previewLabels(current.card)
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)

  if (!e) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="card">
          <h2>Karte konnte nicht geladen werden</h2>
          <p className="subtle">Interner Zustand: Position {idx}, Warteschlange {queue.length}.</p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={onExit}>Zurück</button>
        </div>
      </div>
    )
  }

  return (
    <div className="trainer">
      <div className="trainer-top">
        <div className="counter"><span className="dot dot-new" />{Math.max(0, settings.newPerDay - daily.newDone)}</div>
        <div className="counter"><span className="dot dot-due" />{queue.length}</div>
        <div className="counter"><span className="dot dot-done" />{sessionDone}</div>
        <div className="counter goal-counter" title={`Tagesziel: ${dayTarget} Wörter`}>
          <span className="goal-ring" aria-hidden="true">
            <svg viewBox="0 0 36 36" width="16" height="16">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="5" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" strokeWidth="5"
                strokeDasharray={`${(goalPercent(history, dayTarget) / 100) * 94.2} 94.2`}
                strokeLinecap="round" transform="rotate(-90 18 18)" />
            </svg>
          </span>
          {todayDone}/{dayTarget}
          {serientage > 1 && <span className="streak-badge" title={`${serientage} Tage in Folge`}>🔥 {serientage}</span>}
        </div>
        <span style={{ flex: 1 }} />
        {settings.timer && <span>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>}
        <button className="icon-btn" onClick={onExit} title="Beenden">✕</button>
      </div>

      <div className="stage">
        <div className="flashcard">
          <div className="front-hint">{kindLabel} · {dirLabel} · {e.level}</div>
          <div className="front-row">
            <div className="front-word">{front}</div>
            <button className="icon-btn play-btn" title="Vorlesen" onClick={() => speak(current.entry.de, true)}>▶</button>
          </div>

          {!revealed && inputActive && (
            <>
            <input className={`answer-input ${hint === true ? 'correct' : hint === false ? 'wrong' : ''}`}
              autoFocus value={typed}
              onChange={ev => setTyped(ev.target.value)}
              onKeyDown={ev => { if (ev.key === 'Enter') checkTyped() }}
              placeholder={current.kind === 'satz' ? 'Satz auf Deutsch tippen …' : 'Antwort tippen …'}
              autoComplete="off" autoCapitalize="off" spellCheck={false} />

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button className={`btn ${listening ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 14 }}
                onClick={listening ? stopListening : startListening}>
                {listening ? '● Aufnahme läuft — stopp' : '🎤 Sprechen statt tippen'}
              </button>
            </div>
            {speechErr && <p className="subtle" style={{ fontSize: 12, marginTop: 6 }}>{speechErr}</p>}
            </>
          )}

          {revealed && (
            <>
              <div className="divider" />
              {hint !== null && (
                <div>
                  {/* Anki-Darstellung (Renato 19.10.2026): Zeichen für Zeichen.
                      Kein Urteil, kein Prozentbalken — nur die Gegenüberstellung. */}
                  <div className="anki-diff">
                    <div className="anki-row">
                      <div className="anki-label">Deine Eingabe</div>
                      <div className="anki-line">
                        {typedDiff.input.map((seg, k) => (
                          <span key={k} className={`anki-${seg.kind}`}>{seg.text}</span>
                        ))}
                      </div>
                    </div>
                    <div className="anki-row">
                      <div className="anki-label">Lösung</div>
                      <div className="anki-line">
                        {typedDiff.target.map((seg, k) => (
                          <span key={k} className={`anki-${seg.kind}`}>{seg.text}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Anki zeigt keine Prozentzahl — nur Grün/Rot/Grau. */}
                  <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
                    Grün = getroffen · Rot = falsch getippt · Grau = fehlt
                  </div>
                </div>
              )}
              <button className="btn btn-secondary btn-block" style={{ marginTop: 10, fontSize: 13 }}
                onClick={() => { setFbOpen(v => !v) }}>
                ⚑ Fehler an dieser Karte melden
              </button>
              {fbOpen && <FeedbackCard settings={settings} current={e} />}
              <div className="front-row">
                <div className="answer">{back}</div>
                <button className="icon-btn play-btn" title="Vorlesen" onClick={() => speak(e.de, true)}>▶</button>
              </div>
              {current.kind === 'satz' && (
                <div className="answer-sentence">{e.sentenceFull}</div>
              )}
              {current.kind === 'wort' && settings.cardTypes !== 'satz' && (
                <div className="meaning">{e.sentenceFull}</div>
              )}
              {current.dir === 'rec' && (
                <div className="subtle" style={{ fontSize: 13 }}>
                  {e.meaningTr?.[((settings as any).explainLang && (settings as any).explainLang !== 'auto') ? (settings as any).explainLang : settings.native] || e.meaning}
                </div>
              )}
            </>
          )}

          {!revealed && !inputActive && (
            <button className="btn btn-primary btn-block" onClick={reveal}>
              Antwort zeigen
            </button>
          )}
          {!revealed && inputActive && (
            <button className="btn btn-primary btn-block" onClick={checkTyped} disabled={!typed.trim()}>
              Prüfen
            </button>
          )}
        </div>
      </div>

      {revealed && (
        settings.evalMode === 'einfach' ? (
          <div className="gradebar g2">
            <button className="grade g-again" onClick={() => grade('wrong')}>Falsch</button>
            <button className="grade g-good" onClick={() => grade('right')}>Richtig</button>
          </div>
        ) : (
          <div className="gradebar g4">
            <button className="grade g-again" onClick={() => grade('again')}>Nochmal<small>{labels.again}</small></button>
            <button className="grade g-hard" onClick={() => grade('hard')}>Schwer<small>{labels.hard}</small></button>
            <button className="grade g-good" onClick={() => grade('good')}>Gut<small>{labels.good}</small></button>
            <button className="grade g-easy" onClick={() => grade('easy')}>Einfach<small>{labels.easy}</small></button>
          </div>
        )
      )}
    </div>
  )
}

function AdminView({ onBack }: { onBack: () => void }) {
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(10)
  const [days, setDays] = useState(90)
  const [note, setNote] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSeats, setOrgSeats] = useState(20)

  const load = async () => {
    try {
      setCodes(await listCodes())
      setOrgs(await orgOverview())
    } catch (e) { setMsg((e as Error).message) }
  }
  useEffect(() => { void load() }, [])

  const erzeugen = async () => {
    setBusy(true); setMsg('')
    try {
      const neu = await createCodes({
        count: Number(count), kind: 'voucher', language: 'de',
        days: Number(days) || null, note: note || undefined,
      })
      setMsg(`${neu.length} Codes erzeugt.`)
      await load()
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Verwaltung</h1>
        <span className="spacer" />
        <button className="icon-btn" onClick={onBack} title="Zurück">←</button>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17 }}>Gutschein-Codes erzeugen</h2>
        <p className="subtle" style={{ fontSize: 14 }}>
          Ein Code = ein Platz, einmal einlösbar, läuft nach der Kurszeit automatisch ab.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 90 }}>
            <span className="subtle" style={{ fontSize: 12 }}>Anzahl</span>
            <input className="answer-input" style={{ textAlign: 'left' }} type="number" min={1} max={500}
              value={count} onChange={e => setCount(Number(e.target.value))} />
          </label>
          <label style={{ flex: 1, minWidth: 90 }}>
            <span className="subtle" style={{ fontSize: 12 }}>Laufzeit (Tage)</span>
            <input className="answer-input" style={{ textAlign: 'left' }} type="number" min={1}
              value={days} onChange={e => setDays(Number(e.target.value))} />
          </label>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <span className="subtle" style={{ fontSize: 12 }}>Notiz (z.B. Kurs Oktober 2026)</span>
          <input className="answer-input" style={{ textAlign: 'left' }}
            value={note} onChange={e => setNote(e.target.value)} placeholder="Kurs Oktober 2026" />
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }}
          disabled={busy} onClick={erzeugen}>
          {busy ? 'Wird erzeugt …' : `${count} Codes erzeugen`}
        </button>
        {msg && <p className="subtle" style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17 }}>Codes ({codes.length})</h2>
        {codes.length === 0 && <p className="subtle">Noch keine Codes erzeugt.</p>}
        {codes.length > 0 && (
          <>
            <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }}
              onClick={() => {
                const t = codesAsText(codes)
                navigator.clipboard?.writeText(t)
                setMsg('Alle Codes kopiert — jetzt in Excel oder Mail einfügen.')
              }}>
              Alle Codes kopieren
            </button>
            <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto', fontSize: 13 }}>
              {codes.map(c => (
                <div key={c.code} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <code style={{ flex: 1 }}>{c.code}</code>
                  <span className="subtle" style={{ fontSize: 12 }}>
                    {c.used}/{c.seat_limit} · {c.valid_until ? new Date(c.valid_until).toLocaleDateString('de-CH') : '∞'}
                    {c.status !== 'active' ? ` · ${c.status}` : ''}
                  </span>
                  <button className="icon-btn" title="30 Tage verlängern"
                    onClick={async () => { await extendCode(c.code, 30); await load() }}>+30</button>
                  <button className="icon-btn" title={c.status === 'revoked' ? 'Entsperren' : 'Sperren'}
                    onClick={async () => { await setCodeStatus(c.code, c.status === 'revoked' ? 'active' : 'revoked'); await load() }}>
                    {c.status === 'revoked' ? '↺' : '⊘'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17 }}>Firmen &amp; Lehrpersonen</h2>
        <p className="subtle" style={{ fontSize: 14 }}>
          Kontingent statt Einzelcodes: N Sitze, ein Admin, Entzug möglich.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ flex: 2, minWidth: 140 }}>
            <span className="subtle" style={{ fontSize: 12 }}>Name</span>
            <input className="answer-input" style={{ textAlign: 'left' }}
              value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Sprachschule X" />
          </label>
          <label style={{ flex: 1, minWidth: 80 }}>
            <span className="subtle" style={{ fontSize: 12 }}>Sitze</span>
            <input className="answer-input" style={{ textAlign: 'left' }} type="number" min={10}
              value={orgSeats} onChange={e => setOrgSeats(Number(e.target.value))} />
          </label>
        </div>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }}
          disabled={!orgName.trim()}
          onClick={async () => {
            try { await createOrg(orgName.trim(), Number(orgSeats), 5); setOrgName(''); await load() }
            catch (e) { setMsg((e as Error).message) }
          }}>
          Firma anlegen (CHF 5/Sitz)
        </button>
        <div style={{ marginTop: 12 }}>
          {orgs.map(o => (
            <div key={o.org_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <span>{o.name}</span>
              <span className="subtle">{o.used}/{o.seats} belegt</span>
            </div>
          ))}
          {orgs.length === 0 && <p className="subtle">Noch keine Firmen.</p>}
        </div>
      </div>
    </div>
  )
}

function langName(code: string) {
  return LANGS.find(l => l.code === code)?.name ?? code
}

/** Queue: neue + fällige gemischt (Vorgabe 9 / 46). */
function buildQueue(settings: Settings, cards: Record<string, CardState>, daily: DailyCounter): QueueItem[] {
  const now = Date.now()
  const visible = ALL_WORDS.filter(e => isVisible(e, settings))
  // Selbstheilung (Renato 18.10.2026): Karten zu Einträgen, die es nicht mehr
  // gibt (z.B. nach einem Datenwechsel), dürfen neue Karten nicht blockieren.
  const knownEntries = new Set(visible.map(e => e.id))
  const due: QueueItem[] = []
  const fresh: QueueItem[] = []

  for (const e of visible) {
    const kinds: ('wort' | 'satz')[] =
      settings.cardTypes === 'wort' ? ['wort'] :
      settings.cardTypes === 'satz' ? ['satz'] : ['wort', 'satz']
    const dirs: ('rec' | 'prod')[] =
      settings.direction === 'rezeptiv' ? ['rec'] :
      settings.direction === 'produktiv' ? ['prod'] : ['rec', 'prod']

    for (const kind of kinds) for (const dir of dirs) {
      const id = cardId(e.id, dir, kind)
      const c = knownEntries.has(e.id) ? cards[id] : undefined
      if (c) {
        if (isDue(c, now)) due.push({ entry: e, card: c, dir, kind })
      } else if (dir === 'rec' && kind === 'wort') {
        fresh.push({ entry: e, card: makeCard(e.id, 'rec', 'wort'), dir, kind })
      }
    }
  }

  const freshLeft = Math.max(0, settings.newPerDay - daily.newDone)
  const reviewLeft = Math.max(0, settings.reviewsPerDay - daily.reviewDone)
  const byRank = (a: QueueItem, b: QueueItem) => a.entry.rank - b.entry.rank

  // Selbstheilung: Wenn der Tagesstand (z.B. durch einen alten Fehler) über dem
  // Limit liegt, aber nichts mehr fällig ist, darf die App NICHT leer bleiben.
  // Dann gilt das Tageslimit als nicht erreicht (Renato 18.10.2026).
  const nothingDue = due.length === 0 && freshLeft === 0
  const healFresh = nothingDue ? settings.newPerDay : freshLeft

  if (settings.order === 'rank') {
    // Häufigkeit + Niveau-Leiter (Vorgabe Renato 18.10.2026):
    // Das häufigste Wort des aktuellen Niveaus zuerst. Ist es richtig, steigt das
    // Niveau (A1 -> A2 -> B1 ...); bei einem Fehler bleibt man auf dem Niveau und
    // bekommt das nächsthäufigste Wort desselben Niveaus.
    const byLevel = (a: QueueItem, b: QueueItem) =>
      levelIndex(a.entry.level) - levelIndex(b.entry.level) || a.entry.rank - b.entry.rank

    const lvlNow = settings.maxLevel ?? LEVELS[0]
    const pendingStatus = (item: QueueItem) => item.card.stage === 0

    const pass = (list: QueueItem[], limit: number) => {
      const sorted = [...list].sort(byLevel)
      const onLevel = sorted.filter(q => q.entry.level === lvlNow)
      const below = sorted.filter(q => levelIndex(q.entry.level) < levelIndex(lvlNow))
      const above = sorted.filter(q => levelIndex(q.entry.level) > levelIndex(lvlNow))
      // Erst das aktuelle Niveau, dann tiefere (Wiederholung), zuletzt höhere.
      return [...onLevel, ...below, ...above].slice(0, limit)
    }

    const newPick = pass(fresh.filter(pendingStatus), healFresh)
    const duePick = pass(due, reviewLeft)

    // Interleaving, wirksam statt nominal: neue und fällige Karten werden
    // gemischt UND derselbe Eintrag erscheint nicht zweimal direkt hintereinander.
    // Ebenso werden zwei Karten desselben Themas (erste Kategorie) nach
    // Möglichkeit getrennt — Blocklernen ist der schwächere Lernweg
    // (Rohrer & Taylor 2007; Cepeda et al. 2006).
    return interleave(newPick, duePick)
  }

  const newPick = shuffle(fresh).slice(0, healFresh)
  const duePick = shuffle(due).slice(0, reviewLeft)
  return interleave(newPick, duePick)
}

/**
 * Mischt zwei Kartenlisten so, dass
 *  * neue und fällige Karten abwechseln (proportional zur Menge),
 *  * nie zweimal derselbe Eintrag direkt hintereinander kommt,
 *  * zwei Karten desselben Themas möglichst nicht aufeinander folgen.
 * Wenn ein Kriterium nicht erfüllbar ist, gewinnt die Vollständigkeit:
 * keine Karte darf verloren gehen.
 */
function interleave(newPick: QueueItem[], duePick: QueueItem[]): QueueItem[] {
  const pool: QueueItem[] = []
  let i = 0, j = 0
  while (i < newPick.length || j < duePick.length) {
    const restNew = newPick.length - i
    const restDue = duePick.length - j
    const takeNew = restDue === 0 || (restNew > 0 && Math.random() < restNew / (restNew + restDue))
    if (takeNew) pool.push(newPick[i++])
    else pool.push(duePick[j++])
  }

  const out: QueueItem[] = []
  const rest = [...pool]
  while (rest.length) {
    const prev = out[out.length - 1]
    // bevorzugt: anderer Eintrag UND anderes Thema als die letzte Karte
    let idx = rest.findIndex(q =>
      (!prev || q.entry.id !== prev.entry.id) &&
      (!prev || q.entry.cats[0] !== prev.entry.cats[0]))
    if (idx < 0) idx = rest.findIndex(q => !prev || q.entry.id !== prev.entry.id)
    if (idx < 0) idx = 0
    out.push(rest.splice(idx, 1)[0])
  }
  return out
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/* ============================ Stats ============================ */

function Stats({ cards, settings, onBack }: {
  cards: Record<string, CardState>; settings: Settings; onBack: () => void
}) {
  const all = Object.values(cards)
  const known = all.filter(c => c.interval >= 21).length
  const learning = all.filter(c => c.stage === 0 || c.interval < 21).length
  const visible = ALL_WORDS.filter(e => isVisible(e, settings))
  const now = Date.now()
  const dueToday = all.filter(c => c.due <= now + 86_400_000).length

  return (
    <div className="container">
      <div className="stat-grid">
        <div className="stat"><div className="n">{all.length}</div><div className="l">Karten gesehen</div></div>
        <div className="stat"><div className="n">{known}</div><div className="l">gefestigt</div></div>
        <div className="stat"><div className="n">{learning}</div><div className="l">im Aufbau</div></div>
        <div className="stat"><div className="n">{dueToday}</div><div className="l">fällig in 24 h</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 17 }}>Fortschritt pro Stufe</h2>
        {LEVELS.map(l => {
          const total = visible.filter(e => e.level === l).length
          const done = all.filter(c => BY_ID.get(c.entryId)?.level === l).length
          const pct = total ? Math.min(100, (done / total) * 100) : 0
          return (
            <div className="level-row" key={l}>
              <span className="lv">{l}</span>
              <div className="bar">
                <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
              </div>
              <span className="subtle" style={{ fontSize: 13, minWidth: 68, textAlign: 'right' }}>
                {done}/{total}
              </span>
            </div>
          )
        })}
      </div>

      <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={onBack}>
        Zurück
      </button>
    </div>
  )
}

/* ============================ Settings ============================ */

/* ============================ Preise ============================ */

/** Preisseite: Free-Stufe, Pro-Abo pro Sprache, Berufsfeld-Pakete, B2B.
 *  Vorgaben N (64–74): kein Scheinkauf, keine Fake-Verknappung, A1+A2 bleiben gratis. */
function PricingView({ settings, user, onBack }: {
  settings: Settings; user: User | null; onBack: () => void
}) {
  const [tab, setTab] = useState<'privat' | 'firma'>('privat')
  const [openPack, setOpenPack] = useState<string | null>(null)
  const [seats, setSeats] = useState(10)
  const tier = seats >= 200 ? COMPANY_TIERS[2] : seats >= 50 ? COMPANY_TIERS[1] : COMPANY_TIERS[0]
  const monthly = PRICES_DE[0].price
  const yearly = PRICES_DE[1].price
  const saved = yearlySaving(monthly, yearly)

  return (
    <div className="container">
      <div className="card">
        <h2>Preise</h2>
        <p className="subtle">
          A1 und A2 sind gratis — vollständig, mit allen Übungen. Bezahlt wird erst ab B1.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {(['privat', 'firma'] as const).map(t => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, fontSize: 14 }} onClick={() => setTab(t)}>
              {t === 'privat' ? 'Für mich' : 'Für Betriebe'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'privat' && (
        <>
          <div className="card">
            <h2 style={{ fontSize: 17 }}>Gratis</h2>
            <p className="subtle" style={{ fontSize: 14 }}>Für immer, ohne Konto möglich.</p>
            <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.9 }}>
              {FREE_INCLUDES.map(x => <li key={x}>{x}</li>)}
            </ul>
            <p className="subtle" style={{ fontSize: 13, marginTop: 10 }}>
              Keine Werbung in der Lernkarte, keine künstliche Verknappung.
            </p>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 17 }}>Pro — Deutsch</h2>
            <p className="subtle" style={{ fontSize: 14 }}>
              Preis gilt pro Lernsprache. Jede weitere Sprache ist ein eigenes Abo.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {PRICES_DE.map(p => (
                <button key={p.id} className="btn btn-secondary btn-block"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 16px', textAlign: 'left',
                    border: p.highlight ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}
                  onClick={() => setOpenPack(p.id)}>
                  <span>
                    <strong>{p.title}</strong>
                    {p.note && <span className="subtle" style={{ display: 'block', fontSize: 13 }}>{p.note}</span>}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <strong>{priceLabel(p.price)}</strong>
                    {p.perMonth && (
                      <span className="subtle" style={{ display: 'block', fontSize: 13 }}>
                        {formatCHF(p.perMonth)} / Monat
                      </span>
                    )}
                    {p.saving && (
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--accent)' }}>{p.saving}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            <p className="subtle" style={{ fontSize: 13, marginTop: 14 }}>
              Jahresabo gegenüber 12 Monatsraten: {formatCHF(saved)} günstiger.
            </p>

            <h3 style={{ fontSize: 15, marginTop: 22 }}>In Pro enthalten</h3>
            <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.9 }}>
              {PRO_INCLUDES.map(x => <li key={x}>{x}</li>)}
            </ul>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 17 }}>Berufsfeld-Pakete</h2>
            <p className="subtle" style={{ fontSize: 14 }}>
              {priceLabel(PRICE_FIELD_PACK)} pro Sprache und Branche. Einzeln kaufbar, ohne Abo.
            </p>
            <div className="chips" style={{ marginTop: 14 }}>
              {FIELD_PACKS.map(f => (
                <button key={f.id} className="chip" style={{ background: 'var(--surface-2)' }}
                  onClick={() => setOpenPack(f.id)} title={f.note}>
                  {f.title}
                </button>
              ))}
            </div>
            {openPack && FIELD_PACKS.some(f => f.id === openPack) && (
              <p className="subtle" style={{ fontSize: 13, marginTop: 12 }}>
                {FIELD_PACKS.find(f => f.id === openPack)?.title}: {' '}
                {FIELD_PACKS.find(f => f.id === openPack)?.note} — {priceLabel(PRICE_FIELD_PACK)}
              </p>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: 17 }}>Alle Sprachen</h2>
            <p className="subtle" style={{ fontSize: 14 }}>
              {PRICE_BUNDLE.title} für {priceLabel(PRICE_BUNDLE.price)} im Jahr — {PRICE_BUNDLE.note}.
            </p>
            <p className="subtle" style={{ fontSize: 14 }}>
              Lifetime alle Sprachen: {priceLabel(PRICE_LIFETIME_ALL)}.
            </p>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 17 }}>Bezahlen</h2>
            <div className="chips" style={{ marginTop: 10 }}>
              {PAYMENT_METHODS.map(m => (
                <span key={m} className="chip" style={{ background: 'var(--surface-2)' }}>{m}</span>
              ))}
              <span className="chip" style={{ background: 'var(--surface-2)' }}>Rechnung (Betriebe)</span>
            </div>
            <p className="subtle" style={{ fontSize: 13, marginTop: 14 }}>
              {openPack
                ? `Ausgewählt: ${openPack}. Die Zahlung ist noch nicht angeschlossen — deshalb ist hier nichts gesperrt.`
                : 'Die Zahlung wird gerade angeschlossen. Solange sie nicht funktioniert, bleibt alles nutzbar.'}
            </p>
            {!user && (
              <p className="subtle" style={{ fontSize: 13 }}>
                Für ein Abo brauchst du ein Konto — damit dein Kauf auf jedem Gerät gilt.
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'firma' && (
        <>
          <div className="card">
            <h2 style={{ fontSize: 17 }}>Firmenlizenzen</h2>
            <p className="subtle" style={{ fontSize: 14 }}>
              Sitzlizenzen ab 10 Sitzen, Jahresrechnung. Gedacht für Integrationsbetriebe,
              Spitäler, Gastro-Ketten und Temporärfirmen.
            </p>
            <div style={{ marginTop: 18 }}>
              {COMPANY_TIERS.map(t => (
                <div key={t.seats} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{t.seats} Sitze</span>
                  <span className="subtle" style={{ fontSize: 14 }}>
                    {formatCHF(t.pricePerSeat)} / {t.note?.toLowerCase().includes('anfrage') ? 'Sitz' : 'Sitz'}
                  </span>
                </div>
              ))}
            </div>

            <div className="field">
              <label>Sitze</label>
              <input className="answer-input" type="number" min={10} value={seats}
                style={{ textAlign: 'left', fontSize: 16 }}
                onChange={e => setSeats(Math.max(10, Number(e.target.value) || 10))} />
            </div>
            <p className="subtle" style={{ fontSize: 14 }}>
              {seats} Sitze × {formatCHF(tier.pricePerSeat)} = <strong>{formatCHF(companyYearly(seats, tier.pricePerSeat))}</strong> pro Jahr.
            </p>
            <p className="subtle" style={{ fontSize: 13, marginTop: 6 }}>
              {tier.note}
            </p>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 17 }}>Was Betriebe bekommen</h2>
            <ul style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.9 }}>
              <li>Alle Stufen inklusive, auch Berufsfeld-Pakete</li>
              <li>Verwaltung mehrerer Personen und Kontingente</li>
              <li>Fortschritt pro Person einsehbar</li>
              <li>Jahresrechnung, keine automatische Verlängerung</li>
            </ul>
            <p className="subtle" style={{ fontSize: 13, marginTop: 12 }}>
              Anfrage geht direkt an {settings.native === 'de' ? 'uns' : 'uns'} — wir melden uns mit einem Angebot.
            </p>
          </div>
        </>
      )}

      <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={onBack}>
        Zurück
      </button>
    </div>
  )
}

function SettingsView({ settings, patch, user, setUser, onBack }: {
  settings: Settings; patch: (p: Partial<Settings>) => void
  user: User | null; setUser: (u: User | null) => void; onBack: () => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)

  const toggleCat = (c: string) => {
    const has = settings.cats.includes(c as never)
    patch({ cats: has ? settings.cats.filter(x => x !== c) : [...settings.cats, c as never] })
  }
  const toggleRegion = (r: 'CH' | 'AT' | 'DE' | 'INT') => {
    const has = settings.regions.includes(r)
    patch({ regions: has ? settings.regions.filter(x => x !== r) : [...settings.regions, r] })
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Einstellungen</h2>

        <div className="field">
          <label>Muttersprache</label>
          <select className="select" value={settings.native} onChange={e => patch({ native: e.target.value })}>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Erklärungen in</label>
          <select className="select" value={(settings as any).explainLang ?? (settings as any).explain ?? 'auto'}
            onChange={e => patch({ explainLang: e.target.value } as any)}>
            <option value="auto">Automatisch (Muttersprache)</option>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            <option value="de">Deutsch</option>
          </select>
          <p className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
            Sprache der kurzen Bedeutungserklärung unter der Lösung.
          </p>
        </div>

        <div className="field">
          <label>Bewertung</label>
          <div className="chips">
            <button className={`chip ${settings.evalMode === 'einfach' ? 'on' : 'off'}`}
              onClick={() => patch({ evalMode: 'einfach' })}>Einfach (Richtig/Falsch)</button>
            <button className={`chip ${settings.evalMode === 'erweitert' ? 'on' : 'off'}`}
              onClick={() => patch({ evalMode: 'erweitert' })}>Erweitert (4 Stufen)</button>
          </div>
        </div>

        <div className="field">
          <label>Kartentyp</label>
          <div className="chips">
            <button className={`chip ${settings.cardTypes === 'wort' ? 'on' : 'off'}`}
              onClick={() => patch({ cardTypes: 'wort' })}>Nur Wörter</button>
            <button className={`chip ${settings.cardTypes === 'satz' ? 'on' : 'off'}`}
              onClick={() => patch({ cardTypes: 'satz' })}>Nur Sätze</button>
            <button className={`chip ${settings.cardTypes === 'beides' ? 'on' : 'off'}`}
              onClick={() => patch({ cardTypes: 'beides' })}>Beides</button>
          </div>
        </div>

        <div className="field">
          <label>Lernrichtung</label>
          <div className="chips">
            <button className={`chip ${settings.direction === 'rezeptiv' ? 'on' : 'off'}`}
              onClick={() => patch({ direction: 'rezeptiv' })}>Nur verstehen</button>
            <button className={`chip ${settings.direction === 'beides' ? 'on' : 'off'}`}
              onClick={() => patch({ direction: 'beides' })}>Verstehen + sprechen</button>
            <button className={`chip ${settings.direction === 'produktiv' ? 'on' : 'off'}`}
              onClick={() => patch({ direction: 'produktiv' })}>Nur sprechen</button>
          </div>
        </div>

        <div className="field">
          <label>Reihenfolge</label>
          <div className="chips">
            <button className={`chip ${settings.order === 'rank' ? 'on' : 'off'}`}
              onClick={() => patch({ order: 'rank' })}>Nach Häufigkeit</button>
            <button className={`chip ${settings.order === 'random' ? 'on' : 'off'}`}
              onClick={() => patch({ order: 'random' })}>Gemischt</button>
          </div>
          <p className="subtle" style={{ fontSize: 13, marginTop: 6 }}>
            Häufigkeit: die häufigsten Wörter zuerst. Gemischt: zufällig aus deiner Auswahl.
          </p>
        </div>

        <h3>Lebensbereiche</h3>
        <p className="subtle" style={{ fontSize: 13, marginBottom: 10 }}>
          Abwählen, was du nicht brauchst — diese Wörter kommen dann nicht.
        </p>
        <div className="chips">
          {Object.entries(CAT_LABELS).map(([k, v]) => (
            <button key={k} className={`chip ${settings.cats.includes(k as never) ? 'on' : 'off'}`}
              onClick={() => toggleCat(k)}>{v}</button>
          ))}
        </div>

        <h3>Region</h3>
        <div className="chips">
          {(['CH', 'AT', 'DE', 'INT'] as const).map(r => (
            <button key={r} className={`chip ${settings.regions.includes(r) ? 'on' : 'off'}`}
              onClick={() => toggleRegion(r)}>
              {r === 'INT' ? 'International' : r}
            </button>
          ))}
        </div>

        <h3>Sprache im Alltag</h3>
        <div className="switch-row">
          <div>
            <div className="label">Slang</div>
            <div className="desc">Umgangssprache aus CH, AT und DE</div>
          </div>
          <button className={`switch ${settings.slang ? 'on' : ''}`} onClick={() => patch({ slang: !settings.slang })} />
        </div>
        <div className="switch-row">
          <div>
            <div className="label">Vulgäre Ausdrücke</div>
            <div className="desc">Standardmässig ausgeschaltet</div>
          </div>
          <button className={`switch ${settings.vulgar ? 'on' : ''}`} onClick={() => patch({ vulgar: !settings.vulgar })} />
        </div>

        <h3>Bedienung</h3>
        <div className="switch-row">
          <div>
            <div className="label">Texteingabe</div>
            <div className="desc">Antwort tippen — Hinweis, Bewertung bleibt bei dir</div>
          </div>
          <button className={`switch ${settings.textInput ? 'on' : ''}`} onClick={() => patch({ textInput: !settings.textInput })} />
        </div>
        <div className="switch-row">
          <div>
            <div className="label">Vorlesen</div>
            <div className="desc">Sprachausgabe einschalten (Knopf ▶ auf jeder Karte)</div>
          </div>
          <button className={`switch ${settings.audio ? 'on' : ''}`} onClick={() => patch({ audio: !settings.audio })} />
        </div>
        {settings.audio && (
          <div className="field">
            <label>Wann automatisch vorlesen?</label>
            <div className="chips">
              <button className={`chip ${settings.audioMode === 'manual' ? 'on' : 'off'}`}
                onClick={() => patch({ audioMode: 'manual' })}>Nur auf Knopf</button>
              <button className={`chip ${settings.audioMode === 'afterInput' ? 'on' : 'off'}`}
                onClick={() => patch({ audioMode: 'afterInput' })}>Nach Eingabe</button>
              <button className={`chip ${settings.audioMode === 'afterReveal' ? 'on' : 'off'}`}
                onClick={() => patch({ audioMode: 'afterReveal' })}>Nach Lösung</button>
            </div>
            <p className="subtle" style={{ fontSize: 13, marginTop: 6 }}>
              Standard: nur auf Knopf — so bleibt die aktive Erinnerung erhalten.
            </p>
          </div>
        )}
        <div className="switch-row">
          <div>
            <div className="label">Timer</div>
            <div className="desc">Zeit pro Karte anzeigen</div>
          </div>
          <button className={`switch ${settings.timer ? 'on' : ''}`} onClick={() => patch({ timer: !settings.timer })} />
        </div>
        <div className="switch-row">
          <div>
            <div className="label">Dunkles Design</div>
            <div className="desc">Hell oder dunkel</div>
          </div>
          <button className={`switch ${settings.theme === 'dark' ? 'on' : ''}`}
            onClick={() => patch({ theme: settings.theme === 'dark' ? 'light' : 'dark' })} />
        </div>

        <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }}
          onClick={() => setAdvanced(a => !a)}>
          {advanced ? 'Erweiterte Einstellungen ausblenden' : 'Erweiterte Einstellungen'}
        </button>

        {advanced && (
          <div style={{ marginTop: 12 }}>
            <div className="switch-row">
              <div>
                <div className="label">Neue Karten pro Tag</div>
                <div className="desc">Standard 10 — kleine tägliche Mengen schlagen grosse Blöcke</div>
              </div>
              <input className="answer-input" style={{ width: 90, textAlign: 'center', fontSize: 16 }}
                type="number" min={1} max={50} value={settings.newPerDay}
                onChange={e => patch({ newPerDay: Math.max(1, Math.min(50, +e.target.value || 10)) })} />
            </div>
            <div className="switch-row">
              <div>
                <div className="label">Wiederholungen pro Tag</div>
                <div className="desc">Standard 120 — verhindert Rückstau</div>
              </div>
              <input className="answer-input" style={{ width: 90, textAlign: 'center', fontSize: 16 }}
                type="number" min={10} max={500} value={settings.reviewsPerDay}
                onChange={e => patch({ reviewsPerDay: Math.max(10, Math.min(500, +e.target.value || 120)) })} />
            </div>
          </div>
        )}
      </div>

      <FeedbackCard settings={settings} current={null} />

      <div className="card">
        <h2 style={{ fontSize: 17 }}>Code einlösen</h2>
        <p className="subtle" style={{ fontSize: 14 }}>
          Kursgutschein oder Firmenplatz — der Code läuft nach der Kurszeit automatisch ab.
        </p>
        <div className="field" style={{ marginTop: 10 }}>
          <input className="answer-input" style={{ textAlign: 'left', fontSize: 16, textTransform: 'uppercase' }}
            value={codeInput} onChange={e => setCodeInput(e.target.value)}
            placeholder="CODE-EINGEBEN" autoCapitalize="characters" />
        </div>
        <button className="btn btn-secondary btn-block" disabled={codeInput.trim().length < 4 || codeBusy}
          onClick={async () => {
            setCodeBusy(true); setCodeMsg('')
            try {
              const r = await redeemCode(codeInput.trim())
              setCodeMsg(r.ok
                ? `Code eingelöst — Zugang bis ${r.validUntil ? new Date(r.validUntil).toLocaleDateString('de-CH') : 'unbegrenzt'}.`
                : errorText(r.error ?? 'network'))
              if (r.ok) setCodeInput('')
            } finally { setCodeBusy(false) }
          }}>
          {codeBusy ? 'Wird geprüft …' : 'Code einlösen'}
        </button>
        {codeMsg && <p className="subtle" style={{ marginTop: 8 }}>{codeMsg}</p>}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17 }}>Konto &amp; Backup</h2>
        {user ? (
          <p className="subtle">Angemeldet als {user.email}</p>
        ) : (
          <p className="subtle">Nicht angemeldet — Fortschritt bleibt in diesem Browser.</p>
        )}
        <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }}
          onClick={() => {
            const blob = new Blob([exportAll()], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `wortschatz-backup-${todayKey()}.json`
            a.click()
          }}>
          Fortschritt exportieren
        </button>
      </div>

      <button className="btn btn-primary btn-block" style={{ margin: '16px 0' }} onClick={onBack}>
        Fertig
      </button>
    </div>
  )
}

/** Feedback: Fehler an einer Karte melden oder Verbesserung vorschlagen. */
export function FeedbackCard({ settings, current }: { settings: Settings; current: Entry | null }) {
  const [kind, setKind] = useState<'card-error' | 'typo' | 'suggestion' | 'other'>(
    current ? 'card-error' : 'suggestion',
  )
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    const text = msg.trim()
    if (text.length < 3) { setSent('Bitte kurz beschreiben, was nicht stimmt.'); return }
    setBusy(true)
    const r = await submitFeedback({
      kind,
      entryId: current?.id,
      de: current?.de,
      message: text,
      lang: (settings as unknown as { mother?: string }).mother ?? 'de',
    })
    setBusy(false)
    setMsg('')
    setSent(
      r.ok
        ? 'Danke — gespeichert und übermittelt. Wird geprüft und automatisch korrigiert, wenn es ein Fehler ist.'
        : 'Danke — gespeichert. Wird beim nächsten Verbinden übermittelt.',
    )
  }

  const pending = loadFeedback().filter(i => i.status === 'offen').length

  return (
    <div className="card">
      <h2 style={{ fontSize: 17 }}>Feedback &amp; Fehler melden</h2>
      <p className="subtle" style={{ marginBottom: 10 }}>
        {current ? `Aktuelle Karte: «${current.de}»` : 'Allgemeines Feedback zur App'}
      </p>
      <select className="answer-input" style={{ fontSize: 15, marginBottom: 10 }}
        value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
        <option value="card-error">Fehler an dieser Karte</option>
        <option value="typo">Schreibfehler / Tippfehler</option>
        <option value="suggestion">Verbesserungsvorschlag</option>
        <option value="other">Sonstiges</option>
      </select>
      <textarea className="answer-input" style={{ fontSize: 15, minHeight: 80, textAlign: 'left' }}
        placeholder="Was stimmt nicht, was sollte besser sein?"
        value={msg} onChange={e => setMsg(e.target.value)} />
      <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }}
        onClick={send} disabled={busy}>
        {busy ? 'Wird gesendet …' : 'Senden'}
      </button>
      {sent && <p className="subtle" style={{ marginTop: 8 }}>{sent}</p>}
      {pending > 0 && (
        <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }}
          onClick={() => { navigator.clipboard?.writeText(feedbackAsText()) }}>
          {pending} offene Meldung(en) kopieren
        </button>
      )}
    </div>
  )
}
