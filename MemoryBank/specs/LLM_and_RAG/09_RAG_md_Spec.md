# RAG-документация репо — стандарт

> **Статус**: финальный · **Версия**: 1.0 · **Дата**: 2026-05-01
>
> Стандарт описывает структуру каталога `<repo>/.rag/`, формат файлов
> `_RAG.md` и `<namespace>_<ClassName>.md`, doxygen-теги `@test*` в коде
> и автоматизацию (CLI, pre-commit, weekly cron).

---

## 1. Структура каталога в каждом репо

```
<repo>/
├── .rag/                                              ← новый каталог в репо
│   ├── _RAG.md                                        ← главный манифест репо
│   ├── _RAG_repo_overview.md                          ← (опц.) расширенный обзор
│   ├── _RAG_changelog.md                              ← (опц.) история изменений RAG
│   └── test_params/                                   ← один файл = один класс
│       ├── fft_processor_FFTProcessorROCm.md
│       ├── fft_processor_AllMaximaPipelineROCm.md
│       ├── filters_FirFilterROCm.md
│       ├── filters_KalmanFilterROCm.md
│       └── lch_farrow_LchFarrowROCm.md
└── ...
```

**Правила имени файла класса**: `<namespace>_<ClassName>.md`, где `<namespace>` —
последний сегмент namespace (для `dsp::fft_processor::FFTProcessorROCm` →
`fft_processor_FFTProcessorROCm.md`).

> **Примечание (legacy namespace, 2026-05-03):** часть классов DSP-GPU сейчас лежит в
> legacy-namespace (`fft_processor::*`, `filters::*`, `vector_algebra::*`, `range_angle::*`,
> `fm_correlator::*`, `statistics::*`, `signal_gen::*`). Целевое состояние по правилу
> `10-modules.md` — `dsp::<repo>::*`. Пока миграция не выполнена, RAG использует **реальный
> текущий namespace** из кода. После миграции (см.
> `MemoryBank/.future/TASK_namespace_migration_legacy_to_dsp.md`) формула именования файла
> станет `<repo>_<ClassName>.md` (без двойного указания).

---

## 2. Расшифровки

### 2.1 `layer`

| layer | Что значит | Репо |
|---|---|---|
| **core** | Фундамент. Управляет железом (GPU backend, kernels, memory, profiler). Не зависит от других compute-репо. | `core` |
| **compute** | Вычислительные DSP-модули. Зависят только от `core`. | `spectrum`, `stats`, `signal_generators`, `heterodyne`, `linalg`, `radar` |
| **composer** | Собирают pipelines из compute-модулей. | `strategies` |
| **meta** | Не код, а инфраструктура — Python-API, мета-проект, тесты. | `DSP`, `workspace` |

### 2.2 `maturity`

| maturity | Признаки |
|---|---|
| **stable** | Production. API заморожен. Покрытие тестами ≥80%. `human_verified: true` для всех ключевых методов. |
| **beta** | Функциональность есть, API ещё может меняться. Тесты есть, но не везде. |
| **experimental** | Прототип. Может быть удалён или переписан. Минимум тестов. |
| **deprecated** | Замена есть, удалится в следующем major. AI не рекомендует при поиске. |

---

## 3. `_RAG.md` — главный манифест репо

YAML-frontmatter + краткий markdown ниже.

```yaml
---
schema_version: 1
repo: spectrum
version: 2.1.0
layer: compute
maturity: stable
purpose: "FFT + фильтры + LCH Farrow на ROCm"

modules:
  public:                               # auto: include/<repo>/*
    - fft_processor
    - filters
    - lch_farrow
  internal:                             # auto: src/* кроме include
    - kernels

key_classes:                            # auto: БД symbols + AI brief
  - fqn: fft_processor::FFTProcessorROCm
    brief: "Обёртка hipFFT для C2C/R2C FFT"
    maturity: stable
    test_params: test_params/fft_processor_FFTProcessorROCm.md
  - fqn: filters::FirFilterROCm
    brief: "FIR на GPU"
    maturity: stable
    test_params: test_params/filters_FirFilterROCm.md
  - fqn: filters::KalmanFilterROCm
    brief: "Калман-фильтр на GPU"
    maturity: beta
    test_params: test_params/filters_KalmanFilterROCm.md

public_data:
  constants:                            # значения в комментариях для аудита
    - { fqn: filters::DEFAULT_FIR_TAPS,     value: "10",   type: "uint32_t", in_file: "filters/fir_filter_rocm.hpp:24" }
    - { fqn: fft_processor::MAX_BATCH_SIZE, value: "1024", type: "size_t",   in_file: "fft_processor/fft_processor_rocm.hpp:18" }
  enums:
    - filters::FilterMode
    - fft_processor::FftDirection

depends_on:
  internal: [core]                      # auto: includes из БД
  external: [hipFFT, hipBLAS]           # вручную

used_by: [radar, strategies]

python_modules: [dsp_spectrum]          # auto: pybind_bindings

test_params_summary:
  total_classes: 5
  total_methods: 47
  ready_for_autotest: 12
  partial_coverage: 8
  no_tags: 27

tags: [fft, filters, lch-farrow, hipfft, dsp, gpu, rocm]

notes:
  - "FFTProcessorROCm требует SetGpuId до первого Process"
  - "MovingAverageFilter медленнее IIR при N>32"

ai_generated_at: 2026-05-01T12:00:00Z
ai_model: qwen3:8b
ai_sections: [key_classes.brief, tags, notes]
---

# spectrum

## Назначение
FFT (через hipFFT), фильтры (FIR, IIR, Kalman, MovingAverage), фракционная задержка LCH Farrow.

## Ключевые классы
*(автогенерируется из YAML key_classes выше)*

## Дополнительная документация
- [../Doc/API.md](../Doc/API.md)
- [../Doc/Full.md](../Doc/Full.md)
```

---

## 4. `<namespace>_<ClassName>.md` — карточка класса

**Один файл = один класс**. Все public-методы класса в одном файле.

### 4.1 Frontmatter

```yaml
---
schema_version: 1
repo: spectrum
class_fqn: fft_processor::FFTProcessorROCm
file: include/spectrum/fft_processor_rocm.hpp
line: 53
brief: "Layer-6 фасад для batch-FFT через hipFFT + hiprtc kernels"
maturity: stable

methods_total: 14
methods_ready: 1
methods_partial: 0
methods_no_tags: 13

ai_generated_at: 2026-05-01T20:00:00Z
ai_model: qwen3:8b
parser_version: 1
---
```

### 4.2 Структура тела

```markdown
# fft_processor::FFTProcessorROCm

## Описание класса
*(блок в стиле ЧТО/ЗАЧЕМ/ПОЧЕМУ/ИСПОЛЬЗОВАНИЕ/ИСТОРИЯ из шапки .hpp)*

## Method 1: ProcessComplex (CPU input) ✅ ready
*(полный YAML-блок: signature, params с @test, return_checks, expected_throws, coverage)*

## Method 2: ProcessComplex (GPU input) ⏸ skipped (no @test tags)
*(минимальный stub с сигнатурой)*

## Method 3: ProcessMagPhase (CPU input) ⏸ skipped
...

## Method 14: GetGpuContext ⏸ skipped (trivial getter)
```

Smoke-тесты, negative-тесты и stress-тесты **генерируются автоматически** в
`<repo>/tests/auto/` из `coverage: ready_for_autotest` методов.

---

## 5. Doxygen `@test`-теги в коде

Источник правды для тест-параметров — теги в `.hpp` файлах. YAML в `.rag/` — производный.

### 5.1 Список тегов

| Тег | Применяется к | Что описывает |
|---|---|---|
| `@test` | `@param` или поле struct'а | диапазоны, дефолты, шаги, паттерны для одного значения |
| `@test_field <name>` | `@param` со struct-типом | то же, для подпараметра внутри |
| `@test_ref <Type>` | `@param` со struct-типом | сослаться на описание `@test` полей этого `<Type>` (без дублирования) |
| `@test_check <expr>` | `@return` или `@throws` | что проверять (assert) |

### 5.2 Ключи внутри `{...}`

| Ключ | Тип | Пример | Зачем |
|---|---|---|---|
| `range=[min..max]` | пара | `range=[100..1300000]` | физический диапазон |
| `value=X` | one | `value=6000` | дефолт для smoke-теста |
| `values=[a,b,c]` | list | `values=[1024,4096,16384]` | конкретные значения |
| `step=N` | int | `step=10000` | шаг при переборе |
| `step=2^n n=[a..b]` | formula | `step=2^n n=[3..22]` | формула с переменной n |
| `pattern=P` | enum | `pattern=power_of_2` | мат. ограничение |
| `unit="..."` | string | `unit="Гц"` | единица |
| `boundary=[low,high]` | pair | `boundary=[8,4194304]` | крайние случаи |
| `depends=[other]` | list | `depends=[beam_count]` | связь параметров |
| `formula="..."` | string | `formula="data.size() == beam_count * n_point"` | связь формулой |

`pattern` поддерживает: `power_of_2`, `prime`, `even`, `odd`, `int`, `float`, `any`, `gpu_pointer`.

### 5.3 Описание struct один раз — `@test` на полях

Чтобы не плодить дублирование, описание полей struct'а живёт **в его файле**:

```cpp
// fft_params.hpp
struct FFTProcessorParams {
    /** @test { range=[1..50000], value=128, unit="лучей" } */
    uint32_t beam_count = 1;

    /** @test { range=[100..1300000], value=6000, pattern=any } */
    uint32_t n_point = 0;

    /** @test { range=[1.0..1e9], value=10e6, unit="Гц" } */
    float sample_rate = 1000.0f;

    /** @test { range=[1..16], value=1 } */
    uint32_t repeat_count = 1;

    /** @test { range=[0.1..0.95], value=0.80, unit="доля VRAM" } */
    float memory_limit = 0.80f;
};
```

В методах ссылаемся через `@test_ref`:

```cpp
// fft_processor_rocm.hpp
/**
 * @brief Прямой FFT C2C для batch-данных с CPU.
 *
 * @param data Входные данные.
 *   @test { size=[100..1300000], value=6000, step=10000, unit="complex samples" }
 *
 * @param params Конфиг FFT.
 *   @test_ref FFTProcessorParams
 *
 * @param prof_events Профиль (опционально).
 *   @test { values=[nullptr] }
 *
 * @return Массив [beam_count] результатов.
 *   @test_check result.size() == params.beam_count
 *   @test_check result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
 *
 * @throws std::invalid_argument когда n_point == 0
 *   @test_check throws on params.n_point=0
 * @throws std::runtime_error на GPU OOM (hipError_t hipErrorOutOfMemory обёрнут)
 *   @test_check throws on beam_count*nFFT*8*4 > VRAM*memory_limit
 */
std::vector<FFTComplexResult> ProcessComplex(...);
```

Поменялся `FFTProcessorParams` → правишь **один раз** в `fft_params.hpp`,
все методы во всех классах подхватывают.

### 5.4 Правило «нет тега → нет автотеста»

```text
для каждого public-метода (исключая trivial: ctor/dtor/=delete/=default):
  parse_doxygen → собрать @test/@test_field/@test_ref/@test_check

  total_params      = число @param в doxygen
  params_with_tag   = число @param с @test/@test_ref/@test_field

  coverage_inputs   = (total_params == 0) ? 1.0 : params_with_tag / total_params

  has_return_check  = (return_void) OR (есть @test_check на @return)
  has_throw_check   = (no_throws_in_body) OR (есть @test_check на @throws)
  coverage_outputs  = has_return_check AND has_throw_check ? 1.0 : 0.0

  if coverage_inputs == 1.0 AND coverage_outputs == 1.0:
      status: ready_for_autotest   → AI генерирует тест-файл в tests/auto/
  elif coverage_inputs > 0 OR coverage_outputs > 0:
      status: partial              → попадает в карточку с заглушкой "TODO: @test missing on <param>"
                                      тест НЕ генерируется
  else:
      status: skipped              → попадает в карточку как stub с подсказкой
                                      "добавь @test/@test_check к параметрам в hpp"
                                      тест НЕ генерируется
```

**Уточнения:**

- **`void`-методы**: `has_return_check = true` всегда. Но рекомендуется добавлять
  `@test_check` на side-effect (например `@test_check magnitudes[0] == known_value`),
  иначе тест бессмысленен. Если нет ни `@test_check` на `@param`'ы (out-параметры),
  ни на side-effect — метод считается partial, а не ready.
- **Нулевое число `@param`**: getter / фабрика без аргументов → `coverage_inputs = 1.0`.
  Но getter обычно тривиален и фильтруется ранее (см. Spec 12 §1).
- **`skipped` методы попадают в карточку как stub** (согласовано с Alex 2026-05-03):
  показываем сигнатуру + строку `**Coverage**: 0% — добавь @test теги в hpp`. Это
  полезно человеку: видно «что добавить». Но `tests/auto/` для них **не генерируется**.
- **`partial` методы** — также попадают, с явным списком отсутствующих тегов.

---

## 6. Поля frontmatter — кто правит

| Поле | Источник |
|---|---|
| `repo`, `version`, `layer`, `maturity`, `purpose` | человек |
| `modules.public/internal` | auto: путь файлов |
| `key_classes.fqn`, `public_data.*` | auto: БД symbols |
| `key_classes.brief` | AI из doxy_brief, человек правит |
| `depends_on.internal` | auto: includes из БД |
| `depends_on.external` | человек |
| `python_modules` | auto: pybind_bindings |
| `tags` | AI, человек правит |
| `notes` | человек или AI из @note |
| Всё в `test_params/*.md` | auto из @test тегов в hpp |
| `ai_*` | auto |

Правило: если `human_verified: true` — AI не перезаписывает.

---

## 7. Стиль тестов и профилирования

### 7.1 Канонический стиль DSP-GPU (`gpu_test_utils::TestRunner`)

Текущий стиль проекта DSP-GPU (правило `15-cpp-testing.md`):

- Файл `<repo>/tests/test_<class>.hpp` (header-only).
- Namespace на класс: `namespace test_<class> { ... }`.
- Точка входа — `inline void run()`, создаёт `gpu_test_utils::TestRunner` и
  регистрирует кейсы через `runner.test(name, lambda)`.
- Каждый кейс возвращает `TestResult` (multi-check) или `ValidationResult` (single).
- Проверки складываются через `tr.add(ValidationResult{...})` или фабрики
  `PassResult(name)` / `FailResult(name, actual, expected, msg)`.
- Validators (Strategy) — `RelativeValidator(tol)`, `AbsoluteValidator(tol)`,
  `RmseValidator(tol)` — для сравнения с эталоном (NumPy/SciPy).
  ⚠️ Сейчас портируются из `GPUWorkLib` — см.
  `MemoryBank/tasks/TASK_validators_port_from_GPUWorkLib_2026-05-03.md`.
- Между тестами — явный `Reset*()` глобального состояния (singleton, кэш).
- Агрегация всех тестов репо — `all_test.hpp` → `RunAllSpectrumTests()`.
- Вывод — `ConsoleOutput::Print()`, **не** `std::cout`.

**AI-генератор по умолчанию использует именно этот стиль.**

```cpp
#include <core/test_utils/test_runner.hpp>
#include <core/test_utils/test_result.hpp>
#include <spectrum/fft_processor_rocm.hpp>

namespace test_fft_processor {

using namespace gpu_test_utils;
using namespace fft_processor;

inline void run() {
    int gpu_id = 0;
    drv_gpu_lib::ROCmBackend backend;
    backend.Initialize(gpu_id);

    TestRunner runner(&backend, "FFT ROCm", gpu_id);

    runner.test("process_complex_smoke", [&]() -> TestResult {
        TestResult tr{"process_complex_smoke"};

        FFTProcessorROCm proc(&backend);
        std::vector<std::complex<float>> data(6000);
        FFTProcessorParams params;
        params.beam_count = 128;
        params.n_point    = 6000;
        params.sample_rate = 10.0e6f;

        auto result = proc.ProcessComplex(data, params, nullptr);

        if (result.size() != 128u)
            return tr.add(FailResult("size",
                static_cast<double>(result.size()), 128.0));
        tr.add(PassResult("size", 128.0, 128.0));
        return tr;
    });

    runner.print_summary();
}

} // namespace test_fft_processor
```

Полный пример (smoke + negative + stress) — см.
`examples/fft_processor_FFTProcessorROCm.md` Method 1.

### 7.2 Lightweight C++ validator — портируется из GPUWorkLib

Хелперы (`MaxRelError/AbsError/RmseError/ScalarRelError`) и Validator-классы
(`RelativeValidator/AbsoluteValidator/RmseValidator`) уже есть в legacy
`E:\C++\GPUWorkLib\` (зеркальные C++ ↔ Python). Портирование — отдельная active
задача: `MemoryBank/tasks/TASK_validators_port_from_GPUWorkLib_2026-05-03.md`.

После портирования AI-генератор будет использовать их вместо ручного epsilon-сравнения:
```cpp
RelativeValidator v(1e-5);
tr.add(v.Validate(gpu_result, cpu_reference, "fft_magnitude"));
```

### 7.3 Google Test variant (отключено, see `.future/`)

Для проектов на GoogleTest (внешние закрытые проекты, будущие локации AI)
существует параллельный pipeline генерации в стиле `TEST(...) / ASSERT_* / EXPECT_THROW`.

В DSP-GPU (этот проект) — **выключено**, правило `15-cpp-testing.md` запрещает
GoogleTest. Реактивация — см. `MemoryBank/.future/TASK_gtest_variant_for_external_projects.md`
(триггер: «при копировании AI на новую локацию / приходе проекта на GTest»).

AI **не** добавляет блок `<details>Google Test variant</details>` в card по умолчанию.

---

## 7.5 Профилирование — `@autoprofile`

Признак того, что для класса/метода нужен **бенчмарк** через `drv_gpu_lib::GpuBenchmarkBase`.
По умолчанию **выключено**. Программист ставит руками.
Применяется только к **GPU-классам** (содержат include `hip/hip_runtime.h`,
`hipfft/hipfft.h`, `rocblas/rocblas.h` или `core/services/buffer_set.hpp`).
Для CPU-only классов тег игнорируется (warning).

### Расположение тега — два места

1. **В doxygen** в `.hpp`:
   ```cpp
   /**
    * @brief ...
    * @autoprofile { warmup=5, runs=20 }
    */
   ```
   На уровне класса (бенчмарк основного метода) или на конкретном методе.

2. **В YAML карточки класса** (`<repo>/.rag/test_params/<ns>_<Class>.md`):
   ```yaml
   autoprofile:
     enabled: true
     warmup: 5
     runs: 20
     target_method: ProcessComplex
     output_dir: "Results/Profiler"
   ```

При расхождении значений — **приоритет у YAML**.

### Что генерирует

Файл `<repo>/tests/auto/<ns>_<Class>_benchmark.hpp`:

```cpp
// auto-generated from @autoprofile. DO NOT EDIT — правь тег в hpp или YAML.
#pragma once

#include <core/services/gpu_benchmark_base.hpp>
#include <spectrum/fft_processor_rocm.hpp>

namespace bench_fft_processor {

class FFTProcessorBenchmark : public drv_gpu_lib::GpuBenchmarkBase {
public:
  FFTProcessorBenchmark(drv_gpu_lib::IBackend* backend)
    : GpuBenchmarkBase(backend, "FFTProcessorROCm"),
      proc_(backend) {
    // setup из @test_ref FFTProcessorParams (дефолтные значения)
    params_.beam_count   = 128;
    params_.n_point      = 6000;
    params_.sample_rate  = 10.0e6f;
    params_.repeat_count = 1;
    in_.assign(params_.beam_count * params_.n_point, {0.0f, 0.0f});
  }

protected:
  void ExecuteKernel() override {
    proc_.ProcessComplex(in_, params_, nullptr);
  }

  void ExecuteKernelTimed() override {
    drv_gpu_lib::ROCmProfilingData d{};
    // proc_.ProcessComplexTimed(in_, params_, d);   // если есть Timed-перегрузка
    proc_.ProcessComplex(in_, params_, nullptr);
    RecordROCmEvent("FFT_Execute", d);
  }

private:
  fft_processor::FFTProcessorROCm proc_;
  fft_processor::FFTProcessorParams params_;
  std::vector<std::complex<float>> in_;
};

} // namespace bench_fft_processor
```

Запускается так же как обычный бенчмарк:
```cpp
bench_fft_processor::FFTProcessorBenchmark b(backend);
b.Run();      // 5 warmup + 20 measured (из @autoprofile)
b.Report();   // PrintReport + Results/Profiler/*.{json,md}
```

### Регрессия производительности

Weekly cron `manifest refresh-all` сравнивает новый прогон с предыдущим
(`Results/Profiler/*.json`). Если медленнее на >10% — добавляет в `notes:`
главного `_RAG.md` запись `Performance regression: <method> slower by N%`.

---

## 8. JSON-Schema валидация

`E:/DSP-GPU/MemoryBank/specs/LLM_and_RAG/schemas/`:
- `_RAG.schema.json` — схема главного манифеста.
- `class_card.schema.json` — схема карточки класса.

CLI: `dsp-asst manifest check [--repo X | --all]` — валидация всех `.rag/*.md`.

VS Code подхватывает схему через директиву в YAML:
```yaml
# yaml-language-server: $schema=../../schemas/_RAG.schema.json
```

---

## 9. CLI

```
dsp-asst manifest init    --repo <X>     создать .rag/ из БД + AI + @test тегов
dsp-asst manifest check   [--all]        JSON-Schema валидация (после Phase A schemas)
dsp-asst manifest refresh [--repo <X>]   weekly: AI обновляет brief/tags/notes
                                          без --repo = все репо (используется в cron)
dsp-asst manifest sync    [--repo <X>]   .rag/ → таблица repos_meta в Postgres
```

> ⚠️ Подкоманда `manifest refresh-all` устарела — используй `manifest refresh` без `--repo`.

---

## 10. Pre-commit hook

`.git/hooks/pre-commit` (через `install_git_hooks.bat`):

- Если в коммите изменились файлы из `include/<repo>/*` или `src/*`:
  - проверить, что `.rag/_RAG.md` не старше 10 дней;
  - если старше → warning (не блокирует);
  - флаг `--strict` → fail (для CI).
- Если в коммите изменились публичные методы без `@test` тегов → warning.

---

## 11. Weekly cron (вторник 09:00)

**Linux (Stages 2+, primary)**:
```bash
echo "0 9 * * TUE /home/alex/.dsp_assistant/bin/dsp-asst manifest refresh" | crontab -
```

**Windows (Stage 1 home, Phase 1 пилот)**:
```powershell
schtasks /Create /TN "dsp-asst-manifest-refresh" `
  /TR "C:\finetune-env\.venv\Scripts\dsp-asst.exe manifest refresh" `
  /SC WEEKLY /D TUE /ST 09:00 /F
```

Что делает `manifest refresh` (без `--repo`):
1. Идёт по 9 репо.
2. На каждом — обновляет AI-секции (`key_classes.brief`, `tags`, `notes`).
3. Не трогает поля с `human_verified: true`.
4. Регенерирует `test_params/*.md` из актуальных `@test` тегов.

---

## 12. Tool `dsp_repo_overview` для агента

```python
def dsp_repo_overview(repo: str | None = None) -> ToolResult:
    """Без args — список всех репо проекта (имя, layer, purpose, tags).
    С args — полный _RAG.md этого репо + краткие SQL-факты."""
```

В промпте 008 добавляется: **«перед фильтром по `repo` сначала вызови
`dsp_repo_overview` без args»**.

---

## 13. Поэтапный план реализации

| # | Шаг | Время |
|---|---|---|
| 1 | JSON-Schema (`_RAG.schema.json`, `class_card.schema.json`) | 1 ч |
| 2 | Парсер doxygen `@test` тегов (`dsp_assistant/manifest/doxytags.py`) + юнит-тесты | 1.5 ч |
| 3 | CLI `dsp-asst manifest check / init / refresh / sync` | 2 ч |
| 4 | Pre-commit hook (расширение существующего) | 30 мин |
| 5 | Пилот на `spectrum` — сгенерировать `.rag/` | 1 ч |
| 6 | Алекс добавляет `@test` теги к 1-2 классам | 1 ч твоих рук |
| 7 | Прогон автогенерации тестов под `gpu_test_utils::TestRunner` | 1 ч |
| 8 | Tool `dsp_repo_overview` + правка промпта 008 | 30 мин |
| 9 | Раскатка на остальные 8 репо | 1 ч кода + 4 ч твоих рук |

**Итого**: ~9 ч кода + ~5 ч ручной правки.

---

*Конец стандарта v1.0.*
