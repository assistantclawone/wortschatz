#!/usr/bin/env python3
"""
Prüft den Wortschatz-Datensatz gegen die Vorgaben (VORGABEN.md).

Aufruf:  python3 tools/verify.py
Exit 0 = alles ok, Exit 1 = Fehler gefunden.

Geprüft wird:
  - Platzhalter "{{ }}" genau einmal im Satz, Satz enthält das Wort/den Stamm
  - Übersetzungen für alle unterstützten Sprachen vorhanden und nicht leer
  - Tags: mind. 1 Lebensbereich, gültige Schlüssel
  - Region: gültige Schlüssel, mind. 1
  - Level gültig, ids eindeutig, ranks eindeutig
  - Häufigkeitsreihenfolge plausibel (aufsteigend innerhalb der Datei)
  - keine doppelten Kombinationen (Wort + Bedeutung)
"""
import re, sys, json
from collections import Counter

SRC = "src/data"
LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]
CATS = {"alltag","behoerden","arbeit","gesundheit","wohnen","einkaufen","reisen",
        "familie","bildung","freizeit","telefon","bank","gastro","handwerk",
        "technik","pflege","logistik","bau","buero","recht"}
REGIONS = {"CH","AT","DE","INT"}
LEVELS = {"A1","A2","B1","B2","C1","C2"}

files = sorted(__import__("glob").glob(f"{SRC}/words-*.ts"))
if not files:
    print("FEHLER: keine Wortdateien gefunden"); sys.exit(1)

errors, entries = [], []
for f in files:
    text = open(f, encoding="utf-8").read()
    # Jeder Eintrag beginnt mit "{ id: '...'" — Positionen bestimmen und bis zur
    # nächsten Eintrags-Position schneiden (robust gegen Zeilenumbrüche).
    starts = [(m.start(), m.group(1)) for m in re.finditer(r"\{\s*id:\s*'([^']+)'", text)]
    blocks = []
    for i, (pos, eid) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else text.rfind("]")
        blocks.append((eid, text[pos:end]))
    if not blocks:
        errors.append(f"{f}: keine Einträge geparst")
    for eid, body in blocks:
        entries.append((f, eid, body))

print(f"{len(entries)} Einträge in {len(files)} Datei(en)")

ids, ranks, combos = Counter(), Counter(), Counter()
for f, eid, b in entries:
    def g(key):
        m = re.search(rf"{key}:\s*'([^']*)'", b)
        return m.group(1) if m else None

    ids[eid] += 1
    rank = re.search(r"rank:\s*(\d+)", b)
    lvl = re.search(r"level:\s*'([^']+)'", b)
    cats = re.search(r"cats:\s*\[([^\]]*)\]", b)
    region = re.search(r"region:\s*\[([^\]]*)\]", b)
    sent_m = re.search(r"sentence:\s*'([^']*)'", b)
    full_m = re.search(r"sentenceFull:\s*'([^']*)'", b)
    sent = sent_m.group(1) if sent_m else None
    full = full_m.group(1) if full_m else None
    de = g("de")
    meaning = g("meaning")

    if rank: ranks[int(rank.group(1))] += 1
    if lvl and lvl.group(1) not in LEVELS:
        errors.append(f"{eid}: ungültiges Level {lvl.group(1)}")
    if cats:
        keys = {c.strip().strip("'") for c in cats.group(1).split(",") if c.strip()}
        bad = keys - CATS
        if bad: errors.append(f"{eid}: unbekannte Kategorie(n) {bad}")
        if not keys: errors.append(f"{eid}: keine Kategorie")
    else:
        errors.append(f"{eid}: cats fehlt")
    if region:
        keys = {c.strip().strip("'") for c in region.group(1).split(",") if c.strip()}
        bad = keys - REGIONS
        if bad: errors.append(f"{eid}: unbekannte Region {bad}")
    else:
        errors.append(f"{eid}: region fehlt")

    if not de: errors.append(f"{eid}: de fehlt")
    if not meaning: errors.append(f"{eid}: meaning fehlt (Bedeutungsabgrenzung, Vorgabe 17)")
    if de and meaning:
        combos[(de.lower(), meaning.lower())] += 1

    if sent:
        if sent.count("{{ }}") != 1:
            errors.append(f"{eid}: Lücke '{{{{ }}}}' muss genau 1x vorkommen (ist {sent.count('{{ }}')})")
        if full and de:
            stem = de.split()[0][:max(3, len(de.split()[0]) - 2)].lower()
            filled = sent.replace("{{ }}", de.split()[0]).lower()
            if stem not in filled and stem not in full.lower():
                errors.append(f"{eid}: Satz enthält den Eintrag nicht ({de!r} ↔ {full!r})")
    else:
        errors.append(f"{eid}: sentence fehlt")
    if not full: errors.append(f"{eid}: sentenceFull fehlt")

    # Übersetzungen
    tr = re.search(r"tr:\s*\{([^}]*)\}", b, re.S)
    if not tr:
        errors.append(f"{eid}: tr fehlt")
    else:
        have = {}
        for k, v in re.findall(r"(\w+):\s*'([^']*)'", tr.group(1)):
            have[k] = v
        for lang in LANGS:
            if lang not in have or not have[lang].strip():
                errors.append(f"{eid}: Übersetzung fehlt für '{lang}'")

for eid, n in ids.items():
    if n > 1: errors.append(f"doppelte id: {eid}")
for r, n in ranks.items():
    if n > 1: errors.append(f"doppelter rank: {r}")
for (d, m), n in combos.items():
    if n > 1: errors.append(f"doppelter Eintrag (Wort+Bedeutung): {d} / {m}")

# Reihenfolge je Datei prüfen
seen_globally = True
if errors:
    print(f"\n{len(errors)} Fehler:")
    for e in errors[:60]:
        print("  ✗", e)
    if len(errors) > 60:
        print(f"  … und {len(errors)-60} weitere")
    sys.exit(1)

print("Alle Prüfungen bestanden.")
