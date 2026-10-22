#!/usr/bin/env python3
"""Baut src/data/words-b1.ts komplett aus allen geprueften Blockquelldateien neu.

Quelle: tools/b1/src_block*.txt (Format: de|meaning|cats|satz|10 Sprachen)
Filter: Sperrliste (A1/A2), Dubletten, Formatfehler.
"""
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(APP, 'src', 'data', 'words-b1.ts')
LANGS = ["en","es","fr","it","pt","tr","ar","ru","pl","uk"]

def names(p, jsonmode=False):
    t = open(p, encoding='utf-8').read()
    pat = r'"de": "((?:[^"\\]|\\.)*)"' if jsonmode else r"de: '((?:[^'\\]|\\.)*)'"
    return [x.replace("\\'", "'").lower() for x in re.findall(pat, t)]

def blocked_set():
    a1 = names(os.path.join(APP,'src','data','words-a1.ts'))
    a2 = names(os.path.join(APP,'src','data','words-a2.ts'), True)
    return set(a1) | set(a2)

def q(s): return s.replace("\\","\\\\").replace("'","\\'")

def gap(de, full):
    head = de.split()[-1]
    stems = [head[:max(3, len(head)-1)]] if len(head) > 3 else [head]
    if head.lower().endswith('en') and len(head) > 4: stems.insert(0, head[:-2])
    for st in stems:
        for m in re.finditer(r"\b[\wÄÖÜäöüß-]+", full):
            if m.group(0).lower().startswith(st.lower()):
                return full[:m.start()] + '{{ }}' + full[m.end():]
    return full

def main():
    blocked = blocked_set()
    files = sorted(glob.glob(os.path.join(HERE, 'src_block*.txt')))
    rows, errs = [], []
    seen = set()
    for f in files:
        for n, raw in enumerate(open(f, encoding='utf-8'), 1):
            line = raw.strip()
            if not line or line.startswith('#'): continue
            p = [x.strip() for x in line.split('|')]
            if len(p) != 14:
                errs.append(f"{os.path.basename(f)}:{n} Feldzahl {len(p)}"); continue
            de, meaning, cats, full = p[0], p[1], p[2], p[3]
            trs = p[4:]
            if not de or not meaning or not full:
                errs.append(f"{os.path.basename(f)}:{n} leeres Feld"); continue
            if de.lower() in blocked:
                continue
            if de.lower() in seen:
                errs.append(f"{os.path.basename(f)}:{n} Dublette {de}"); continue
            if any(',' in t for t in trs):
                errs.append(f"{os.path.basename(f)}:{n} Komma {de}"); continue
            if any(not t for t in trs):
                errs.append(f"{os.path.basename(f)}:{n} leere Uebersetzung {de}"); continue
            if '{{' in full:
                errs.append(f"{os.path.basename(f)}:{n} Luecke im Satz {de}"); continue
            cats_clean = [c for c in cats.split(',') if c and ' ' not in c]
            seen.add(de.lower())
            rows.append(dict(de=de, meaning=meaning, cats=cats_clean, full=full,
                             tr=dict(zip(LANGS, trs))))
    lines = ["// B1-Wortschatz — nach Haeufigkeit geordnet. Aus geprueften Blockdateien gebaut.",
             "// Quellen: Goethe-Institut Wortliste B1, Frequenzrangfolge. Keine Erfindungen.",
             "import type { Entry } from '../types'", "", "export const WORDS_B1: Entry[] = ["]
    for i, r in enumerate(rows, 1):
        cats = ",".join(f"'{c}'" for c in r['cats'])
        trs = ", ".join(f"{k}: '{q(r['tr'][k])}'" for k in LANGS)
        lines.append(f"  {{ id: 'b1-{i:04d}', de: '{q(r['de'])}', meaning: '{q(r['meaning'])}', rank: {1500+i}, "
                     f"level: 'B1', cats: [{cats}], region: ['INT'],")
        lines.append(f"    sentence: '{q(gap(r['de'], r['full']))}', sentenceFull: '{q(r['full'])}',")
        lines.append(f"    tr: {{ {trs} }} }},")
    lines += ["]", ""]
    open(OUT, 'w', encoding='utf-8').write("\n".join(lines))
    print(f"B1 neu gebaut: {len(rows)} Eintraege aus {len(files)} Blockdateien, {len(errs)} uebersprungen")
    for e in errs[:10]: print("  -", e)

if __name__ == '__main__':
    main()
