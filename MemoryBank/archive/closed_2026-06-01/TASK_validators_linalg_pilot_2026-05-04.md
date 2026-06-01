# TASK — Внедрить `gpu_test_utils::*` валидаторы в `linalg/tests/` (пилот)

> **Создано**: 2026-05-04
> **Статус**: ✅ **DONE 2026-05-13** (обнаружено inspection'ом: миграция уже выполнена в одной из сессий между 04.05 и 13.05)
> **Effort**: ~3-4 ч — **выполнено фактически в одной из прошлых сессий**
> **Платформа**: Debian + RX 9070 (gfx1201) — собрать + прогнать на GPU
> **Зависимости**: ✅ `core/test_utils/validators/{numeric,signal}.hpp` (готовы), ✅ `core/tests/test_validators.hpp` (зелёный)

---

## ✅ Итог 2026-05-13 — V2 уже сделана

Inspection-проверка: в `linalg/tests/` **0** ручных `if (err/diff >= TOL) throw`, **15** использований `gpu_test_utils::ScalarAbsError` + throw на `!v.passed`.

| Файл | `gpu_test_utils::` вхождений |
|------|-----------------------------:|
| `test_cholesky_inverter_rocm.hpp` | 6 |
| `test_cross_backend_conversion.hpp` | 3 |
| `test_capon_opencl_to_rocm.hpp` | 4 |
| `test_capon_hip_opencl_to_rocm.hpp` | 2 |
| **Итого** | **15** |

Все запланированные в этом TASK строки (Phase B + Phase C) уже заменены на правильный паттерн (`v = ScalarAbsError(err, 0.0, TOL, name); if (!v.passed) throw runtime_error(... + v.metric_name + actual + threshold)`). Файлы собрались зелёным в acceptance v12 (26/26).

**Следующий шаг**: раскатить паттерн на остальные 7 модулей — отдельный TASK (rollout-фаза). Пилот ✅ закрыт.

---

---

## Зачем

`linalg` — эталонный модуль (Capon, Cholesky-inverter, SVD-cross-backend).
Покрытие валидаторами **0 из 9** test_*.hpp. Тесты используют:

- ручные `if (err >= 1e-5) throw std::runtime_error(...)` (`test_cholesky_inverter_rocm.hpp:148, 184, 225, 288, 345, ...`),
- ручной `std::abs(theta - theta_int)` в `test_capon_rocm.hpp:141`,
- кастомный `FrobeniusError(A, B, n)` который возвращает скаляр и проверяется if'ом.

Цель: **заменить** все ручные сравнения на `gpu_test_utils::*` чтобы:

1. Получить единое представление `ValidationResult` во всех тестах (для `TestRunner`/reporters).
2. Убрать near-zero risk (`MaxRelError` сам переключается на абсолютную проверку при `max_ref < 1e-15`).
3. Получить эталон — на нём построим план миграции остальных 7 модулей (`spectrum/stats/heterodyne/...`).

⚠️ **Не переписывать математику тестов** — только заменить «как сравниваем».
⚠️ **Не трогать CMake** — валидаторы уже в INTERFACE-include через `DspCoreTestUtils` (см. `core/CMakeLists.txt:115-128`: `target_include_directories(... ${CMAKE_CURRENT_SOURCE_DIR})` — даёт доступ через `core/test_utils/validators/numeric.hpp`). `linalg/tests` уже линкуется на `DspCore::TestUtils`.

---

## Inventory ручных сравнений (что менять)

> ⚠️ В `linalg/tests/` **нет** `TestRunner tr` — тесты это `inline void Test*()` функции,
> которые бросают `std::runtime_error` на провал. Семантику сохраняем: вычисляем
> `ValidationResult v = ScalarAbsError(...)`; если `!v.passed` → `throw runtime_error`
> с осмысленным сообщением (`v.metric_name`, `v.actual_value`, `v.threshold`).
> Профит — единое представление + near-zero fallback + сообщение собирается из полей.

### Подлежит замене

| Файл | Строки | Что | На что менять |
|---|---|---|---|
| `test_cholesky_inverter_rocm.hpp` | 147-159 | `err = FrobeniusError(I, A_inv); if (err >= 1e-5) throw` | `ScalarAbsError(err, 0.0, 1e-5, "frobenius_I_AAinv")` + throw на `!v.passed` |
| `test_cholesky_inverter_rocm.hpp` | 183-191 | `err = FrobeniusError(A, A_inv); if (err >= 1e-2) throw` | `ScalarAbsError(..., 1e-2, "frobenius_residual_341")` + throw |
| `test_cholesky_inverter_rocm.hpp` | 224-232 | то же (другой mode `void*`) | то же |
| `test_cholesky_inverter_rocm.hpp` | 287-292 | batch CPU loop, `if (err >= 1e-3) throw` | `ScalarAbsError(err, 0.0, 1e-3, "batch_cpu_k="+k)` |
| `test_cholesky_inverter_rocm.hpp` | 344-350 | batch GPU loop, то же | `ScalarAbsError(err, 0.0, 1e-3, "batch_gpu_k="+k)` |
| `test_cholesky_inverter_rocm.hpp` | **433-440** | TestMatrixSizes batch, `if (err >= 1e-2) throw` | `ScalarAbsError(err, 0.0, 1e-2, "matrix_sizes_n="+n+"_k="+k)` |
| `test_cross_backend_conversion.hpp` | 68-72 | `if (err >= 1e-3) throw` (Convert_VectorInput) | `ScalarAbsError(err, 0.0, 1e-3, "convert_vector_input")` |
| `test_cross_backend_conversion.hpp` | 133-137 | `if (diff >= 1e-3) throw` (Convert_HipInput) | `ScalarAbsError(diff, 0.0, 1e-3, "convert_hip_input")` |
| `test_cross_backend_conversion.hpp` | 195-199 | `if (diff >= 1e-7) throw` (Convert_OutputFormats) | `ScalarAbsError(diff, 0.0, 1e-7, "convert_output_formats")` |

### НЕ трогать (false positives)

| Файл | Строки | Почему оставить |
|---|---|---|
| `test_cholesky_inverter_rocm.hpp` | 81-95 | `FrobeniusError(A, B, n)` — **helper-функция**, не сравнение. Само использование заменяется (см. таблицу выше). |
| `test_capon_rocm.hpp` | 138-143 | `float diff = std::abs(theta - theta_int); if (diff < min_diff) m_int = m;` — это **argmin** (поиск ближайшего индекса), а не валидация порога. |
| `test_capon_opencl_to_rocm.hpp` | 489, 490, 759, 760 | `if (diff > max_diff) max_diff = diff;` — **аккумулятор максимума** для статистики, не assert. |
| `test_capon_hip_opencl_to_rocm.hpp` | 201, 208 | `throw` после `hipGetErrorString` — это error-check на API hip, не на валидацию данных. |
| `test_capon_hip_opencl_to_rocm.hpp` | 776, 777 | то же что в `_opencl_to_rocm` — accumulator. |

### Файлы под точечный скан в Phase A

| Файл | Размер | Ожидание |
|---|---|---|
| `test_capon_rocm.hpp` | 296 строк | argmin + ratio-print, явных assert'ов нет — подтвердить |
| `test_capon_hip_opencl_to_rocm.hpp` | 819 строк | если есть финальный pass-check — заменить; если только diff/reldiff print — нет |
| `test_capon_opencl_to_rocm.hpp` | 820 строк | то же |
| `test_capon_benchmark_rocm.hpp` | 120 строк | benchmark — обычно без assert'а |
| `test_benchmark_symmetrize.hpp` | 558 строк | benchmark |
| `test_capon_reference_data.hpp` | 408 строк | reference data — может содержать сравнения |
| `test_stage_profiling.hpp` | 404 строки | profiling — обычно без assert'а |

---

## Phases

### Phase A — Inventory + replacement plan (~30 мин)

1. Прогнать grep (только `>=`-сравнения с порогом, без argmin/accumulator):
   ```bash
   grep -nE 'if \(.*(err|err_|diff|reldiff)[^)]*>=' linalg/tests/*.hpp \
     > /tmp/linalg_inventory.txt
   ```
2. Дополнительно прогнать поиск throw-веток для перекрёстной проверки:
   ```bash
   grep -nE 'throw .*runtime_error.*FAIL' linalg/tests/*.hpp >> /tmp/linalg_inventory.txt
   ```
3. Каждое попадание классифицировать: какой validator подходит
   (`ScalarAbsError` / `ScalarRelError` / `RmseError` / `MaxRelError`).
   Default для существующих линалг-`if (err >= TOL) throw` — `ScalarAbsError(err, 0.0, TOL, name)`.
4. Записать итоговую таблицу в `MemoryBank/specs/validators_linalg_inventory_2026-05-04.md`
   (формат как в этом TASK-файле, секции «Подлежит замене» / «НЕ трогать»).
5. Перед заменой — `git status` чистый (если M/?? — спросить Alex).

### Phase B — Replace в `test_cholesky_inverter_rocm.hpp` (~1 ч)

Самый плотный файл (6 ручных сравнений: 147, 183, 224, 287, 344, 433).
Делать **первым** чтобы поймать паттерн:

1. Добавить include + using в начало файла (после `#include <hip/hip_runtime.h>`):
   ```cpp
   #include <core/test_utils/validators/numeric.hpp>
   using gpu_test_utils::ScalarAbsError;
   ```
2. **Паттерн замены** — сохраняем `throw runtime_error` на провал
   (в `linalg/tests` нет `TestRunner`, тесты — `inline void Test*()`):
   ```cpp
   // БЫЛО:
   double err = FrobeniusError(I, A_inv, n);
   if (err >= 1e-5) {
     throw std::runtime_error("TestCpuIdentity FAILED: err=" + std::to_string(err));
   }

   // СТАЛО:
   double err = FrobeniusError(I, A_inv, n);
   auto v = ScalarAbsError(err, 0.0, 1e-5, "frobenius_I_AAinv");
   if (!v.passed) {
     throw std::runtime_error(
       "TestCpuIdentity FAILED [" + std::string(ModeName(mode)) + "] " +
       v.metric_name + " actual=" + std::to_string(v.actual_value) +
       " threshold=" + std::to_string(v.threshold));
   }
   ```
   Профит — единый `ValidationResult`, near-zero fallback внутри валидатора,
   reporters/tooling смогут хвататься за `metric_name`/`actual_value`/`threshold`.
3. ⚠️ **Не вводить `TestRunner tr` в эти функции** — это другой рефакторинг (перевод на
   тест-классы по правилу 15 §"Дизайн"), он за пределами пилот-таска.
4. ⚠️ **Граничное значение**: ручное сравнение использует `>=` (включая `err == TOL` → fail),
   а `ScalarAbsError` использует `<` (т.е. `err == TOL` → fail тоже, потому что `err < TOL` будет false). Семантика совпадает. Если тест проходил «впритык» — поведение **не меняется**.

### Phase C — Replace в остальных файлах (~1.5 ч)

Идти по inventory из Phase A. По убыванию плотности подтверждённых assert'ов:

1. **`test_cross_backend_conversion.hpp`** (3 явных места: 68, 133, 195) — точно есть что менять.
2. `test_capon_rocm.hpp` (296 строк) — заявлено только argmin (стр. 141), assert не подтверждён. Подтвердить grep'ом из Phase A; если нет — **пропустить файл**.
3. `test_capon_hip_opencl_to_rocm.hpp` (819 строк) — содержит accumulator-блоки и hip-error throw'ы, ни то ни другое не валидаторы. Скан-проверить финальный pass-check.
4. `test_capon_opencl_to_rocm.hpp` (820 строк) — то же.
5. `test_capon_benchmark_rocm.hpp` (120 строк) — benchmark, скорее всего без assert.
6. `test_benchmark_symmetrize.hpp` (558 строк) — benchmark.
7. `test_capon_reference_data.hpp` (408 строк) — reference data, проверить.
8. `test_stage_profiling.hpp` (404 строки) — profiling, обычно без assert.

Файлы где assert'ов нет — **просто пометить** в inventory-спеке («clean, no manual epsilon»), коммит не нужен.

Для каждого изменённого файла — **отдельный коммит** (`linalg: validators in test_X.hpp`), чтобы при регрессии откатить точечно.

### Phase D — Build + Test on Debian GPU (~30 мин)

```bash
cd /home/alex/DSP-GPU
cmake --preset debian-local-dev
cmake --build --preset debian-local-dev --target linalg_tests
./build/debian-local-dev/linalg/tests/linalg_tests
```

Зелёные → DONE. Красные:
- Если ошибка компиляции — починить include / using / типы.
- Если ошибка прогона (раньше тест проходил, теперь падает) — **проверить near-zero fallback**:
  `ScalarAbsError` сам по себе не активирует near-zero (это `MaxRelError`/`RmseError`),
  но если тест где-то опирался на `MaxRelError` и `max_ref < 1e-15` — поведение
  переключается на абсолютную проверку с порогом `1e-10`. Это документированное поведение валидатора.
- **Boundary check**: ручное `if (err >= TOL) throw` фейлит при `err == TOL`. Валидатор
  `ScalarAbsError` использует `err < TOL` → при `err == TOL` `passed=false` → throw тоже сработает.
  Семантика совпадает. Регрессий «прошёл впритык — теперь падает» **быть не должно**.

### Phase E — Документация (~30 мин)

1. Обновить `linalg/tests/README.md` — раздел «Валидация»: использовать `gpu_test_utils::*`, ссылка на правило 15.
2. Запись в `MemoryBank/sessions/2026-05-04.md`.
3. В `MemoryBank/changelog/2026-05.md` — одна строчка.

---

## Acceptance criteria

- [ ] `linalg/tests/test_cholesky_inverter_rocm.hpp` — 0 ручных `if (err >= TOL) throw`.
- [ ] `linalg/tests/test_*.hpp` — 0 ручных epsilon-сравнений (только `gpu_test_utils::*`).
- [ ] `cmake --build --preset debian-local-dev --target linalg_tests` — без warnings (валидаторы шаблонные, могут быть deprecated warnings если что — обнаружим).
- [ ] `linalg_tests` — все зелёные на gfx1201.
- [ ] `linalg/tests/README.md` — обновлён.
- [ ] Inventory `MemoryBank/specs/validators_linalg_inventory_2026-05-04.md` — создан.
- [ ] Эталонный коммит `linalg: validators in test_cholesky_inverter_rocm.hpp` — есть, можно показывать как образец для остальных модулей.

---

## После пилота — план «валидация везде»

После того как `linalg` зелёный, создаю **7 параллельных подтасков** (по одному на каждый репо
кроме `linalg` который уже сделан этим пилотом):

| Репо | Файлов с тестами | Покрытие сейчас | TASK файл |
|---|---|---|---|
| `core` | 22 (ориентировочно) | 2/22 | `TASK_validators_core_migration_2026-05-XX.md` |
| `spectrum` | 18 | 7/18 (частично) | `TASK_validators_spectrum_migration_...md` |
| `stats` | 6 | 2/6 | `TASK_validators_stats_migration_...md` |
| `heterodyne` | 4 | 3/4 | `TASK_validators_heterodyne_migration_...md` |
| `signal_generators` | 3 | 2/3 | `TASK_validators_signal_generators_...md` |
| `radar` | 8 | 0/8 | `TASK_validators_radar_migration_...md` |
| `strategies` | 5 | 0/5 | `TASK_validators_strategies_migration_...md` |

> Цифры «файлов / покрытие» — ориентировочные, уточнить через `git ls-files` + grep при создании каждого подтаска.

Каждый подтаск идёт по **тому же паттерну** что linalg: Inventory → Replace → Build → Test → Docs.

---

## Связанные документы

- `MemoryBank/tasks/TASK_validators_port_from_GPUWorkLib_2026-05-03.md` — родительский таск (≈90% сделан до этого пилота)
- `core/test_utils/validators/numeric.hpp` — используемые free functions
- `core/test_utils/validators/signal.hpp` — для FFT-spectrum-тестов
- `.claude/rules/15-cpp-testing.md` §«Валидаторы» — единый источник правды

---

## Заметки

- ⚠️ Если в файле **нет** `TestRunner tr`, а функция возвращает `bool` или `void` — **не переделывать на TestRunner-стиль** в этом таске. Просто заменить ручное сравнение на validator и проверить `result.passed`. Перевод на TestRunner — отдельная работа (правило 15 не требует обязательно).
- ⚠️ `test_capon_benchmark_rocm.hpp` и `test_benchmark_symmetrize.hpp` — это **бенчмарки** (через `GpuBenchmarkBase`). У них своя проверка через `ProfilingFacade`. Скорее всего там `gpu_test_utils::*` не понадобится — проверить и пометить если так.
- Никаких git push / tag — только локальные коммиты по Phase B и C.

*Maintained by: Кодо.*
