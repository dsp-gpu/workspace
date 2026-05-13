# Namespace Migration Plan — `spectrum` модуль

> **Создано**: 2026-05-12 (Windows-сессия, подготовка)
> **Цель**: мигрировать `fft_processor::*` + `filters::*` + `lch_farrow::*` → `dsp::spectrum::*` (плоско) согласно правилу [10-modules.md](../.claude/rules/10-modules.md) и `.future/TASK_namespace_migration_legacy_to_dsp.md`.
> **Платформа выполнения**: Phase 1-2 — Windows (правки), Phase 3-4 — Debian (сборка + тесты).
> **Estimate**: 4-6 ч (по таску `.future/`).

---

## TL;DR (хорошая новость)

🟢 **Spectrum — изолированный модуль.** В **коде других репо** (radar / strategies / heterodyne / linalg / signal_generators / stats / core / DSP) **нет ни одного** `#include <spectrum/...>` и нет ни одного `fft_processor::` / `filters::` / `lch_farrow::` упоминания. Все matches вне spectrum/ — только в `MemoryBank/` (документация, golden_set, RAG данные).

Это значит миграция spectrum **не ломает** другие модули. Blast radius — внутри `spectrum/` + Python-биндинги.

### Что НЕ меняется
- ✅ Имя Python-модуля `dsp_spectrum` (PYBIND11_MODULE) — остаётся.
- ✅ Python-аттрибуты `dsp_spectrum.FFTProcessorROCm` и пр. — остаются.
- ✅ Никаких изменений в `radar/`, `strategies/`, `DSP/Python/` (включая `t_signal_to_spectrum.py`, `t_hybrid_backend.py`).
- ✅ `find_package(spectrum)` / `target_link_libraries(... DspSpectrum)` — остаются.

---

## Blast radius (точные цифры)

### Внутри `spectrum/` — что трогаем

| Что | Кол-во | Где |
|-----|-------:|-----|
| `namespace fft_processor {` объявлений | 14 (в 11 файлах) | `include/spectrum/{fft_processor_rocm,complex_to_mag_phase_rocm,operations/{mag_phase,magnitude,pad_data}_op,types/{fft_modes,fft_params,fft_results,mag_phase_types,window_type},kernels/{fft_processor,complex_to_mag_phase}_kernels_rocm}.hpp` + 2 `.cpp` |
| `namespace filters {` объявлений | 25 (в 17 файлах, считая дубли `{...}` в одном файле) | `include/spectrum/filters/*.hpp` (5×2=10), `include/spectrum/types/filter_*.hpp` (3), `include/spectrum/kernels/{fir,iir,kalman,kaufman,moving_average}_kernels_rocm.hpp` (5), `src/filters/src/*.cpp` (5), 2 теста |
| `namespace lch_farrow {` объявлений | 5 (в 4 файлах) | `include/spectrum/{lch_farrow,lch_farrow_rocm}.hpp` (3), `include/spectrum/kernels/lch_farrow_kernels_rocm.hpp` (1), `src/lch_farrow/src/lch_farrow_rocm.cpp` (1) |
| `using namespace fft_processor;` | 7 | `tests/test_{fft_processor,fft_cpu_reference,complex_to_mag_phase,process_magnitude}_rocm.hpp` + legacy дубликаты в `src/fft_func/tests/` |
| `using namespace filters;` | 10 | `tests/test_{filters,kalman,kaufman,moving_average,fir_basic}_rocm.hpp` + legacy дубликаты в `src/filters/tests/` |
| `using namespace lch_farrow;` | 3 | `tests/test_lch_farrow_rocm.hpp` + 2 legacy дубликата |
| `#include <spectrum/...>` (внутренние) | **155** в **74 файлах** | заменить на `#include <dsp/spectrum/...>` |
| `Doc/API.md`, `Doc/filters_API.md`, `Doc/Full.md`, `Doc/Quick.md` | 4 файла | **НЕ трогаем в этой фазе** (документация — Phase 5) |

### Снаружи `spectrum/` — что НЕ трогаем (потому что не используют)

```
radar/        : 0 ссылок на spectrum/* / fft_processor:: / filters:: / lch_farrow::
strategies/   : 0 ссылок
heterodyne/   : 0 ссылок
linalg/       : 0 ссылок
signal_generators/ : 0 ссылок
stats/        : 0 ссылок
core/         : 0 ссылок (core ниже spectrum в иерархии)
DSP/Python/   : использует Python API через import dsp_spectrum — НЕ меняется
DSP/CMakeLists.txt : fetch_dsp_spectrum() — название fetch функции не меняется
```

### MemoryBank / RAG (Phase 5 — отдельная фаза, не сейчас)

| Что | Файлы |
|-----|------|
| `golden_set/qa_v{1,2}.jsonl` + 8 eval reports | content matches `fft_processor::` — обновить expected_fqn |
| `.rag/test_params/*.md` (legacy namespace в md) | `fft_processor_FFTProcessorROCm.md`, `filters_FirFilterROCm.md` и пр. |
| `_RAG.md` файлы (tags / key_classes) | теги `#namespace:lch_farrow` etc. — обновить на `#namespace:dsp_spectrum` |
| `MemoryBank/specs/LLM_and_RAG/*` | прокурить, оставить как исторический snapshot |

---

## Особые случаи и грабли

### 1. Дубликаты тестов в `src/{fft_func,filters,lch_farrow}/tests/`

В `src/` обнаружены **legacy дубликаты** тестов (старая структура до миграции):

```
spectrum/
├── tests/                       ← АКТИВНЫЕ (подключены через all_test.hpp)
│   ├── test_fir_basic.hpp
│   ├── test_kalman_rocm.hpp
│   └── ...
└── src/
    ├── filters/tests/           ← LEGACY DUPLICATES (?)
    │   ├── test_fir_basic.hpp   ← дубликат с того же namespace
    │   ├── test_kalman_rocm.hpp
    │   └── ...
    ├── fft_func/tests/          ← LEGACY DUPLICATES (?)
    └── lch_farrow/tests/        ← LEGACY DUPLICATES (?)
```

**Действие**: проверить `tests/CMakeLists.txt` — какие реально собираются. Скорее всего `src/X/tests/` — dead code от старой структуры. **Не трогать в этой миграции**, открыть отдельный таск на чистку.

### 2. Двойная вложенность `src/X/src/`

```
src/fft_func/src/*.cpp    ← actual sources, linked в CMakeLists.txt:25-29
src/filters/src/*.cpp     ← actual sources, CMakeLists.txt:31-36
src/lch_farrow/src/*.cpp  ← actual sources, CMakeLists.txt:38
```

Это **legacy artifact** от предыдущих миграций. По правилу [05-architecture-ref03.md](../.claude/rules/05-architecture-ref03.md) должно быть просто `src/*.cpp` или `src/operations/*.cpp`. **Не трогаем в этой миграции** — открыть отдельный таск на структуру.

### 3. Dead include path в `python/CMakeLists.txt`

```cmake
target_include_directories(dsp_spectrum PRIVATE
  ${PROJECT_SOURCE_DIR}/src/fft_func/include   # ← НЕ СУЩЕСТВУЕТ
  ${PROJECT_SOURCE_DIR}/src/filters/include    # ← НЕ СУЩЕСТВУЕТ
  ${PROJECT_SOURCE_DIR}/src/lch_farrow/include # ← НЕ СУЩЕСТВУЕТ
  ...)
```

Эти каталоги не существуют в реальной структуре (нет `src/X/include/`). Compile work-around: CMake не падает на несуществующих `target_include_directories`, просто игнорирует. **Зафиксировать в отдельной CMake-чистке** (требует OK Alex по правилу [12-cmake-build.md](../.claude/rules/12-cmake-build.md)).

### 4. `Doc/API.md` + `Doc/filters_API.md` содержат legacy namespace

В документации есть примеры с `namespace filters {...}` (40+ упоминаний). **НЕ трогаем в Phase 1-4** (документация исключена из текущей сессии). Откроется в Phase 5 либо как `doc-agent` таск.

### 5. `tests/all_test.hpp` — неправильное имя namespace

Файл `spectrum/tests/all_test.hpp` объявляет `namespace lch_farrow_all_test { run() {...} }` — историческое имя. По стандарту `15-cpp-testing.md` должно быть `spectrum_all_test`. **Отдельный косметический фикс**, не блокирует миграцию.

---

## План выполнения (по фазам)

### Phase 0 — Этот документ ✅ DONE (2026-05-12 Windows)

### Phase 1 — Namespace replace (Windows, ~45-60 мин)

Цель: внутри `spectrum/`, во всех `.hpp` / `.cpp` / `.hip` (кроме `Doc/`, `Logs/`, `.rag/`, `build/`):

1. `namespace fft_processor {` → `namespace dsp::spectrum {`
2. `namespace filters {` → `namespace dsp::spectrum {`
3. `namespace lch_farrow {` → `namespace dsp::spectrum {`
4. `using namespace fft_processor;` → `using namespace dsp::spectrum;`
5. `using namespace filters;` → `using namespace dsp::spectrum;`
6. `using namespace lch_farrow;` → `using namespace dsp::spectrum;`
7. Closing comments `// namespace fft_processor` / `} // fft_processor` → `} // namespace dsp::spectrum` (опц. косметика)

**Quote из C++ pitfall**: `namespace fft_processor {` существует **14 раз в 11 файлах** — некоторые файлы имеют **несколько** namespace блоков (`namespace fft_processor { ... } namespace fft_processor::detail { ... }`). Делать только **точные** replace по полной строке `^namespace fft_processor\s*\{`.

**Inline FQN-ссылки** (`fft_processor::FFTProcessorROCm`) — заменить отдельно, без них код не компилируется. На данный момент **0 inline FQN** в коде других репо, в spectrum/ они есть в pybind11 файлах.

### Phase 2 — Physical include move (Windows, ~15 мин)

```bash
cd e:/DSP-GPU/spectrum
mkdir -p include/dsp
git mv include/spectrum include/dsp/spectrum
```

После git mv обновить **155 #include <spectrum/...>** на `<dsp/spectrum/...>` во всех `.hpp` / `.cpp` / `.hip` внутри `spectrum/`:

```powershell
Get-ChildItem -Recurse -Include *.hpp,*.cpp,*.hip -Path e:/DSP-GPU/spectrum |
  Where-Object { $_.FullName -notmatch '\\Doc\\|\\Logs\\|\\.rag\\|\\build\\|\\.git\\' } |
  ForEach-Object {
    (Get-Content $_ -Raw) -replace '#include\s+([<"])spectrum/','#include $1dsp/spectrum/' |
      Set-Content $_
  }
```

### Phase 3 — CMake update (на Debian, ~10 мин, требует OK Alex)

⚠️ Правило [12-cmake-build.md](../.claude/rules/12-cmake-build.md) — без OK Alex CMake не трогаем.

Проверить нужно/нет:
- `spectrum/CMakeLists.txt:44` — `$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>` — **остаётся** (корень `include/` теперь содержит `dsp/spectrum/`).
- `spectrum/CMakeLists.txt:87` — `install(DIRECTORY include/ ...)` — **остаётся** (install копирует поддерево с новым `dsp/spectrum/`).
- `spectrum/python/CMakeLists.txt` — dead include paths `${PROJECT_SOURCE_DIR}/src/X/include/` — **отдельный CMake-фикс** (вне scope этой миграции).

**Вывод**: CMake правки **не требуются** для миграции namespace. Структура `target_include_directories` уже работает с любым `include/<anything>/...`.

### Phase 4 — Debian build + tests (~30 мин)

```bash
cd /home/alex/DSP-GPU/spectrum
cmake --preset debian-local-dev -B build
cmake --build build -j$(nproc)
ctest --test-dir build --output-on-failure
```

Acceptance:
- [ ] Сборка проходит без ошибок (`hipcc` + `find_package(hipfft)`).
- [ ] C++ тесты в `spectrum/tests/` зелёные.
- [ ] Python binding собирается: `cmake --build build -t dsp_spectrum`.
- [ ] `python3 -c "import dsp_spectrum; print(dsp_spectrum.FFTProcessorROCm)"` работает.
- [ ] `DSP/Python/integration/t_signal_to_spectrum.py` зелёный.
- [ ] `DSP/Python/integration/t_hybrid_backend.py` зелёный.
- [ ] Зависимые репо собираются без правок (radar, strategies).

### Phase 5 — RAG / Doc / golden_set (отдельная сессия, после Debian PASS)

- `Doc/API.md` + `Doc/filters_API.md` — обновить примеры (исключено из текущей сессии Alex).
- `spectrum/_RAG.md` — теги `#namespace:dsp_spectrum`.
- `.rag/test_params/{fft_processor,filters,lch_farrow}_*.md` — переименовать в `dsp_spectrum_*.md` + обновить namespace внутри.
- `MemoryBank/specs/LLM_and_RAG/golden_set/qa_v2.jsonl` — заменить expected_fqn.
- Re-index RAG: `dsp-asst index build --root /home/alex/DSP-GPU`.

---

## Команды для Phase 1 (PowerShell, готовые к copy-paste)

⚠️ Сначала **commit** текущего состояния (чтобы откатить через `git reset --hard HEAD`).

```powershell
# Корень spectrum
$root = "e:\DSP-GPU\spectrum"

# Файловый фильтр: только исходники, исключая Doc/Logs/.rag/build
$files = Get-ChildItem -Recurse -Include *.hpp,*.cpp,*.hip -Path $root |
  Where-Object { $_.FullName -notmatch '\\(Doc|Logs|\.rag|build|\.git|modules)\\' }

# 1) namespace declarations
$files | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $c2 = $c `
    -replace '(?m)^namespace fft_processor\s*\{','namespace dsp::spectrum {' `
    -replace '(?m)^namespace filters\s*\{','namespace dsp::spectrum {' `
    -replace '(?m)^namespace lch_farrow\s*\{','namespace dsp::spectrum {'
  if ($c -ne $c2) { Set-Content -Path $_.FullName -Value $c2 -NoNewline }
}

# 2) using namespace
$files | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $c2 = $c `
    -replace 'using namespace fft_processor;','using namespace dsp::spectrum;' `
    -replace 'using namespace filters;','using namespace dsp::spectrum;' `
    -replace 'using namespace lch_farrow;','using namespace dsp::spectrum;'
  if ($c -ne $c2) { Set-Content -Path $_.FullName -Value $c2 -NoNewline }
}

# 3) closing comments (косметика)
$files | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $c2 = $c `
    -replace '}\s*//\s*namespace (fft_processor|filters|lch_farrow)','} // namespace dsp::spectrum' `
    -replace '}\s*//\s*(fft_processor|filters|lch_farrow)\s*$','} // dsp::spectrum'
  if ($c -ne $c2) { Set-Content -Path $_.FullName -Value $c2 -NoNewline }
}

# Проверка — что осталось
Get-ChildItem -Recurse -Include *.hpp,*.cpp,*.hip -Path $root |
  Where-Object { $_.FullName -notmatch '\\(Doc|Logs|\.rag|build|\.git|modules)\\' } |
  Select-String -Pattern '(namespace|using namespace)\s+(fft_processor|filters|lch_farrow)' |
  Select-Object Path, LineNumber, Line
```

## Команды для Phase 2 (после Phase 1 commit'а)

```powershell
cd e:\DSP-GPU\spectrum
mkdir include\dsp -Force
git mv include\spectrum include\dsp\spectrum

# обновить все #include <spectrum/...> → <dsp/spectrum/...> и "spectrum/..." → "dsp/spectrum/..."
$files = Get-ChildItem -Recurse -Include *.hpp,*.cpp,*.hip -Path e:\DSP-GPU\spectrum |
  Where-Object { $_.FullName -notmatch '\\(Doc|Logs|\.rag|build|\.git|modules)\\' }

$files | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  $c2 = $c -replace '#include\s+([<"])spectrum/','#include $1dsp/spectrum/'
  if ($c -ne $c2) { Set-Content -Path $_.FullName -Value $c2 -NoNewline }
}

# Проверка
Select-String -Path e:\DSP-GPU\spectrum -Pattern '#include\s+[<"]spectrum/' -Include *.hpp,*.cpp,*.hip -Recurse |
  Where-Object { $_.Path -notmatch '\\(Doc|Logs|\.rag|build|modules)\\' }
```

---

## Rollback план

Каждая Phase = отдельный коммит. Откат:
- Phase 1 failure: `git reset --hard <pre-phase-1-commit>`.
- Phase 2 failure: `git reset --hard <post-phase-1-commit>`.
- Phase 4 build/test failure на Debian: оставить как is, разобрать конкретные ошибки.

---

## Связанные файлы и правила

- Триггер таска: `MemoryBank/.future/TASK_namespace_migration_legacy_to_dsp.md`
- Целевое состояние: `.claude/rules/10-modules.md`, `.claude/rules/05-architecture-ref03.md`
- CMake правила: `.claude/rules/12-cmake-build.md`
- Pybind правила: `.claude/rules/11-python-bindings.md`
- Тесты: `.claude/rules/15-cpp-testing.md`

---

## Acceptance criteria (полные)

- [ ] Все `*.hpp` / `*.cpp` / `*.hip` в `spectrum/` (кроме Doc/Logs/.rag) используют `namespace dsp::spectrum`.
- [ ] `0` упоминаний `namespace fft_processor` / `filters` / `lch_farrow` в исходниках spectrum.
- [ ] `include/spectrum/` физически перемещена в `include/dsp/spectrum/`.
- [ ] Все `#include <spectrum/...>` внутри spectrum заменены на `<dsp/spectrum/...>`.
- [ ] `cmake --build` проходит на Debian preset `debian-local-dev`.
- [ ] C++ тесты в `spectrum/tests/` PASS.
- [ ] `DSP/Python/integration/t_signal_to_spectrum.py` + `t_hybrid_backend.py` PASS.
- [ ] `radar/`, `strategies/`, `heterodyne/`, `linalg/` собираются **без правок**.
- [ ] Pybind `import dsp_spectrum; dsp_spectrum.FFTProcessorROCm(ctx)` работает.
- [ ] (Phase 5) `_RAG.md` теги + golden_set + `.rag/test_params/*.md` обновлены.

---

## Следующие шаги после spectrum (по таску `.future/`)

| # | Репо | legacy namespace | target | Estimate |
|---|------|------------------|--------|----------|
| 1 | ✅ **spectrum** | fft_processor/filters/lch_farrow | dsp::spectrum | 4-6 ч (эта спека) |
| 2 | stats | statistics, snr_estimator | dsp::stats | 2-3 ч |
| 3 | signal_generators | signal_gen, form_signal | dsp::signal_generators | 2-3 ч |
| 4 | heterodyne | heterodyne | dsp::heterodyne | 1-2 ч |
| 5 | linalg | vector_algebra, capon | dsp::linalg | 3-4 ч |
| 6 | radar | range_angle, fm_correlator | dsp::radar | 3-4 ч |
| 7 | strategies | strategies | dsp::strategies | 1-2 ч |

Итого: **16-24 ч** на 7 модулей. Spectrum — **самый большой**; если этот план пройдёт чисто, остальные пойдут быстрее по тому же шаблону.

---

*Created: 2026-05-12 by Кодо (Windows-сессия, без правок кода). Используется для Phase 1-4 выполнения на следующих сессиях.*
