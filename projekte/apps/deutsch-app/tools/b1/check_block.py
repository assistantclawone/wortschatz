#!/usr/bin/env python3
"""Prueft einen B1-Block gegen Format, Dubletten und Satz-Vorkommen."""
import json, re, sys

LANGS = ["en","es","fr","it","pt","tr","ar","ru","pl","uk"]
CATS = set("alltag behoerden arbeit gesundheit wohnen einkaufen reisen familie bildung freizeit telefon bank gastro handwerk technik pflege logistik bau buero recht".split())

def main(path, seen_extra):
    seen = set(seen_extra)
    rows, errs = [], []
    for n, raw in enumerate(open(path, encoding='utf-8').read().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('```') or line.startswith('#'):
            continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 7:
            errs.append(f'Z{n}: zu wenige Felder ({len(parts)})'); continue
        de, meaning, level, cats, region, full, trraw = parts[:7]
        flags = parts[7] if len(parts) > 7 else ''
        if level != 'B1': errs.append(f'Z{n} {de}: level={level}')
        cs = [] if cats.upper() == 'ALL' else [c for c in cats.split(',') if c]
        bad = set(cs) - CATS
        if bad: errs.append(f'Z{n} {de}: Kategorie {bad}')
        regs = [r for r in region.split(',') if r]
        if set(regs) - {'CH','AT','DE','INT'}: errs.append(f'Z{n} {de}: Region {regs}')
        tr = dict(re.findall(r'(\w{2})=([^,]*)', trraw))
        miss = [l for l in LANGS if not tr.get(l, '').strip()]
        if miss: errs.append(f'Z{n} {de}: fehlt {miss}')
        if '{{' in full: errs.append(f'Z{n} {de}: Luecke schon im Satz')
        key = de.lower()
        if key in seen: errs.append(f'Z{n} {de}: Dublette')
        seen.add(key)
        # Kopfwort muss im Satz vorkommen (Flexion: Stamm)
        head = de.split()[-1].lower()
        stem = head[:-2] if len(head) > 5 and head.endswith('en') else head[:max(4, len(head)-2)]
        if stem not in full.lower():
            errs.append(f'Z{n} {de}: Kopfwort nicht im Satz')
        rows.append(dict(z= n, de= de, meaning= meaning, cats= cs or ['ALL'], region= regs,
                         full= full, tr= {l: tr.get(l,'') for l in LANGS}, flags= flags))
    print(f'{path}: {len(rows)} Eintraege, {len(errs)} Fehler')
    for e in errs[:20]: print('  x', e)
    return rows, errs

if __name__ == '__main__':
    base = json.load(open('/tmp/heads.json', encoding='utf-8'))
    rows, errs = main(sys.argv[1], set(base))
    json.dump(rows, open(sys.argv[1] + '.json', 'w', encoding='utf-8'), ensure_ascii=False)
    sys.exit(1 if errs else 0)
