# Feedback & Auto-Fix — «Wortschatz»

Selbstverbesserung: Nutzer melden Fehler in der App, ein nächtlicher Lauf prüft sie,
behebt **nur eindeutige** Fehler selbst und legt alles andere Renato als Vorschlagsliste vor.

## Ablauf

```
tools/feedback_apply.sh            # pull → fix → release (kein Push)
tools/feedback_apply.sh --push     # ... mit GitHub-Pages-Push
tools/feedback_apply.sh --no-release
tools/feedback_apply.sh --dry-run  # nichts schreiben
```

| Schritt | Datei | Was passiert |
|---|---|---|
| 1 Pull | `tools/feedback_pull.py` | GitHub-Issues (`feedback` **+ `approved`**), lokale `inbox/`, `--import datei.json|txt` → normalisierte JSON-Dateien in `inbox/` |
| 2 Fix | `tools/feedback_fix.py` | Klassifiziert, wendet max. **20** Auto-Fixes an (Backup + Protokoll), Rest → `proposals.md` |
| 3 Release | `tools/release.sh` | `tsc` → `vite build` → Struktur-/Stichproben-Test (10 geänderte Einträge) → `docs/` → optional Push; bei Fehler Abbruch + Log |

## Datenformat (eine Meldung = eine JSON-Datei in `inbox/`)

```json
{"id":"fb-…","kind":"card-error|typo|suggestion|other",
 "entryId":"a1-0042","de":"der Tisch","message":"…",
 "lang":"en","createdAt":"ISO","appVersion":"…","status":"offen"}
```

Abgelegt von `src/lib/feedback.ts` (Klient) über `VITE_FEEDBACK_URL` oder per Clipboard-Text
(«offene Meldungen kopieren») → `feedback_pull.py --import text.txt`.

Ordner:

| Ordner/Datei | Inhalt |
|---|---|
| `inbox/` | offene Meldungen (eine JSON/Jahr) |
| `done/` | automatisch behoben (mit `result` + `resolvedAt`) |
| `seen/` | nicht auto-fixbar → Vorschlag/abgelehnt |
| `quarantine/` | kaputte Dateien |
| `proposals.md` | Vorschlagsliste mit Kategorie, Aufwand S/M/L, Nutzen |
| `autofix-log.md` | jede Änderung: Meldungs-ID, Eintrag, Feld, alt → neu, Grund |
| `backups/` | `words-a1.ts` vor jedem Schreibvorgang |
| `logs/` | pull/fix/apply/release-Logs |
| `outbox/notification.txt` | nur wenn Vorschläge/Build-Blocker — Cron verschickt das (eine Nachricht) |

## Was wird automatisch geändert?

| Fall | Regel |
|---|---|
| Tippfehler `de`/`meaning`/`sentenceFull` | Meldung nennt `«alt» soll «neu» sein`; `alt` muss im Feld vorkommen, `alt ≠ neu` |
| Falsche Übersetzung einer Sprache | `tr.en` / `en: …` + Zielwert; Sprache muss existieren, Wert ≤ 60 Zeichen |
| Lücke `{{ }}` fehlt/defekt | `sentenceFull` enthält das Wort genau einmal → wird durch `{{ }}` ersetzt |
| Doppelter Eintrag | **kein** Auto-Fix (Entscheidung) → Vorschlag mit konkretem Zwilling |
| Artikel/Genus, Bedeutung, Wünsche, Rest | → Vorschlag |

Sicherungen: bei Unsicherheit kein Fix; Meldung mit veraltetem `de` wird nicht angewendet;
nach dem Schreiben Datei-Reload (IDs, Pflichtfelder, `tr.en`, Lücke) — schlägt das fehl,
wird die Änderung verworfen. **Max. 20 Fixes pro Lauf.**

## GitHub-Quelle

`tools/feedback/project.json` → `{"repo": "assistantclawone/wortschatz"}`.
Issues brauchen die Labels `feedback` **und** `approved` (Gate gegen fremden Text).
Ohne `gh`/`GITHUB_TOKEN` wird die GitHub-Quelle übersprungen (lokale Inbox genügt).

## Test

Getestet mit 5 Testmeldungen (danach entfernt, `words-a1.ts` unverändert):
2 Auto-Fixes (Tippfehler, Übersetzung), 3 Vorschläge (Artikel, schon korrekt, Wunsch),
Release-Probelauf grün (tsc + build + 596 Einträge Strukturtest).
