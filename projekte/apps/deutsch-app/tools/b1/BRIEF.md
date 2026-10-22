# AUFTRAG: B1-Wortliste Deutsch (Block-Serie)

Du schreibst Einträge für einen Deutsch-Vokabeltrainer (kommerzielles Produkt, Renato Santiago).
Ziel: B1-Wortschatz, nach Häufigkeit geordnet, muttersprachlich neutral. **Keine Erfindungen.**

## Ausgabeformat — EXAKT einhalten

Eine Datei, eine Zeile pro Eintrag, Felder getrennt durch `|`, keine Kopfzeile,
kein Markdown, kein Codeblock-Zaun:

```
de|meaning|level|cats|region|sentenceFull|en=..,es=..,fr=..,it=..,pt=..,tr=..,ar=..,ru=..,pl=..,uk=..|flags
```

## Feldregeln

1. **de** — Nomen mit Artikel und kleingeschrieben (`der Antrag`), Verben im Infinitiv (`beantragen`),
   Adjektive in Grundform (`zuständig`). Kommt ein Wort real nie allein vor → Phrase (`in Anspruch nehmen`).
2. **meaning** — kurze deutsche Bedeutungsabgrenzung, 2–5 Wörter (`Gesuch an eine Behörde`).
   Mehrere Bedeutungen = getrennte Zeilen mit eigener meaning.
3. **level** — immer `B1`.
4. **cats** — `ALL` oder Komma-Liste ohne Leerzeichen aus:
   `alltag,behoerden,arbeit,gesundheit,wohnen,einkaufen,reisen,familie,bildung,freizeit,telefon,bank,gastro,handwerk,technik,pflege,logistik,bau,buero,recht`
5. **region** — `INT` (Standard) oder `CH`/`AT`/`DE`.
6. **sentenceFull** — natürlicher Satz (6–12 Wörter), der den Eintrag **wörtlich** enthält.
   Neutral: keine Politik, Religion, Stereotype.
7. **Übersetzungen** — genau diese Reihenfolge: `en,es,fr,it,pt,tr,ar,ru,pl,uk`.
   - Englisch bei Verben mit `to ` (`to apply`), Nomen mit `the ` (`the application`).
   - Übrige Sprachen idiomatisch; bei Verben die isolierte Form kennzeichnen, wo die Sprache es verlangt.
   - **Keine Kommas** in Übersetzungen (`und/oder` mit `/`).
8. **flags** — leer (Zeile endet mit `|`), `slang` oder `vulgar`.

## Qualität

- Nur Wörter, die im B1-Wortschatz real vorkommen (Goethe B1 / Alltagssprache).
- Keine Dubletten innerhalb des Blocks und keine Wörter aus der Sperrliste.
- Satz muss das Kopfwort enthalten (Flexion erlaubt); die Lücke setzt das Skript automatisch.

## Phrasen-Regel (Renato, 19.10.2026 — verbindlich)

Ein Einzelwort, das im echten Deutsch nie allein steht, ist **kein Eintrag**. Dann wird die
geläufige Kollokation/Phrase der Eintrag:

- statt `die Frage` → nur wenn als Kopfwort sinnvoll; sonst `eine Frage stellen`
- statt `der Bezug` → `Bezug nehmen auf`
- statt `die Rücksicht` → `Rücksicht nehmen`
- statt `die Verfügung` → `zur Verfügung stehen`
- statt `die Anspruch` → `in Anspruch nehmen`
- statt `die Rede` → `es ist die Rede von` / `zur Rede stellen`

Regel: Eintrag = die Form, in der ein Muttersprachler das Wort tatsächlich benutzt.
Nomen mit Artikel bleiben Nomen, wenn sie frei stehen können (`der Tisch`).
Verben im Infinitiv, aber wenn sie nur mit fester Ergänzung vorkommen → Phrase (`Bescheid geben`).
`meaning` erklärt dann die **Phrase**, nicht das Einzelwort.
