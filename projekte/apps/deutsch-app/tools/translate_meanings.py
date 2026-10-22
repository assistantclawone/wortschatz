"""Erklaerungen der Bedeutung in alle Lernsprachen uebersetzen.

Arbeitet in Bloecken, schreibt nach jedem Block eine Zwischendatei, damit ein
Abbruch nichts kaputt macht. Ergebnisse landen in /tmp/meanings_tr.json.
Aufruf: python3 tools/translate_meanings.py <startblock> <endblock>
"""
import json, os, sys

SRC = '/tmp/meanings_all.json'
OUT = '/tmp/meanings_tr.json'
LANGS = ['en', 'es', 'fr', 'it', 'pt', 'tr', 'ar', 'ru', 'pl', 'uk']
BLOCK = 70

all_meanings = json.load(open(SRC, encoding='utf-8'))
blocks = [all_meanings[i:i + BLOCK] for i in range(0, len(all_meanings), BLOCK)]

done = {}
if os.path.exists(OUT):
    try:
        done = json.load(open(OUT, encoding='utf-8'))
    except Exception:
        done = {}

start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
end = int(sys.argv[2]) if len(sys.argv) > 2 else len(blocks)
pending = [i for i in range(start, min(end, len(blocks)))
           if any(b not in done for b in blocks[i])]
print(f'Bloecke gesamt: {len(blocks)} | offen in diesem Auftrag: {len(pending)} | bereits: {len(done)}')
print('Erster offener Block:', pending[0] if pending else None)
if pending:
    b = blocks[pending[0]]
    print('--- BLOCK', pending[0], '---')
    print(json.dumps(b, ensure_ascii=False))
