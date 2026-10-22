#!/usr/bin/env python3
"""feedback_pull.py — holt offene Feedback-Meldungen und legt sie in tools/feedback/inbox/ ab.

Quellen:
  (a) GitHub Issues mit Label `feedback` im Repo von project.json (gh oder GITHUB_TOKEN),
      nur Issues mit Label `approved` werden geholt (Gate: NIEMAND kann fremden Text
      unkontrolliert in den Auto-Fix-Lauf bringen).
  (b) lokale Inbox tools/feedback/inbox/*.json (bereits dort, werden nur normalisiert)
  (c) optionale Import-Datei (Clipboard/Download aus der App):
        tools/feedback_pull.py --import datei.json        (Array oder Einzelobjekt)
        tools/feedback_pull.py --import datei.txt         (Text aus «Meldungen kopieren»)
  (d) Proxy-Datei vom Feedback-Endpunkt: tools/feedback/inbox/_proxy.sqlite existiert nicht —
      der Endpunkt schreibt selbst JSON-Dateien in inbox/ (siehe README-feedback.md).

Behoben/abgelehnt → tools/feedback/seen/ (nicht doppelt bearbeiten).

Aufruf:
  python3 tools/feedback_pull.py               # GitHub + lokal
  python3 tools/feedback_pull.py --no-github   # nur lokal/Import
  python3 tools/feedback_pull.py --import x.json
  python3 tools/feedback_pull.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import feedback_lib as fl  # noqa: E402

PROJECT_JSON = fl.TOOLS / "feedback" / "project.json"


# ------------------------------------------------------------ GitHub

def gh_json(args: list[str]):
    gh = shutil.which("gh")
    env = dict(os.environ)
    token = env.get("GITHUB_TOKEN") or env.get("GH_TOKEN")
    if gh:
        cmd = [gh, "api"] + args
    elif token:
        # Ohne gh, aber mit Token: Header via curl
        if not shutil.which("curl"):
            raise RuntimeError("weder gh noch curl vorhanden")
        cmd = ["curl", "-fsS", "-H", "Accept: application/vnd.github+json",
               "-H", f"Authorization: Bearer {token}",
               "-H", "X-GitHub-Api-Version: 2022-11-28",
               "https://api.github.com/" + args[0]]
        for extra in args[1:]:
            cmd += ["-d", extra]
    else:
        raise RuntimeError("kein gh und kein GITHUB_TOKEN — GitHub-Quelle uebersprungen")
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env)
    if out.returncode != 0:
        raise RuntimeError((out.stderr or out.stdout).strip()[:300])
    data = out.stdout
    if gh is None:
        data = data[data.find("[") if "[" in data else data.find("{"):]
    return json.loads(data)


def parse_issue_body(body: str) -> dict | None:
    """Issue-Body: erste JSON-Zeile (```json ... ```) oder Key: Value-Zeilen."""
    if not body:
        return None
    mt = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", body, re.S)
    if mt:
        try:
            return json.loads(mt.group(1))
        except json.JSONDecodeError:
            pass
    mt = re.search(r"(\{[^\n{]*\"message\"[^\n]*\})", body)
    if mt:
        try:
            return json.loads(mt.group(1))
        except json.JSONDecodeError:
            pass
    kv = {}
    for line in body.splitlines():
        m2 = re.match(r"^\s*(kind|entryId|entry|de|lang|message|status)\s*:\s*(.+)$", line, re.I)
        if m2:
            kv[m2.group(1)] = m2.group(2).strip()
    return kv or None


def pull_github(repo: str, state_path: Path, dry: bool) -> tuple[int, list[str]]:
    merged = gh_json([f"repos/{repo}/issues?labels=feedback,approved&state=open&per_page=100"])
    if not isinstance(merged, list):
        merged = [merged]
    merged = [i for i in merged if "pull_request" not in i]
    # Fallback: ohne gh-Token-Filter — Issues mit feedback laden, approved lokal pruefen
    if not merged:
        allfb = gh_json([f"repos/{repo}/issues?labels=feedback&state=open&per_page=100"])
        if isinstance(allfb, list):
            merged = [i for i in allfb
                      if "pull_request" not in i
                      and any(lb.get("name") == "approved" for lb in i.get("labels", []))]
    state = fl.read_json(state_path) or {}
    if not isinstance(state, dict):
        state = {}
    count = 0
    notes: list[str] = []
    for iss in merged:
        iid = iss.get("number")
        key = f"issue:{iid}"
        if key in state:
            continue
        parsed = parse_issue_body(iss.get("body") or "")
        if not parsed:
            notes.append(f"Issue #{iid}: kein Feedback-JSON erkennbar — uebersprungen")
            continue
        parsed.setdefault("id", f"fb-gh-{iid}")
        parsed.setdefault("createdAt", iss.get("created_at"))
        parsed["source"] = key
        item = fl.normalize(parsed)
        if not item:
            notes.append(f"Issue #{iid}: unbrauchbar")
            continue
        item["source"] = key
        path = fl.INBOX / f"{_safe(item['id'])}.json"
        if data_matches(path, item):
            state[key] = {"id": item["id"], "at": fl.now_iso()}
            continue
        if not dry:
            fl.write_json(path, item)
            state[key] = {"id": item["id"], "at": fl.now_iso()}
        count += 1
    if not dry:
        fl.write_json(state_path, state)
    return count, notes


def data_matches(path: Path, item: dict) -> bool:
    old = fl.read_json(path)
    if not isinstance(old, dict):
        return False
    return (old.get("message") == item.get("message")
            and old.get("entryId") == item.get("entryId")
            and old.get("kind") == item.get("kind"))


# ------------------------------------------------------------ lokal / Import

def _safe(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s)[:80]


def import_file(path: Path, dry: bool) -> tuple[int, list[str]]:
    notes: list[str] = []
    raw_text = path.read_text(encoding="utf-8")
    items: list[dict] = []
    if path.suffix.lower() == ".json" or raw_text.lstrip().startswith(("[", "{")):
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            return 0, [f"{path.name}: kein gueltiges JSON ({exc})"]
        items = data if isinstance(data, list) else [data]
    else:
        # Textformat aus feedbackAsText(): [kind] entryId (de) \n message \n Sprache: xx · ISO \n ---
        for block in re.split(r"\n-{3,}\n", raw_text):
            m2 = re.match(r"\[(\w-+)\]\s*(.*)", block.strip())
            if not m2:
                continue
            kind, head = m2.group(1), m2.group(2)
            rest = block.strip().splitlines()[1:]
            msg = " ".join(l for l in rest if not l.startswith(("Sprache:", "---"))).strip()
            eid, de = None, None
            mh = re.match(r"([\w.-]+)\s*\((.+)\)\s*$", head)
            if mh:
                eid, de = mh.group(1), mh.group(2)
            if not eid and re.fullmatch(r"[\w.-]+", head):
                eid = head
            if kind in fl.KINDS and msg:
                items.append({"id": f"fb-imp-{abs(hash((msg, eid))) % 10**10}",
                              "kind": kind, "entryId": eid, "de": de, "message": msg,
                              "lang": _lang_in(block) or "de"})
    n = 0
    for it in items:
        it.setdefault("id", "fb-imp-" + _safe(str(it.get("message"))[:24]))
        if "id" not in it or not it["id"]:
            continue
        item = fl.normalize(it)
        if not item:
            notes.append(f"{path.name}: Meldung ohne id/message uebersprungen")
            continue
        item["source"] = f"import:{path.name}"
        target = fl.INBOX / f"{_safe(item['id'])}.json"
        if data_matches(target, item):
            continue
        if not dry:
            fl.write_json(target, item)
        n += 1
    return n, notes


def _lang_in(block: str) -> str | None:
    m2 = re.search(r"Sprache:\s*([A-Za-z-]{2,10})", block)
    return m2.group(1) if m2 else None


def normalize_local(dry: bool) -> tuple[int, list[str]]:
    """Inbox-Dateien pruefen/normalisieren, kaputte in quarantine/."""
    n = 0
    notes: list[str] = []
    for p in sorted(fl.INBOX.glob("*.json")):
        data = fl.read_json(p)
        if not isinstance(data, dict):
            notes.append(f"{p.name}: defekt — verschoben nach quarantine/")
            if not dry:
                fl.QUARANTINE.mkdir(parents=True, exist_ok=True)
                p.replace(fl.QUARANTINE / p.name)
            continue
        item = fl.normalize(data)
        if not item:
            notes.append(f"{p.name}: ohne id — verschoben nach quarantine/")
            if not dry:
                fl.QUARANTINE.mkdir(parents=True, exist_ok=True)
                p.replace(fl.QUARANTINE / p.name)
            continue
        if item.get("status") in ("behoben", "abgelehnt"):
            if not dry:
                fl.SEEN.mkdir(parents=True, exist_ok=True)
                p.replace(fl.SEEN / p.name)
            continue
        if item != {**data, **{k: item[k] for k in item if data.get(k) != item.get(k)}}:
            if not dry:
                fl.write_json(p, item)
            n += 1
    return n, notes


# --------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description="Feedback-Meldungen einsammeln")
    ap.add_argument("--no-github", action="store_true")
    ap.add_argument("--import", dest="imp", action="append", default=[],
                    help="Datei mit Meldungen (JSON oder Text)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    fl.ensure_dirs()
    dry = a.dry_run
    total = 0
    notes: list[str] = []

    for f in a.imp:
        n, nt = import_file(Path(f), dry)
        total += n
        notes += nt
        # verschobene Import-Datei nicht loeschen — Quelle bleibt beim Nutzer

    if not a.no_github:
        cfg = fl.read_json(PROJECT_JSON) or {}
        repo = cfg.get("repo") if isinstance(cfg, dict) else None
        if repo:
            try:
                n, nt = pull_github(repo, fl.FB / "github-state.json", dry)
                total += n
                notes += nt
            except Exception as exc:  # GitHub nicht erreichbar -> lokale Inbox genuegt
                notes.append(f"GitHub: {exc}")
        else:
            notes.append("GitHub: project.json fehlt/kein repo — uebersprungen")

    n, nt = normalize_local(dry)
    total += n
    notes += nt

    open_n = len(fl.open_items()) if not dry else None
    if not a.quiet:
        print(f"pull: {total} neu/normalisiert" + (f", {open_n} offen in inbox" if open_n is not None else " (dry-run)"))
        for x in notes:
            print("  -", x)
    fl.log_line(fl.LOG_DIR / "pull.log", f"{fl.now_iso()} pull total={total} offen={open_n} " + "; ".join(notes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
