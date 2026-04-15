# TASK: Core + Spectrum — Follow-ups по ревью 2026-04-15

> **Создан**: 2026-04-15
> **Источник**: [core_spectrum_REVIEW_2026-04-15.md](../specs/core_spectrum_REVIEW_2026-04-15.md)
> **Статус**: ⬜ BACKLOG
> **Координатор**: `workflow-coordinator` (опционально)
> **Связь**: дополняет [TASK_Spectrum_Review_Followups.md](TASK_Spectrum_Review_Followups.md) (от 14.04)

---

## 📊 Сводка задач

| ID | Задача | Файлы | Приоритет | Estimate | Зависит от |
|----|--------|-------|-----------|----------|------------|
| T0 | Baseline build + smoke-test | core, spectrum | 🔴 | 15 мин | — |
| T1 | Тиражировать `ScopedHipEvent` в 4 файла | spectrum/src | 🟠 | 1.5–2 ч | T0 |
| T2 | Проверить дубль `complex_to_mag_phase_rocm.hpp` | spectrum/include | 🟡 | 30 мин | T0 |
| T3 | Обновить doxy у `SpectrumProcessorFactory::Create` | spectrum/include/factory | 🟡 | 5 мин | — |
| T4 | Удалить shim `fft_processor_types.hpp` (опц.) | spectrum/include + клиенты | 🟢 | 30 мин | T0 |
| T5 | Финальный build + tests + commit | core + spectrum | 🔴 | 30 мин | T1–T4 |

**Общий estimate**: 3.5–4 часа на одного разработчика.

---

## 🔴 T0. Baseline — зафиксировать рабочее состояние ПЕРЕД правками

### Цель
Гарантировать, что репо собирается и тесты проходят ДО любых изменений. Это baseline для регрессий.

### Шаги

```bash
# 1. Зафиксировать SHA отправной точки
cd e:/DSP-GPU/core && git rev-parse HEAD > /tmp/core_baseline.sha
cd e:/DSP-GPU/spectrum && git rev-parse HEAD > /tmp/spectrum_baseline.sha

# 2. Чистая сборка core
cd e:/DSP-GPU/core
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 32 2>&1 | tee /tmp/core_baseline_build.log

# 3. Чистая сборка spectrum
cd e:/DSP-GPU/spectrum
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 32 2>&1 | tee /tmp/spectrum_baseline_build.log

# 4. Тесты (если есть на ROCm)
cd e:/DSP-GPU/core/build && ctest --output-on-failure 2>&1 | tee /tmp/core_baseline_tests.log
cd e:/DSP-GPU/spectrum/build && ctest --output-on-failure 2>&1 | tee /tmp/spectrum_baseline_tests.log
```

### Acceptance criteria
- [ ] `core` собирается без ошибок (warnings допустимы, фиксируем количество)
- [ ] `spectrum` собирается без ошибок
- [ ] Прогоны тестов сохранены в `/tmp/*_baseline_*.log` (для сравнения после правок)
- [ ] Зафиксированы baseline SHA в начале файла отчёта T5

### Риски
- ⚠️ Если baseline уже **сломан** — НЕ начинать T1–T4. Сначала чинить базу, отдельной задачей.

---

## 🟠 T1. Тиражировать `ScopedHipEvent` — 23 `hipEventCreate` в 4 файлах

### Цель
Закрыть технический долг — везде в spectrum/src заменить голые `hipEvent_t` + `hipEventCreate`/`hipEventDestroy` на RAII-обёртку `fft_processor::ScopedHipEvent`.

### Контекст
- Класс уже существует: `spectrum/include/spectrum/utils/scoped_hip_event.hpp` (создан в `aa10959`)
- Применён в `src/fft_func/src/fft_processor_rocm.cpp` (3 метода) — эталон для копирования
- Осталось 23 `hipEventCreate` без RAII в 4 файлах

### Файлы (порядок выполнения — от меньшего к большему)

#### T1.1 `src/filters/src/fir_filter_rocm.cpp` — 4 события
- [ ] Прочитать файл, найти все `hipEventCreate` (4 шт.)
- [ ] Заменить парами на `ScopedHipEvent`
- [ ] Удалить соответствующие `hipEventDestroy` (RAII делает сам)
- [ ] Добавить `#include <spectrum/utils/scoped_hip_event.hpp>`
- [ ] Использовать namespace `fft_processor::ScopedHipEvent` (или `using` локально)
- [ ] Локальная сборка: `cmake --build spectrum/build --target fir_filter_rocm`

#### T1.2 `src/filters/src/iir_filter_rocm.cpp` — 4 события
- [ ] Аналогично T1.1

#### T1.3 `src/lch_farrow/src/lch_farrow_rocm.cpp` — 6 событий
- [ ] Аналогично, но больше пар (3 пары)
- [ ] Особое внимание: проверить, не утекают ли события сейчас при исключении в Upload→Kernel

#### T1.4 `src/fft_func/src/spectrum_processor_rocm.cpp` — 9 событий
- [ ] Самый большой файл. События распределены по нескольким методам:
  - `ProcessFromCPU` / `ProcessFromGPU`
  - `ProcessBatch` / `ProcessBatchFromGPU`
  - `FindAllMaxima*`
  - `AllMaximaFromCPU`
- [ ] Применять локально по методу, после каждого — пробная сборка

### Паттерн замены (из эталонного `fft_processor_rocm.cpp`)

```cpp
// === БЫЛО ===
hipEvent_t ev_up_s = nullptr, ev_up_e = nullptr;
if (prof_events) {
    hipEventCreate(&ev_up_s);
    hipEventCreate(&ev_up_e);
}

hipEventRecord(ev_up_s, stream);
UploadData(...);                  // ← может бросить
hipEventRecord(ev_up_e, stream);

// ... обработка ...

if (prof_events) {
    hipEventDestroy(ev_up_s);     // ← НЕ выполнится при throw!
    hipEventDestroy(ev_up_e);
}

// === СТАЛО ===
fft_processor::ScopedHipEvent ev_up_s, ev_up_e;
if (prof_events) {
    ev_up_s.Create();
    ev_up_e.Create();
}

hipEventRecord(ev_up_s.get(), stream);
UploadData(...);                  // ← бросит — события всё равно освободятся в дтор
hipEventRecord(ev_up_e.get(), stream);

// ... обработка ...
// hipEventDestroy не нужен — RAII
```

### Edge-cases на которые смотреть

1. **`hipEventCreate` внутри условия `if (prof_events)`** — RAII работает: пустой `ScopedHipEvent` в дтор просто проверит `event_ != nullptr` и пропустит destroy.
2. **Передача `hipEvent_t` в чужую функцию** (например `hipEventElapsedTime`) — использовать `.get()`.
3. **Move semantics** — не передавать `ScopedHipEvent` по значению (только move).
4. **Контейнеры** — если будут массивы событий, использовать `std::vector<ScopedHipEvent>` (move-only ок).

### Acceptance criteria
- [ ] Все 4 файла отредактированы
- [ ] `grep -rn "hipEventCreate" spectrum/src/` возвращает **0 совпадений** (или только в комментариях/тестах)
- [ ] `grep -rn "hipEventDestroy" spectrum/src/` возвращает **0 совпадений**
- [ ] Чистая сборка `spectrum/` проходит без новых warnings
- [ ] Если есть unit-тесты — все проходят
- [ ] Diff `git diff --stat` показывает только эти 4 файла + возможно header

### Тесты (минимальные)
- [ ] Smoke-тест: запустить любой профилируемый pipeline в `spectrum`, проверить через `rocm-smi`/`hipevent_tracker` что `hipEvent_t` не накапливаются (ровно столько, сколько живых)
- [ ] Stress: повторный вызов `ProcessBatch(...)` 10000 раз — нет роста потребления GPU memory

### Риски
- 🟡 `ScopedHipEvent` сейчас в namespace `fft_processor`. В `filters/` используется namespace `filters` (или подобный). Импорт через `using` или полный путь — выбрать единый стиль.
- 🟢 Изменения локальные, регрессионный риск низкий.

---

## 🟡 T2. Проверить дубль `complex_to_mag_phase_rocm.hpp`

### Цель
Понять, является ли `spectrum/include/spectrum/complex_to_mag_phase_rocm.hpp` (в корне) дублем `spectrum/include/spectrum/operations/mag_phase_op.hpp` (Layer 5). Если да — удалить старый.

### Контекст
- В GPUWorkLib/fft_func эта же дилемма была — файл лежит в корне модуля, при этом в `operations/` есть свой `mag_phase_op.hpp`.
- По Ref03 architecture все Op-классы должны быть в `operations/`.

### Шаги
1. [ ] Прочитать `spectrum/include/spectrum/complex_to_mag_phase_rocm.hpp`
2. [ ] Прочитать `spectrum/include/spectrum/operations/mag_phase_op.hpp`
3. [ ] Сравнить:
   - Что экспортирует каждый (классы, функции, типы)?
   - Кто на них ссылается? `grep -rn "complex_to_mag_phase_rocm.hpp" spectrum/`
   - Кто на них ссылается? `grep -rn "operations/mag_phase_op.hpp" spectrum/`
4. [ ] Решить (3 варианта):
   - **A**: Полный дубль → удалить корневой, переадресовать клиентов на `operations/`
   - **B**: Разная семантика → пометить в Doxygen что это разные сущности
   - **C**: Корневой — устаревший shim → пометить `@deprecated`, удалить в следующем мажоре

### Acceptance criteria
- [ ] Решение задокументировано в комментарии PR / commit
- [ ] Если удалили — все клиенты переадресованы, сборка не упала
- [ ] Если оставили — добавлен Doxygen-комментарий `@brief`+`@see`, поясняющий разницу

### Риски
- ⚠️ **Python bindings** могут включать `complex_to_mag_phase_rocm.hpp` напрямую. Проверить `spectrum/python/` и `DSP/Python/`.

---

## 🟡 T3. Обновить устаревший Doxygen у `SpectrumProcessorFactory::Create`

### Цель
В `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp:32-38` стоит:
```cpp
@throws std::runtime_error if ROCm requested (not implemented)
```
Это ложь — ROCm теперь основной backend.

### Шаги
1. [ ] Открыть `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp`
2. [ ] Заменить doxy-комментарий метода `Create`:
   ```cpp
   /**
    * @brief Create processor for given backend type
    * @param backend_type ROCm (main) or OPENCL (legacy / nvidia branch)
    * @param backend DrvGPU backend (non-owning)
    * @return unique_ptr to processor, never null
    * @throws std::runtime_error if backend_type is unsupported on current platform
    */
   ```
3. [ ] Также проверить пример использования в комментарии (строки 26-28) — там `BackendType::OPENCL` и `BackendType::ROCm`. Если на main-ветке OpenCL не поддерживается — поправить на `ROCm` как default.

### Acceptance criteria
- [ ] Doxy актуален: ROCm — основной backend, OPENCL — legacy
- [ ] Пример в `@class` блоке адекватный
- [ ] Сборка не сломана (изменение только в комментарии)

### Estimate
5 минут.

---

## 🟢 T4. Опционально удалить shim `fft_processor_types.hpp`

### Цель
Файл `spectrum/include/spectrum/fft_processor_types.hpp` — 12 строк-обёртка:
```cpp
#pragma once
#include <spectrum/types/fft_types.hpp>
```
Существует для обратной совместимости. После миграции спектра можно удалить.

### Шаги
1. [ ] `grep -rn "fft_processor_types.hpp" e:/DSP-GPU/` — найти ВСЕХ клиентов:
   - `spectrum/src/**/*.cpp`
   - `spectrum/python/**/*.cpp`
   - `DSP/Python/**`
   - `signal_generators/**`, `heterodyne/**` (зависят от spectrum)
   - `radar/**`, `strategies/**`
2. [ ] В каждом клиенте заменить:
   ```diff
   - #include <spectrum/fft_processor_types.hpp>
   + #include <spectrum/types/fft_types.hpp>
   ```
3. [ ] Удалить `spectrum/include/spectrum/fft_processor_types.hpp`
4. [ ] Сборка всех зависящих репо
5. [ ] Если что-то не собралось — вернуть shim, добавить deprecated-комментарий вместо удаления

### Acceptance criteria
- [ ] Файл удалён ИЛИ помечен `@deprecated` (выбрать)
- [ ] Все клиенты собираются
- [ ] Python bindings работают

### Альтернатива
Оставить как есть с комментарием:
```cpp
/**
 * @file fft_processor_types.hpp
 * @deprecated Use <spectrum/types/fft_types.hpp> directly. Kept for ABI compat.
 */
```

### Риски
- 🟡 Затрагивает несколько репо — нужен аккуратный обход всех.
- 🟢 Если оставить deprecated-shim — рисков нет.

---

## 🔴 T5. Финальная сборка + commit

### Цель
Собрать всё после T1–T4, прогнать тесты, закоммитить чистым набором правок.

### Шаги

```bash
# 1. Сборка
cd e:/DSP-GPU/core
cmake --build build --parallel 32 2>&1 | tee /tmp/core_final_build.log

cd e:/DSP-GPU/spectrum
cmake --build build --parallel 32 2>&1 | tee /tmp/spectrum_final_build.log

# 2. Diff с baseline
diff /tmp/core_baseline_build.log /tmp/core_final_build.log
diff /tmp/spectrum_baseline_build.log /tmp/spectrum_final_build.log
# → ожидаем: 0 новых warnings/errors

# 3. Тесты
cd e:/DSP-GPU/spectrum/build && ctest --output-on-failure 2>&1 | tee /tmp/spectrum_final_tests.log
diff /tmp/spectrum_baseline_tests.log /tmp/spectrum_final_tests.log
# → ожидаем: тот же набор PASS, никаких новых FAIL

# 4. Итоговая статистика leak'ов (опционально, если есть hip_tracker)
HIP_LAUNCH_BLOCKING=1 ./spectrum/build/tests/test_spectrum_smoke
# → проверить hipEvent_t балланс
```

### Коммит-сообщения (примеры)

**T1 — отдельный коммит**:
```
fix(spectrum): применён ScopedHipEvent в filters + lch_farrow + spectrum_processor

23 hipEventCreate в 4 файлах обёрнуты в RAII. Технический долг
из ревью 2026-04-15 (TASK_Core_Spectrum_Review/T1) закрыт.

Файлы:
- src/filters/src/fir_filter_rocm.cpp (4 события)
- src/filters/src/iir_filter_rocm.cpp (4 события)
- src/lch_farrow/src/lch_farrow_rocm.cpp (6 событий)
- src/fft_func/src/spectrum_processor_rocm.cpp (9 событий)

Гарантирует hipEventDestroy при исключении в Upload/Kernel/FFT.
Поведение в happy-path не меняется.
```

**T2 — отдельный коммит** (если что-то удалили/переименовали):
```
refactor(spectrum): убран дубль complex_to_mag_phase_rocm.hpp

Файл в корне был пред-Ref03 версией. Op-класс MagPhaseOp
в operations/ — каноничная Layer 5 реализация. Все клиенты
переадресованы.
```

**T3 — отдельный коммит**:
```
docs(spectrum): актуализирован Doxygen у SpectrumProcessorFactory

ROCm — основной backend, не "not implemented".
```

**T4 — отдельный коммит** (если выполнен):
```
chore(spectrum): удалён shim fft_processor_types.hpp

Все клиенты теперь включают <spectrum/types/fft_types.hpp> напрямую.
```

### Push policy

⚠️ **`git push` — ТОЛЬКО после явного OK от Alex.**
Локальные коммиты — автономно.
`git tag` — НЕ ставить.

### Acceptance criteria
- [ ] Все 4 baseline-логов сравнены: 0 регрессий
- [ ] Тесты: тот же набор PASS, без новых FAIL
- [ ] Все коммиты атомарные и подписаны Co-Authored-By: Claude
- [ ] PR/commit message ссылается на `core_spectrum_REVIEW_2026-04-15.md`

---

## 🚦 Definition of Done (вся задача)

- [ ] T0–T5 закрыты
- [ ] `grep -rn "hipEventCreate" e:/DSP-GPU/spectrum/src/` → 0 совпадений
- [ ] `core` + `spectrum` собираются чисто
- [ ] Все ранее проходящие тесты проходят
- [ ] Коммиты в локальной ветке (не в `main` напрямую — лучше через PR-style branch)
- [ ] `MemoryBank/changelog/` обновлён записью о закрытии follow-ups
- [ ] `MemoryBank/tasks/IN_PROGRESS.md` обновлён (отметка о завершении или переход к следующей фазе)

---

## 🔗 Связанные документы

- **Ревью**: [core_spectrum_REVIEW_2026-04-15.md](../specs/core_spectrum_REVIEW_2026-04-15.md)
- **Старый follow-up**: [TASK_Spectrum_Review_Followups.md](TASK_Spectrum_Review_Followups.md) (от 14.04, частично пересекается)
- **CMake-правило**: [agents/cmake-fixer.md](../../.claude/agents/cmake-fixer.md) — DIFF-preview перед правкой
- **CLAUDE.md** §🚨 CMake — строгий запрет

---

## 🤖 Кому делегировать

| Task | Агент | Модель |
|------|-------|--------|
| T0 | `build-agent` | sonnet |
| T1 | прямая правка (sed/Edit) или `gpu-optimizer` для ревью паттерна | sonnet/opus |
| T2 | прямая правка после `Read` обоих файлов | — |
| T3 | прямая правка (5 минут) | — |
| T4 | прямая правка + `repo-sync` для проверки клиентов | sonnet |
| T5 | `build-agent` + `test-agent` | sonnet |

Опционально: запустить через `workflow-coordinator` для оркестрации.

---

*Created: 2026-04-15 | Maintained by: Кодо (AI Assistant)*
