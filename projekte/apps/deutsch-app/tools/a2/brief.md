# AUFTRAG: A2-Wortliste Deutsch (Block A2-01)

Du schreibst Einträge für einen Deutsch-Vokabeltrainer (Renato Santiago).
Ziel: muttersprachlich neutrale, evidenzbasierte A2-Grundwortliste, nach Häufigkeit geordnet,
für ein kommerzielles Produkt. **Keine Erfindungen.**

## Ausgabeformat — EXAKT einhalten

Eine Datei, eine Zeile pro Eintrag, Felder getrennt durch `|` (Pipe), keine Kopfzeile,
keine Kommentare, **kein Markdown, kein Codeblock-Zaun**:

```
de|meaning|level|cats|region|sentenceFull|en=..,es=..,fr=..,it=..,pt=..,tr=..,ar=..,ru=..,pl=..,uk=..|flags
```

### Feldregeln

1. **de** — Das deutsche Wort oder die Phrase, wie man sie wirklich lernt.
   - Kommt das Wort real nie allein vor → **Phrase** nehmen (`Bescheid geben`, `Es geht mir gut`).
   - Nomen mit Artikel, Nomen klein: `der Tisch`, `die Frau`, `das Kind`.
   - Verben im Infinitiv, Adjektive in Grundform.
2. **meaning** — kurze deutsche Bedeutungsabgrenzung in 2–5 Wörtern.
   Bei mehreren Bedeutungen: **jede Bedeutung = eigene Zeile**.
3. **level** — immer `A2` in diesem Auftrag.
4. **cats** — `ALL` ODER Komma-Liste ohne Leerzeichen aus:
   `alltag,behoerden,arbeit,gesundheit,wohnen,einkaufen,reisen,familie,bildung,freizeit,telefon,bank,gastro,handwerk,technik,pflege,logistik,bau,buero,recht`
   Basiswörter → `ALL`. Sonst nur die 2–4 Bereiche, in denen das Wort wirklich vorkommt.
5. **region** — Komma-Liste aus `CH,AT,DE,INT`. Standard `INT`.
6. **sentenceFull** — ein geläufiger, natürlicher Beispielsatz (5–10 Wörter), der den Eintrag
   wörtlich enthält. Kultursensibel neutral: keine Politik, Religion, Stereotype, Klischees.
7. **Übersetzungen** — alle zehn Sprachen, in dieser Reihenfolge:
   `en,es,fr,it,pt,tr,ar,ru,pl,uk`
   - Kurz und idiomatisch. **Keine Kommas** in den Übersetzungen (Feldtrenner!) → `und/oder` mit `/`.
   - Arabisch in arabischer Schrift, Russisch/Ukrainisch in Kyrillisch.
8. **flags** — leer lassen (Zeile endet mit `|`) oder `slang` / `vulgar`.

## Inhaltlicher Auftrag

Liefere **60 Einträge**: die 60 häufigsten deutschen Wörter auf **A2-Niveau**
(Goethe-Institut A2 / Start Deutsch 2, Alltag, Behörden, Arbeit, Wohnen, Gesundheit),
die noch NICHT in der A1-Liste stehen.

**Bereits vorhanden (NICHT wiederholen):** siehe Datei `tools/a2/vorhanden.txt` im gleichen Ordner.

Sortiere von häufig nach selten. Prüfe jedes Wort gegen den echten Goethe-A2-Wortschatz.
Erfinde keine Wörter und keine Übersetzungen.
