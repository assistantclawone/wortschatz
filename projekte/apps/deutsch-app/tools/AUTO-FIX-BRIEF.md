# AUFTRAG: Automatisches Selbstverbesserungs-System «Wortschatz»

## Ziel
Nutzer melden Fehler direkt in der App. Ein nächtlicher Lauf prüft die Meldungen und behebt
eindeutige Fehler selbstständig; alles andere wird Renato als Vorschlagsliste vorgelegt.

## Datenformat (eine Meldung)
```json
{"id":"fb-...","kind":"card-error|typo|suggestion|other",
 "entryId":"a1-0042","de":"der Tisch","message":"...",
 "lang":"en","createdAt":"ISO","appVersion":"...","status":"offen"}
```
Ablage: `tools/feedback/inbox/*.json` (neu), `tools/feedback/done/` (behoben), `tools/feedback/proposals.md`

## Was du baust
1. `tools/feedback_pull.py` — holt offene Meldungen (GitHub Issues mit Label `feedback` oder
   lokale Inbox), vereinheitlicht ins obige Format, legt sie in `inbox/` ab.
2. `tools/feedback_fix.py` — Klassifizierung:
   - **auto-fixbar:** Tippfehler in `de`/`meaning`/`sentenceFull`, falsche Artikel-/Wortübersetzung
     einer einzelnen Sprache, doppelter Eintrag, Lücke `{{ }}` fehlt im Satz.
     → Änderung direkt in `src/data/words-a1.ts`, Eintrag nach `done/` verschieben,
     Protokollzeile in `tools/feedback/autofix-log.md`.
   - **Vorschlag:** alles andere → Zeile in `proposals.md` (Kategorie, Aufwand S/M/L, Nutzen).
3. `tools/release.sh` — Sicherheitsnetz vor jedem Deploy:
   `npx tsc --noEmit` → `npx vite build` → Stichprobe (10 geänderte Einträge auf Feldformat prüfen)
   → nur bei 0 Fehlern weiter → Upload → bei Fehler Abbruch und Log.
4. `tools/feedback_apply.sh` — Kette pull → fix → release, mit **Limit max. 20 Auto-Fixes pro Lauf**.

## Harte Regeln
- Nie mehr als 20 automatische Änderungen pro Lauf.
- Bei Unsicherheit: NICHT ändern, als Vorschlag einreihen.
- Jede Änderung protokollieren: Meldungs-ID, Eintrag, alt → neu, Grund.
- Renato bekommt nur dann eine Nachricht, wenn es Vorschläge gibt (verdichtet) oder ein Fehler
  den Build blockiert. Keine Statusmeldungen.

## Ausgabe
Skripte + lesbare Doku in `tools/README-feedback.md`. Kurzbericht: was gebaut, was getestet.
