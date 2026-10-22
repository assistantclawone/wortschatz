# AUFTRAG: Evidenz-Audit der Lern-App «Wortschatz»

Du bist Lernpsychologie-/Didaktik-Prüfer. Prüfe die App gegen den aktuellen Forschungsstand.

**Oberstes Credo (Renato, 18.10.2026):** Die App muss dem maximal effizienten, evidenzbasierten
Lernen dienen — Ziel ist aktiver, alltagstauglicher Sprachgebrauch, nicht isoliertes Wortabfragen.

## Prüfgegenstand
- Vorgaben: /home/ubuntu/.openclaw/workspace/projekte/apps/deutsch-app/VORGABEN.md
- SRS-Logik: src/lib/srs.ts  (Lernschritte 1/10 Min, Graduation 1 Tag, Relearn 10 Min,
  Max 365 Tage, Ease 2.5, Easy-Bonus 1.3)
- Kartenlogik: src/App.tsx (Funktion buildQueue, grade, checkTyped, reveal)
- Inhaltsform: src/data/words-a1.ts (598 Eintraege, Wort/Phrase + Beispielsatz)

## Was du liefern sollst
Tabelle: Punkt | Bewertung (konform / teilweise / nicht konform / Risiko) | Evidenz (Studie/Autor+Jahr) | konkrete Aenderung (Datei + was genau)

Prüfe mindestens:
1. Retrival Practice / Testing Effect — wird aktives Abrufen erzwungen (kein Auto-Audio vor Antwort)?
2. Spacing — sind die Intervalle forschungskonform (Lernschritte, Relearn, Max-Intervall)?
3. Interleaving vs. Blocking — ist das Mischen so umgesetzt, dass es Nutzen bringt und nicht nur Zufall erzeugt?
4. Desirable Difficulties — wo ist die App zu leicht (Hinweise, Audio, Multiple Choice)?
5. Chunking / Formulaic Sequences — sind Phrasen gegenueber Einzelwoertern ausreichend gewichtet?
6. Output / Produktion — reicht die produktive Stufe fuer Alltagsgebrauch (Sprechen, Satzbau)?
7. Feedback-Design — ist der Diff-Hinweis foerderlich oder ersetzt er Selbstbewertung?
8. Motivation / Ueberlastung — 10 neu/Tag, 120 Wiederholungen, Abbruchrisiko.
9. Der Niveau-Leiter-Mechanismus (richtig +1 Stufe, falsch -1) — ist er evidenzbasiert oder schaedlich?

Sei kritisch und konkret. Keine Lobhudelei. Wenn etwas nicht belegt ist, sage es.
Antworte auf Deutsch, max. 1200 Woerter, Markdown-Tabelle.
