#!/usr/bin/env node
// Code-Verwaltung fuer Renato — laeuft lokal, spricht direkt mit der Datenbank.
// Aufruf:
//   node tools/make-codes.mjs neu --anzahl 20 --laufzeit 180 --kurs "Kurs Oktober 2026"
//   node tools/make-codes.mjs liste
//   node tools/make-codes.mjs sperren --code WORTSCHATZ-XXXX
//   node tools/make-codes.mjs verlaengern --kurs "Kurs Oktober 2026" --laufzeit 90
//   node tools/make-codes.mjs firma --name "Pflegeheim X" --sitze 20 --laufzeit 365
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ohne I/O/0/1 (Verwechslung)

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  for (const f of ['.env', '../../.env', '.env.local']) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(new RegExp('^' + name + '=(.*)$'))
      if (m) return m[1].trim().replace(/^["\']|["\']$/g, '')
    }
  }
  return ''
}

const URL_BASE = env('VITE_SUPABASE_URL') || env('SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_BASE || !SERVICE_KEY) {
  console.error('Fehlt: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY (z.B. in .env.service).')
  console.error('Der service_role-Key gehoert NIE in den Browser-Build.')
  process.exit(1)
}

function makeCode(prefix = 'WS') {
  const part = (n) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${prefix}-${part(4)}-${part(4)}`
}

async function db(path, init = {}) {
  const r = await fetch(URL_BASE + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: '***' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name, def = '') => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const days = Number(opt('laufzeit', '180'))
const until = new Date(Date.now() + days * 864e5).toISOString()

if (cmd === 'neu') {
  const n = Number(opt('anzahl', '10'))
  const kurs = opt('kurs', 'Kurs')
  const prefix = opt('prefix', 'WS')
  const rows = []
  const seen = new Set()
  while (rows.length < n) {
    const code = makeCode(prefix)
    if (seen.has(code)) continue
    seen.add(code)
    rows.push({
      code, kind: 'voucher', plan: 'voucher', language: opt('sprache', 'de'),
      valid_until: until, seat_limit: 1, created_by: 'renato', note: kurs,
    })
  }
  const created = await db('/rest/v1/codes', { method: 'POST', body: JSON.stringify(rows) })
  const list = (created ?? rows).map((r) => r.code)
  console.log(`\n${list.length} Codes fuer «${kurs}», gueltig bis ${until.slice(0, 10)}:\n`)
  for (const c of list) console.log('  ' + c)
  appendFileSync('tools/codes-log.txt', `${new Date().toISOString()}\t${kurs}\t${until.slice(0, 10)}\t${n}\t${list.join(',')}\n`)
  console.log('\nProtokoll: tools/codes-log.txt')
} else if (cmd === 'liste') {
  const rows = await db('/rest/v1/codes?select=code,kind,plan,valid_until,seat_limit,status,note&order=created_at.desc&limit=200')
  const heute = new Date().toISOString()
  console.log('\nCODE              TYP      GUELTIG BIS   PL  STATUS    NOTIZ')
  for (const r of rows) {
    const abgelaufen = r.valid_until && r.valid_until < heute
    const status = abgelaufen ? 'abgelaufen' : r.status
    console.log(
      String(r.code).padEnd(18),
      String(r.kind).padEnd(8),
      String(r.valid_until ? r.valid_until.slice(0, 10) : 'unbegrenzt').padEnd(13),
      String(r.seat_limit).padEnd(3),
      String(status).padEnd(10),
      r.note ?? '',
    )
  }
} else if (cmd === 'sperren') {
  const code = opt('code')
  if (!code) throw new Error('--code fehlt')
  await db(`/rest/v1/codes?code=eq.${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'revoked' }),
  })
  console.log(`Code ${code} gesperrt.`)
} else if (cmd === 'verlaengern') {
  const kurs = opt('kurs')
  if (!kurs) throw new Error('--kurs fehlt (oder --code)')
  const code = opt('code')
  const filt = code
    ? `/rest/v1/codes?code=eq.${encodeURIComponent(code)}`
    : `/rest/v1/codes?note=eq.${encodeURIComponent(kurs)}`
  await db(filt, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ valid_until: until }) })
  console.log(`Verlaengert bis ${until.slice(0, 10)}.`)
} else if (cmd === 'firma') {
  const name = opt('name', 'Firma')
  const sitze = Number(opt('sitze', '20'))
  const org = await db('/rest/v1/orgs', {
    method: 'POST',
    body: JSON.stringify({ name, plan: 'seat', currency: 'CHF', price_per_seat: 5, notes: opt('notiz', '') }),
  })
  const orgId = Array.isArray(org) ? org[0].id : org.id
  const code = makeCode('FIRMA')
  await db('/rest/v1/codes', {
    method: 'POST',
    body: JSON.stringify({
      code, kind: 'seat', plan: 'seat', language: 'de', valid_until: until,
      seat_limit: sitze, org_id: orgId, created_by: 'renato', note: name,
    }),
  })
  console.log(`\nFirma «${name}»: ${sitze} Plaetze, gueltig bis ${until.slice(0, 10)}`)
  console.log(`Code fuer die Firma: ${code}\n`)
} else {
  console.log(`Aufrufe:
  neu         --anzahl 20 --laufzeit 180 --kurs "Kurs Oktober 2026"
  liste
  sperren     --code WS-XXXX-XXXX
  verlaengern --kurs "Kurs Oktober 2026" --laufzeit 90   (oder --code)
  firma       --name "Pflegeheim X" --sitze 20 --laufzeit 365`)
}
