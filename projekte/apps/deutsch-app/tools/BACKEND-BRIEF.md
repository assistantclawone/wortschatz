# AUFTRAG: Backend-Fundament für «Wortschatz» (Supabase Free)

## Kontext
App: Vite + React + TypeScript, statisch auf GitHub Pages, kein Server heute.
Fortschritt liegt nur im localStorage. Jetzt kommt: Login, geräteübergreifender Fortschritt,
serverseitig geprüfte Lizenzen (Gutschein-Codes + Firmen-Kontingente). Später Zahlung.

## Harte Randbedingungen
- **Keine Kosten.** Supabase Free-Tier (Postgres + Auth + Edge Functions). Kein bezahlter Dienst.
- **Keine Secrets im Frontend.** Nur `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
  Der Service-Role-Key niemals in den Browser-Bundle.
- **Keine Registrierung beim Anbieter ohne Renato.** Du baust alles, was OHNE Cloud-Zugang geht:
  Schema, Migrationen, Policies, Edge Function, Client-Code, Doku. Live-Anbindung erst, wenn
  Renato das Projekt anlegt und die Schlüssel da sind.
- **Die App muss ohne Backend weiter funktionieren** (Offline/Erststart), lokal zuerst, Sync danach.
  Sync muss konfliktfest sein (Last-Write-Wins pro Karte mit Zeitstempel, nie Totalüberschreiben).

## Was du lieferst
1. `supabase/schema.sql` — Tabellen:
   - `profiles` (id uuid → auth.users, email, created_at, active_language, plan)
   - `progress` (user_id, card_key, stage, due, reps, ease, lapses, updated_at) — PK (user_id, card_key)
   - `reviews` (id, user_id, card_key, rating, created_at) — für Auswertung
   - `codes` (code PK, kind: 'voucher'|'seat', plan, language, valid_until, seat_limit,
     created_at, created_by, note, status)
   - `code_redemptions` (code, user_id, redeemed_at, revoked_at) — ein Code = ein Platz,
     ein Platz = ein Nutzer, einmaliger Gebrauch
   - `orgs` (id, name, admin_user_id, plan, currency, price_per_seat, notes)
   Row Level Security überall aktiv, Policies so, dass ein Nutzer nur eigene Daten sieht.
2. `supabase/functions/redeem-code/index.ts` — Edge Function (Deno): prüft Code serverseitig,
   Ablauf, Kontingent, Einmalgebrauch; verweigert bei Verstoss; gibt Plan + Laufzeit zurück.
3. `src/lib/backend.ts` — dünner Client: Login (Magic Link per E-Mail), Logout, Session,
   pull/push Fortschritt mit Zeitstempel-Merge, redeemCode(). Muss ohne Konfiguration sauber
   in den Offline-Modus fallen (keine Crashes, keine Endlos-Retries).
4. `.env.example` — Platzhalter, ausführlich kommentiert.
5. `docs/BACKEND-SETUP.md` — Schritt für Schritt für Renato: Supabase-Projekt anlegen (Free),
   schema.sql im SQL-Editor ausführen, Edge Function deployen, URL + anon key holen,
   in `.env` setzen, GitHub-Secret für den Build setzen. Geschätzte Zeit: 15 Minuten.
   Inklusive: wie man einen Testnutzer anlegt und das Einlösen prüft.

## Was du NICHT machst
- Keine Zahlungsanbindung (kommt später separat).
- Kein Deploy, kein Push, keine Cloud-Registrierung.
- Keine Änderung an der Lernlogik (srs.ts) — nur Anbindung.

## Qualität
- `npx tsc --noEmit` muss durchlaufen. `npx vite build` muss durchlaufen.
- Kein `any` ohne Grund. Kommentare auf Deutsch.
- Antworte mit: erstellte Dateien, was getestet wurde, was ohne Supabase-Konto noch offen ist.
