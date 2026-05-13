#!/usr/bin/env bash
# ============================================================================
# install_rocm_devkit.sh — установка ROCm 7.2 devkit на Debian из offline-pack
#
# ЧТО:    Ставит 76 .deb файлов ROCm devkit (hipcc + hip-runtime-amd + rocm-llvm
#         + rocm-cmake + hipfft-dev + rocblas-dev + rocsolver-dev + rocprim-dev
#         + rocrand-dev + транзитивные deps), собранных дома через WSL2 12.05.
# ЗАЧЕМ:  Без интернета на работе. apt install из локального каталога с .deb.
# ИСТОЧНИК: /home/alex/offline-debian-pack/7_dop_files/lib_deb/*.deb
# СОБРАНО: WSL2 Ubuntu 24.04 noble через apt-get install --download-only.
#
# Использование:
#   bash install_rocm_devkit.sh                # стандартный путь
#   bash install_rocm_devkit.sh /custom/path   # кастомный путь к lib_deb/
#
# Acceptance:
#   - which hipcc → /opt/rocm-7.2.0/bin/hipcc
#   - hipcc --version → AMD clang + HIP version
#   - /opt/rocm-7.2.0/lib/cmake/hip/hip-config.cmake существует
#   - rocminfo показывает RX 9070 (gfx1201)
# ============================================================================

set -euo pipefail

# ── Параметры ────────────────────────────────────────────────────────────────
DEB_DIR="${1:-/home/alex/offline-debian-pack/7_dop_files/lib_deb}"
ROCM_PATH="/opt/rocm-7.2.0"

# ── Цвета для вывода ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Шаг 0: Проверки ───────────────────────────────────────────────────────────
log_info "Шаг 0: проверка окружения"

if [[ $EUID -eq 0 ]]; then
    log_error "Не запускать от root напрямую — скрипт сам вызывает sudo где нужно."
    exit 1
fi

if [[ ! -d "$DEB_DIR" ]]; then
    log_error "Каталог $DEB_DIR не существует. Передай путь первым аргументом."
    exit 1
fi

DEB_COUNT=$(find "$DEB_DIR" -maxdepth 1 -name "*.deb" | wc -l)
if [[ $DEB_COUNT -lt 50 ]]; then
    log_warn "Найдено только $DEB_COUNT .deb файлов в $DEB_DIR (ожидалось ~76)."
    read -p "Продолжить? (y/N) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

DEB_SIZE=$(du -sh "$DEB_DIR" | cut -f1)
log_info "Найдено $DEB_COUNT .deb файлов, размер $DEB_SIZE"

# ── Шаг 1: Проверка что уже установлено ──────────────────────────────────────
log_info "Шаг 1: что уже установлено"
echo "  ROCm runtime (должен быть):"
dpkg -l | grep -E "^ii\s+(rocm-core|hsa-rocr|rocminfo|rocm-smi-lib)" || log_warn "ROCm runtime НЕ установлен — devkit без runtime бесполезен"

if command -v hipcc &>/dev/null; then
    log_warn "hipcc уже установлен: $(hipcc --version | head -1)"
    read -p "Переустановить из offline-pack? (y/N) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && { log_info "Пропуск установки. Smoke check: переходим к шагу 3."; SKIP_INSTALL=1; }
fi

# ── Шаг 2: Установка .deb пакетов ────────────────────────────────────────────
if [[ "${SKIP_INSTALL:-0}" -ne 1 ]]; then
    log_info "Шаг 2: установка $DEB_COUNT .deb пакетов из $DEB_DIR"
    log_info "Это займёт 3-5 минут. Лог: /tmp/rocm_devkit_install.log"

    # apt install понимает absolute paths через ./ префикс если в текущем каталоге,
    # а для абсолютных путей просто перечисляем — apt сам резолвит зависимости
    # внутри переданного набора.
    sudo apt install -y "$DEB_DIR"/*.deb 2>&1 | tee /tmp/rocm_devkit_install.log

    if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        log_warn "apt install вернул ошибку. Пробую dpkg + apt-get install -f"
        sudo dpkg -i "$DEB_DIR"/*.deb 2>&1 | tee -a /tmp/rocm_devkit_install.log || true
        sudo apt-get install -f -y 2>&1 | tee -a /tmp/rocm_devkit_install.log || {
            log_error "Установка не прошла. Проверь /tmp/rocm_devkit_install.log"
            exit 1
        }
    fi
fi

# ── Шаг 3: Smoke check ────────────────────────────────────────────────────────
log_info "Шаг 3: smoke check"

PASS=0
FAIL=0

check() {
    local desc="$1"
    local cmd="$2"
    if eval "$cmd" &>/dev/null; then
        log_info "✅ $desc"
        ((PASS++))
    else
        log_error "❌ $desc"
        ((FAIL++))
    fi
}

check "hipcc найден"                  "command -v hipcc"
check "hipcc --version работает"       "hipcc --version"
check "hip-config.cmake существует"    "test -f $ROCM_PATH/lib/cmake/hip/hip-config.cmake"
check "rocm-llvm clang"                "command -v $ROCM_PATH/llvm/bin/clang"
check "hipfft headers"                 "test -d $ROCM_PATH/include/hipfft"
check "rocblas headers"                "test -d $ROCM_PATH/include/rocblas"
check "rocsolver headers"              "test -d $ROCM_PATH/include/rocsolver"
check "rocprim headers"                "test -d $ROCM_PATH/include/rocprim"
check "rocminfo работает"              "rocminfo | grep -q 'Marketing Name'"

# GPU видимость (некритично — может быть driver/permission issue)
if rocminfo | grep -q "gfx1201"; then
    log_info "✅ GPU gfx1201 (RX 9070) виден через rocminfo"
elif rocminfo | grep -q "gfx908"; then
    log_info "✅ GPU gfx908 (MI100) виден через rocminfo"
else
    log_warn "⚠️  GPU не виден в rocminfo. Проверь: sudo usermod -aG render,video \$USER + relogin"
fi

# ── Итог ─────────────────────────────────────────────────────────────────────
echo
echo "═══════════════════════════════════════════════════"
log_info "Smoke check: $PASS PASS / $FAIL FAIL"
if [[ $FAIL -eq 0 ]]; then
    log_info "🟢 ROCm devkit установлен корректно."
    log_info "Следующий шаг: тест сборки одного модуля DSP-GPU."
    echo
    echo "    cd /home/alex/DSP-GPU/core"
    echo "    cmake --preset debian-local-dev -B build"
    echo "    cmake --build build -j\$(nproc)"
    echo
    exit 0
else
    log_error "🔴 Есть проблемы — см. логи выше."
    exit 1
fi
