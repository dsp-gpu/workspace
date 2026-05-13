# TASK — Debian Acceptance: namespace migration (7 модулей)

> **Создано**: 2026-05-12 (Windows session, конец)
> **Статус**: ⬜ TODO — все правки на GitHub, ждёт сборки на рабочем Debian
> **Платформа**: Debian + ROCm 7.2 + AMD Radeon RX 9070 (gfx1201)
> **Effort**: 1-2 часа (если всё зелёное), 3-6 часов (если ошибки)
> **Триггер**: 13.05 утром на работе после `git pull` всех репо
> **Связано**: `.future/TASK_namespace_migration_legacy_to_dsp.md` (исходный таск), `specs/namespace_migration_spectrum_plan_2026-05-12.md` (план для spectrum)

---

## Контекст

12.05 на Windows-сессии Кодо выполнил полную миграцию namespace для **7 из 10 репо** DSP-GPU:

| # | Репо | Legacy namespace | Целевой | Особенность |
|---|------|------------------|---------|-------------|
| 1 | spectrum | `fft_processor` / `filters` / `lch_farrow` | `dsp::spectrum` | плоско |
| 2 | stats | `statistics` / `snr_estimator` / `gpu_sort` / `snr_defaults` | `dsp::stats` (+ nested gpu_sort / snr_defaults) | mix |
| 3 | strategies | `strategies` | `dsp::strategies` | + forward decls на migrated modules |
| 4 | signal_generators | `signal_gen` | `dsp::signal_generators` | плоско |
| 5 | linalg | `vector_algebra` / `capon` / `matrix_ops` | `dsp::linalg` | плоско |
| 6 | radar | `range_angle` + `drv_gpu_lib` (fm_correlator) | `dsp::radar` | смешанный, fm_correlator с `using namespace ::drv_gpu_lib` |
| 7 | heterodyne | `drv_gpu_lib` (целиком) | `dsp::heterodyne` | с `using namespace ::drv_gpu_lib` |

**core + workspace + DSP** — НЕ трогали (по правилу 10-modules.md, `drv_gpu_lib::*` остаётся в core для DrvGPU/Logger/ConsoleOutput/ProfilingFacade).

**Кроме namespace**, в каждом репо были сделаны:
- Physical move: `{repo}/include/{repo}/` → `{repo}/include/dsp/{repo}/`
- `#include` rewrites: `<X/...>` → `<dsp/X/...>` (cross-repo + внутри)
- Cross-repo refs: каждый зависимый модуль обновлён на новые namespace соседей
- Doc/ + .rag/ + MemoryBank/golden_set — все упоминания обновлены
- test_params/*.md переименованы: `X_ClassName.md` → `dsp_X_ClassName.md`
- Удалены OpenCL `.cl` + `manifest.json` (правило 09-rocm-only.md)
- Выпрямлена структура: `src/X/src/*.cpp` → `src/X/*.cpp` (двойная вложенность убрана)
- CMake `target_sources` пути обновлены, dead include paths в `python/CMakeLists.txt` убраны

**Особый подход для heterodyne + radar/fm_correlator** (классы были в `drv_gpu_lib` namespace):
```cpp
// Было:
namespace drv_gpu_lib { class HeterodyneDechirp { ... }; }

// Стало:
namespace dsp::heterodyne {
using namespace ::drv_gpu_lib;  // ← импорт core имён
class HeterodyneDechirp { ... };
}
```

---

## Acceptance criteria

### A. Сборка (порядок зависимостей)

```bash
cd /home/alex/DSP-GPU

# 1. Подтянуть все репо
git pull --ff-only
for repo in core spectrum stats strategies signal_generators heterodyne linalg radar DSP; do
  git -C $repo pull --ff-only || { echo "FAIL pull $repo"; exit 1; }
done

# 2. Сборка по порядку зависимостей (core → leaves)
# core НЕ трогали — должен уже собираться
for repo in spectrum stats strategies signal_generators heterodyne linalg radar; do
  echo "=== Building $repo ==="
  cd /home/alex/DSP-GPU/$repo
  cmake --preset debian-local-dev -B build 2>&1 | tee /tmp/${repo}_cmake.log
  cmake --build build -j$(nproc) 2>&1 | tee /tmp/${repo}_build.log
  if [ $? -ne 0 ]; then
    echo "❌ BUILD FAIL: $repo — см. /tmp/${repo}_build.log"
    break
  fi
done
```

**Acceptance**: все 7 репо → `0 errors, 0 critical warnings`. Если упало — анализ логов + раздел "Грабли" ниже.

### B. C++ тесты

```bash
for repo in spectrum stats strategies signal_generators heterodyne linalg radar; do
  echo "=== Testing $repo ==="
  ctest --test-dir /home/alex/DSP-GPU/$repo/build --output-on-failure 2>&1 | tee /tmp/${repo}_ctest.log
done
```

**Acceptance**: все `test_*_main` → PASS / SKIP (если GPU не виден — SKIP норма для основных тестов; FAIL — критично).

### C. Python биндинги (smoke)

```bash
cd /home/alex/DSP-GPU/DSP/Python
python3 -c "
import sys
sys.path.insert(0, 'libs')
modules = ['dsp_core', 'dsp_spectrum', 'dsp_stats', 'dsp_signal_generators',
           'dsp_heterodyne', 'dsp_linalg', 'dsp_radar', 'dsp_strategies']
for m in modules:
    try:
        mod = __import__(m)
        print(f'  ✅ {m}: {dir(mod)[:5]}')
    except ImportError as e:
        print(f'  ❌ {m}: {e}')
"
```

**Acceptance**: все 8 модулей импортируются без `ImportError`.

### D. Python integration тесты

```bash
cd /home/alex/DSP-GPU
python3 DSP/Python/integration/t_signal_to_spectrum.py
python3 DSP/Python/integration/t_hybrid_backend.py
python3 DSP/Python/spectrum/t_cpu_fft.py
python3 DSP/Python/stats/t_*.py
python3 DSP/Python/heterodyne/t_*.py
python3 DSP/Python/linalg/t_*.py
python3 DSP/Python/radar/t_*.py
python3 DSP/Python/strategies/t_*.py
python3 DSP/Python/signal_generators/t_*.py
```

**Acceptance**: все тесты PASS или SKIP (`SkipTest` для отсутствующего GPU — норма).

### E. core НЕ должен сломаться

```bash
cd /home/alex/DSP-GPU/core
cmake --preset debian-local-dev -B build
cmake --build build -j$(nproc)
ctest --test-dir build --output-on-failure
```

**Acceptance**: 0 errors. core не трогали — должен компилироваться идентично прошлой сборке.

---

## Возможные грабли

| Грабли | Где смотреть | Решение |
|--------|-------------|---------|
| `error: 'fft_processor' has not been declared` | компиляция любого репо ссылающегося на spectrum | пропущен FQN replace — найти через `grep -r 'fft_processor::' include src` |
| `fatal error: spectrum/X.hpp: No such file` | компиляция | пропущен `#include <spectrum/...>` → `<dsp/spectrum/...>` |
| `'IBackend' was not declared in this scope` в heterodyne/fm_correlator | компиляция .cpp | проверить что `using namespace ::drv_gpu_lib;` есть после `namespace dsp::heterodyne {` |
| ambiguous `dsp::stats::SnrEstimatorOp` vs `dsp::spectrum::WindowType` | компиляция stats | проверить cross-repo refs обновлены на новые namespace |
| Python `ImportError: dsp_spectrum` | загрузка .so | проверить что `.so` собран и в `DSP/Python/libs/` (Auto-deploy POST_BUILD) |
| Python `AttributeError: module has no attribute X` | импорт | проверить `PYBIND11_MODULE(dsp_X, m)` и `register_*` вызовы в `dsp_X_module.cpp` |
| `ctest fails` с `Multiple definition of X` | линковка | проверить что нет двойного `using namespace` в headers |
| `cmake: error: target_sources file does not exist` | configure | проверить пути src/X/*.cpp (без `src/X/src/`) в `{repo}/CMakeLists.txt` |
| Зависимый репо не собирается (radar/strategies) | компиляция | проверить cross-repo refs (например в strategies forward decls должны быть `namespace dsp::spectrum`) |
| `tests/all_test.hpp` падает с unresolved namespace | линковка тестов | проверить что test namespace `namespace dsp::X::tests { ... }` корректен |

---

## Rollback план (если что-то критичное упало)

Каждый репо имеет линейную историю коммитов миграции. Откат:

```bash
# Например для spectrum:
cd /home/alex/DSP-GPU/spectrum
git log --oneline -10   # найти коммит ДО Phase 1 миграции
# Это коммит 0c6befe (DS_PATTERNS_MD: ...) — последний pre-migration
git checkout main
git reset --hard 0c6befe   # ⚠️ ТОЛЬКО локально, БЕЗ push
# Затем разобрать что упало
```

⚠️ **НЕ делать `git push --force`** до согласования с Alex.

Коммиты pre-migration для каждого репо:
- spectrum: `0c6befe` (DS_PATTERNS_MD)
- stats: `24e636b` (DS_PATTERNS_MD + A3)
- strategies: `292a476` (Doc/Patterns.md fix)
- signal_generators: `129a4a1`
- linalg: `898cf65` (chore: ignore Logs/)
- radar: `1bae243`
- heterodyne: `c520eb9`

---

## Что делать когда всё зелёное

1. ✅ Этот TASK → переместить в `MemoryBank/changelog/2026-05.md` со ссылкой на коммиты
2. ✅ `.future/TASK_namespace_migration_legacy_to_dsp.md` → переместить в `changelog/2026-05/` или удалить (закрыт)
3. ✅ Обновить `_RAG.md` индексы (re-index если нужно): `dsp-asst index build --root /home/alex/DSP-GPU`
4. ✅ Опц. тег `v0.X.0-namespace-migration` на всех 7 репо (через release-manager агента)
5. ✅ Запись в `MemoryBank/sessions/2026-05-13.md`: "Debian acceptance namespace migration — PASS"

---

## Связанные файлы

- Исходный таск: `.future/TASK_namespace_migration_legacy_to_dsp.md` (со списком всех 7 модулей и блоками прогресса)
- План для spectrum: `specs/namespace_migration_spectrum_plan_2026-05-12.md`
- Правила: `.claude/rules/10-modules.md` (target namespaces), `.claude/rules/05-architecture-ref03.md` (target structure)
- 30 коммитов миграции — `git log --since=2026-05-12 --until=2026-05-13 --all`

---

*Created: 2026-05-12 Кодо. Сборка завтра 13.05 утром на Debian. Если все 7 зелёные — задача закрывается, мигрируем по факту.*
