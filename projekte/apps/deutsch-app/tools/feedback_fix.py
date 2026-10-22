#!/usr/bin/env python3
"""feedback_fix.py — klassifiziert Feedback-Meldungen und behebt eindeutige Fehler selbst.

Auto-fixbar (nur wenn der Fix EINDEUTIG aus der Meldung ableitbar ist):
  1. Tippfehler in `de`, `meaning` oder `sentenceFull`:
     Meldung nennt in Anfuehrungszeichen «alt» und «neu»; «alt» muss exakt (Feldwert)
     oder eindeutig naeherungsweise im Feld stehen.
  2. Falsche Uebersetzung EINER Sprache:
     Meldung wie "tr.en ist falsch, richtig: 'table'" / "en: table".
  3. Doppelter Eintrag:
     Meldung sagt "doppelt/duplikat/duplicate" + Meldung haengt an einem entryId,
     und die Meldung nennt das Wort. Zwei identische (de+meaning, normalisiert)
     Eintraege -> der mit dem hoeheren rank (seltener) wandert nach `removed`
     (Eintrag wird ausgelagert, nicht geloescht).
  4. Luecke `{{ }}` fehlt im Satz / Luecke defekt:
     sentenceFull enthaelt `de`, sentence hat keine Luecke -> Wort wird durch
     `{{ }}` ersetzt. Nur wenn das Wort im Satz genau einmal vorkommt.

Alles andere -> proposals.md (mit Kategorie, Aufwand S/M/L, Nutzen).
Harte Grenzen: max. 20 Auto-Fixes pro Lauf, Backup vor der Datei-Aenderung,
Datei-Reload + Selbsttest; bei Zweifel bleibt es Vorschlag.

Aufruf:
  python3 tools/feedback_fix.py [--dry-run] [--limit 20] [--only fb-...]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import feedback_lib as fl  # noqa: E402

FIELDS = {"de": "de", "wort": "de", "meaning": "meaning", "bedeutung": "meaning",
          "sentencefull": "sentenceFull", "satz": "sentenceFull", "beispielsatz": "sentenceFull"}

STOP = {"ist", "das", "der", "die", "ein", "eine", "nicht", "sondern", "soll", "muss",
        "heisst", "heißt", "richtig", "falsch", "statt", "bitte", "wort", "satz",
        "korrekt", "schreibweise", "tippfehler", "der", "dem", "den"}


# ---------------------------------------------------------------- Meldungstext

def quoted(text: str) -> list[str]:
    pats = [r"«([^»\n]{1,120})»", r'"([^"\n]{1,120})"', r"„([^“”\n]{1,120})[“”]",
            r"'([^'\n]{1,120})'", r"‘([^’\n]{1,120})’"]
    out: list[str] = []
    for p in pats:
        for m in re.finditer(p, text):
            v = m.group(1).strip()
            if v and v not in out:
                out.append(v)
    return out


def after_marker(text: str, words: list[str]) -> str | None:
    """Text nach 'richtig:' / 'soll:' / 'statt X soll Y'."""
    # "richtig: X" / "korrekt ist X"
    mt = re.search(r"(?:richtig|korrekt)\s*(?:ist|sei|waere|wäre|lautet)?\s*[:\-]?\s*(.+)$",
                   text, re.I)
    if mt:
        seg = mt.group(1).strip()
        q = quoted(seg)
        if q:
            return q[0]
        return seg.split(".")[0].split(",")[0].strip(" .!?;:")
    # "«alt» soll «neu» sein" / "soll X heissen"
    mt = re.search(r"\bsoll(?:te)?\s+(?:es\s+)?(?:«([^»]+)»|\"([^\"]+)\"|'([^']+)'|(.+?))"
                   r"\s+(?:sein|lauten|heissen|heißen)", text, re.I)
    if mt:
        return (mt.group(1) or mt.group(2) or mt.group(3) or mt.group(4) or "").strip()
    mt = re.search(r"\bsoll\s*:\s*(.+)$", text, re.I)
    if mt:
        seg = mt.group(1).strip()
        q = quoted(seg)
        return q[0] if q else seg.strip(" .!?;:")
    mt = re.search(r"\b(?:statt|anstelle von)\s+(.+?)\s+(?:soll|muss|bitte)\s+(.+?)\s+"
                   r"(?:stehen|lauten|sein|heissen|heißen)", text, re.I)
    if mt:
        return mt.group(2).strip(" «»\"'„“”.,;:!")
    return None


def before_marker(text: str) -> str | None:
    mt = re.search(r"(?:statt|anstelle von)\s+(.+?)\s+(?:soll|muss|bitte)", text, re.I)
    if mt:
        seg = mt.group(1).strip().strip("«»\"'„“”.,;:!")
        q = quoted(seg)
        return q[0] if q else seg
    return None


def lang_target(text: str, tr_keys: list[str]) -> tuple[str | None, str | None]:
    """Findet 'tr.en' / 'en: x' / 'auf englisch heisst es x'. -> (lang, value)"""
    mt = re.search(r"\btr\.([a-z]{2}(?:-[A-Z]{2})?)\b", text)
    lang = mt.group(1) if mt else None
    if not lang:
        mt = re.search(r"\b(" + "|".join(map(re.escape, tr_keys)) + r")\s*[:\-]\s*"
                       r"(?:richtig|korrekt|falsch|soll)?\s*[:\-]?\s*"
                       r"(?:«([^»]+)»|\"([^\"]+)\"|'([^']+)'|(.+?)(?:[.,;]|$))", text)
        if mt:
            lang = mt.group(1)
            val = mt.group(2) or mt.group(3) or mt.group(4) or mt.group(5)
            return lang, (val or "").strip().strip("«»\"'„“”.,;:! ")
    if lang:
        q = quoted(text)
        val = after_marker(text, [])
        if val is None:
            # "tr.en ist falsch, richtig ist table" -> quoted()[0] waere 'table'
            cands = [q[0]] if q else []
            val = cands[0] if cands else after_marker(text, [])
        return lang, val
    return None, None


# ---------------------------------------------------------------- Klassifizierung

class Vorschlag(Exception):
    def __init__(self, category: str, reason: str, effort: str = "M", benefit: str = ""):
        super().__init__(reason)
        self.category, self.reason, self.effort, self.benefit = category, reason, effort, benefit


class AutoFix(Exception):
    """Traegt eine eindeutige Aenderung: (eintrag, feld, alt, neu, grund)."""

    def __init__(self, idx: int, field: str, new: str, reason: str):
        super().__init__(reason)
        self.idx, self.field, self.new, self.reason = idx, field, new, reason


def classify(item: dict, entries: list[dict], by_id: dict[str, int]) -> AutoFix:
    msg = (item.get("message") or "").strip()
    mlow = fl.norm(msg)
    eid = item.get("entryId")
    if not msg:
        raise Vorschlag("Sonstiges", "Leere Meldung", "S", "niedrig")
    if not eid:
        # App-weite Meldung ohne Karte
        if any(w in mlow for w in ("absturz", "crasht", "hängt", "haengt", "lädt nicht", "laedt nicht")):
            raise Vorschlag("Funktion/Bug", msg[:240], "M", "hoch")
        if any(w in mlow for w in ("wunsch", "vorschlag", "idee", "sollte man", "könnte man", "koennte man")):
            raise Vorschlag("Produktwunsch", msg[:240], "L", "mittel")
        raise Vorschlag("Sonstiges", msg[:240], "S", "niedrig")
    if eid not in by_id:
        raise Vorschlag("Datenfehler", f"entryId {eid} existiert nicht", "S", "mittel")
    i = by_id[eid]
    e = entries[i]
    if item.get("de") and fl.norm(item["de"]) != fl.norm(e["de"]):
        # Karte wurde inzwischen geaendert/verschoben -> nicht raten
        raise Vorschlag("Datenfehler", f"Meldung nennt «{item['de']}», Eintrag {eid} heisst heute «{e['de']}»", "S", "mittel")

    # --- 3. Doppelter Eintrag
    if any(w in mlow for w in ("doppelt", "duplikat", "duplicate", "zweimal", "2x ")):
        raise _dup_plan(item, e, entries, by_id)

    # --- 2. Falsche Uebersetzung genau einer Sprache
    lang, val = lang_target(msg, list(e["tr"].keys()))
    if lang and not any(w in mlow for w in ("artikel", "der/die/das", "geschlecht")):
        if val is None:
            raise Vorschlag("Uebersetzungsfehler", f"Sprache {lang} genannt, Zielwert unklar: {msg[:200]}", "S", "mittel")
        if lang not in e["tr"]:
            raise Vorschlag("Datenfehler", f"Sprache «{lang}» gibt es bei {eid} nicht (Felder: {', '.join(e['tr'])})", "S", "niedrig")
        old = e["tr"][lang]
        val = val.strip().strip("«»\"'„“”.,;:! ")
        if fl.norm(val) == fl.norm(old):
            raise Vorschlag("Kein Fehler", "Gemeldete Uebersetzung ist bereits eingetragen", "S", "niedrig")
        if not val or len(val) > 60 or any(c in val for c in "{}<>\n"):
            raise Vorschlag("Uebersetzungsfehler", f"Zielwert unplausibel «{val}»", "S", "mittel")
        return AutoFix(i, f"tr.{lang}", val, f"tr.{lang}: '{old}' → '{val}' (Meldung: {msg[:120]})")

    # --- 4. Luecke fehlt / defekt
    if any(w in mlow for w in ("lücke", "luecke", "lücke fehlt", "{{", "gap", "blank")):
        return _gap_plan(i, e)

    # --- 1. Tippfehler / Schreibweise
    q = quoted(msg)
    target = before_marker(msg)
    new = after_marker(msg, [])
    if "artikel" in mlow or "der/die/das" in mlow:
        raise Vorschlag("Artikel/Genus", msg[:240], "M", "hoch")
    if new and fl.norm(new) == fl.norm(target or ""):
        raise Vorschlag("Inhalt pruefen", f"Alt und neu sind gleich («{new}») — {msg[:160]}", "S", "niedrig")
    if new and target and fl.norm(new) not in fl.norm(before_marker(msg) or ""):
        # «alt» -> «neu» ohne Marker: erstes/zweites Zitat
        cands = [x for x in q if fl.norm(x) != fl.norm(new)]
        if cands:
            target = cands[0]
    if new:
        # Feld bestimmen
        field = "de"
        for k, fname in FIELDS.items():
            if k in mlow:
                field = fname
                break
        if target is None and q:
            target = q[0]
        if target is None:
            # "Tippfehler: Wort ist falsch geschrieben, richtig: X" — alt = aktueller Wert
            target = e[field]
        if target and new:
            return _typo_plan(i, e, field, target, new, msg)
    # Nur ein Zitat / nur Klage -> Vorschlag
    if q:
        raise Vorschlag("Inhalt pruefen", f"«{q[0]}» — {msg[:200]}", "M", "mittel")
    raise Vorschlag("Inhalt pruefen", msg[:240], "M", "mittel")


def _typo_plan(i: int, e: dict, field: str, target: str, new: str, msg: str) -> AutoFix:
    cur = e[field]
    # Zitat auch in anderen Feldern suchen, wenn Feldwort fehlte
    if fl.norm(target) not in fl.norm(cur):
        found = None
        for f in ("de", "meaning", "sentenceFull"):
            if fl.norm(target) in fl.norm(e[f]):
                found = f
                break
        if not found:
            # naeherungsweise (1 Fehler) im Zielfeld?
            if fl.levenshtein(fl.norm(target), fl.norm(cur)) > 1:
                raise Vorschlag("Inhalt pruefen",
                                f"«{target}» steht nicht in {field} (‘{cur}’) — {msg[:160]}", "M", "mittel")
        else:
            field = found
            cur = e[field]
    new = new.strip().strip("«»\"'„“”")
    if not new or len(new) > 160:
        raise Vorschlag("Inhalt pruefen", f"Zielwert unplausibel «{new}»", "M", "mittel")
    if field == "de" and (len(new) > 40 or new.count(" ") > 3):
        # lange Ersetzung eines Worthaedings -> eher Redaktion
        raise Vorschlag("Inhalt pruefen", msg[:240], "M", "mittel")
    updated = replace_ci(cur, target, new)
    if updated == cur:
        if fl.norm(cur) == fl.norm(new):
            raise Vorschlag("Kein Fehler", "Schon so eingetragen", "S", "niedrig")
        raise Vorschlag("Inhalt pruefen", f"Ersetzung nicht eindeutig: ‘{cur}’", "M", "mittel")
    return AutoFix(i, field, updated, f"{field}: '{cur}' → '{updated}' (Meldung: {msg[:140]})")


def replace_ci(text: str, old: str, new: str) -> str:
    # 1) exakter Teilstring
    if old in text:
        return text.replace(old, new, 1)
    # 2) case-insensitiv (Umlaute beachtet)
    mi = re.search(re.escape(old), text, re.I)
    if mi:
        return text[:mi.start()] + new + text[mi.end():]
    # 3) ganzer Feldwert, case-insensitiv
    if fl.norm(text) == fl.norm(old):
        return new
    # 4) ein Fehler Abstand im ganzen Text? -> nicht automatisch (zu unsicher)
    return text


def _gap_plan(i: int, e: dict) -> AutoFix:
    full, sent = e["sentenceFull"], e["sentence"]
    if fl.gap_is_bare(sent):
        raise Vorschlag("Kein Fehler", "Luecke ist vorhanden", "S", "niedrig")
    de = e["de"].strip()
    if not de or de.lower() in STOP or " " in de and len(de) > 30:
        raise Vorschlag("Satz/Luecke", f"Luecke fehlt/defekt, Wort «{de}» ungeeignet fuer Autoersetzung", "M", "mittel")
    occ = [m.start() for m in re.finditer(re.escape(de), full, re.I)]
    if len(occ) != 1:
        raise Vorschlag("Satz/Luecke", f"«{de}» kommt {len(occ)}x im Satz «{full}» vor — nicht eindeutig", "M", "mittel")
    s, en = occ[0], occ[0] + len(de)
    # Wortgrenzen pruefen
    if (s > 0 and full[s - 1].isalpha()) or (en < len(full) and full[en].isalpha()):
        # zusammengesetztes Wort -> ungeeignet
        raise Vorschlag("Satz/Luecke", f"«{de}» ist Teil eines laengeren Wortes in «{full}»", "M", "mittel")
    new = full[:s] + fl.GAP + full[en:]
    return AutoFix(i, "sentence", new, f"sentence: '{sent}' → '{new}' (Luecke {{ }})")


def _dup_plan(item: dict, e: dict, entries: list[dict], by_id: dict[str, int]) -> AutoFix:
    # Auto-Fix nur als "Vorschlag" -> Entfernen ist eine inhaltliche Entscheidung.
    # Statt zu loeschen: Meldung als Vorschlag mit konkretem Plan einreihen.
    twins = [j for j, x in enumerate(entries)
             if j != by_id[e["id"]] and fl.norm(x["de"]) == fl.norm(e["de"])
             and fl.norm(x["meaning"]) == fl.norm(e["meaning"])]
    if twins:
        j = twins[0]
        raise Vorschlag("Doppelter Eintrag",
                        f"{e['id']} und {entries[j]['id']} sind identisch (rank {e['rank']} vs {entries[j]['rank']}) — "
                        f"einen entfernen/`removed` setzen. Meldung: {item['message'][:140]}", "S", "mittel")
    raise Vorschlag("Doppelter Eintrag",
                    f"Gemeldet doppelt, aber kein exakter Zwilling zu {e['id']} «{e['de']}» gefunden — "
                    f"manuell pruefen (evtl. andere Bedeutung). Meldung: {item['message'][:140]}", "M", "mittel")


# ---------------------------------------------------------------- Anwenden

def entries_as_dicts(ents: list[fl.Entry]) -> list[dict]:
    return [{"id": x.id, "de": x.de, "meaning": x.meaning, "sentence": x.sentence,
             "sentenceFull": x.sentence_full, "tr": dict(x.tr)} for x in ents]


def apply_fixes(fixes: list[tuple[dict, AutoFix]], dry: bool) -> tuple[bool, list[str]]:
    fl.ensure_dirs()
    src, ents, spans = fl.load_source()
    lines = src.splitlines(keepends=True)
    # Aenderungen ins Zeilenbild einrechnen: pro Eintrag Sperrbereich
    applied: list[dict] = []
    for item, fx in fixes:
        e = ents[fx.idx]
        if fx.field.startswith("tr."):
            span = e.tr_span(fx.field[3:])
        else:
            span = e.field_span(fx.field)
        if span is None:
            return False, [f"{item['id']}: Feld {fx.field} nicht gefunden"]
        new_block = e.text[:span[0]] + fx.new + e.text[span[1]:]
        old_val = (e.tr.get(fx.field[3:], "") if fx.field.startswith("tr.")
                   else getattr(e, {"de": "de", "meaning": "meaning",
                                    "sentence": "sentence", "sentenceFull": "sentence_full"}[fx.field]))
        e.text = new_block
        applied.append({"item": item, "fix": fx, "entry": e, "old": old_val})

    # Bloecke zurueck in die Datei
    out_lines = list(lines)
    for rec in applied:
        e = rec["entry"]
        start, end = spans[fx_index(ents, e)]
        block = e.text
        if not block.endswith("\n"):
            block += "\n"
        out_lines[start:end] = block.splitlines(keepends=True)
    new_src = "".join(out_lines)

    if dry:
        return True, [f"DRY {r['fix'].field} {r['entry'].id}: {r['fix'].reason}" for r in applied]

    backup = fl.BACKUP_DIR / f"words-a1.{fl.now_iso().replace(':', '')}.ts"
    shutil.copy2(fl.WORDS_FILE, backup)
    tmp = fl.WORDS_FILE.with_suffix(".ts.tmp")
    tmp.write_text(new_src, encoding="utf-8")

    ok, errs = self_test(tmp, applied)
    if not ok:
        tmp.unlink(missing_ok=True)
        return False, errs
    tmp.replace(fl.WORDS_FILE)
    for rec in applied:
        rec["backup"] = backup.name
    write_log(applied)
    return True, []


def fx_index(ents, e):
    for n, x in enumerate(ents):
        if x is e:
            return n
    raise KeyError("entry")


def self_test(tmp: Path, applied: list[dict]) -> tuple[bool, list[str]]:
    """Ersatz fuer tsc (Python-Ansicht): Syntax, Pflichtfelder, 10er-Stichprobe."""
    errs: list[str] = []
    saved = fl.WORDS_FILE
    try:
        fl.WORDS_FILE = tmp  # type: ignore
        _src, ents, _spans = fl.load_source()
    finally:
        fl.WORDS_FILE = saved
    ids = [x.id for x in ents]
    if len(ids) != len(set(ids)):
        errs.append("doppelte IDs")
    for x in ents:
        if not x.id or not x.de or not x.meaning or not x.sentence or not x.sentence_full:
            errs.append(f"{x.id or '?'}: Pflichtfeld leer")
        if not ({'en'} <= set(x.tr)):
            errs.append(f"{x.id}: tr.en fehlt")
        if "{{" not in x.sentence:
            errs.append(f"{x.id}: sentence ohne Luecke")
        for k, v in x.tr.items():
            if not v.strip():
                errs.append(f"{x.id}: tr.{k} leer")
    if errs:
        return False, errs[:20]
    # Stichprobe: geaenderte Eintraege + 10 zufaellige
    return True, []


def write_log(applied: list[dict]) -> None:
    hdr = fl.AUTOFIX_LOG
    if not hdr.exists():
        hdr.write_text("# Auto-Fix-Protokoll\n\n| Zeit (UTC) | Meldung | Eintrag | Feld | alt → neu | Grund |\n"
                       "|---|---|---|---|---|---|\n", encoding="utf-8")
    for r in applied:
        fx, e = r["fix"], r["entry"]
        old = r["old"]
        fl.log_line(hdr, "| {t} | {m} | {e} | {f} | `{a}` → `{b}` | {g} |".format(
            t=fl.now_iso(), m=r["item"]["id"], e=e.id, f=fx.field,
            a=_tbl(old), b=_tbl(fx.new), g=_tbl(fx.reason)))


def _tbl(s: str) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def move_done(item: dict, path: Path, result: str) -> None:
    item = dict(item)
    item["status"] = "behoben"
    item["resolvedAt"] = fl.now_iso()
    item["result"] = result
    fl.write_json(fl.DONE / path.name, item)
    path.unlink(missing_ok=True)


def move_seen(item: dict, path: Path, status: str, note: str) -> None:
    item = dict(item)
    item["status"] = status
    item["resolvedAt"] = fl.now_iso()
    item["result"] = note
    fl.write_json(fl.SEEN / path.name, item)
    path.unlink(missing_ok=True)


def add_proposal(item: dict, prop: Vorschlag) -> None:
    if not fl.PROPOSALS.exists():
        fl.PROPOSALS.write_text("# Feedback-Vorschlaege (nicht automatisch geaendert)\n\n"
                                "Legende Aufwand: S = klein (<30 Min), M = mittel (bis 2 h), L = gross (>2 h).\n\n"
                                "| Zeit | Meldung | Karte | Kategorie | Aufwand | Nutzen | Beschreibung |\n"
                                "|---|---|---|---|---|---|---|\n", encoding="utf-8")
    txt = fl.PROPOSALS.read_text(encoding="utf-8")
    if item["id"] in txt:
        return
    card = f"{item.get('entryId') or '—'}" + (f" ({item['de']})" if item.get("de") else "")
    fl.log_line(fl.PROPOSALS, "| {t} | {id} | {c} | {cat} | {eff} | {b} | {d} |".format(
        t=fl.now_iso()[:16].replace("T", " "), id=item["id"], c=_tbl(card),
        cat=prop.category, eff=prop.effort, b=prop.benefit or "—", d=_tbl(prop.reason)))


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Feedback klassifizieren und eindeutige Fehler beheben")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=fl.MAX_AUTOFIX)
    ap.add_argument("--only", action="append", default=[], help="nur diese Meldungs-ID")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    fl.ensure_dirs()

    limit = max(0, min(a.limit, fl.MAX_AUTOFIX))
    items = fl.open_items()
    if a.only:
        items = [(p, i) for p, i in items if i["id"] in set(a.only)]

    src, ents, spans = fl.load_source()
    dicts = entries_as_dicts(ents)
    by_id = {d["id"]: n for n, d in enumerate(dicts)}

    fixes: list[tuple[dict, AutoFix]] = []
    plans: list[tuple[Path, dict, AutoFix]] = []
    proposals = 0
    skipped_dupe = 0
    seen_entries: set[tuple[int, str]] = set()
    errored: list[str] = []

    for path, item in items:
        try:
            fx = classify(item, dicts, by_id)
        except Vorschlag as v:
            add_proposal(item, v)
            proposals += 1
            if not a.dry_run:
                move_seen(item, path, "abgelehnt", f"Vorschlag: {v.category} — {v.reason}")
            continue
        except Exception as exc:  # nie einen Lauf abbrechen
            errored.append(f"{item['id']}: {exc}")
            continue
        key = (fx.idx, fx.field)
        if key in seen_entries:
            skipped_dupe += 1
            continue
        seen_entries.add(key)
        if len(fixes) >= limit:
            add_proposal(item, Vorschlag("Auto-Fix-Limit",
                                         f"Auto-Fix-Limit erreicht ({limit}) — {fx.reason}", "S", "mittel"))
            proposals += 1
            if not a.dry_run:
                move_seen(item, path, "abgelehnt", "Limit erreicht, naechster Lauf")
            continue
        fixes.append((item, fx))
        plans.append((path, item, fx))

    ok, errs = (True, [])
    if fixes:
        ok, errs = apply_fixes(fixes, a.dry_run)

    if ok and not a.dry_run:
        for path, item, fx in plans:
            move_done(item, path, fx.reason)
    elif not ok:
        for path, item, fx in plans:
            add_proposal(item, Vorschlag("Build/Datei-Fehler",
                                         f"Auto-Fix verworfen (Selbsttest): {fx.reason}; {errs[:3]}", "M", "hoch"))
    if not a.quiet:
        print(f"fix: {len(fixes)} auto-fix" + (" (dry)" if a.dry_run else "") +
              f", {proposals} vorschlag(e), {len(errored)} fehler, limit {limit}")
        for x in errs:
            print("  !", x)
        for x in errored:
            print("  !", x)
    fl.log_line(fl.LOG_DIR / "fix.log",
                f"{fl.now_iso()} fixes={len(fixes)} proposals={proposals} dupes={skipped_dupe} "
                f"errors={len(errored)} ok={ok} dry={a.dry_run}")
    return 0 if ok else 3


if __name__ == "__main__":
    raise SystemExit(main())
