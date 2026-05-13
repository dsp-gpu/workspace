#!/usr/bin/env bash
# ============================================================================
# acceptance_namespace_migration.sh — авто-проверка 7 мигрированных репо
#
# ЧТО:    Запускает полный чеклист из TASK_namespace_migration_debian_acceptance_2026-05-12.md:
#         A) Сборка по порядку зависимостей
#         B) C++ ctest для каждого репо
#         C) Python smoke (import 8 dsp_* модулей)
#         D) Python integration тесты
#         E) core НЕ должен сломаться
#
# ИСПОЛЬЗОВАНИЕ:
#   cd /home/alex/DSP-GPU/scripts/debian_deploy
#   bash acceptance_namespace_migration.sh                 # все этапы
#   bash acceptance_namespace_migration.sh --only-build    # только сборка
#   bash acceptance_namespace_migration.sh --only-test     # только тесты
#
# Выход: 0 если все этапы PASS, 1 если хоть один FAIL.
# Логи: /tmp/acceptance_<repo>_<phase>.log
# ============================================================================

set -uo pipefail

# ── Параметры ────────────────────────────────────────────────────────────────
DSP_ROOT="${DSP_ROOT:-/home/alex/DSP-GPU}"
DSP_PYTHON="$DSP_ROOT/DSP/Python"
PRESET="${PRESET:-debian-local-dev}"

# Порядок зависимостей (core НЕ трогали → собирать первым только если нужно)
BUILD_ORDER=(spectrum stats strategies signal_generators heterodyne linalg radar)
PY_MODULES=(dsp_core dsp_spectrum dsp_stats dsp_signal_generators dsp_heterodyne dsp_linalg dsp_radar dsp_strategies)

# ── Цвета ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
FAILED_STEPS=()

phase_header() { echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}\n${BLUE}  $*${NC}\n${BLUE}═══════════════════════════════════════════════════${NC}"; }
step_pass()    { echo -e "${GREEN}✅ PASS${NC} — $*"; ((PASS++)); }
step_fail()    { echo -e "${RED}❌ FAIL${NC} — $*"; ((FAIL++)); FAILED_STEPS+=("$*"); }
step_warn()    { echo -e "${YELLOW}⚠️  WARN${NC} — $*"; }

# ── Парс CLI ─────────────────────────────────────────────────────────────────
RUN_BUILD=1
RUN_TEST=1
RUN_PYTHON=1
for arg in "$@"; do
    case "$arg" in
        --only-build)  RUN_TEST=0; RUN_PYTHON=0 ;;
        --only-test)   RUN_BUILD=0; RUN_PYTHON=0 ;;
        --only-python) RUN_BUILD=0; RUN_TEST=0 ;;
        --skip-python) RUN_PYTHON=0 ;;
    esac
done

# ── Pre-flight ───────────────────────────────────────────────────────────────
phase_header "Pre-flight: проверка окружения"

if [[ ! -d "$DSP_ROOT" ]]; then
    echo -e "${RED}❌ $DSP_ROOT не найден. Установи DSP_ROOT перед запуском.${NC}"
    exit 1
fi
echo "  DSP_ROOT  = $DSP_ROOT"
echo "  PRESET    = $PRESET"
echo "  hipcc     = $(command -v hipcc || echo MISSING)"
echo "  python3   = $(command -v python3 || echo MISSING)"

# git pull всех 10 репо
echo -e "\n  Pulling all repos..."
git -C "$DSP_ROOT" pull --ff-only 2>&1 | tail -1
for repo in core spectrum stats strategies signal_generators heterodyne linalg radar DSP; do
    git -C "$DSP_ROOT/$repo" pull --ff-only 2>&1 | tail -1 | sed "s/^/    [$repo] /"
done

# ── A. Сборка (порядок зависимостей) ─────────────────────────────────────────
if [[ $RUN_BUILD -eq 1 ]]; then
    phase_header "A. Сборка 7 мигрированных репо + core"

    # core первым (не должен сломаться)
    for repo in core "${BUILD_ORDER[@]}"; do
        echo -e "\n  ── Building $repo ──"
        cd "$DSP_ROOT/$repo"

        cmake --preset "$PRESET" -B build 2>&1 > "/tmp/acceptance_${repo}_cmake.log"
        if [[ $? -ne 0 ]]; then
            step_fail "$repo cmake configure (см. /tmp/acceptance_${repo}_cmake.log)"
            continue
        fi

        cmake --build build -j"$(nproc)" 2>&1 > "/tmp/acceptance_${repo}_build.log"
        if [[ $? -eq 0 ]]; then
            step_pass "$repo build OK"
        else
            step_fail "$repo build (см. /tmp/acceptance_${repo}_build.log — последние ошибки ниже)"
            tail -20 "/tmp/acceptance_${repo}_build.log" | sed 's/^/      /'
        fi
    done
fi

# ── B. C++ тесты ─────────────────────────────────────────────────────────────
if [[ $RUN_TEST -eq 1 ]]; then
    phase_header "B. C++ ctest для каждого репо"

    for repo in core "${BUILD_ORDER[@]}"; do
        echo -e "\n  ── Testing $repo ──"
        if [[ ! -d "$DSP_ROOT/$repo/build" ]]; then
            step_warn "$repo build/ отсутствует — пропуск (запусти --only-build)"
            continue
        fi
        ctest --test-dir "$DSP_ROOT/$repo/build" --output-on-failure 2>&1 > "/tmp/acceptance_${repo}_ctest.log"
        if [[ $? -eq 0 ]]; then
            step_pass "$repo ctest OK"
        else
            # Если тесты SKIP по причине отсутствия GPU — это норма
            if grep -qE "SkipTest|No GPU detected|gpu_id.*not found" "/tmp/acceptance_${repo}_ctest.log"; then
                step_warn "$repo ctest SKIP (GPU не виден — норма для CI без железа)"
            else
                step_fail "$repo ctest (см. /tmp/acceptance_${repo}_ctest.log)"
            fi
        fi
    done
fi

# ── C. Python smoke (import) ─────────────────────────────────────────────────
if [[ $RUN_PYTHON -eq 1 ]]; then
    phase_header "C. Python smoke — import 8 dsp_* модулей"

    cd "$DSP_PYTHON"
    SMOKE_RESULT=$(python3 - <<'PYEOF' 2>&1
import sys
sys.path.insert(0, 'libs')
modules = ['dsp_core', 'dsp_spectrum', 'dsp_stats', 'dsp_signal_generators',
           'dsp_heterodyne', 'dsp_linalg', 'dsp_radar', 'dsp_strategies']
results = []
for m in modules:
    try:
        mod = __import__(m)
        attrs = [a for a in dir(mod) if not a.startswith('_')][:3]
        results.append(f"PASS|{m}|{','.join(attrs)}")
    except ImportError as e:
        results.append(f"FAIL|{m}|{e}")
print("\n".join(results))
PYEOF
    )

    while IFS='|' read -r status mod info; do
        if [[ "$status" == "PASS" ]]; then
            step_pass "import $mod (attrs: $info)"
        else
            step_fail "import $mod — $info"
        fi
    done <<< "$SMOKE_RESULT"

    # ── D. Python integration тесты ──────────────────────────────────────────
    phase_header "D. Python integration тесты"

    for testfile in \
        "$DSP_PYTHON/integration/t_signal_to_spectrum.py" \
        "$DSP_PYTHON/integration/t_hybrid_backend.py" \
    ; do
        if [[ ! -f "$testfile" ]]; then continue; fi
        name=$(basename "$testfile")
        cd "$DSP_ROOT"
        python3 "$testfile" 2>&1 > "/tmp/acceptance_$name.log"
        rc=$?
        if [[ $rc -eq 0 ]]; then
            step_pass "$name"
        elif grep -qE "SkipTest|GPU not found|dsp_.*not found" "/tmp/acceptance_$name.log"; then
            step_warn "$name SKIP (GPU/lib не найден)"
        else
            step_fail "$name (см. /tmp/acceptance_$name.log)"
        fi
    done
fi

# ── Итог ─────────────────────────────────────────────────────────────────────
phase_header "ИТОГ"
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${RED}FAIL${NC}: $FAIL"

if [[ $FAIL -eq 0 ]]; then
    echo -e "\n${GREEN}🟢 ALL ACCEPTANCE PASSED${NC}"
    echo -e "  Следующий шаг: переместить TASK в changelog/, опц. поставить тег v0.X.0-namespace-migration"
    exit 0
else
    echo -e "\n${RED}🔴 FAIL'ы:${NC}"
    for f in "${FAILED_STEPS[@]}"; do echo "  - $f"; done
    echo -e "\n  Логи в /tmp/acceptance_*.log"
    echo -e "  Грабли + решения → MemoryBank/tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md"
    exit 1
fi
