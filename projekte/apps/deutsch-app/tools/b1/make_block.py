#!/usr/bin/env python3
"""Baut aus einem geprueften Block-JSON eine TS-Datei und ergaenzt sie in words-b1.ts.

Aufruf: python3 tools/b1/make_block.py <block>.json
Die Eintraege werden angehaengt; IDs werden fortlaufend neu vergeben (b1-0001 ...).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(APP, 'src', 'data', 'words-b1.ts')
SENT = os.path.join(APP, 'src', 'data', 'b1-sentences.json')

LANGS = ["en","es","fr","it","pt","tr","ar","ru","pl","uk"]

def make_gap(de, full):
    import re
    words = list(re.finditer(r"\b[\wÄÖÜäöüß-]+", full))
    head = de.split()[-1]
    stems = []
    if head.lower().endswith('en') and len(head) > 4: stems.append(head[:-2])
    stems += [head[:max(3, len(head)-1)], head[:max(3, len(head)-2)]]
    for st in stems:
        for m in words:
            if m.group(0).lower().startswith(st.lower()):
                return full[:m.start()] + '{{ }}' + full[m.end():]
    idx = full.lower().find(head.lower())
    if idx >= 0:
        return full[:idx] + '{{ }}' + full[idx+len(head):]
    return full

def q(s): return s.replace("\\", "\\\\").replace("'", "\\'")

def main(path):
    rows = json.load(open(path, encoding='utf-8'))
    existing = []
    if os.path.exists(OUT):
        src = open(OUT, encoding='utf-8').read()
        existing = json.load(open(OUT + '.json', encoding='utf-8')) if os.path.exists(OUT + '.json') else []
    allrows = existing + rows
    lines = [
      "// B1-Wortschatz — nach Haeufigkeit geordnet (rank 1 = haeufigstes).",
      "// Quellen: Goethe-Institut Wortliste B1, Frequenzrangfolge (FrequencyWords/OpenSubtitles).",
      "// Erklaerungen in allen Sprachen direkt am Eintrag. Keine Erfindungen.",
      "import type { Entry } from '../types'",
      "",
      "export const WORDS_B1: Entry[] = [",
    ]
    for i, r in enumerate(allrows, 1):
        cats = ",".join(f"'{c}'" for c in r['cats'])
        regs = ",".join(f"'{x}'" for x in r['region'])
        trs = ", ".join(f"{k}: '{q(r['tr'][k])}'" for k in LANGS)
        sent = make_gap(r['de'], r['full'])
        extra = ""
        if 'slang' in r.get('flags',''): extra += ", slang: true"
        if 'vulgar' in r.get('flags',''): extra += ", vulgar: true"
        lines.append(f"  {{ id: 'b1-{i:04d}', de: '{q(r['de'])}', meaning: '{q(r['meaning'])}', rank: {1500+i}, "
                     f"level: 'B1', cats: [{cats}], region: [{regs}]{extra},")
        lines.append(f"    sentence: '{q(sent)}', sentenceFull: '{q(r['full'])}',")
        lines.append(f"    tr: {{ {trs} }} }},")
    lines += ["]", ""]
    open(OUT, 'w', encoding='utf-8').write("\n".join(lines))
    json.dump(allrows, open(OUT + '.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'B1 total: {len(allrows)} Eintraege -> {OUT}')

if __name__ == '__main__':
    main(sys.argv[1])
