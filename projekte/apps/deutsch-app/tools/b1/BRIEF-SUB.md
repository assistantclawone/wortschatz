# AUFTRAG: B1-Block schreiben (eine Datei pro Auftrag)

Lies zuerst `tools/b1/BRIEF.md` (Format und Regeln) und `tools/b1/SPERRLISTE.txt`
(1364 verbotene Wörter = A1/A2-Bestand).

## Dein Auftrag
Schreibe **100 Zeilen** in die Datei `tools/b1/blockNN.txt` (NN = Blocknummer aus deinem Auftrag).
Eine Zeile pro Eintrag, Format wie in BRIEF.md, keine Kopfzeile, kein Codeblock.

## Zusätzliche Regeln
- **Keine Kommas** in Übersetzungen — benutze `/`.
- Alle 10 Sprachen müssen gefüllt sein: `en,es,fr,it,pt,tr,ar,ru,pl,uk`.
- Englisch: Nomen mit `the `, Verben mit `to `. Andere Sprachen idiomatisch.
- Satz: 6–12 Wörter, enthält das Kopfwort wörtlich (Flexion erlaubt).
- Keine Dublette innerhalb deiner 100 Zeilen, kein Wort aus der Sperrliste.
- Nur realer B1-Alltagswortschatz — keine Erfindungen.

## Abschluss (Pflicht)
1. Datei schreiben.
2. `python3 tools/b1/check_block.py tools/b1/blockNN.txt` ausführen.
3. Fehler beheben, bis der Prüfer **0 Fehler** meldet.
4. Bericht: Anzahl Zeilen, Prüfergebnis, 2 Beispielzeilen.

Wenn du einen Fehler nicht beheben kannst, ersetze die Zeile durch einen anderen
gültigen Eintrag — niemals eine kaputte Zeile stehen lassen.
