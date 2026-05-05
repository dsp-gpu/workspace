# Doxygen-Filler Agent — стандарт

> **Статус**: финальный · **Версия**: 1.0 · **Дата**: 2026-05-01
>
> Агент `doxytags` обходит репо проекта DSP-GPU и для каждого публичного
> метода в `.hpp`/`.h`:
> 1. Если doxygen-блока **нет** — генерирует полный (`@brief`/`@param`/`@return`/`@throws` + `@test*` теги).
> 2. Если doxygen **есть** — НЕ портит существующее, только дописывает чего не хватает.
>
> Цель — подготовить базу для автогенерации тестов (см. `09_RAG_md_Spec.md`)
> и собрать дополнительный материал для обучения локальной ИИ.

---

## 1. Что обходит

Включает:
- `<repo>/include/<repo>/**/*.hpp`
- `<repo>/include/<repo>/**/*.h`

Исключает:
- `<repo>/tests/`, `<repo>/Doc/`, `<repo>/.rag/`
- файлы помеченные `@private` или `// internal:` маркером
- анонимные namespace
- не-public методы (`private:` / `protected:`)
- тривиальные методы: 1-строчные getter/setter, ctor/dtor без параметров, `operator=` с `default`/`delete`
- `.cpp` файлы (только декларации в `.hpp`/`.h`)

---

## 2. CLI

```
dsp-asst doxytags fill --all                              # все 9 репо
dsp-asst doxytags fill --repo spectrum                    # один репо
dsp-asst doxytags fill --file <abs-path-to-hpp>           # один файл
dsp-asst doxytags fill --method <FQN-or-name>             # один метод
```

| Флаг | Действие |
|---|---|
| `--dry-run` (alias `--preview`) | показать diff, ничего не писать |
| `--allow-dirty` | разрешить запуск на «грязном» репо (см. §6) |
| `--strict` | падать при первой ошибке (по умолчанию — пропускать с warning) |
| `--max-files N` | ограничить N файлов (smoke) |
| `--only-missing` | трогать только методы без doxygen вообще |
| `--no-test-tags` | без `@test*` (только `@brief`/`@param`/`@return`/`@throws`) |
| `--overload <index\|hash>` | при неоднозначности `--method` — выбрать конкретную перегрузку |
| `--all-overloads` | обработать все перегрузки одного имени (default behaviour) |

### 2.1 Disambiguation перегрузок

`--method ProcessComplex` для класса `FFTProcessorROCm` найдёт **2 перегрузки**:
- `ProcessComplex(const std::vector<...>& data, ...)` — CPU input
- `ProcessComplex(void* gpu_data, ...)` — GPU input

**Поведение по умолчанию (`--all-overloads`)**: агент обрабатывает обе перегрузки.
Выбор конкретной — через `--overload`:

```bash
# По индексу (порядок объявления в hpp, начиная с 0):
dsp-asst doxytags fill --method ProcessComplex --overload 0     # CPU input

# По хэшу сигнатуры (для скриптов — стабилен между запусками):
dsp-asst doxytags fill --method ProcessComplex --overload a7f3c1
```

Хэш = `blake3(нормализованная сигнатура)[:6]`. Печатается в выводе `--dry-run` рядом с каждой перегрузкой.

---

## 3. Алгоритм

```
1. Pre-flight:
   - git status в каждом репо (см. §6)
   - проверка Postgres + Ollama
2. Для каждого .hpp/.h:
   - tree-sitter parse → public-методы с координатами
   - для каждого метода:
       a. найти doxygen-блок над декларацией
       b. распарсить теги
       c. сравнить с required: @brief, @param на каждый аргумент,
          @return (если non-void), @throws (если в теле есть throw), @test*
       d. вызвать LLM с (сигнатура, текущий doxygen, эвристики §5)
       e. получить только новые строки
3. Применение:
   - --dry-run: вывести unified diff
   - иначе: <file>.bak → in-place patch → tree-sitter re-validate
   - откат из .bak если файл сломался
4. После:
   - НЕ коммитить автоматически
   - вывести summary
```

---

## 4. Правила «не портить»

1. Не переписывать существующие строки. Только вставлять новые.
2. Не менять текст `@brief`, `@param`, `@note`, `@see`, `@warning`, `@deprecated`.
3. Не трогать `//` и `/* */` комментарии (только doxygen `/** */` и `///`).
4. Не менять отступы — подражать стилю файла.
5. Не менять расположение `*/`.
6. Если блок в стиле `///` — добавлять в том же стиле.

Разрешено:
- Добавлять отсутствующие `@param`, `@return`, `@throws`, `@tparam` после имеющихся, перед `*/`.
- Добавлять `@test`/`@test_field`/`@test_ref`/`@test_check` теги.
- Дополнять `@brief` только если его нет.

---

## 5. Доменные эвристики

Системный промпт `prompts/009_test_params_extract.md`. Базовая таблица:

| Имя параметра | Тип | Предложение `@test` | `error_values` |
|---|---|---|---|
| `beam_count`, `n_beams`, `n_antennas`, `antenna_count` | `uint32_t`/`size_t` | `range=[1..50000], value=128, unit="лучей"` | `[-1, 100000, 3.14]` |
| `n_point`, `sample_count`, `n_samples` | `uint32_t`/`size_t` | `range=[100..1300000], value=6000` | `[-1, 2000000, 3.14]` |
| `n_fft`, `fft_size` | `size_t` | `range=[8..4194304], value=1024, pattern=power_of_2` | `[7, 5000000, 3.14]` |
| `sample_rate`, `fs` | `float` | `range=[1.0..1e9], value=10e6, unit="Гц"` | `[0.0, 2e9, null]` |
| `gpu_id`, `device_id` | `int` | `range=[0..GetDeviceCount()-1], value=0` | `[-1, GetDeviceCount(), 3.14]` |
| `repeat_count`, `padding_factor` | `uint32_t` | `range=[1..16], value=1` | `[0, 100, 3.14]` |
| `memory_limit` | `float` | `range=[0.1..0.95], value=0.80, unit="доля VRAM"` | `[0.0, 1.1, null]` |
| `dt`, `period` | `float`/`double` | `range=[1e-9..1e-3], value=1e-6, unit="с"` | `[0.0, 1.0, null]` |
| `*_ptr`, `*_data` (`void*`) | `void*` | `pattern=gpu_pointer, values=["valid_alloc", nullptr]` | `[0xDEADBEEF, null]` |
| `const T&`, `T` — struct с `@test` тегами | struct | `@test_ref T` | — (не применяется) |

Если имя не узнано → AI ставит `@test { TODO: human }`, метод помечается `coverage: partial`, тест не генерируется до правки руками.

---

### 5.1 Правила генерации `error_values`

Поле добавляется **только** в `@test` теги содержащие `range=[...]` или pointer-паттерн (`values=[..., nullptr]`).
К `@test_ref` и `@test_check` — **не применяется**.

| Условие | `below` (ниже min) | `above` (выше max) | `type_error` |
|---|---|---|---|
| `range=[min..max]`, int/uint | `min - 1` (если min=0 → `-1`) | `max + 1` (или очевидно большое) | `3.14` |
| `range=[min..max]`, float/double | `0.0` (или `min - epsilon`) | очевидно выше max | `null` |
| pointer: `values=[..., nullptr]` | `0xDEADBEEF` | `null` | — |

Если граница `max` — выражение (`GetDeviceCount()`), агент ставит вызов как есть:
```
error_values=[-1, GetDeviceCount(), 3.14]
```

Итоговый формат в теге:
```
@test { range=[8..4194304], value=1024, pattern=power_of_2, error_values=[7, 5000000, 3.14] }
```

---

### 5.2 Эвристика: типы параметров БЕЗ `error_values`

> Добавлено по итогам Phase 0 audit RAG-агентов (2026-05-05). См. `RAG_Phase0_error_values_audit_2026-05-05.md` + ревью v2.1 §«Phase 0 audit».

Для следующих типов параметров `error_values` **НЕ предлагается**:

| Тип | Причина | Пример |
|---|---|---|
| **enum / enum class** | Передача невалидного значения `(EnumType)999` — UB в C++. Компилятор не пускает мусор в обычном коде; unit-тест на UB бессмысленен. | `WindowType`, `BackendType`, `MovingAverageType`, `PeakMode`, `FFTOutputMode` |
| **bool** | Тип имеет ровно 2 валидных значения (`true`/`false`). Невалидного состояния не существует. Если нужен «отсутствующий» — используется `std::optional<bool>` (другой случай). | `bool squared`, `bool enabled` |
| **JSON-путь (string)** | Решение Alex'а 2026-05-05: пока не дозаполняем. Можно пересмотреть позже — тогда стандартный набор `["/no/such/file.json", "", "/tmp/malformed.json", null]`. | `json_path`, путь к `FilterConfig::LoadJson` |

**Поведение агента**:
- Для enum/bool параметров `@test` тег содержит только `values=[...]`, **без** `error_values`.
- Для JSON-путей — то же самое (пока).
- Для всех остальных типов (int/size_t с диапазоном, float, pointer, string не-JSON) — стандартные правила §5.1 применяются.

**Реализация** (TODO для следующего таска):
- `dsp_assistant/agent_doxytags/heuristics.py` — добавить функцию `should_skip_error_values(param_type: str) -> bool`.
- Промпт `prompts/009_test_params_extract.md` — отразить правило в инструкциях LLM (если промпт ещё не создан — создать вместе с правкой `heuristics.py`).
- Pointer-правка #2 (`spectrum_processor_factory.hpp:57`) применяется в этом же коммите (Doxygen-комментарий, на код не влияет).

---

## 6. Git check

Перед началом агент в каждом затрагиваемом репо делает `git status --porcelain`.

- Незакоммиченные правки **в файлах которые агент собирается трогать** → ОТКАЗ.
- Незакоммиченные правки **в других файлах** → пропускаем (с warning).
- `--allow-dirty` → пропустить проверку.

Агент **не коммитит сам**. Создаёт diff, человек смотрит и коммитит.

---

## 7. Профилирование — `@autoprofile`

Тег для GPU-классов, означает «нужен бенчмарк через `drv_gpu_lib::GpuBenchmarkBase`».
Полная спецификация — `09_RAG_md_Spec.md` §7.5.

> ⚠️ **Версия 2 алгоритма (с 2026-05-03)**. Старая формулировка «GPU-класс без `@autoprofile` → НЕ добавляет тег автоматически» — **отменена**. Новый алгоритм — два режима, описаны ниже. Контекст решения: `MemoryBank/specs/Review_LLM_RAG_specs_2026-05-03.md` §9.2.

### 7.1 Два режима работы агента

#### Режим 1 — создание нового модуля AI по запросу Alex'а

Применяется когда **программист просит AI создать новый класс/метод**:
```
1. Класс считает на GPU? (использует hip/*, hipfft/*, rocblas/*, BufferSet, GpuContext)
   ├── НЕТ → @autoprofile НЕ ставится (тег для CPU-only классов запрещён)
   └── ДА  → 2. Alex явно просил профилирование?
              ├── ДА  → @autoprofile { enabled: true, warmup: 5, runs: 20, target_method: ... }
              └── НЕТ → @autoprofile { enabled: false } (placeholder для будущего)
```

#### Режим 2 — массовая расстановка doxygen агентом `doxytags fill --all`

Применяется когда **агент проходит по всем существующим репо**:
```
1. Класс считает на GPU? (детект по include hip*/rocm*, наличие BufferSet/GpuContext, kernels/*.hip)
   ├── НЕТ → @autoprofile НЕ ставится
   └── ДА  → 2. Уже есть benchmark-класс для этого class_fqn? (Вариант A детект)
              Признак: существует <repo>/tests/<Class>_benchmark*.hpp
              ИЛИ файл с классом-наследником drv_gpu_lib::GpuBenchmarkBase для этого class_fqn.
              ├── ДА  → @autoprofile { enabled: true, target_method: <existing>, warmup, runs }
              │        ⚠️ Защита от дублей: проверить что НЕТ ДРУГОГО benchmark-класса
              │        для того же class_fqn (manifest refresh не должен генерить второй).
              │        Если найдено >1 — warning, agent НЕ ставит true и спрашивает Alex.
              └── НЕТ → @autoprofile { enabled: false } (placeholder, программист включит руками)
```

### 7.2 Детект «считает на GPU»

GPU-класс — если **любой** из признаков:
- `#include <hip/hip_runtime.h>` или `<hipfft/hipfft.h>` или `<rocblas/...>` или `<rocprim/...>` в его hpp/cpp.
- В членах класса есть `drv_gpu_lib::BufferSet<N>`, `drv_gpu_lib::GpuContext`, `hipfftHandle`, `hipStream_t`, `IBackend*`.
- В директории репо есть `kernels/rocm/*.hip` и класс упоминает их kernel-имена.

Иначе — CPU-only.

### 7.3 Детект «уже есть benchmark» (Вариант A — согласовано с Alex 2026-05-03)

```python
def has_existing_benchmark(class_fqn: str, repo_root: Path) -> bool:
    """
    True если для class_fqn уже существует benchmark-класс наследник GpuBenchmarkBase.
    Источник правды — файлы <repo>/tests/*benchmark*.hpp.
    """
    candidates = list((repo_root / "tests").glob("*benchmark*.hpp"))
    for f in candidates:
        text = f.read_text()
        # Проверка 1: наследование от GpuBenchmarkBase
        if "GpuBenchmarkBase" not in text:
            continue
        # Проверка 2: упоминание class_fqn (или его последнего сегмента)
        class_short = class_fqn.split("::")[-1]
        if class_short in text:
            return True
    return False
```

Альтернатива B (наличие `ROCmProfEvents*` в API) — **не используется**, она шире чем «бенчмарк есть».

### 7.4 Параметры `@autoprofile { ... }`

| Ключ | Тип | Default | Зачем |
|---|---|---|---|
| `enabled` | bool | `false` | Включает генерацию `tests/auto/<ns>_<Class>_benchmark.hpp` |
| `warmup` | int | `5` | Кол-во warm-up запусков (не учитываются в статистике) |
| `runs` | int | `20` | Кол-во измеряемых запусков |
| `target_method` | str | `""` | Какой метод бенчмарчить (имя). Пусто = первый Process*. |

Если `enabled: false` — остальные параметры игнорируются (ставится placeholder).

### 7.5 Что агент `doxytags` НЕ делает

- Не генерирует файл `<repo>/tests/auto/<ns>_<Class>_benchmark.hpp` — это задача `manifest refresh`.
- Не сравнивает прогоны производительности (это weekly cron — см. 09 §7.5).
- Не интерпретирует параметры внутри тега для регрессий — только зеркалит в YAML.
- Не **меняет** существующий `@autoprofile` тег (как любой существующий — см. §4).

### 7.6 Edge cases

| Ситуация | Что делает агент |
|---|---|
| Существующий `@autoprofile { ... }` в doxygen | Не трогает (как любой существующий тег) |
| CPU-only класс с `@autoprofile` (legacy ошибка) | Warning «autoprofile применим только к GPU-классам», не правит |
| Несколько benchmark-файлов для одного class_fqn | Warning, ставит `@autoprofile { enabled: false }` + комментарий «дубликат бенчмарка, см. <files>» |
| `@autoprofile` на методе vs на классе | Агент сохраняет уровень как написано (метод → метод, класс → класс) |
| GPU-класс без benchmark файла | Ставит `@autoprofile { enabled: false }` placeholder с комментарием TODO |

---

## 8. Договорённости по форматированию

### 8.1 Язык doxygen

- На том же языке, что существующий `@brief` класса.
- Класс без doxygen → по дефолту русский.
- В одном файле могут быть блоки на разных языках (агент следует языку класса).

### 8.2 Перегрузки

- Каждая перегрузка — свой doxygen-блок.
- В `@brief` явное различие, например:
  - `@brief Прямой FFT C2C из CPU-вектора (с H2D copy).`
  - `@brief Прямой FFT C2C из GPU-буфера (без H2D).`

### 8.3 Шаблонные методы

- На каждый `template<typename T>` параметр — `@tparam T <описание>`.
- `@tparam` после `@brief`, перед `@param`'ами.

### 8.4 Константы и enum-значения

- Агент **не трогает** namespace-level константы, `enum`, `enum class`.
- Только методы (public-функции, методы класса, перегрузки, шаблонные методы).

---

## 9. Размещение кода агента

```
dsp_assistant/
├── agent_doxytags/
│   ├── __init__.py
│   ├── walker.py       ← обход репо/файлов
│   ├── extractor.py    ← tree-sitter → методы + текущий doxygen
│   ├── analyzer.py     ← что в doxygen есть/нет
│   ├── llm_filler.py   ← Qwen 8B → недостающие теги
│   ├── patcher.py      ← вставка строк + tree-sitter валидация после
│   ├── git_check.py    ← pre-flight git status
│   └── cli.py          ← dsp-asst doxytags ...
prompts/
└── 009_test_params_extract.md
```

CLI подключается в `cli/main.py` через `cli.add_command(doxytags_cmd)`.

---

## 10. Пример «до» / «после»

### Было (нет doxygen):
```cpp
std::vector<FFTComplexResult> ProcessComplex(
    const std::vector<std::complex<float>>& data,
    const FFTProcessorParams& params,
    ROCmProfEvents* prof_events = nullptr);
```

### Стало (`dsp-asst doxytags fill --method ProcessComplex`):
```cpp
/**
 * @brief Прямой FFT C2C для batch-данных с CPU.
 * @details H2D → pad → hipfftExecC2C → D2H.
 *
 * @param data Входные данные batch'ем [beam_count × n_point] complex<float>.
 *   @test { size=[100..1300000], value=6000, step=10000, unit="complex samples", error_values=[-1, 2000000, 3.14] }
 *
 * @param params Конфиг FFT (см. fft_params.hpp).
 *   @test_ref FFTProcessorParams
 *
 * @param prof_events Профиль (опционально).
 *   @test { values=[nullptr], error_values=[0xDEADBEEF, null] }
 *
 * @return Массив [beam_count] результатов; magnitudes[nFFT] и phases[nFFT].
 *   @test_check result.size() == params.beam_count
 *   @test_check result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
 *
 * @throws std::invalid_argument когда n_point == 0
 *   @test_check throws on params.n_point=0
 * @throws hipError_t на GPU OOM
 *   @test_check throws on beam_count*nFFT*8*4 > VRAM*memory_limit
 */
std::vector<FFTComplexResult> ProcessComplex(
    const std::vector<std::complex<float>>& data,
    const FFTProcessorParams& params,
    ROCmProfEvents* prof_events = nullptr);
```

### Если doxygen уже частично есть:
```cpp
/**
 * @brief Прямой FFT C2C для batch-данных с CPU.       ← НЕ тронуто
 * @param data Входные данные.                          ← НЕ тронуто
 *   @test { size=[100..1300000], value=6000, step=10000, unit="complex samples", error_values=[-1, 2000000, 3.14] }   ← добавлено
 *
 * @param params Конфиг FFT (см. fft_params.hpp).      ← добавлено
 *   @test_ref FFTProcessorParams
 *
 * @param prof_events Профиль (опционально).            ← добавлено
 *   @test { values=[nullptr], error_values=[0xDEADBEEF, null] }
 *
 * @return Массив [beam_count] результатов.             ← добавлено
 *   @test_check result.size() == params.beam_count
 *   @test_check result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
 *
 * @throws std::invalid_argument когда n_point == 0   ← добавлено
 *   @test_check throws on params.n_point=0
 */
```

> ⚠️ **Маркеры `← НЕ тронуто` / `← добавлено` — только для иллюстрации в этой спеке.**
> В реальном выводе агента `doxytags` их **нет**. Агент пишет чистый doxygen без аннотаций.
> Diff в `--dry-run` показывает изменения через `+` / `-` префиксы (стандартный unified diff).

---

## 11. Поэтапный план реализации

| # | Шаг | Время |
|---|---|---|
| 1 | `extractor.py` — tree-sitter парсер public-методов + существующего doxygen | 1.5 ч |
| 2 | `analyzer.py` — diff между «есть» и «надо» | 1 ч |
| 3 | `git_check.py` — pre-flight | 30 мин |
| 4 | `prompts/009_test_params_extract.md` — системный промпт + эвристики | 1 ч |
| 5 | `llm_filler.py` — Qwen вызов с тремя контекстами | 1.5 ч |
| 6 | `patcher.py` — вставка + tree-sitter валидация | 1 ч |
| 7 | `walker.py` + CLI | 1 ч |
| 8 | Smoke на одном методе `ProcessComplex` | 30 мин |
| 9 | Прогон на `fft_processor_rocm.hpp` (весь файл) | 30 мин |
| 10 | Прогон на всех `spectrum` (~30 файлов, --dry-run) | 1 ч |
| 11 | Алекс смотрит diff, правит эвристики в промпте | твои руки |
| 12 | Раскатка на 8 остальных репо | 30 мин кода + 2-4 ч твоих рук |

**Итого**: ~10 ч кода + 3-5 ч ручной приёмки.

---

*Конец стандарта v1.0.*
