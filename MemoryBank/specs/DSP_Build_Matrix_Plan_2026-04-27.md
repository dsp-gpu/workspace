# DSP Build Matrix — план тестирования управляемой CMake-сборки

> **Дата создания**: 2026-04-27
> **Источник идеи**: Alex (2026-04-27, после Profiler v2 closeout)
> **Цель**: верифицировать что `DSP/CMakePresets.json` корректно управляет on/off
> подключением 8 модульных репо через `DSP_BUILD_<MODULE>` опции — каждая
> комбинация собирается, проходит smoke-тест включённых модулей.
> **Effort**: 3-5 часов (чисто инфраструктура + bash-скрипт)
> **Требует**: явный OK Alex на правки `DSP/CMakePresets.json` (CMake-правило 12)

---

## 0. TL;DR

| Что | Статус сейчас |
|-----|---------------|
| Опции `DSP_BUILD_<MODULE>` в `DSP/CMakeLists.txt` | ✅ есть для всех 8 (core/spectrum/stats/SG/heterodyne/linalg/radar/strategies) |
| Guards зависимостей в `DSP/cmake/fetch_deps.cmake` | ✅ есть (8 проверок: spectrum→core, stats→core+spectrum, ...) |
| Пресеты в `DSP/CMakePresets.json` | 🟡 3 готовых (`spectrum-only`, `linalg-only`, `full-release`) — мало для матричного покрытия |
| Smoke-тест каждого модуля известен | 🟡 нет канонического списка «самый лёгкий тест модуля X» |
| Bash-runner для матричного прогона | ❌ нет |
| Документация по сборочной матрице | ❌ нет |

**Идея** — добавить 8 минимальных пресетов (по одному на каждый модуль) + 2
негативных + bash-скрипт `test_build_matrix.sh`, который для каждого пресета
делает `configure → build → запустить smoke-тест включённых модулей` и собирает
итоговую таблицу.

---

## 1. Граф зависимостей (фактический, из guards)

```
                  ┌─ core (фундамент, ни от кого) ─────────────────┐
                  │                                                │
     ┌──────────  ▼                                                │
     │       spectrum ── stats        signal_generators           │
     │       │   │     │   │           │                          │
     │       │   ▼     │   ▼           ▼                          │
     │       │  radar──┘   └─→ heterodyne                         │
     │       │                  │                                 │
     │       └────── linalg ────┴──→ strategies (всё)             │
     └────────────────────────────────────────────────────────────┘
```

| Модуль | Прямые зависимости | Минимальная комбинация для сборки |
|--------|-------------------|-----------------------------------|
| **core** | — | `core` |
| **spectrum** | core | `core + spectrum` |
| **stats** | core + spectrum | `core + spectrum + stats` |
| **signal_generators** | core + spectrum | `core + spectrum + signal_generators` |
| **heterodyne** | core + spectrum + signal_generators | `core + spectrum + SG + heterodyne` |
| **linalg** | core | `core + linalg` |
| **radar** | core + spectrum + stats | `core + spectrum + stats + radar` |
| **strategies** | ALL (core+spectrum+stats+SG+heterodyne+linalg+radar) | full set |

**Вывод**: **8 минимальных пресетов** покрывают все 8 модулей, причём каждый из
них валидно собираем (guards не падают).

---

## 2. Дизайн пресетов (предложение)

### 2.1 Минимальные «*-only» пресеты (8 штук)

| Пресет | core | spectrum | stats | SG | het | linalg | radar | strat |
|--------|:----:|:--------:|:-----:|:--:|:---:|:------:|:-----:|:-----:|
| `core-only`               | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `spectrum-min`            | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `stats-min`               | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `signal-generators-min`   | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `heterodyne-min`          | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `linalg-min`              | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `radar-min`               | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `strategies-full`         | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Все наследуются от `debian-local-dev` (или `local-dev` на Windows-варианте).

### 2.2 Уже существующие пресеты — оставить, переименовать аккуратно

| Текущее имя | Что делать |
|-------------|------------|
| `spectrum-only` | оставить как алиас (или удалить — дублирует `spectrum-min`?) |
| `linalg-only` | оставить как алиас (или дублирует `linalg-min`?) |
| `full-release` | оставить (это `strategies-full` + Release + Python) — другой профиль |
| `local-dev` / `debian-local-dev` | оставить как `inherits`-базы |
| `ci` | оставить (это `strategies-full` + GitHub теги) |

**Решение по дублированию** — оставить одно имя, удалить другое. Рекомендация:
оставить новые `*-min` имена (более регулярные), старые `*-only` сделать
deprecated через комментарий «# alias for *-min — будет удалён в v0.4.0».

### 2.3 Негативные («error-*») пресеты — для проверки guards

| Пресет | core | spectrum | stats | SG | het | linalg | radar | strat | Ожидаем |
|--------|:----:|:--------:|:-----:|:--:|:---:|:------:|:-----:|:-----:|---------|
| `error-spectrum-without-core`   | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | FATAL_ERROR `[DSP] spectrum требует DSP_BUILD_CORE=ON` |
| `error-strategies-partial`      | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | FATAL_ERROR `[DSP] strategies требует DSP_BUILD_HETERODYNE=ON` |

Это **хороший пресет** — он должен **упасть** на configure'е. Скрипт
проверяет: «configure failed AND вывод содержит ожидаемое сообщение» = PASS.

### 2.4 Build/test пресеты

Для каждого новой `configurePreset` добавить парный `buildPreset` + `testPreset`:

```json
"buildPresets": [
  { "name": "core-only", "configurePreset": "core-only" },
  ...
],
"testPresets": [
  { "name": "core-only", "configurePreset": "core-only",
    "output": { "outputOnFailure": true } },
  ...
]
```

---

## 3. Smoke-тест каждого модуля (канонический выбор)

**Принцип**: один тест, минимальный, без тяжёлой математики, без длинных
sweep'ов. Цель — проверить что **сборка** + **bind на симвлы из core** + **JIT
ядра** работают. Не валидация корректности (она в полных тестах).

| Модуль | Smoke-target | Файл | Время | Почему |
|--------|--------------|------|-------|--------|
| **core** | `test_core_main` (только через `--gtest_filter` или просто отдельный тест) | `core/tests/test_storage_services.hpp::run` | < 1 с | Не требует GPU, чистая инфра |
| **spectrum** | `test_spectrum_main` (раздел `test_fft_cpu_reference`) | `spectrum/tests/test_fft_cpu_reference_rocm.hpp` | ~2 с | Один маленький FFT |
| **stats** | `test_stats_main` (раздел `test_statistics_rocm` — mean only) | `stats/tests/test_statistics_rocm.hpp::TestMean` | ~1 с | Только mean (Welford), без SNR |
| **signal_generators** | `test_signal_generators_main` (раздел `test_signal_generators_rocm_basic` — CW only) | `signal_generators/tests/test_signal_generators_rocm_basic.hpp::test_cw` | ~1 с | Самый простой генератор — CW |
| **heterodyne** | `test_heterodyne_main` (раздел `heterodyne::tests::run_basic_tests`) | `heterodyne/tests/test_heterodyne_basic.hpp::single_antenna` | ~2 с | NCO + MixDown на одной антенне |
| **linalg** | `test_linalg_main` (раздел `vector_algebra_all_test::run` — `TestCpu341` only) | `linalg/tests/test_benchmark_symmetrize.hpp::TestCpu341` | ~1 с | 341×341, Roundtrip mode |
| **radar** | `test_radar_main` (раздел `fm_correlator_all_test` — `run_test_msequence`) | `radar/tests/test_fm_msequence.hpp::run_test_msequence` | ~1 с | M-sequence без полного pipeline'а |
| **strategies** | `test_strategies_main` (раздел `test_base_strategy::run_sin_only`) | `strategies/tests/test_base_strategy.hpp::run_sin_only` | ~3 с | SIN only, минимальный pipeline |

**ВАЖНО**: текущая структура — каждый репо имеет ОДИН target `test_<repo>_main`,
который через `all_test.hpp` запускает всё в `run()`. Чтобы запускать **только**
smoke-функцию, варианты:

1. **Вариант A** — `--gtest_filter` style. Не подходит, у нас не gtest, custom runner.
2. **Вариант B** — добавить **второй** `add_executable(test_<repo>_smoke ...)`
   target в каждый `<repo>/tests/CMakeLists.txt` который вызывает только smoke. **Требует CMake-правок ×8.** Тяжело.
3. **Вариант C** ⭐ — добавить в каждый `all_test.hpp` функцию `run_smoke()` рядом
   с `run()`. В smoke-режиме main вызывает `run_smoke()`. Управление через
   env var: `DSP_SMOKE_ONLY=1`. **Не требует CMake-правок.** ← рекомендация.
4. **Вариант D** — для матрицы запускаем **полный** test runner (`run()`) каждого
   модуля. Просто, без правок кода, но дольше (suite целиком 5-10 секунд на
   модуль вместо 1-2 секунд smoke). Для матрицы 8 пресетов = ~1 минута на модуль
   × 8 = ~8 минут. **Приемлемо для CI**, но не для итеративной разработки.
   ← запасной вариант на старте.

**Решение для плана**: начать с **Вариант D** (нулевая инвазивность), при
проблеме «слишком долго» — мигрировать на C через `DSP_SMOKE_ONLY=1` env var.

---

## 4. Структура bash-runner'а

**Файл**: `DSP/scripts/test_build_matrix.sh` (новый)

**Спека**:

```bash
#!/usr/bin/env bash
# DSP Build Matrix Runner
# - Проходит N пресетов
# - configure → build → запуск тестов включённых модулей
# - Собирает таблицу PASS / FAIL / SKIP

set -uo pipefail

PRESETS=(
  core-only
  spectrum-min
  stats-min
  signal-generators-min
  heterodyne-min
  linalg-min
  radar-min
  strategies-full
)

ERROR_PRESETS=(
  error-spectrum-without-core    "spectrum требует DSP_BUILD_CORE"
  error-strategies-partial       "strategies требует DSP_BUILD_HETERODYNE"
)

# Карта: preset → список репо для запуска smoke
declare -A SMOKE_TARGETS
SMOKE_TARGETS[core-only]="core"
SMOKE_TARGETS[spectrum-min]="core spectrum"
SMOKE_TARGETS[stats-min]="core spectrum stats"
SMOKE_TARGETS[signal-generators-min]="core spectrum signal_generators"
SMOKE_TARGETS[heterodyne-min]="core spectrum signal_generators heterodyne"
SMOKE_TARGETS[linalg-min]="core linalg"
SMOKE_TARGETS[radar-min]="core spectrum stats radar"
SMOKE_TARGETS[strategies-full]="core spectrum stats signal_generators heterodyne linalg radar strategies"

cd "$(dirname "$0")/.."   # в корень DSP

# Аргументы
DRY_RUN=${DRY_RUN:-0}
CLEAN=${CLEAN:-0}
JOBS=${JOBS:-$(nproc)}

results_file=$(mktemp)

run_preset_positive() {
  local preset=$1
  local label=$2

  echo "═══ [$preset] configure ════════════════════════════════════"
  if [ "$CLEAN" = "1" ]; then rm -rf "build/$preset"; fi

  cmake --preset "$preset" 2>&1 | tee "build/$preset.configure.log"
  local cfg_rc=${PIPESTATUS[0]}
  if [ $cfg_rc -ne 0 ]; then
    echo "$preset CONFIGURE_FAIL" >> "$results_file"; return; fi

  echo "═══ [$preset] build ═══════════════════════════════════════════"
  local targets=()
  for repo in ${SMOKE_TARGETS[$preset]}; do
    targets+=( "test_${repo}_main" )
  done
  cmake --build "build/$preset" -j$JOBS --target "${targets[@]}" 2>&1 \
    | tee "build/$preset.build.log"
  local build_rc=${PIPESTATUS[0]}
  if [ $build_rc -ne 0 ]; then
    echo "$preset BUILD_FAIL" >> "$results_file"; return; fi

  echo "═══ [$preset] smoke tests ═════════════════════════════════════"
  local fails=0
  for repo in ${SMOKE_TARGETS[$preset]}; do
    local exe
    exe=$(find "build/$preset/_deps" -path "*${repo}-build/tests/test_${repo}_main" \
           2>/dev/null | head -1)
    if [ -z "$exe" ]; then
      echo "  [$repo] BINARY_NOT_FOUND"; ((fails++)); continue; fi
    timeout 120s "$exe" 2>&1 | tee "build/$preset.$repo.smoke.log" | tail -3
    local rc=${PIPESTATUS[0]}
    if [ $rc -ne 0 ]; then
      echo "  [$repo] SMOKE_FAIL (rc=$rc)"; ((fails++))
    else
      echo "  [$repo] SMOKE_PASS"
    fi
  done
  if [ $fails -gt 0 ]; then
    echo "$preset SMOKE_FAIL($fails)" >> "$results_file"
  else
    echo "$preset PASS" >> "$results_file"
  fi
}

run_preset_negative() {
  local preset=$1
  local expected_msg=$2

  echo "═══ [$preset] expected to FAIL on configure ═══════════════"
  local log
  log=$(cmake --preset "$preset" 2>&1 || true)
  echo "$log" | tail -10

  if echo "$log" | grep -q "$expected_msg"; then
    echo "$preset NEG_PASS (guard fired correctly)" >> "$results_file"
  else
    echo "$preset NEG_FAIL (expected: $expected_msg)" >> "$results_file"
  fi
}

# Прогон
for p in "${PRESETS[@]}"; do run_preset_positive "$p"; done
for ((i=0; i<${#ERROR_PRESETS[@]}; i+=2)); do
  run_preset_negative "${ERROR_PRESETS[i]}" "${ERROR_PRESETS[i+1]}"
done

# Отчёт
echo
echo "════════════ RESULTS ════════════"
column -t "$results_file"
echo "═════════════════════════════════"

# Exit code: PASS если все строки PASS / NEG_PASS
if grep -qvE "PASS$" "$results_file"; then exit 1; else exit 0; fi
```

**Возможности**:

- `DRY_RUN=1 ./test_build_matrix.sh` — только configure без build (быстрый санити)
- `CLEAN=1 ./test_build_matrix.sh` — стирает build-директории перед каждым прогоном (полный rebuild)
- `JOBS=4 ./test_build_matrix.sh` — ограничение параллелизма
- Логи: `build/<preset>.{configure,build,<repo>.smoke}.log` (в .gitignore)
- Отчёт через `column` — выровненная таблица PASS/FAIL

---

## 5. Шаги реализации (4 фазы)

### Фаза M1 — расширить `CMakePresets.json` (CMake правка ⚠️ нужен OK Alex)

**Файл**: `DSP/CMakePresets.json`

**Что добавить**:

1. **8 minimum-пресетов** (`core-only` ... `strategies-full`) — точная таблица
   из секции 2.1. Все наследуют `debian-local-dev`.
2. **2 negative-пресета** (`error-spectrum-without-core`, `error-strategies-partial`) —
   также наследуют `debian-local-dev`.
3. **Парные buildPresets / testPresets** для каждого нового — паттерн как у
   текущих 3 (см. в текущем CMakePresets).
4. **Не удалять** существующие `spectrum-only` / `linalg-only` / `full-release` /
   `local-dev` / `debian-local-dev` / `ci`. Только добавить новые рядом.

**Эффект**:
- 11 новых configure-пресетов (8 + 2 + 0 переименований)
- 8 новых build-пресетов (не для error-*, они падают на configure)
- 8 новых test-пресетов

**Acceptance Фазы M1**:
- ✅ DIFF Alex показан, OK получен
- ✅ JSON валиден (`cmake --list-presets configure` без ошибок)
- ✅ `cmake --preset core-only` — configure проходит (пока без build)
- ✅ `cmake --preset error-spectrum-without-core` — configure **падает** с ожидаемой строкой

---

### Фаза M2 — bash-runner `DSP/scripts/test_build_matrix.sh`

**Файл**: `DSP/scripts/test_build_matrix.sh` (новый)
**Право**: `chmod +x`
**.gitignore**: добавить `DSP/build/*.log` (если не покрыто)

**Содержимое**: согласно секции 4.

**Acceptance Фазы M2**:
- ✅ `./test_build_matrix.sh --help` показывает доступные опции (`DRY_RUN` / `CLEAN` / `JOBS`)
- ✅ `DRY_RUN=1 ./test_build_matrix.sh` — все 11 пресетов проходят configure (negative — падают как ожидается)
- ✅ Полный прогон `./test_build_matrix.sh` (на чистой машине) — 8 PASS + 2 NEG_PASS = 10 PASS, exit 0
- ✅ Логи структурированы по пресетам в `DSP/build/<preset>.*.log`

---

### Фаза M3 — документация `DSP/Doc/Build_Matrix.md`

**Файл**: `DSP/Doc/Build_Matrix.md` (новый)

**Структура**:

```markdown
# DSP Build Matrix — выборочная сборка модулей

## Назначение
- Какие модули собираются вместе через CMakePresets
- Как добавить новую конфигурацию

## Граф зависимостей (Mermaid)
[диаграмма из section 1 этого плана]

## Таблица пресетов (8 + 2 негативных)
[таблица из section 2.1 + 2.3 этого плана]

## Запуск
```bash
# Один пресет:
cmake --preset core-only && cmake --build build/core-only -j

# Полная матрица:
DSP/scripts/test_build_matrix.sh

# Быстрый санити (только configure):
DRY_RUN=1 DSP/scripts/test_build_matrix.sh
```

## Smoke-тесты
[таблица из section 3 этого плана]

## Расширение
- Как добавить новый репо в граф (изменение `fetch_deps.cmake` + новый пресет)
- Как добавить новый smoke-тест (Вариант C: `run_smoke()` в all_test.hpp)
```

**Acceptance Фазы M3**:
- ✅ Файл создан
- ✅ Mermaid-диаграмма рендерится в VSCode preview
- ✅ Все ссылки рабочие (на пресеты, скрипт, all_test.hpp)
- ✅ Упомянут в `DSP/CLAUDE.md` в секции «Что здесь»

---

### Фаза M4 — опционально: `run_smoke()` в `all_test.hpp` (Вариант C)

**Включаем только** если M2 показал что Вариант D (полный test runner) слишком
медленный — например > 10 минут на полный матричный прогон.

**Что делать**:

1. В каждый `<repo>/tests/all_test.hpp` добавить:

   ```cpp
   namespace <repo>_all_test {
   inline void run() { /* существующий полный список */ }

   /// Smoke-тест: один лёгкий сценарий из таблицы DSP_Build_Matrix.md
   inline void run_smoke() {
   #if ENABLE_ROCM
       <конкретный smoke-call из section 3 этого плана>
   #endif
   }
   }
   ```

2. В каждый `<repo>/tests/main.cpp` (или один общий) добавить:

   ```cpp
   int main() {
       const char* smoke = std::getenv("DSP_SMOKE_ONLY");
       if (smoke && std::string(smoke) == "1") {
           <repo>_all_test::run_smoke();
       } else {
           <repo>_all_test::run();
       }
       return 0;
   }
   ```

3. В `test_build_matrix.sh` — убрать `timeout 120s` (smoke быстрый), добавить
   `DSP_SMOKE_ONLY=1` env var в `exec`-вызов.

**Acceptance Фазы M4**:
- ✅ `run_smoke()` добавлен в 8 all_test.hpp
- ✅ Существующий полный test runner работает БЕЗ env var (zero regression)
- ✅ Время полного матричного прогона < 5 минут на Debian + RX 9070

---

## 6. Сценарии использования матрицы

### 6.1 Перед коммитом в любой репо

Разработчик правит `spectrum/`. Чтобы убедиться что он не сломал downstream
(stats / signal_generators / heterodyne / radar / strategies):

```bash
cd DSP
DRY_RUN=0 CLEAN=0 ./scripts/test_build_matrix.sh 2>&1 | tee /tmp/matrix.log
# Если все PASS → коммитим в spectrum
# Если упал stats-min или radar-min — баг в spectrum, чинить ДО коммита
```

### 6.2 После добавления новой зависимости в core

Разработчик добавил в `core` новый header, который spectrum ещё не подключил.
Прогон матрицы покажет:
- `core-only` — PASS (core самодостаточен)
- `spectrum-min` — FAIL на build (forward declaration / undefined symbol)

Это **раньше** ловит проблему чем full-stack тесты.

### 6.3 Тестирование «отдела» (как было задумано в `*-only` пресетах)

Команда работает только с `linalg`. Им нужно собрать `linalg-min`, прогнать
там свои unit-тесты, без тяжёлых spectrum/radar.

```bash
cmake --preset linalg-min
cmake --build build/linalg-min -j
ctest --test-dir build/linalg-min/_deps/dsplinalg-build
```

### 6.4 CI / pre-merge gate

Workflow `.github/workflows/dsp_build_matrix.yml` (опционально, ОТДЕЛЬНЫЙ таск
по аналогии с `TASK_Profiler_v2_CI_RunSerial.md`):

```yaml
name: DSP Build Matrix
on: { push: { branches: [main] }, workflow_dispatch: }
jobs:
  matrix:
    runs-on: [self-hosted, rocm, debian]
    steps:
      - uses: actions/checkout@v4
      - run: cd DSP && CLEAN=1 ./scripts/test_build_matrix.sh
```

⚠️ Не вкладываем в этот таск — отдельное согласование с Alex (CI billing).

---

## 7. Риски / подводные камни

| Риск | Митигация |
|------|-----------|
| **`_deps/<repo>-build/tests/test_<repo>_main` путь меняется** при апгрейде CMake/FetchContent | В скрипте — `find ... -path "*${repo}-build/tests/test_${repo}_main"` (паттерн вместо хардкода) |
| **Один тест-runner = один процесс** — если smoke роняет ENV (Reset() Facade), следующий тест в том же бинарнике страдает | Каждый repo имеет свой бинарник, между ними процесс умирает → state не утекает |
| **GPU занят другим процессом** во время прогона матрицы | `rocm-smi --showuse` перед стартом + опционально `--exit-on-busy` флаг скрипта |
| **`cmake --preset core-only` тянет все 8 репо через FetchContent** даже если 7 выключены | `if(DSP_BUILD_*)` обёртки в `DSP/CMakeLists.txt` уже есть — fetch не вызывается → НЕ тянет |
| **Таблица SMOKE_TARGETS в скрипте дублирует знание из CMake `option()`** | Документировать в `DSP/Doc/Build_Matrix.md` что эти два места **должны** обновляться вместе. Опционально — в M4 переписать на `cmake --get-cache-variable DSP_BUILD_*` опрос |
| **Время полного прогона** | Кэшировать сборку: `CLEAN=0` по умолчанию, инкрементальная сборка переиспользует object'ы между пресетами **если** binaryDir **общий** — а он у нас разный (`build/${presetName}`). Это плохо для скорости, но хорошо для изоляции. Решение: full-rebuild только в CI, локально только для нужного пресета. |

---

## 8. Acceptance Criteria для всего плана

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | 8 minimum-пресетов в `DSP/CMakePresets.json` | `cmake --list-presets configure` показывает все 8 + 3 старых + 2 error |
| 2 | 2 негативных пресета падают на configure с правильным сообщением | `cmake --preset error-spectrum-without-core` exit ≠ 0 + grep "spectrum требует" |
| 3 | Bash-скрипт `test_build_matrix.sh` существует и executable | `ls -la DSP/scripts/test_build_matrix.sh` |
| 4 | Полный прогон матрицы — все PASS | `./test_build_matrix.sh; echo $?` = 0 |
| 5 | Документация `Build_Matrix.md` создана | `ls DSP/Doc/Build_Matrix.md` |
| 6 | `DSP/CLAUDE.md` упоминает скрипт + матрицу | grep `test_build_matrix` `DSP/CLAUDE.md` |
| 7 | Логи структурированы | `ls DSP/build/*.{configure,build,smoke}.log` после прогона |
| 8 | Время полного прогона ≤ 10 мин на Debian + RX 9070 (Вариант D) | `time ./test_build_matrix.sh` |
| 9 | (опц. M4) `run_smoke()` в 8 all_test.hpp | `grep -l "run_smoke" {core,spectrum,...}/tests/all_test.hpp` 8 совпадений |

---

## 9. Что НЕ входит в этот план

- **CI workflow `.github/workflows/dsp_build_matrix.yml`** — отдельный таск по
  аналогии с `TASK_Profiler_v2_CI_RunSerial.md`, требует отдельного OK Alex.
- **Удаление старых пресетов** `spectrum-only` / `linalg-only` — оставить как
  алиасы до v0.4.0 (BC).
- **Тестирование Windows-варианта** (`local-dev` без `debian-`) — main = Linux,
  Windows-паттерн только для дев-машины Alex.
- **rocm-smi проверки занятости GPU** — приятно иметь, но за рамками минимально
  жизнеспособного матричного runner'а.

---

## 10. Открытые вопросы для обсуждения с Alex

1. **Имена пресетов** — `core-only` vs `core-min` vs `min-core`? Я предлагаю
   `*-min` (регулярно по конвенции `<flagship>-min`), но `*-only` уже есть в
   `spectrum-only` / `linalg-only`. Унифицировать или оставить как есть и
   добавить новые рядом?

2. **Удалять ли `spectrum-only` / `linalg-only`** после введения `*-min`?
   Они дублируют функционал. Рекомендую оставить с deprecated-комментом до v0.4.0.

3. **Вариант smoke-тестов** — стартуем с D (полный test runner каждого репо,
   ноль кода) или сразу C (`run_smoke()` в `all_test.hpp` × 8)? Рекомендую D
   на старте, мигрировать на C только если время прогона > 10 мин.

4. **Negative-пресеты** — нужны или достаточно полагаться на guards в
   `fetch_deps.cmake` (они уже работают, не сломаются если не ткнуть)? Я считаю
   нужны — это **тест что guards работают**, иначе можно случайно убить логику
   в `fetch_deps.cmake` и не заметить.

5. **CI workflow** — делаем сразу или отдельным таском после стабилизации?
   Рекомендую отдельным.

6. **Параллелизм скрипта** — `JOBS=$(nproc)` per-пресет последовательно, или
   параллелить пресеты? Параллельно собрать все 8 — выгода 4-5×, но риск перегрева
   GPU + interference smoke-тестов. Рекомендую последовательно.

7. **CLEAN=1 по умолчанию или нет?** Чистая сборка надёжнее, но медленная.
   Рекомендую `CLEAN=0` (инкрементально), `CLEAN=1` для CI.

8. **Что делать с `radar` excluded из Phase D Profiler v2?** Сейчас radar
   собирается и его smoke (`run_test_msequence`) работает. Но `radar` тесты
   мигрированы на ProfilingFacade в RemoveLegacy. Нужно убедиться что
   `radar-min` PASS. Должно быть ОК, но валидируем в M2.

---

## 11. Эстимейт времени

| Фаза | Часы | Что |
|------|-----:|-----|
| M1 | 1 ч | CMakePresets.json правки + DIFF Alex + проверка configure |
| M2 | 2 ч | bash-скрипт + первый прогон + отладка путей `_deps` |
| M3 | 1 ч | Build_Matrix.md + Mermaid + ссылки |
| M4 (опц.) | 1-2 ч | `run_smoke()` × 8 если время прогона > 10 мин |
| **Итого** | **3-5 ч** | без M4 — 4 ч; с M4 — 5-6 ч |

---

## 12. Связанные документы

- `DSP/CMakeLists.txt` — точка входа меты
- `DSP/cmake/fetch_deps.cmake` — guards + FetchContent функции
- `DSP/CMakePresets.json` — текущие 6 пресетов
- `MemoryBank/.claude/rules/12-cmake-build.md` — правила правки CMake
- `MemoryBank/.claude/rules/10-modules.md` — список 10 репо + граф
- `MemoryBank/.claude/specs/CMake_Module_Template.md` — эталон CMakeLists модуля

---

*Created: 2026-04-27 by Кодо. Owner: после OK Alex по плану — следующая сессия.*
