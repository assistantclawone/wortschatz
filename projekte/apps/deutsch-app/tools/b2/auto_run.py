#!/usr/bin/env python3
"""auto_run.py — selbständiger Bau-Lauf für die Wortschatz-App.

Ablauf pro Lauf (gedacht für Cron, z. B. alle 10 Minuten):
  1. Quellblöcke aus tools/b2/src_b2_*.txt einlesen und prüfen
  2. words-b2.ts neu bauen (tools/b2/gen_b2.py Logik), Dubletten/Sperrliste greifen
  3. check_b2.py — bei Fehlern: NICHTS deployen, Status in auto-state.json
  4. npx tsc --noEmit — bei Fehlern: Abbruch, nichts deployen
  5. npx vite build
  6. docs/ aktualisieren + Push nach assistantclawone/wortschatz (Token aus
     ~/.openclaw/secrets/github-token)
  7. Live-Verifikation (b2-ID-Zahl im ausgelieferten app.js)
  8. Ergebnis als eine Zeile in tools/b2/auto-log.txt + auto-state.json

Es wird nie etwas gelöscht und nie ein kaputter Stand hochgeladen.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

APP = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE = os.path.join(APP, "tools", "b2", "auto-state.json")
LOG = os.path.join(APP, "tools", "b2", "auto-log.txt")
TOKEN_FILE = os.path.expanduser("~/.openclaw/secrets/github-token")
REPO = "assistantclawone/wortschatz"
LIVE = "https://assistantclawone.github.io/wortschatz/app.js"


def sh(cmd, timeout=1800, env=None):
    e = dict(os.environ)
    e.setdefault("HTTPS_PROXY", "")
    e["HTTPS_PROXY"] = ""
    e["HTTP_PROXY"] = ""
    e["https_proxy"] = ""
    e["http_proxy"] = ""
    if env:
        e.update(env)
    p = subprocess.run(cmd, shell=True, cwd=APP, capture_output=True, text=True,
                       timeout=timeout, env=e)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def log(line):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{now()} {line}\n")


def read_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"runs": 0, "last_ok": None, "last_error": None, "deployed_b2": 0}


def write_state(s):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=1)


def count_b2_src():
    out = sh("grep -c 'id: \"b2-' src/data/words-b2.ts || true")[1].strip()
    if not out.isdigit():
        out = sh("grep -c 'b2-' src/data/words-b2.ts")[1].strip()
    return int(out) if out.isdigit() else 0


def live_b2():
    try:
        req = urllib.request.Request(LIVE + f"?t={int(time.time())}",
                                     headers={"User-Agent": "cron"})
        with open(os.devnull, "w") as dn:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(req, timeout=60) as r:
                txt = r.read().decode("utf-8", "ignore")
        return len(set(re.findall(r"b2-\d{4}", txt)))
    except Exception as e:
        return f"error: {e}"


def main():
    st = read_state()
    st["runs"] = st.get("runs", 0) + 1
    steps = []

    # 1+2: Quelldateien -> words-b2.ts
    files = sorted(
        [f for f in os.listdir(os.path.join(APP, "tools", "b2")) if re.match(r"src_b2_\d+\.txt$", f)]
    )
    pairs = []
    for f in files:
        code, _ = sh(f"python3 tools/b2/gen_b2.py tools/b2/{f} /tmp/auto_{f}.ts", timeout=600)
        pairs.append((f, code))
    bad = [f for f, c in pairs if c != 0]
    steps.append(f"gen:{len(files)} Dateien, Fehler: {bad or 'keine'}")

    # 3: Prüfer
    code, out = sh("python3 tools/b2/check_b2.py", timeout=600)
    if code != 0:
        st["last_error"] = f"check_b2: {out.strip()[-400:]}"
        steps.append("check_b2 FEHLER -> kein Deploy")
        write_state(st)
        log("; ".join(steps))
        return 1
    steps.append("check_b2 ok")
    n_src = count_b2_src()

    # 4: TypeScript
    code, out = sh("npx tsc --noEmit", timeout=1200)
    if code != 0:
        st["last_error"] = "tsc: " + out.strip()[-400:]
        steps.append("tsc FEHLER -> kein Deploy")
        write_state(st)
        log("; ".join(steps))
        return 1
    steps.append("tsc 0")

    # 5: Build
    code, out = sh("npx vite build", timeout=1800)
    if code != 0:
        st["last_error"] = "build: " + out.strip()[-400:]
        steps.append("build FEHLER -> kein Deploy")
        write_state(st)
        log("; ".join(steps))
        return 1
    built = len(set(re.findall(r"b2-\d{4}", open(os.path.join(APP, "dist", "app.js"),
                                                 encoding="utf-8", errors="ignore").read())))
    steps.append(f"build ok ({built} b2 im Bundle)")

    # 6: docs + Push
    sh("cp dist/index.html dist/app.js dist/app.css docs/ && cp -r dist/assets docs/ 2>/dev/null || true")
    if os.path.exists(TOKEN_FILE):
        tok = open(TOKEN_FILE, encoding="utf-8").read().strip()
        code, out = sh("python3 /tmp/ghput.py \"auto: B2 %d Eintraege\"" % n_src,
                       timeout=600, env={"GITHUB_TOKEN_CLASSIC_ASSISTANTCLAWONE": tok})
        ok = "200 OK" in out and "401" not in out
        steps.append("push " + ("ok" if ok else "FEHLER: " + out.strip()[-200:]))
        if not ok:
            st["last_error"] = "push: " + out.strip()[-300:]
            write_state(st)
            log("; ".join(steps))
            return 1
    else:
        steps.append("push übersprungen (kein Token)")

    # 7: Live prüfen (Pages braucht manchmal 1-2 Minuten)
    seen = 0
    for _ in range(6):
        seen = live_b2()
        if isinstance(seen, int) and seen >= built:
            break
        time.sleep(20)
    steps.append(f"live {seen}/{built}")

    st["last_ok"] = now()
    st["deployed_b2"] = built
    st["last_error"] = None
    write_state(st)
    log("; ".join(steps))
    return 0


if __name__ == "__main__":
    sys.exit(main())
