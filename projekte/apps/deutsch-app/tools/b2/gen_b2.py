#!/usr/bin/env python3
"""Baut src/data/words-b2.ts aus kompakten Quelldateien tools/b2/src_b2_*.txt.

Quellformat (eine Zeile pro Eintrag, Felder mit | getrennt):
  de|meaning|cats|sentenceFull|en|es|fr|it|pt|tr|ar|ru|pl|uk

Regeln:
 - Nomen mit Artikel, Verben im Infinitiv, Adjektive Grundform
 - level B2, region INT, flags leer
 - Uebersetzungen ohne Kommas
 - Satz 6-12 Woerter, enthaelt das Kopfwort wortwoertlich
 - Dubletten gegen A1/A2/B1 und innerhalb B2 werden verworfen

Zusaetzlich: tools/b2/ranks.json (de -> Rang in de_50k.txt), sonst Fallback 3001+.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(APP, "src", "data", "words-b2.ts")
LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]
CATS = set(
    "alltag behoerden arbeit gesundheit wohnen einkaufen reisen familie bildung "
    "freizeit telefon bank gastro handwerk technik pflege logistik bau buero recht".split()
)


def heads(path, json_mode=False):
    t = open(path, encoding="utf-8").read()
    pat = r'"de": "((?:[^"\\]|\\.)*)"' if json_mode else r"de: '((?:[^'\\]|\\.)*)'"
    return [x.replace("\\'", "'") for x in re.findall(pat, t)]


def blocked_set():
    return {
        " ".join(w.lower().split())
        for f, jm in (
            ("src/data/words-a1.ts", False),
            ("src/data/words-a2.ts", True),
            ("src/data/words-b1.ts", False),
        )
        for w in heads(os.path.join(APP, f), jm)
    }


def freq_rank():
    """Rang des Kopfworts in der Frequenzliste (ohne Artikel, Grundform-Stamm)."""
    p = os.path.join(APP, "tools", "a2", "de_50k.txt")
    ranks = {}
    for i, line in enumerate(open(p, encoding="utf-8"), 1):
        parts = line.split()
        if parts and parts[0] not in ranks:
            ranks[parts[0].lower()] = i
    return ranks


def rank_for(de, ranks, fallback):
    head = de.split()[-1]
    cands = [head.lower()]
    # Nomen: Frequenzliste fuehrt kleingeschrieben
    if de.lower().startswith(("der ", "die ", "das ")):
        cands.insert(0, head.lower())
    for c in cands:
        if c in ranks:
            return ranks[c]
    # Verben: flektierte Grundform im Korpus suchen (Infinitiv meist vorhanden)
    stem = head[:-2] if head.lower().endswith("en") and len(head) > 4 else None
    if stem:
        for w, r in ranks.items():
            if w.startswith(stem.lower()):
                return r
    return fallback


def q(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def make_gap(de, full):
    """Setzt die Luecke an die Stelle des Kopfworts im Satz."""
    head = de.split()[-1]
    if de.lower().startswith(("der ", "die ", "das ", "den ", "dem ")):
        head = de.split()[-1]
    stems = []
    hl = head.lower()
    if hl.endswith("en") and len(head) > 4:
        stems.append(head[:-2])
    stems += [head[: max(3, len(head) - 1)], head]
    for st in stems:
        for m in re.finditer(r"\b[\wÄÖÜäöüß-]+", full):
            if m.group(0).lower().startswith(st.lower()):
                return full[: m.start()] + "{{ }}" + full[m.end():]
    idx = full.lower().find(hl)
    if idx >= 0:
        return full[:idx] + "{{ }}" + full[idx + len(head):]
    return full


def parse(raw, blocked, seen_text):
    f = [x.strip() for x in raw.rstrip("\n").split("|")]
    if len(f) != 4 + len(LANGS):
        return None, f"Feldzahl {len(f)} statt {14}"
    de, meaning, cats, full = f[0], f[1], f[2], f[3]
    trs = f[4:]
    if not de or not meaning or not full:
        return None, "leeres Pflichtfeld"
    key = " ".join(de.lower().split())
    if key in blocked:
        return None, f"schon in A1/A2/B1: {de}"
    if key in seen_text:
        return None, f"Dublette: {de}"
    if "," in "".join(trs) or "،" in "".join(trs):
        return None, f"Komma in Uebersetzung: {de}"
    if any(not t for t in trs):
        return None, f"leere Uebersetzung: {de}"
    n = len(full.split())
    if n < 6 or n > 12:
        return None, f"Satz {n} Woerter: {de}"
    if "{{" in full:
        return None, f"Luecke im Satz: {de}"
    cs = [c for c in cats.split(",") if c]
    bad = set(cs) - CATS
    if bad or not cs:
        return None, f"Kategorie {bad or 'leer'}: {de}"
    # Kopfwort muss wortwoertlich im Satz stehen
    if de.split()[-1] not in full:
        return None, f"Kopfwort nicht im Satz: {de}"
    return {"de": de, "meaning": meaning, "cats": cs, "full": full,
            "tr": dict(zip(LANGS, trs))}, None


def main():
    blocked = blocked_set()
    ranks = freq_rank()
    files = sorted(glob.glob(os.path.join(HERE, "src_b2_*.txt")))
    rows, errs, seen = [], [], set()
    for path in files:
        for n, raw in enumerate(open(path, encoding="utf-8"), 1):
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            row, err = parse(raw, blocked, seen)
            if err:
                errs.append(f"{os.path.basename(path)}:{n} {err}")
                continue
            seen.add(row["de"].lower())
            rows.append(row)

    # Nach Frequenz ordnen, Gleichstand alphabetisch (stabil/deterministisch)
    fallback = 3001
    for i, r in enumerate(rows):
        r["rank"] = rank_for(r["de"], ranks, fallback + i)
    rows.sort(key=lambda r: (r["rank"], r["de"].lower()))

    lines = [
        "// B2-Wortschatz — nach Häufigkeit geordnet (rank 1 = häufigstes Wort).",
        "// Quellen: Frequenzrangfolge hermitdave/FrequencyWords (OpenSubtitles 2018);",
        "// Auswahl = über B1 hinausgehend, geprüft gegen A1/A2/B1 (keine Dubletten).",
        "// Nomen mit Artikel, Verben im Infinitiv, Adjektive in der Grundform.",
        "import type { Entry } from '../types'",
        "",
        "export const WORDS_B2: Entry[] = [",
    ]
    for i, r in enumerate(rows, 1):
        cats = ",".join(f"'{c}'" for c in r["cats"])
        trs = ", ".join(f"{k}: '{q(r['tr'][k])}'" for k in LANGS)
        lines.append(
            f"  {{ id: 'b2-{i:04d}', de: '{q(r['de'])}', meaning: '{q(r['meaning'])}', rank: {r['rank']}, "
            f"level: 'B2', cats: [{cats}], region: ['INT'],"
        )
        lines.append(f"    sentence: '{q(make_gap(r['de'], r['full']))}', sentenceFull: '{q(r['full'])}',")
        lines.append(f"    tr: {{ {trs} }} }},")
    lines += ["]", ""]
    open(OUT, "w", encoding="utf-8").write("\n".join(lines))
    print(f"B2 gebaut: {len(rows)} Eintraege aus {len(files)} Dateien, {len(errs)} verworfen -> {OUT}")
    for e in errs[:40]:
        print("  -", e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
