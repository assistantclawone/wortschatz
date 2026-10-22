#!/usr/bin/env python3
"""Baut B1-Bloecke aus einer kompakten Quelldatei.

Quelle: tools/b1/src_blockNN.txt, eine Zeile pro Eintrag:
  de|meaning|cats|sentenceFull|en|es|fr|it|pt|tr|ar|ru|pl|uk

Regeln (Vorgaben): Nomen mit Artikel, Verben im Infinitiv, Adjektive Grundform,
level B1, region INT, flags leer, Uebersetzungen ohne Kommas.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]


def load_blocked():
    blocked = set()
    for name in ("SPERRLISTE.txt", "SPERRLISTE_B1.txt"):
        p = os.path.join(HERE, name)
        if not os.path.exists(p):
            continue
        blocked |= {l.strip().lower() for l in open(p, encoding="utf-8") if l.strip()}
    return blocked


def parse_line(raw, blocked):
    f = raw.rstrip("\n").split("|")
    if len(f) != 4 + len(LANGS):
        return None, f"Feldzahl {len(f)} statt {4+len(LANGS)}"
    de, meaning, cats, full = f[0].strip(), f[1].strip(), f[2].strip(), f[3].strip()
    trs = [x.strip() for x in f[4:]]
    if not de or not meaning or not full:
        return None, "leeres Pflichtfeld"
    if de.lower() in blocked:
        return None, f"Sperrliste: {de}"
    if "," in "".join(trs):
        return None, f"Komma in Uebersetzung: {de}"
    if len(full.split()) < 5:
        return None, f"Satz zu kurz: {de}"
    if "," in cats and " " in cats:
        return None, f"cats mit Leerzeichen: {de}"
    return {
        "de": de,
        "meaning": meaning,
        "cats": [c for c in cats.split(",") if c],
        "region": ["INT"],
        "full": full,
        "tr": dict(zip(LANGS, trs)),
        "flags": "",
    }, None


def make_gap(de, full):
    words = list(re.finditer(r"\b[\wÄÖÜäöüß-]+", full))
    head = de.split()[-1]
    stems = []
    if head.lower().endswith("en") and len(head) > 4:
        stems.append(head[:-2])
    stems += [head[: max(3, len(head) - 1)], head[: max(3, len(head) - 2)]]
    for st in stems:
        for m in words:
            if m.group(0).lower().startswith(st.lower()):
                return full[: m.start()] + "{{ }}" + full[m.end():]
    idx = full.lower().find(head.lower())
    if idx >= 0:
        return full[:idx] + "{{ }}" + full[idx + len(head):]
    return full


def q(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def write_ts(rows, out_path):
    lines = [
        "// B1-Wortschatz — nach Haeufigkeit geordnet (rank 1 = haeufigstes).",
        "// Quellen: Goethe-Institut Wortliste B1, Frequenzrangfolge (FrequencyWords/OpenSubtitles).",
        "// Erklaerungen in allen Sprachen direkt am Eintrag. Keine Erfindungen.",
        "import type { Entry } from '../types'",
        "",
        "export const WORDS_B1: Entry[] = [",
    ]
    for i, r in enumerate(rows, 1):
        cats = ",".join(f"'{c}'" for c in r["cats"])
        trs = ", ".join(f"{k}: '{q(r['tr'][k])}'" for k in LANGS)
        sent = make_gap(r["de"], r["full"])
        lines.append(
            f"  {{ id: 'b1-{i:04d}', de: '{q(r['de'])}', meaning: '{q(r['meaning'])}', rank: {1500+i}, "
            f"level: 'B1', cats: [{cats}], region: ['INT'],"
        )
        lines.append(f"    sentence: '{q(sent)}', sentenceFull: '{q(r['full'])}',")
        lines.append(f"    tr: {{ {trs} }} }},")
    lines += ["]", ""]
    open(out_path, "w", encoding="utf-8").write("\n".join(lines))


def main(src, out):
    blocked = load_blocked()
    rows, errors = [], []
    for n, raw in enumerate(open(src, encoding="utf-8"), 1):
        if not raw.strip() or raw.startswith("#"):
            continue
        row, err = parse_line(raw, blocked)
        if err:
            errors.append(f"Z{n}: {err}")
        else:
            rows.append(row)
    seen = set()
    uniq = []
    for r in rows:
        if r["de"].lower() in seen:
            errors.append(f"Dublette: {r['de']}")
            continue
        seen.add(r["de"].lower())
        uniq.append(r)
    write_ts(uniq, out)
    print(f"{src}: {len(uniq)} Eintraege, {len(errors)} Fehler -> {out}")
    for e in errors[:30]:
        print("  ", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
