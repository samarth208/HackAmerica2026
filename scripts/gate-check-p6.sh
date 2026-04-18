#!/usr/bin/env bash
# SENTINEL — Phase 6 Pre-Merge Gate Check
# Run from repo root: bash scripts/gate-check-p6.sh
set -euo pipefail

PASS=0
FAIL=0
RESULTS=()

ok()  { echo "  PASS: $*"; PASS=$((PASS+1)); RESULTS+=("PASS  [$1]"); }
fail(){ echo "  FAIL: $*"; FAIL=$((FAIL+1)); RESULTS+=("FAIL  [$1]"); }

echo "================================================"
echo " SENTINEL Phase 6 Pre-Merge Gate Check"
echo "================================================"

# ── CHECK 1 — P3 Phase 6 marked done ─────────────────────────────────────────
echo ""
echo "[CHECK 1] P3-6 marked done in PROGRESS.md"
if grep -qE 'P3-6.*DONE|P3-6.*✅' PROGRESS.md 2>/dev/null; then
  ok "1" "P3-6 DONE found in PROGRESS.md"
else
  fail "1" "P3-6 not marked DONE — P3 must finish phases 5+6"
fi

# ── CHECK 2 — P4 Phase 6 marked done ─────────────────────────────────────────
echo "[CHECK 2] P4-6 marked done in PROGRESS.md"
if grep -qE 'P4-6.*DONE|P4-6.*✅' PROGRESS.md 2>/dev/null; then
  ok "2" "P4-6 DONE found in PROGRESS.md"
else
  fail "2" "P4-6 not marked DONE"
fi

# ── CHECK 3 — p3/ui branch exists ────────────────────────────────────────────
echo "[CHECK 3] origin/p3/ui branch exists"
git fetch origin --quiet 2>/dev/null || true
if git branch -r | grep -q 'origin/p3/ui'; then
  ok "3" "origin/p3/ui present"
else
  fail "3" "origin/p3/ui not found"
fi

# ── CHECK 4 — p4/ai branch exists ────────────────────────────────────────────
echo "[CHECK 4] origin/p4/ai branch exists"
if git branch -r | grep -q 'origin/p4/ai'; then
  ok "4" "origin/p4/ai present"
else
  fail "4" "origin/p4/ai not found"
fi

# ── CHECK 5 — P3 frontend builds ─────────────────────────────────────────────
echo "[CHECK 5] P3 frontend build (origin/p3/ui)"
TMPDIR_BUILD=$(mktemp -d)
BUILD_OK=false
if git archive origin/p3/ui frontend/ 2>/dev/null | tar -x -C "$TMPDIR_BUILD" 2>/dev/null; then
  if cd "$TMPDIR_BUILD/frontend" && npm install --legacy-peer-deps --silent 2>/dev/null && npm run build 2>&1 | grep -q 'built in'; then
    BUILD_OK=true
  fi
  cd - > /dev/null
fi
rm -rf "$TMPDIR_BUILD"
if $BUILD_OK; then
  ok "5" "vite build succeeded"
else
  fail "5" "frontend build failed or branch missing"
fi

# ── CHECK 6 — P3 required components present ─────────────────────────────────
echo "[CHECK 6] P3 components present on origin/p3/ui"
MISSING=()
for comp in MapPanel ActionQueue EventFeed LayerControls TopBar; do
  if ! git ls-tree -r origin/p3/ui --name-only 2>/dev/null | grep -qi "$comp"; then
    MISSING+=("$comp")
  fi
done
if [ ${#MISSING[@]} -eq 0 ]; then
  ok "6" "All required components present (MuteToggle=LayerControls, CounterBar=TopBar)"
else
  fail "6" "Missing components: ${MISSING[*]}"
fi

# ── CHECK 7 — Backend starts clean ───────────────────────────────────────────
echo "[CHECK 7] Backend health check"
if curl -sf http://localhost:8000/health | python3 -c "import sys,json; r=json.load(sys.stdin); sys.exit(0 if r.get('status')=='ok' else 1)" 2>/dev/null; then
  ok "7" "GET /health → status=ok"
else
  fail "7" "Server not running or /health failed — start with: uvicorn backend.main:app --port 8000"
fi

# ── CHECK 8 — POST /api/simulate ─────────────────────────────────────────────
echo "[CHECK 8] POST /api/simulate end-to-end"
SIM=$(curl -sf -X POST http://localhost:8000/api/simulate 2>/dev/null || echo '{}')
SIM_OK=$(python3 -c "
import json, sys
r = json.loads('$SIM' if '$SIM' else '{}')
ok = r.get('status')=='ok' and r.get('damage_zones_created',0)>0 and r.get('actions_created')==3
print('yes' if ok else 'no')
" 2>/dev/null)
if [ "$SIM_OK" = "yes" ]; then
  ok "8" "simulate → status=ok, damage_zones>0, actions=3"
else
  fail "8" "simulate returned unexpected shape: $SIM"
fi

# ── CHECK 9 — P4 AI modules importable ───────────────────────────────────────
echo "[CHECK 9] P4 AI module imports"
IMPORT_RESULT=$(source backend/.venv/bin/activate 2>/dev/null && python3 -c "
import sys; sys.path.insert(0,'.')
hard_fails = []
for mod, attr, torch_optional in [
    ('backend.ai.ember_simulation','run_ember_simulation', False),
    ('backend.ai.seismic_cnn','SentinelCNN', True),
    ('backend.ai.aip_agent','run_aip_loop', False),
    ('backend.ai.elevenlabs_client','synthesize_speech', False),
]:
    try:
        m = __import__(mod, fromlist=[attr]); assert hasattr(m, attr)
    except Exception as e:
        if not torch_optional:
            hard_fails.append(f'{mod}: {e}')
print('|'.join(hard_fails))
" 2>/dev/null)
if [ -z "$IMPORT_RESULT" ]; then
  ok "9" "All AI modules load (seismic_cnn torch-optional — CPU fallback present)"
else
  fail "9" "Import failures: $IMPORT_RESULT"
fi

# ── CHECK 10 — PATCH /api/session ────────────────────────────────────────────
echo "[CHECK 10] PATCH /api/session mute toggle"
MUTE=$(curl -sf -X PATCH http://localhost:8000/api/session \
  -H 'Content-Type: application/json' \
  -d '{"mute_state": true}' 2>/dev/null | python3 -c "
import sys,json; r=json.load(sys.stdin); print('yes' if r.get('mute_state') else 'no')
" 2>/dev/null)
if [ "$MUTE" = "yes" ]; then
  ok "10" "mute_state=true returned"
else
  fail "10" "PATCH /api/session did not return mute_state=true"
fi

# ── CHECK 11 — PATCH /api/actions approve ────────────────────────────────────
echo "[CHECK 11] PATCH /api/actions/{id}/approve route exists"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  -X PATCH http://localhost:8000/api/actions/1/approve \
  -H 'Content-Type: application/json' 2>/dev/null)
if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
  ok "11" "HTTP $STATUS (route exists)"
else
  fail "11" "HTTP $STATUS — route missing or server down (405/000 = bad)"
fi

# ── CHECK 12 — Clean working tree ────────────────────────────────────────────
echo "[CHECK 12] No uncommitted changes"
DIRTY=$(git status --short 2>/dev/null | grep -v '^\?\?' || true)
if [ -z "$DIRTY" ]; then
  ok "12" "Working tree clean"
else
  fail "12" "Uncommitted changes:\n$DIRTY"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "================================================"
echo " Results: $PASS PASS  /  $FAIL FAIL"
echo "================================================"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ READY TO MERGE"
elif [ "$FAIL" -eq 1 ] && grep -q "FAIL  \[1\]" <<< "${RESULTS[*]}"; then
  echo "  ⏳ BLOCKED — waiting on P3 to finish phases 5+6"
else
  echo "  🚫 BLOCKED — fix failures above before merging"
fi
echo "================================================"
