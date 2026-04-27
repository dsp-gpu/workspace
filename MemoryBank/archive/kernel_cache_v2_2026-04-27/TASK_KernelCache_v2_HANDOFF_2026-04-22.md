# HANDOFF: KernelCache v2 — Build & Test on Debian (2026-04-23 AM)

> **Автор сдачи**: Кодо (вечер 2026-04-22)
> **Приёмщик**: Alex (утро 2026-04-23 на Debian + ROCm 7.2+)
> **Статус**: весь код написан + закоммичен + **смержен в main** всех 5 репо.
> **Сборку и тесты на Linux/ROCm надо сделать утром** — Windows не умеет hipcc.

---

## 🎯 Что сделано

Полная реализация `KernelCache v2` (clean-slate, key-based disk cache) — **5 фаз из 5** в спецификации `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md`.

### Сводка коммитов

| Репо | Ветка | Ключевые коммиты |
|------|-------|------------------|
| core | kernel_cache_v2 | `7bc06a5` Phase A1 (CompileKey+FNV) • `db32e5d` A2 WIP (KCS v2 + GpuCtx) • `a306f46` A2 finish (tests register) • `1608ecb` ReleaseModule → public |
| spectrum | kernel_cache_v2 | `2f314c0` Phase B2 (AllMaxima) • `eac5c7c` D1 (filters cleanup) |
| signal_generators | kernel_cache_v2 | `2e367bf` Phase B1 (ScriptGen disk cache впервые!) |
| linalg | kernel_cache_v2 | `ee84729` Phase C1-C3 (Cholesky/Symmetrize/DiagLoad) |
| strategies | kernel_cache_v2 | `4b6681c` Phase C4 split hpp→cpp • `435065b` CMake target_sources |
| radar | kernel_cache_v2 | `e30ebe0` Phase D2 (dead code −141 LOC) |

### Сводка изменений

- **-530 LOC** boilerplate hiprtc + own-KernelCacheService removed (7 файлов)
- **+580 LOC** clean API (CompileKey + KCS v2 + tests + docs comments)
- **+8 unit tests** для `CompileKey` (FNV, определения, arch, hiprtc_version, hex)
- **+8 unit tests** для `KernelCacheService` v2 (Save/Load/coexist/stats/atomic/corrupt)
- **6 CMake правок**: 1 в core (compile_key.cpp в target_sources, уже в ветке A1) + 1 в strategies (strategies_float_api.cpp в target_sources). Все — «новый .cpp в существующий target_sources» — разрешено.

---

## 🏗️ Что нужно сделать утром (Alex на Debian)

### Шаг 1 — синк

```bash
cd ~/DSP-GPU
for d in . core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
    echo "=== $d ==="
    (cd $d && git pull origin main)
done
```

### Шаг 2 — установка hook на новой машине (если ещё не сделано)

```bash
cd ~/DSP-GPU
cp MemoryBank/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
python3 MemoryBank/sync_rules.py --check   # должно быть "In sync"
```

### Шаг 3 — сборка core (Phase A)

```bash
cd ~/DSP-GPU/core
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=$PWD
rm -rf build
cmake --preset debian-local-dev
cmake --build build -j$(nproc) 2>&1 | tee /tmp/core_build.log
```

**Если ошибка** — проверить:
- `core/src/services/compile_key.cpp` — должен компилироваться. FNV-1a константы + `hiprtcVersion()` вызов.
- `core/src/services/kernel_cache_service.cpp` — новый API использует `std::optional<std::vector<uint8_t>>`, `CacheStats` atomic counters, `CacheStatsSnapshot` POD.
- `core/src/gpu_context.cpp` — `CompileModule` строит `CompileKey{source, defines, arch_name_, DetectHiprtcVersion()}` → передаёт в `kernel_cache_->Load(cache_kernel, key)`.

### Шаг 4 — прогнать core тесты

```bash
ctest --test-dir build --output-on-failure 2>&1 | tee /tmp/core_tests.log
```

**Ожидается зелёное**:
- `test_compile_key` — 8 тестов
- `test_kernel_cache_service` — 8 тестов
- Все остальные (до Phase A) — без регрессий

**Если регрессия** — высылай `/tmp/core_tests.log`, посмотрим вместе.

### Шаг 5 — сборка остальных 4 репо (в порядке зависимостей)

```bash
for d in spectrum signal_generators linalg strategies; do
    echo "=== Building $d ==="
    cd ~/DSP-GPU/$d
    export FETCHCONTENT_SOURCE_DIR_DSP_CORE=~/DSP-GPU/core
    export FETCHCONTENT_SOURCE_DIR_DSP_SPECTRUM=~/DSP-GPU/spectrum
    export FETCHCONTENT_SOURCE_DIR_DSP_STATS=~/DSP-GPU/stats
    export FETCHCONTENT_SOURCE_DIR_DSP_SIGNAL_GENERATORS=~/DSP-GPU/signal_generators
    export FETCHCONTENT_SOURCE_DIR_DSP_LINALG=~/DSP-GPU/linalg
    rm -rf build
    cmake --preset debian-local-dev
    cmake --build build -j$(nproc) 2>&1 | tee /tmp/${d}_build.log || break
    ctest --test-dir build --output-on-failure 2>&1 | tee /tmp/${d}_tests.log
done
```

### Шаг 6 — radar сборка (зависит от всех)

```bash
cd ~/DSP-GPU/radar
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=~/DSP-GPU/core
# ... (все FETCHCONTENT_SOURCE_DIR_DSP_*)
rm -rf build
cmake --preset debian-local-dev
cmake --build build -j$(nproc) 2>&1 | tee /tmp/radar_build.log
ctest --test-dir build --output-on-failure
```

### Шаг 7 — integration тест (опц.)

```bash
cd ~/DSP-GPU/DSP
# ... сборка meta-repo если нужно для full pipeline
```

---

## 🔍 На что обратить внимание при тестировании

### A. Проверить что disk cache работает (acceptance G5 из spec)

Запустить любой тест дважды подряд, смотреть время компиляции:

```bash
# 1-й запуск (cache miss, ~150ms hiprtc):
time ./build/tests/test_script_generator_rocm

# 2-й запуск (cache hit, ~1ms):
time ./build/tests/test_script_generator_rocm

# Должно быть существенно быстрее.
```

### B. Проверить что cache entries coexist (Q5, C5)

```bash
# После тестов посмотреть файлы:
ls -la ~/DSP-GPU/core/build/tests/kernels_cache/*/gfx*/

# Ожидается: несколько HSACO с разными hash8 суффиксами для одного kernel_name
# (разные N_WINDOW / defines / arch → разные файлы)
```

### C. Проверить что GpuContext::ReleaseModule работает (D1)

Тест `spectrum/filters` с разными N_WINDOW последовательно — должно компилироваться без пересоздания GpuContext.

### D. Проверить что CompileKey hash стабилен (G3 из spec)

Тест `TestHash_StabilityRegression` в `test_compile_key.hpp` — если FNV реализация «уедет», тест упадёт.

### E. rocm-smi — отсутствие утечек

```bash
rocm-smi --showmeminfo vram
./build/tests/test_<anything> --iterations 1000
rocm-smi --showmeminfo vram  # не должно расти
```

Q7 из spec: `hipModuleUnload` имеет known leak на некоторых ROCm версиях — старые модули держатся до shutdown GpuContext (приемлемо).

---

## 🚨 Если что-то пошло не так

### Ошибка компиляции в core
- `compile_key.cpp:84` — `hiprtcVersion()` может отсутствовать на старых ROCm. Fallback реализован (`"<unknown>"`).
- `kernel_cache_service.cpp` — если `<filesystem>` не доступен → нужен `-lstdc++fs` (маловероятно на ROCm 7.2+).

### Ошибка линковки в strategies
- `strategies_float_api.cpp` — новый файл, добавлен в `target_sources`. Если падает с undefined symbol — проверить что `GpuContext` из `DspCore::DspCore` виден.

### Тест padает с «Unknown cache dir»
- `ResolveCacheDir(module)` возвращает `<exe_dir>/kernels_cache/<module>`. Убедиться что тест запускается из `build/tests/`.

### Старый Pattern B где-то остался
- Grep по всем репо: `grep -rn "hiprtcCompileProgram" */src/` — должен быть **пусто** (кроме `core/src/gpu_context.cpp`, там единственное место).

---

## 📋 Post-testing checklist (после зелёных тестов)

- [ ] Обновить `MemoryBank/tasks/IN_PROGRESS.md` — пометить KernelCache v2 как DONE.
- [ ] Добавить запись в `MemoryBank/changelog/2026-04.md`.
- [ ] Обсудить git tag `v0.3.0` для всех 5 репо (synced tagging) — **только с OK Alex**.
- [ ] Phase E1 CLI tool `dsp-cache-list` (1ч, optional, после успешного билда).

---

## 📎 Ссылки

- Spec: `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md`
- Master Index: `MemoryBank/tasks/TASK_KernelCache_v2_INDEX.md`
- Phase А: `MemoryBank/tasks/TASK_KernelCache_v2_PhaseA_CoreNewApi.md`
- Phase B: `MemoryBank/tasks/TASK_KernelCache_v2_PhaseB_CriticalFixes.md`
- Phase C: `MemoryBank/tasks/TASK_KernelCache_v2_PhaseC_LinalgStrategies.md`
- Phase D: `MemoryBank/tasks/TASK_KernelCache_v2_PhaseD_Cleanup.md`
- Phase E: `MemoryBank/tasks/TASK_KernelCache_v2_PhaseE_Polish.md`

---

*Handoff prepared 2026-04-22 by Кодо. Рассмотри утром, Alex. Я рядом если что 💛*
