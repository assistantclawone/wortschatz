#!/usr/bin/env python3
"""Prueft src/data/words-b2.ts gegen alle Vorgaben der B2-Runde.

Prueft: IDs fortlaufend/doppelt, Kopfwort-Dubletten, Dubletten gegen A1/A2/B1,
alle Felder gefuellt, Luecke {{ }} genau 1x, Wort wortwoertlich in sentenceFull,
Satz 6-12 Woerter, 10 Uebersetzungen ohne Kommas, cats/region gueltig, level B2.
Exit 0 = alles ok.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(APP, "src", "data")
LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]
CATS = set("alltag behoerden arbeit gesundheit wohnen einkaufen reisen familie bildung "
           "freizeit telefon bank gastro handwerk technik pflege logistik bau buero recht".split())
REGIONS = {"CH", "AT", "DE", "INT"}


def heads(path, json_mode=False):
    t = open(path, encoding="utf-8").read()
    pat = r'"de": "((?:[^"\\]|\\.)*)"' if json_mode else r"de: '((?:[^'\\]|\\.)*)'"
    return [x.replace("\\'", "'") for x in re.findall(pat, t)]


def main():
    text = open(os.path.join(SRC, "words-b2.ts"), encoding="utf-8").read()
    starts = [(m.start(), m.group(1)) for m in re.finditer(r"\{\s*id:\s*'([^']+)'", text)]
    other = set()
    for f, jm in (("words-a1.ts", False), ("words-a2.ts", True), ("words-b1.ts", False)):
        other |= {w.lower() for w in heads(os.path.join(SRC, f), jm)}

    errs, ids, de_seen, words_short, words_long = [], [], {}, 0, 0
    prev = 0
    for i, (pos, eid) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else text.rfind("]")
        b = text[pos:end]
        m = re.match(r"b2-(\d{4})$", eid)
        if not m:
            errs.append(f"{eid}: ID-Format")
        else:
            num = int(m.group(1))
            if num != prev + 1:
                errs.append(f"{eid}: ID nicht fortlaufend (nach b2-{prev:04d})")
            prev = num
        ids.append(eid)

        def g(key):
            mm = re.search(rf"{key}:\s*'((?:[^'\\]|\\.)*)'", b)
            return mm.group(1).replace("\\'", "'") if mm else None

        de, meaning = g("de"), g("meaning")
        sent, full = g("sentence"), g("sentenceFull")
        rank = re.search(r"rank:\s*(\d+)", b)
        lvl = re.search(r"level:\s*'([^']+)'", b)
        cats = re.search(r"cats:\s*\[([^\]]*)\]", b)
        region = re.search(r"region:\s*\[([^\]]*)\]", b)

        for name, val in (("de", de), ("meaning", meaning), ("sentence", sent), ("sentenceFull", full)):
            if not val or not val.strip():
                errs.append(f"{eid}: {name} leer")
        if not rank:
            errs.append(f"{eid}: rank fehlt")
        if not lvl or lvl.group(1) != "B2":
            errs.append(f"{eid}: level != B2")
        if not cats or not cats.group(1).strip():
            errs.append(f"{eid}: cats leer")
        else:
            keys = {c.strip().strip("'") for c in cats.group(1).split(",") if c.strip()}
            bad = keys - CATS
            if bad:
                errs.append(f"{eid}: unbekannte Kategorie {bad}")
        if not region:
            errs.append(f"{eid}: region fehlt")
        else:
            keys = {c.strip().strip("'") for c in region.group(1).split(",") if c.strip()}
            if keys - REGIONS:
                errs.append(f"{eid}: ungültige Region {keys - REGIONS}")

        if de:
            k = de.lower()
            if k in other:
                errs.append(f"{eid}: Dublette zu A1/A2/B1: {de}")
            if k in de_seen:
                errs.append(f"{eid}: doppeltes Kopfwort ({de_seen[k]}) : {de}")
            de_seen[k] = eid

        if de and full:
            head = de.split()[-1]
            if head not in full:
                errs.append(f"{eid}: Kopfwort nicht wörtlich in sentenceFull: {de}")
            if full.count("{{"):
                errs.append(f"{eid}: Lücke in sentenceFull")
        if sent and full:
            if sent.count("{{ }}") != 1:
                errs.append(f"{eid}: Lücke muss 1x vorkommen (ist {sent.count('{{ }}')})")
            n = len(full.split())
            if not 6 <= n <= 12:
                errs.append(f"{eid}: Satz {n} Wörter: {full}")
            if sent.replace("{{ }}", "") not in full.replace("{{ }}", ""):
                # Lücke muss den Satz lückenlos rekonstruieren
                pre, post = sent.split("{{ }}")[0], sent.split("{{ }}")[1]
                if not (full.startswith(pre) and full.endswith(post)):
                    errs.append(f"{eid}: sentence passt nicht zu sentenceFull")

        tr = re.search(r"tr:\s*\{([^}]*)\}", b, re.S)
        if not tr:
            errs.append(f"{eid}: tr fehlt")
        else:
            have = dict(re.findall(r"(\w+):\s*'((?:[^'\\]|\\.)*)'", tr.group(1)))
            for lang in LANGS:
                v = have.get(lang, "").strip()
                if not v:
                    errs.append(f"{eid}: Übersetzung fehlt ({lang})")
                if "," in v:
                    errs.append(f"{eid}: Komma in Übersetzung ({lang}): {v}")
                if lang == "en" and de and de.lower().endswith(("en", "ern", "eln")) \
                        and not v.startswith("to "):
                    words_short += 1
                    errs.append(f"{eid}: Verb ohne 'to' in en: {de} -> {v}")

    print(f"{len(starts)} Einträge, IDs b2-0001 … b2-{prev:04d}")
    if errs:
        print(f"\n{len(errs)} Fehler:")
        for e in errs[:60]:
            print("  ✗", e)
        if len(errs) > 60:
            print(f"  … und {len(errs) - 60} weitere")
        return 1
    print("Alle Prüfungen bestanden.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
