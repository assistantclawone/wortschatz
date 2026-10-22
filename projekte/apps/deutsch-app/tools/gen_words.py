#!/usr/bin/env python3
"""
Erzeugt src/data/words-a1.ts aus tools/_gen_input.txt

Eingabeformat: eine Zeile pro Eintrag, Felder getrennt durch '|'
  de | meaning | level | cats | region | sentenceFull | tr(en=..,es=..,...) | flags

  cats: "ALL" oder Liste mit Komma: alltag,arbeit
  region: Liste mit Komma: INT  /  CH,DE
  flags: leer, "slang", "vulgar", "slang+vulgar"
  sentence: Lücke {{ }} wird automatisch gesetzt — im Satz das erste Vorkommen
            des Kopfworts durch "{{ }}" ersetzen.

Ranks fortlaufend 1..n in Dateireihenfolge.
"""
import re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
INP = os.path.join(HERE, "_gen_input.txt")
OUT = os.path.join(APP, "src", "data", "words-a1.ts")

ALL_CATS = ("alltag behoerden arbeit gesundheit wohnen einkaufen reisen familie bildung "
            "freizeit telefon bank gastro handwerk technik pflege logistik bau buero recht").split()

LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]

def q(s): return s.replace("\\", "\\\\").replace("'", "\\'")

def make_sentence(de, full):
    """Setzt die Lücke {{ }} — erst ganzer Ausdruck, dann Kopfwort, dann Flexion."""
    if full.count("{{ }}") == 1:
        return full
    head = de.split()[0]

    # 1) ganzer Ausdruck oder Kopfwort wörtlich
    for needle in (de, head):
        m = re.search(re.escape(needle), full, re.IGNORECASE)
        if m:
            return full[:m.start()] + "{{ }}" + full[m.end():]

    # 2) Wortstamm: bei Verben Endung abschneiden (müssen -> müss, gehen -> geh)
    stems = [head[:max(3, len(head) - 2)], head[:max(3, len(head) - 1)], head[:3]]
    if head.lower().endswith("en") and len(head) > 4:
        stems.insert(0, head[:-2])          # machen -> mach
    if head.lower().endswith("n") and len(head) > 3:
        stems.insert(0, head[:-1])          # sammeln -> sammel

    words = list(re.finditer(r"\b[\wÄÖÜäöüß-]+", full))
    for stem in stems:
        st = stem.lower()
        if len(st) < 2:
            continue
        for m in words:
            if m.group(0).lower().startswith(st[0]) and st[:2] in m.group(0).lower():
                return full[:m.start()] + "{{ }}" + full[m.end():]

    # 3) Umlaut-/Vokalwechsel: erster Buchstabe + Länge
    if len(head) >= 3:
        first = head[0].lower()
        for m in words:
            w = m.group(0).lower()
            if w[0] == first and abs(len(w) - len(head)) <= 3:
                return full[:m.start()] + "{{ }}" + full[m.end():]

    # 4) Nomen ohne Artikel: Kopfwort ohne Artikel suchen (die Unterschrift -> Unterschrift)
    bare = de.split()[-1]
    for needle in (bare, bare[:max(3, len(bare) - 2)]):
        m = re.search(re.escape(needle), full, re.IGNORECASE)
        if m:
            return full[:m.start()] + "{{ }}" + full[m.end():]

    raise ValueError(f"Lücke nicht setzbar: {de!r} in {full!r}")

rows, errors = [], []
raw = [l.strip() for l in open(INP, encoding="utf-8").read().splitlines()]
raw = [l for l in raw if l and not l.startswith("#")]

for lineno, line in enumerate(raw, 1):
    parts = [p.strip() for p in line.split("|")]
    if len(parts) < 7:
        errors.append(f"Zeile {lineno}: zu wenige Felder ({len(parts)}): {line[:60]}"); continue
    de, meaning, level, cats, region, full, trraw = parts[:7]
    flags = parts[7] if len(parts) > 7 else ""

    cats = ALL_CATS if cats.upper() == "ALL" else [c.strip() for c in cats.split(",") if c.strip()]
    bad = set(cats) - set(ALL_CATS)
    if bad: errors.append(f"Zeile {lineno}: unbekannte Kategorie {bad}")

    regs = [r.strip().upper() for r in region.split(",") if r.strip()]
    bad = set(regs) - {"CH", "AT", "DE", "INT"}
    if bad: errors.append(f"Zeile {lineno}: unbekannte Region {bad}")

    tr = {}
    for k, v in re.findall(r"(\w{2})=([^,]*)", trraw):
        tr[k.strip()] = v.strip()
    miss = [l for l in LANGS if not tr.get(l)]
    if miss: errors.append(f"Zeile {lineno} ({de}): Übersetzung fehlt {miss}")

    try:
        sent = make_sentence(de, full)
    except ValueError as e:
        errors.append(f"Zeile {lineno}: {e}"); continue

    rows.append(dict(lineno=lineno, de=de, meaning=meaning, level=level, cats=cats,
                     region=regs, sent=sent, full=full, tr=tr, flags=flags))

if errors:
    print(f"{len(errors)} Fehler in der Eingabe:")
    for e in errors[:40]: print("  ✗", e)
    sys.exit(1)

seen = {}
for r in rows:
    key = (r["de"].lower(), r["meaning"].lower())
    if key in seen:
        print(f"FEHLER: doppelter Eintrag {key} (Zeile {seen[key]} und {r['lineno']})"); sys.exit(1)
    seen[key] = r["lineno"]

out = [
 "// A1-Wortschatz — nach Häufigkeit geordnet (rank 1 = häufigstes).",
 "// Quellen: Goethe-Institut Wortliste A1 (Start Deutsch 1), Deutsche Welle Deutschtrainer A1,",
 "// frequenzwörterbuch-basierte Rangfolge des Deutschen. Übersetzungen manuell erstellt.",
 "// Bedeutungen sind getrennte Einträge (Vorgabe 17). Erzeugt aus tools/_gen_input.txt.",
 "import type { Entry } from '../types'",
 "",
 "export const WORDS_A1: Entry[] = [",
]
for i, r in enumerate(rows, 1):
    cats = ",".join(f"'{c}'" for c in r["cats"])
    regs = ",".join(f"'{x}'" for x in r["region"])
    trs = ", ".join(f"{k}: '{q(r['tr'][k])}'" for k in LANGS)
    extras = []
    if "slang" in r["flags"]: extras.append("slang: true")
    if "vulgar" in r["flags"]: extras.append("vulgar: true")
    extra = (", " + ", ".join(extras)) if extras else ""
    out.append(f"  {{ id: 'a1-{i:04d}', de: '{q(r['de'])}', meaning: '{q(r['meaning'])}', "
               f"rank: {i}, level: '{r['level']}', cats: [{cats}], region: [{regs}]{extra},")
    out.append(f"    sentence: '{q(r['sent'])}', sentenceFull: '{q(r['full'])}',")
    out.append(f"    tr: {{ {trs} }} }},")
out += ["]", ""]
open(OUT, "w", encoding="utf-8").write("\n".join(out))
print(f"OK: {len(rows)} Einträge -> {OUT}")
