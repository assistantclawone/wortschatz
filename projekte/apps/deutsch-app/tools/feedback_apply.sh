#!/usr/bin/env bash
# feedback_apply.sh — vollstaendige Kette pull -> fix -> release, max. 20 Auto-Fixes.
#
#   tools/feedback_apply.sh              # alles, Release ohne Push
#   tools/feedback_apply.sh --push       # ... mit GitHub-Pages-Push
#   tools/feedback_apply.sh --no-release # nur pull + fix (z.B. fuer Tests)
#   tools/feedback_apply.sh --dry-run    # nichts schreiben, nur anzeigen
#
# Ablauf:
#   1. pull   (GitHub-Issues mit feedback+approved, lokale inbox/, --import-Dateien)
#   2. fix    (max. 20, Backup + Protokoll; Unsicheres -> proposals.md)
#   3. release (tsc -> vite build -> Stichprobe -> docs/; bei Fehler Abbruch + Log)
#   4. Benachrichtigung an Renato NUR wenn es Vorschlaege gibt oder der Build blockiert
#      (outbox/notification.txt; Versand uebernimmt der Cron/Wrapper — keine Statusmeldungen).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
FB="$ROOT/tools/feedback"
LOG="$FB/logs/apply.log"
mkdir -p "$FB/logs" "$FB/outbox"

PUSH=""; DO_RELEASE=1; DRY=""
for a in "$@"; do
  case "$a" in
    --push) PUSH="--push" ;;
    --no-release) DO_RELEASE=0 ;;
    --dry-run) DRY="--dry-run" ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done
Q="--quiet"; [[ -n "$DRY" ]] && Q=""

say() { echo "$*"; echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

# Vorschlaege vor/nach zaehlen
prop_before=0
[[ -f "$FB/proposals.md" ]] && prop_before=$(grep -c '^| fb-' "$FB/proposals.md" || true)

say "== pull"
python3 tools/feedback_pull.py $DRY $Q || say "pull: Warnungen (weiter)"

say "== fix (Limit 20)"
python3 tools/feedback_fix.py --limit 20 $DRY $Q
fix_rc=$?
if [[ "$fix_rc" == 3 ]]; then
  say "!! Auto-Fix-Selbsttest fehlgeschlagen — Datei unveraendert, Abbruch"
else
  say "== release"
  if [[ "$DO_RELEASE" == 1 ]]; then
    tools/release.sh $PUSH
    rel_rc=$?
    if [[ "$rel_rc" != 0 ]]; then
      say "!! Release blockiert (Exit $rel_rc) — siehe tools/feedback/logs/release.log"
      {
        echo "Wortschatz: Deploy blockiert."
        echo "Grund: Build/Stichprobe fehlgeschlagen. Log: tools/feedback/logs/release.log"
        tail -5 "$FB/logs/release.log" 2>/dev/null
      } > "$FB/outbox/notification.txt"
      exit 1
    fi
  else
    say "(Release uebersprungen)"
  fi
fi

# --- Benachrichtigung nur bei neuen Vorschlaegen (verdichtet)
prop_after=0
[[ -f "$FB/proposals.md" ]] && prop_after=$(grep -c '^| fb-' "$FB/proposals.md" || true)
new_props=$((prop_after - prop_before))
if [[ "$new_props" -gt 0 ]]; then
  {
    echo "Wortschatz-Feedback: $new_props neue Vorschlaege (nichts automatisch geaendert)."
    tail -n "$new_props" "$FB/proposals.md" | cut -c1-220
    echo "Details: tools/feedback/proposals.md"
  } > "$FB/outbox/notification.txt"
  say "outbox: $new_props Vorschlaege"
else
  rm -f "$FB/outbox/notification.txt"
fi
say "== fertig"
exit 0
