#!/usr/bin/env bash
# release.sh — Sicherheitsnetz vor jedem Deploy (versteht die Parameter von deploy.sh).
#   1. npx tsc --noEmit
#   2. npx vite build
#   3. Stichprobe: Wortdaten-Struktur + bis zu 10 geaenderte Eintraege auf Feldformat
#   4. nur bei 0 Fehlern weiter -> docs/ aktualisieren -> optional push
#   Bei Fehler: Abbruch (Exit 1), Grund in tools/feedback/logs/release.log, Build-Artefakt bleibt unberuehrt.
#
#   tools/release.sh            # Build + Stichprobe, kein Push
#   tools/release.sh --push     # Build + Stichprobe + GitHub-Pages-Push (wie deploy.sh --push)
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
LOG="$ROOT/tools/feedback/logs/release.log"
mkdir -p "$(dirname "$LOG")"

PUSH=0
for a in "$@"; do
  case "$a" in
    --push) PUSH=1 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done

fail() {
  echo "!! RELEASE ABBRUCH: $*" >&2
  echo "$(date -u +%FT%TZ) ABBRUCH $*" >> "$LOG"
  exit 1
}
say() { echo ">> $*"; echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

# --- 0. Arbeitskopie sauber? (nur Warnung, kein Abbruch)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet -- src/data/words-a1.ts; then
    say "words-a1.ts hat uncommittete Auto-Fixes (werden mitgebaut)"
  fi
fi

# --- 1. TypeScript
say "tsc --noEmit"
if ! npx tsc --noEmit -p tsconfig.json > /tmp/wortschatz-tsc.log 2>&1; then
  tail -20 /tmp/wortschatz-tsc.log >&2
  fail "TypeScript-Fehler (siehe /tmp/wortschatz-tsc.log)"
fi

# --- 2. Build
say "vite build"
rm -rf dist
if ! npx vite build > /tmp/wortschatz-build.log 2>&1; then
  tail -20 /tmp/wortschatz-build.log >&2
  fail "vite build fehlgeschlagen (siehe /tmp/wortschatz-build.log)"
fi
[[ -f dist/index.html && -f dist/app.js ]] || fail "dist unvollstaendig (index.html/app.js fehlt)"
grep -q 'app.js' dist/index.html || fail "app.js-Referenz in index.html fehlt"

# --- 3. Stichprobe der Wortdaten (10 geaenderte Eintraege + Grundform)
say "Stichprobe Wortdaten"
python3 - "$@" <<'PY' || fail "Stichprobe der Wortdaten fehlgeschlagen"
import re, subprocess, sys
from pathlib import Path
root = Path.cwd()
sys.path.insert(0, str(root / "tools"))
import feedback_lib as fl

_src, ents, _ = fl.load_source()
errs = []
ids = [e.id for e in ents]
if len(ids) != len(set(ids)):
    errs.append("doppelte IDs")
for e in ents:
    if not re.fullmatch(r"[a-z]\d-\d{4,5}", e.id or ""):
        errs.append(f"{e.id!r}: ID-Format ungueltig")
    for f, v in (("de", e.de), ("meaning", e.meaning), ("sentence", e.sentence), ("sentenceFull", e.sentence_full)):
        if not v or not v.strip():
            errs.append(f"{e.id}: {f} leer")
    if "{{" not in e.sentence or "}}" not in e.sentence:
        errs.append(f"{e.id}: sentence ohne Luecke {{{{' '}}}}")
    if not e.tr or "en" not in e.tr:
        errs.append(f"{e.id}: tr.en fehlt")
    for k, v in e.tr.items():
        if not v.strip():
            errs.append(f"{e.id}: tr.{k} leer")

# bis zu 10 wirklich geaenderte Eintraege aus git diff ermitteln
changed = []
try:
    diff = subprocess.run(["git", "diff", "-U0", "--", "src/data/words-a1.ts"],
                          capture_output=True, text=True, timeout=30).stdout
    for ln in diff.splitlines():
        m = re.search(r"id: '([^']+)'", ln)
        if m and m.group(1) not in changed:
            changed.append(m.group(1))
except Exception:
    pass
sample = [e for e in ents if e.id in changed][:10]
for e in sample:
    if not e.de.strip() or not e.tr.get("en", "").strip():
        errs.append(f"{e.id}: geaenderter Eintrag unplausibel nach Fix")

if errs:
    for x in errs[:20]:
        print("   !", x)
    sys.exit(1)
print(f"   ok: {len(ents)} Eintraege, {len(sample)} geaenderte Eintraege geprueft")
PY

# --- 4. Weiterreichen (wie deploy.sh)
say "Build ok — docs/ aktualisieren"
rm -rf docs && mkdir -p docs
cp dist/index.html dist/app.js dist/app.css docs/
touch docs/.nojekyll

if [[ "$PUSH" == 1 ]]; then
  if ! git diff --quiet -- docs || ! git ls-files --error-unmatch docs/index.html >/dev/null 2>&1; then
    git add -A docs src/data/words-a1.ts tools/feedback
    git commit -qm "release: build + feedback-autofix ($(date -u +%F\ %H:%M))" || true
  fi
  git push origin HEAD || fail "git push fehlgeschlagen"
  say "gepusht"
else
  say "dry-run (kein Push)"
fi
echo ">> release ok"
