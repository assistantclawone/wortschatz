#!/usr/bin/env python3
"""A2: englische Verben mit 'to', deutsche Nomen mit 'the' (Bug-Check 19.10.2026).
Idempotent: bereits korrekte Werte bleiben unverändert."""
import re

NO_TO = {'can', 'must', 'should', 'may', 'shall', 'will', 'would', 'could', 'might'}
NOT_VERBS = {'geboren', 'verboten', 'zufrieden', 'abgefahren', 'abgehen'}

path = 'src/data/words-a2.ts'
s = open(path, encoding='utf-8').read()

# Einträge liegen als JSON-Objekte in einer Zeile: {"id": ..., "tr": {"en": "...", ...}}
entry_re = re.compile(r'\{"id": "(?P<id>[^"]+)", "de": "(?P<de>[^"]*)".*?"tr": \{(?P<tr>[^}]*)\}\s*\}', re.S)

verbs = 0
nouns = 0

def fix(m):
    global verbs, nouns
    block = m.group(0)
    de = m.group('de')
    tr = m.group('tr')
    men = re.search(r'"en": "((?:[^"\\]|\\.)*)"', tr)
    if not men:
        return block
    val = men.group(1)
    new = None
    if re.fullmatch(r'[a-zäöüß]+(en|ern|eln)', de) and de not in NOT_VERBS:
        if not val.startswith('to ') and val not in NO_TO:
            new = 'to ' + val
            verbs += 1
    elif re.match(r'(der|die|das) ', de):
        if not val.startswith('the ') and not val.startswith('to '):
            new = 'the ' + val
            nouns += 1
    if not new:
        return block
    tr2 = tr.replace(men.group(0), '"en": "' + new + '"', 1)
    return block[:m.start('tr')] + tr2 + block[m.end('tr'):]

s2 = entry_re.sub(fix, s)
open(path, 'w', encoding='utf-8').write(s2)
print(f'A2: Verben mit to ergänzt: {verbs} | Nomen mit the: {nouns}')
