// Feedback: Nutzer melden Fehler an einer Karte oder machen Verbesserungsvorschlaege.
// Zwei Wege: (a) GitHub-Issue mit Label "feedback" (automatische Pruefung durch Cron),
// (b) Download/Clipboard-Fallback, wenn kein Token hinterlegt ist.
// Der Token steht NIE im Klienten — Upload laeuft ueber VITE_FEEDBACK_URL (Proxy).

const FEEDBACK_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FEEDBACK_URL ?? ''

export type FeedbackKind = 'card-error' | 'typo' | 'suggestion' | 'other'

export type FeedbackItem = {
  id: string
  kind: FeedbackKind
  entryId?: string
  de?: string
  message: string
  lang: string
  createdAt: string
  appVersion: string
  status: 'offen' | 'behoben' | 'abgelehnt'
}

const KEY = 'wortschatz.feedback.v1'

export function loadFeedback(): FeedbackItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FeedbackItem[]) : []
  } catch {
    return []
  }
}

function save(items: FeedbackItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-200)))
  } catch {
    /* Speicher voll — ignorieren */
  }
}

export async function submitFeedback(
  item: Omit<FeedbackItem, 'id' | 'createdAt' | 'appVersion' | 'status'>,
): Promise<{ ok: boolean; queued: boolean }> {
  const full: FeedbackItem = {
    ...item,
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    appVersion: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_VERSION ?? 'dev',
    status: 'offen',
  }
  // Immer lokal sichern — nichts geht verloren, auch offline.
  const items = loadFeedback()
  items.push(full)
  save(items)

  if (!FEEDBACK_URL) return { ok: false, queued: true }
  try {
    // GitHub-Issues direkt aus dem Browser sind ohne Token nicht moeglich (CORS).
    // Deshalb: Meldung bleibt lokal und wird als mailto-Text bereitgestellt.
    // Sobald VITE_FEEDBACK_URL auf einen Proxy zeigt, wird dort gepostet.
    const isIssueApi = FEEDBACK_URL.includes('api.github.com')
    if (isIssueApi) return { ok: false, queued: true }
    const r = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    })
    return { ok: r.ok, queued: !r.ok }
  } catch {
    return { ok: false, queued: true }
  }
}

/** Alle offenen Meldungen als Klartext — fuer Clipboard/Download-Fallback. */
export function feedbackAsText(): string {
  const items = loadFeedback().filter(i => i.status === 'offen')
  if (!items.length) return ''
  return items
    .map(i => {
      const head = `[${i.kind}] ${i.entryId ? `${i.entryId} (${i.de})` : 'App'}`
      return `${head}\n${i.message}\nSprache: ${i.lang} · ${i.createdAt}\n`
    })
    .join('\n---\n')
}

export function clearSentFeedback() {
  save(loadFeedback().map(i => ({ ...i, status: 'behoben' as const })))
}
