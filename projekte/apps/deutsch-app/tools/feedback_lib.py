"""Gemeinsame Helfer fuer das Feedback-/Auto-Fix-System «Wortschatz».

- Pfade (inbox/done/proposals/autofix-log)
- Einlesen der Wortdaten direkt aus src/data/words-a1.ts (Quelle der Wahrheit)
- Normalisierung eingehender Meldungen
- Protokollieren von Aenderungen

Es werden KEINE schreibenden Aenderungen an den Wortdaten hier gemacht —
das macht ausschliesslich feedback_fix.py (mit Backup, Limit und Selbsttest).
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # deutsch-app/
TOOLS = ROOT / "tools"
FB = TOOLS / "feedback"
INBOX = FB / "inbox"
DONE = FB / "done"
SEEN = FB / "seen"
QUARANTINE = FB / "quarantine"
PROPOSALS = FB / "proposals.md"
AUTOFIX_LOG = FB / "autofix-log.md"
WORDS_FILE = ROOT / "src" / "data" / "words-a1.ts"
BACKUP_DIR = FB / "backups"
LOG_DIR = FB / "logs"
MAX_AUTOFIX = 20

KINDS = {"card-error", "typo", "suggestion", "other"}
STATUS = {"offen", "behoben", "abgelehnt"}


def ensure_dirs() -> None:
    for d in (INBOX, DONE, SEEN, QUARANTINE, BACKUP_DIR, LOG_DIR, TOOLS / "feedback"):
        d.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def log_line(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(text.rstrip() + "\n")


# ---------------------------------------------------------------- Wortdaten

ENTRY_RE = re.compile(r"[ \t]*\{ id: ")
ID_RE = re.compile(r"id: '([^']*)'")
DE_RE = re.compile(r"de: '((?:[^'\\]|\\.)*)'")
MEANING_RE = re.compile(r"meaning: '((?:[^'\\]|\\.)*)'")
SENTENCE_RE = re.compile(r"sentence: '((?:[^'\\]|\\.)*)'")
SENTENCE_FULL_RE = re.compile(r"sentenceFull: '((?:[^'\\]|\\.)*)'")
TR_LINE_RE = re.compile(r"tr: \{ (.*?) \}")
TR_PAIR_RE = re.compile(r"([a-z]{2}(?:-[A-Z]{2})?): '((?:[^'\\]|\\.)*)'")


class Entry:
    """Ein Eintrag in words-a1.ts, mit Zeilenbereich und Feldpositionen."""

    def __init__(self, text: str):
        self.text = text
        self.id = _m(ID_RE, text)
        self.de = _m(DE_RE, text)
        self.meaning = _m(MEANING_RE, text)
        self.sentence = _m(SENTENCE_RE, text)
        self.sentence_full = _m(SENTENCE_FULL_RE, text)
        self.tr: dict[str, str] = {}
        mt = TR_LINE_RE.search(text)
        if mt:
            self.tr = {k: v for k, v in TR_PAIR_RE.findall(mt.group(1))}

    def field_span(self, field: str) -> tuple[int, int] | None:
        """Absoluter (start, end) Bereich des WERTES eines Feldes in self.text."""
        rx = {
            "de": DE_RE, "meaning": MEANING_RE,
            "sentence": SENTENCE_RE, "sentenceFull": SENTENCE_FULL_RE,
        }[field]
        mt = rx.search(self.text)
        if not mt:
            return None
        return mt.span(1)

    def tr_span(self, lang: str) -> tuple[int, int] | None:
        mt = TR_LINE_RE.search(self.text)
        if not mt:
            return None
        base = mt.start(1)
        line = mt.group(1)
        for pm in TR_PAIR_RE.finditer(line):
            if pm.group(1) == lang:
                return base + pm.start(2), base + pm.end(2)
        return None


def _m(rx: re.Pattern, text: str) -> str:
    mt = rx.search(text)
    return mt.group(1) if mt else ""


def load_source() -> tuple[str, list[Entry], list[tuple[int, int]]]:
    """Gibt (quelltext, eintraege, zeilenbereiche) zurueck.

    zeilenbereiche[i] = (start_zeile, end_zeile) 0-basiert, exklusiv Ende.
    """
    src = WORDS_FILE.read_text(encoding="utf-8")
    lines = src.splitlines(keepends=True)
    starts = [i for i, ln in enumerate(lines) if ENTRY_RE.match(ln)]
    entries: list[Entry] = []
    spans: list[tuple[int, int]] = []
    for n, s in enumerate(starts):
        e = starts[n + 1] if n + 1 < len(starts) else len(lines)
        # trailing "]" / "]" Zeile nicht mitschlucken
        while e > s + 1 and lines[e - 1].lstrip().startswith("]"):
            e -= 1
        entries.append(Entry("".join(lines[s:e])))
        spans.append((s, e))
    return src, entries, spans


def entry_index(entries: list[Entry]) -> dict[str, int]:
    return {e.id: i for i, e in enumerate(entries)}


# ---------------------------------------------------------------- Meldungen

def normalize(raw: dict) -> dict | None:
    """Vereinheitlicht eine eingehende Meldung. None = unbrauchbar."""
    if not isinstance(raw, dict):
        return None
    msg = str(raw.get("message") or raw.get("body") or "").strip()
    kind = str(raw.get("kind") or "").strip()
    eid = raw.get("entryId")
    if kind not in KINDS:
        kind = "other"
    if eid is not None:
        eid = str(eid).strip() or None
    rid = raw.get("id")
    if not rid:
        return None
    item = {
        "id": str(rid),
        "kind": kind,
        "entryId": eid,
        "de": (str(raw["de"]).strip() if raw.get("de") else None),
        "message": msg,
        "lang": str(raw.get("lang") or "de").strip(),
        "createdAt": str(raw.get("createdAt") or now_iso()),
        "appVersion": str(raw.get("appVersion") or "unbekannt"),
        "status": "offen",
    }
    if raw.get("source"):
        item["source"] = str(raw["source"])
    return item


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def open_items() -> list[tuple[Path, dict]]:
    out = []
    for p in sorted(INBOX.glob("*.json")):
        data = read_json(p)
        if isinstance(data, dict) and data.get("status") == "offen":
            out.append((p, data))
    return out


# ---------------------------------------------------------------- Text-Helfer

def norm(s: str) -> str:
    """Vergleichsform: NFC, Kleinbuchstaben, einfache Anfuehrungszeichen, Whitespace."""
    s = unicodedata.normalize("NFC", s or "")
    s = s.replace("’", "'").replace("‘", "'").replace("„", '"').replace("“", '"')
    return re.sub(r"\s+", " ", s).strip().casefold()


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if abs(len(a) - len(b)) > 4:
        return 99
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


GAP = "{{ }}"


def gap_count(s: str) -> int:
    return (s or "").count("{{")


def gap_is_bare(s: str) -> bool:
    """True, wenn die Luecke vorhanden und sauber geschlossen ist."""
    return ("{{" in s and "}}" in s
            and s.count("{{") == 1 and s.count("}}") == 1
            and s.index("{{") < s.index("}}"))
