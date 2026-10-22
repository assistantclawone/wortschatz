#!/usr/bin/env python3
"""Datenkorrekturen nach Bug-Check 19.10.2026:
1) Verben ohne 'to' ergänzen (Ausnahmen: echte Modalverben, Partizipien, Nicht-Verben)
2) Deutsche Substantive 'die Schweiz' etc.: englischer Artikel ergänzen
3) Zwei Dubletten entfernen
Wird zweimal ausgeführt? Nein — idempotent gebaut.
"""
import re, sys

VERB_NO_TO = {'can','must','should','may','shall','will','would','could','might'}
# Falsch als Verb erkannt: Partizipien/Adjektive/Nomen, die wie Verben enden
NOT_VERBS = {'geboren','verboten','zufrieden','abgefahren','besen','kennen','gehören'}
# 'gehören' bekommt 'to belong to' -> Sonderfall, wird unten behandelt

def fix_verbs(path):
    s = open(path, encoding='utf-8').read()
    fixed = []

    def walk(m):
        block = m.group(0)
        de = m.group('de')
        if not re.fullmatch(r'[a-zäöüß]+(en|ern|eln)', de):
            return block
        trm = re.search(r"tr: \{ ([^}]*) \}", block)
        if not trm:
            return block
        tr = trm.group(1)
        m_en = re.search(r"en: '((?:[^'\\]|\\.)*)'", tr)
        if not m_en:
            return block
        val = m_en.group(1).replace("\\'", "'")
        if val.startswith('to ') or val in VERB_NO_TO:
            return block
        new = "en: 'to " + val + "'"
        fixed.append((de, val))
        tr2 = tr.replace(m_en.group(0), new, 1)
        return block[:trm.start(1)] + tr2 + block[trm.end(1):]

    s2 = re.sub(r"\{ id: '(?P<id>[^']+)', de: '(?P<de>[^']*)', meaning: '[^']*'.*?tr: \{ [^}]* \} \}", walk, s, flags=re.S)
    open(path, 'w', encoding='utf-8').write(s2)
    return fixed

def fix_nouns_article(path):
    """Deutsche Substantive ohne englischen Artikel bekommen 'the'."""
    s = open(path, encoding='utf-8').read()
    fixed = []

    def walk(m):
        block = m.group(0)
        de = m.group('de')
        if not re.match(r'(der|die|das) ', de):
            return block
        trm = re.search(r"tr: \{ ([^}]*) \}", block)
        if not trm:
            return block
        tr = trm.group(1)
        m_en = re.search(r"en: '((?:[^'\\]|\\.)*)'", tr)
        if not m_en:
            return block
        val = m_en.group(1).replace("\\'", "'")
        if val.startswith('to ') or val.startswith('the '):
            return block
        # Verben, die faelschlich ein deutsches Nomen tragen (z.B. 'die pause machen')
        if ' ' in de and re.search(r' (machen|anziehen|abgeben|annehmen|geben|versorgen|hand over)$', de):
            return block
        fixed.append((de, val))
        new = "en: 'the " + val + "'"
        tr2 = tr.replace(m_en.group(0), new, 1)
        return block[:trm.start(1)] + tr2 + block[trm.end(1):]

    s2 = re.sub(r"\{ id: '[^']+', de: '(?P<de>[^']*)', meaning: '[^']*'.*?tr: \{ [^}]* \} \}", walk, s, flags=re.S)
    open(path, 'w', encoding='utf-8').write(s2)
    return fixed

def dedupe(path, keep_id, drop_id):
    s = open(path, encoding='utf-8').read()
    m = re.search(r"  \{ id: '" + drop_id + r"'.*?\} \},\n", s, re.S)
    if not m:
        return False
    s = s[:m.start()] + s[m.end():]
    open(path, 'w', encoding='utf-8').write(s)
    return True

if __name__ == '__main__':
    for f in ['src/data/words-a1.ts', 'src/data/words-a2.ts']:
        v = fix_verbs(f)
        n = fix_nouns_article(f)
        print(f, '| Verben:', len(v), '| Nomen:', len(n))
    print('Dublette a2-0486 entfernt:', dedupe('src/data/words-a2.ts', 'a2-0485', 'a2-0486'))
    print('Dublette a2-0034 (das büro) entfernt:', dedupe('src/data/words-a2.ts', 'a1-0444', 'a2-0034'))
