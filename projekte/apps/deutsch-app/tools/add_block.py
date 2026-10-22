#!/usr/bin/env python3
"""
Fügt einen Block in tools/_gen_input.txt ein, prüft ihn vorher und baut danach
die Wortdatei neu.

Aufruf:  python3 tools/add_block.py tools/blocks/b01.txt
"""
import re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
INPUT = os.path.join(HERE, "_gen_input.txt")

LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]
CATS = {"alltag","behoerden","arbeit","gesundheit","wohnen","einkaufen","reisen",
        "familie","bildung","freizeit","telefon","bank","gastro","handwerk",
        "technik","pflege","logistik","bau","buero","recht"}
REGIONS = {"CH", "AT", "DE", "INT"}


def strip_fence(lines):
    out = []
    for l in lines:
        s = l.strip()
        if s.startswith("```") or s.startswith("#") or not s:
            continue
        out.append(s)
    return out


def check(line, lineno):
    errs = []
    parts = [p for p in line.split("|")]
    if len(parts) < 7:
        return [f"Zeile {lineno}: nur {len(parts)} Felder"]
    de, meaning, level, cats, region, full, trraw = parts[:7]
    flags = parts[7] if len(parts) > 7 else ""

    if not de or not meaning:
        errs.append(f"Zeile {lineno}: de/meaning leer")
    if level != "A1":
        errs.append(f"Zeile {lineno}: level={level!r}")
    if cats.upper() != "ALL":
        bad = {c.strip() for c in cats.split(",") if c.strip()} - CATS
        if bad:
            errs.append(f"Zeile {lineno}: cats unbekannt {bad}")
    bad = {r.strip().upper() for r in region.split(",") if r.strip()} - REGIONS
    if bad:
        errs.append(f"Zeile {lineno}: region unbekannt {bad}")
    if not full:
        errs.append(f"Zeile {lineno}: sentenceFull leer")

    tr = dict(re.findall(r"(\w{2})=([^,]*)", trraw))
    miss = [l for l in LANGS if not tr.get(l, "").strip()]
    if miss:
        errs.append(f"Zeile {lineno}: Übersetzung fehlt {miss}")
    extra = set(tr) - set(LANGS)
    if extra:
        errs.append(f"Zeile {lineno}: unbekannte Sprachkürzel {extra}")
    if flags.strip() not in ("", "slang", "vulgar", "slang+vulgar"):
        errs.append(f"Zeile {lineno}: flags={flags!r}")
    return errs


def main():
    if len(sys.argv) < 2:
        print("Aufruf: python3 tools/add_block.py <blockdatei>"); sys.exit(2)
    blockfile = sys.argv[1]
    raw = strip_fence(open(blockfile, encoding="utf-8").read().splitlines())

    existing = strip_fence(open(INPUT, encoding="utf-8").read().splitlines())
    have = {l.split("|")[0].strip().lower() for l in existing if l.count("|") >= 6}

    errs, ok, dup = [], [], 0
    for i, line in enumerate(raw, 1):
        e = check(line, i)
        if e:
            errs += e
            continue
        de = line.split("|")[0].strip().lower()
        if de in have:
            dup += 1
            continue
        have.add(de)
        ok.append(line)

    print(f"Block: {len(raw)} Zeilen | übernommen: {len(ok)} | Duplikate: {dup} | Fehler: {len(errs)}")
    for e in errs[:25]:
        print("  ✗", e)

    if errs:
        print("\nNICHT eingefügt — Block zuerst korrigieren.")
        sys.exit(1)

    with open(INPUT, "a", encoding="utf-8") as f:
        for l in ok:
            f.write(l + "\n")
    print(f"Eingefügt in {INPUT}")


if __name__ == "__main__":
    main()
