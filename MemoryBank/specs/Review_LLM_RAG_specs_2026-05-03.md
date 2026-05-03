# Глубокое ревью: 09_RAG_md_Spec + 12_DoxyTags_Agent_Spec + examples/fft_processor_FFTProcessorROCm

> **Дата:** 2026-05-03 · **Ревьюер:** Кодо · **Версия спек:** обе v1.0 (финальные)
> **Метод:** Sequential review + сверка с реальным кодом (`spectrum/include/spectrum/fft_processor_rocm.hpp`,
> `core/test_utils/{test_runner,test_result}.hpp`, `core/include/core/services/gpu_benchmark_base.hpp`,
> spectrum/tests/test_fft_processor_rocm.hpp).
> **Связанные документы:** `00_Master_Plan_2026-04-30.md`, `Session_Handoff_2026-05-01.md`,
> `10_DataFlow_Visualization.md` (deprecated), `.claude/rules/{05,10,14,15}.md`.

---

## 0. TL;DR (вердикт)

| Спека | Статус | Комментарий |
|---|---|---|
| **09_RAG_md_Spec.md** | 🟡 **Условно ОК с правками** | Архитектура корректна. Внутренние противоречия (§7.1 vs §4.2 vs пример) и расхождения с реальным API ломают пилот. Schemas не созданы. |
| **12_DoxyTags_Agent_Spec.md** | 🟢 **ОК после минорных правок** | Алгоритм чистый, разделение ролей с 09 — ясное. Не покрыт disambiguation перегрузок и `void`-методы. |
| **examples/fft_processor_FFTProcessorROCm.md** | 🔴 **Переписать Method 1** | Использует **несуществующий API** (`ValidationResult::All/Eq/Throws<T>`). Внутренне противоречит §5.4 спеки 09. |

## от Alex  ValidationResult  можешь сослаться на эту работу будем включать вроде есть такой TASK
GPUWorkLib — полноценная реализация в 48 файлах
Реализован зеркально в C++ и Python.
C++ — struct (modules/test_utils/test_result.hpp):

namespace gpu_test_utils {
struct ValidationResult {
  bool        passed;
  std::string metric_name;
  double      actual_value;
  double      threshold;
  std::string message;
};
}
Фабричные функции: PassResult(name, value, tol) / FailResult(name, value, tol).

Хелперы-валидаторы: MaxRelError(...), AbsError(...), RmseError(...), ScalarRelError(...).

Пример в тесте (modules/fft_func/tests/test_fft_processor_rocm.hpp):


tr.add(ValidationResult{peak_bin == expected_bin, "peak_bin",
    (double)peak_bin, (double)expected_bin, "peak=... exp=..."});
// или через хелпер:
tr.add(FailResult("beam_count", results.size(), beam_count));
Python — dataclass (Python_test/common/result.py):


@dataclass
class ValidationResult:
    passed: bool
    metric_name: str
    actual_value: float
    threshold: float
    message: str = ""
Валидаторы: RelativeValidator(tol), AbsoluteValidator(tol), RmseValidator(tol) — все возвращают ValidationResult.

Вывод: в DSP-GPU ValidationResult ещё не портирован из GPUWorkLib. Нужно будет перенести.




**Блокеры пилота на `spectrum`:**
1. card-пример использует фейковый API → AI-генератор сразу породит несобираемый код.
2. JSON-Schemas (`_RAG.schema.json`, `class_card.schema.json`) — заявлены в §8 спеки 09, **не созданы**.
3. Внутренний конфликт стилей тестов (§7.1 vs реальные тесты + card).

---

## 1. Что сделано хорошо

- **Разделение ролей** между 09 (формат RAG) и 12 (поведение агента) — чёткое, без дублирования.
- **§5.3 «struct-описание один раз через `@test_ref`»** — отличное решение, экономит сотни строк, нет дублирования. Прямо отвечает на запрос Alex'а из 10_DataFlow_Visualization §9.
- **§5.4 правило «нет тега → нет автотеста»** — корректный контракт безопасности (не плодим мусорные тесты).
- **§7.5 `@autoprofile`** — выключено по умолчанию, ставится руками. Соответствует «не плодить сущности» из правила 01.
- **§4 «один файл = один класс»** — соответствует 14-cpp-style.md «один класс = один файл».
- **12 §6 git-check** — pre-flight `git status --porcelain` с правильной семантикой (отказ только если агент **сам** трогает грязный файл).
- **12 §10 «было / стало»** — наглядный side-by-side, легко сверять.
- **12 §4 «не переписывать существующее»** — правильная защита от регресса doxygen.

---

## 2. 🔴 Критические проблемы (блокируют пилот)

### 2.1 Card-пример Method 1 использует несуществующий API

**Что в `examples/fft_processor_FFTProcessorROCm.md:211-218, 229-231, 243-245`:**
```cpp
return ValidationResult::All({
  ValidationResult::Eq("result.size", result.size(), size_t{128}),
  ValidationResult::Eq("magnitudes.size", result[0].magnitudes.size(), size_t{8192}),
});
...
return ValidationResult::Throws<std::invalid_argument>([&]() { ... });
return ValidationResult::Throws<std::runtime_error>([&]() { ... });
```

**Что реально в `core/test_utils/test_result.hpp`:**
```cpp
struct ValidationResult { bool passed; string metric_name; double actual_value; double threshold; string message; };
struct TestResult { ... TestResult& add(ValidationResult); TestResult& add_all(initializer_list<ValidationResult>); };
inline ValidationResult PassResult(name, value, threshold, msg);
inline ValidationResult FailResult(name, value, threshold, msg);
```

**Никаких `::All`, `::Eq`, `::Throws<T>` нет**. AI-генератор, опираясь на этот пример, сразу выдаст несобираемый C++.

**Реальный канонический стиль** (из `spectrum/tests/test_fft_processor_rocm.hpp:59-83`):
```cpp
runner.test("single_beam_complex", [&]() -> TestResult {
    FFTProcessorROCm fft(&backend);
    auto data = refs::GenerateSinusoid(100.0f, 1000.0f, 1024);
    FFTProcessorParams params; /* ... */

    auto results = fft.ProcessComplex(data, params);

    TestResult tr{"single_beam_complex"};
    if (results.empty()) return tr.add(FailResult("size", 0, 1));
    /* ... */
    tr.add(ValidationResult{peak_bin == expected_bin, "peak_bin",
        static_cast<double>(peak_bin), static_cast<double>(expected_bin), msg});
    return tr;
});
```

**Что делать:**
- Переписать Method 1 в `examples/fft_processor_FFTProcessorROCm.md:175-247` под реальный API: `runner.test(name, []() -> TestResult { TestResult tr{name}; tr.add(ValidationResult{...}); return tr; })`.
- Negative-тест `ThrowsOnZeroNPoint` — оборачивать try/catch вручную:
  ```cpp
  runner.test("ThrowsOnZeroNPoint", [&]() -> TestResult {
      TestResult tr{"ThrowsOnZeroNPoint"};
      try {
          proc.ProcessComplex(data, params, nullptr);
          tr.add(FailResult("throws", 0, 1, "ожидался invalid_argument"));
      } catch (const std::invalid_argument&) {
          tr.add(PassResult("throws"));
      }
      return tr;
  });
  ```
- Удалить блок `<details>Google Test variant</details>` из card (см. §3.4 ниже) — вводит в заблуждение.

### 2.2 §7.1 спеки 09 описывает несуществующий стиль (FC_ASSERT)

**Что в `09_RAG_md_Spec.md:317-349`:**
```cpp
namespace test_fft_processor {
#define FC_ASSERT(cond, msg) do { ... return false; } while (0)
inline bool test_process_complex_smoke(IBackend* backend) { ... FC_ASSERT_EQ(...); ... }
}
```

**Реальность:**
- `FC_ASSERT` / `FC_ASSERT_EQ` / `FC_CONTAINS` встречаются **только** в этой спеке. Глобальный grep по `e:/DSP-GPU` — 0 совпадений в коде.
- Реальный стиль — `gpu_test_utils::TestRunner` + `runner.test(name, lambda → TestResult)` (см. `core/test_utils/test_runner.hpp:38-79`).

**Что делать:** §7.1 переписать целиком — описать **реальный** канонический стиль через `runner.test` + `ValidationResult`/`TestResult`. Это же снимет противоречие с card §Method 1 (после правки 2.1) и с правилом 15-cpp-testing.md.

### 2.3 Внутреннее противоречие §5.4 vs card example

**§5.4 спеки 09 (строки 290-291):**
> «status: skipped → метод просто не попадает в карточку»

**Card example (`examples/fft_processor_FFTProcessorROCm.md:289-368`):**
В карточку **попадают** Methods 2-7 со статусом `⏸ skipped` — как stub'ы с пометкой «Coverage: 0%».

**Что делать — выбрать одно:**
- **Вариант A** (рекомендую): skipped-методы **показываем** как stub с TODO-подсказкой → правка §5.4 алгоритма: `skipped → попадает в карточку как stub без YAML-блока`. Это полезно человеку (видно что добавить).
- Вариант B: skipped не попадают → удалить Methods 2-7 из card.

## от Alex - **Вариант A** - Да

### 2.4 JSON-Schemas заявлены, но отсутствуют
## от Alex - с начала разберемся с doxygen а потом вернемся к  JSON-Schemas
**§8 спеки 09:**
> `E:/DSP-GPU/MemoryBank/specs/LLM_and_RAG/schemas/`:
> - `_RAG.schema.json`
> - `class_card.schema.json`

**Реальность:** каталога `schemas/` в `LLM_and_RAG/` нет (проверено `Glob`). VS Code-директива `# yaml-language-server: $schema=../../schemas/_RAG.schema.json` указывает в пустоту.

**Что делать:** либо создать схемы в Phase 1 пилота (это входит в §13 шаг 1, 1ч работы), либо явно пометить «Phase 1 deliverable» в §8.
## от Alex  - ответил в верху учти

### 2.5 `hipError_t` как exception — семантическая ошибка

**§3 спеки 09 (frontmatter `_RAG.md`)** и **card example (`expected_throws`):**
```yaml
- { type: hipError_t, when: "beam_count*nFFT*8*4 > VRAM*memory_limit" }
```

`hipError_t` — это **enum**, возвращаемый HIP-функциями. Бросается? Нет. Реальные классы DSP-GPU оборачивают неуспех HIP в `std::runtime_error` (см. как `ROCmBackend::Initialize` это делает). В card же stress-тест уже корректно ловит `Throws<std::runtime_error>` — то есть YAML и тест расходятся.

**Что делать:** В YAML `expected_throws` ставить **C++-исключения**, которые реально бросает класс (`std::runtime_error`, `std::invalid_argument`, `std::bad_alloc`). Если нужно зафиксировать факт «внутри проверяется hipError_t» — отдельный комментарий, но в `expected_throws` — только то, что прокидывается наружу.

---

## 3. 🟠 Серьёзные проблемы (нужно фиксить до v1.1)

### 3.1 Расхождение namespace и пути с правилом 10-modules.md

| Артефакт | Спека 09 / реальный код | rule 10 / spectrum/CLAUDE.md |
|---|---|---|
| namespace | `fft_processor::FFTProcessorROCm` | `dsp::spectrum::FFTProcessorROCm` |
| include path | `include/spectrum/fft_processor_rocm.hpp` | `include/dsp/spectrum/fft_processor_rocm.hpp` |
| repo / namespace mapping | `repo: spectrum` + `class_fqn: fft_processor::...` | `repo == namespace == spectrum` |

**Реальный код совпадает со спекой 09**, не с rule 10. Это известный долг проекта (legacy `fft_processor::*` ещё не мигрирован в `dsp::spectrum::*`). Спеку 09 это не ломает, но создаёт путаницу — RAG-индексер найдёт `fft_processor::`, а человек, читая правила, ожидает `dsp::spectrum::`.

**Что делать (минимум):** добавить в §1 спеки 09 примечание:
> «Сейчас часть классов лежит в legacy-namespace (`fft_processor::`, `filters::`, …). После миграции в `dsp::<repo>::` правило именования файла станет `<repo>_<ClassName>.md` — пока используем `<last-namespace>_<ClassName>.md`.»

### 3.2 §5.3 пример struct неполный (нет `output_mode`)

**Реальная `FFTProcessorParams` (`spectrum/include/spectrum/types/fft_params.hpp:28-41`):**
```cpp
struct FFTProcessorParams {
    uint32_t beam_count, n_point;
    float sample_rate;
    FFTOutputMode output_mode;       // ← есть в реальности
    uint32_t repeat_count;
    float memory_limit;
};
```

**§5.3 спеки 09 (строки 226-244):** показывает 5 полей, **без `output_mode`**. Card в Method 1 при этом ставит `params.output_mode = FFTOutputMode::COMPLEX;` — то есть пример теста использует поле, которого нет в `@test_ref` блоке.

**Что делать:** добавить в §5.3 enum-поле как пример:
```cpp
/** @test { values=[COMPLEX, MAGNITUDE_PHASE, MAGNITUDE_PHASE_FREQ] } */
FFTOutputMode output_mode = FFTOutputMode::COMPLEX;
```
+ обновить `pattern` enum: добавить `enum_value` или `enum=<TypeName>`.

### 3.3 Coverage-формула не работает для `void` методов и нулевых @param

**§5.4:**
> `coverage = (params with @test/@test_ref) / (всего @param) * 100%`
> `if coverage == 100% AND есть @test_check на @return: status: ready_for_autotest`

Кейсы:
- `void ProcessMagnitudesToGPU(...)` — `@return` отсутствует → **никогда** не сможет стать `ready`. У такого метода `@test_check` логически про **side effect** (что записалось в `gpu_out_magnitudes`).
- Метод без `@param` (getter, фабрика без аргументов) — деление на 0.

**Что делать:** уточнить алгоритм:
```text
coverage_inputs  = @param_with_tag / total_params         (1.0 если total=0)
coverage_outputs = ((return_void OR @test_check on @return) ? 1 : 0)
                   * (no_throws_in_body OR has @test_check on @throws ? 1 : 0)
status = ready_for_autotest if coverage_inputs == 1.0 AND coverage_outputs == 1.0
```
Для `void` — требовать `@test_check` на side-effect (например `@test_check magnitudes[0] == ...`).

### 3.4 Удалить Google Test variant

**Card example блок `<details>Google Test variant</details>` (строки 252-285)** и **§7.3 спеки 09**:
> «AI-генератор может выдавать дополнительный блок `<details>Google Test variant</details>` для будущей миграции».

**Аргументы против:**
- Правило 15-cpp-testing.md явно: «Запрещено GoogleTest / Catch2 / другие фреймворки».
- Двойная генерация удваивает токены LLM (Qwen 8B уже на пределе).
- «Будущая миграция» — гипотетика, нарушает «не делать заранее» из глобального CLAUDE.md §"Doing tasks".
- В реальном проекте это будет шум в каждой карточке.

**Что делать:** удалить §7.3 и `<details>` из всех card-шаблонов. Если миграция случится — добавить тогда.
## от Alex  -Да

### 3.5 Несогласованность `manifest refresh` / `manifest refresh-all`

- §9 CLI: `manifest refresh [--repo X]`
- §11 weekly cron: `manifest refresh-all`

**Что делать:** оставить одну форму. Рекомендую: `manifest refresh` (без `--repo` = все репо), `manifest refresh --repo X` (один). Подкоманду `refresh-all` убрать, в cron вызывать `manifest refresh`.
## от Alex Да

### 3.6 12 §2: disambiguation перегрузок не покрыта

`--method <FQN-or-name>` для `ProcessComplex` неоднозначно (две перегрузки: CPU input vs GPU input). Агент должен:
- Либо выдавать оба варианта (поведение по умолчанию),
- Либо требовать `--overload <signature-hash>` / `--overload-index N`.

**Что делать:** добавить в §2 таблицу флагов:
```
--overload <index|hash>   при неоднозначности — выбрать конкретную перегрузку
--all-overloads           обработать все (default behaviour)
```
## от Alex Да

### 3.7 12 §10: педагогические маркеры в примере «после»

В блоке «Если doxygen уже частично есть» строки помечены `← НЕ тронуто` и `← добавлено`. Если читать буквально, AI-генератор может начать вставлять эти стрелки в реальный код.

**Что делать:** добавить под примером строку:
> Маркеры `← НЕ тронуто` / `← добавлено` — **только для иллюстрации в этой спеке**. В реальном выводе агента их нет.
## от Alex Да
---

## 4. 🟡 Минорные / стилевые

### 4.1 Несогласованные даты в frontmatter card
```yaml
ai_generated_at: 2026-05-01T20:00:00Z   # §4.1 спеки
updated_at: 2026-05-01T20:00:00Z        # ниже в YAML методов
```
ОК. Но в card example поле `ai_generated_at` указано в frontmatter (`12:00:00Z` в §4.1 спеки vs `20:00:00Z` в card). Несогласованность — выбрать один таймстамп для пилота.
## от Alex  `20:00:00Z`

### 4.2 §4.1 `methods_total: 14`, в реальности 7
В card example methods_total: 7 (правильно для реального класса). В §4.1 спеки 09 пример frontmatter — `methods_total: 14`. Это «иллюстративная цифра», но лучше согласовать с реальной (или явно пометить «пример для абстрактного класса»).

### 4.3 §10 pre-commit «10 дней» — magic number
Без обоснования. Предлагаю либо «1 неделя» (соответствует weekly cron), либо `--strict-stale-days N` параметр.

### 4.4 §11 cron — Windows `schtasks`
Master Plan §"Этап 2+" — переезд на Debian. Cron на Windows только Phase 1. **Что делать:** добавить в §11:
```bash
# Linux (Stages 2+):
echo "0 9 * * TUE dsp-asst manifest refresh" | crontab -
# Windows (Stage 1):
schtasks /Create ...
```

### 4.5 §6 «`human_verified: true`» — где живёт поле?
В card example поля `human_verified` нет ни в frontmatter, ни в method-YAML (есть только `auto_extracted: true`). Логика «не перезаписывать» правильная, но **неявная**.

**Что делать:** в §6 показать пример где именно это поле появляется:
```yaml
key_classes:
  - fqn: fft_processor::FFTProcessorROCm
    brief: "Обёртка hipFFT (мой текст)"
    human_verified: true              # ← AI не трогает этот brief
```
И в method-YAML (`auto_extracted: false, human_verified: true`).

### 4.6 §5.2 pattern — `enum_value` отсутствует
`pattern` поддерживает: `power_of_2, prime, even, odd, int, float, any, gpu_pointer`. Для enum-полей (`output_mode`, `WindowType`) нет варианта. Добавить `pattern=enum`, `enum_type=<FQN>` или просто `values=[X, Y, Z]` (уже есть, но не очевидно для enum).

### 4.7 §3 `_RAG.md` — `version: 2.1.0` без описания
Откуда берётся версия модуля? CMake `version.cmake`? VERSION файл? Уточнить (auto vs human).

### 4.8 12 §3 «Pre-flight Postgres+Ollama» избыточно для doxytags
`doxytags fill --file foo.hpp` нужен только tree-sitter + Ollama. Postgres нужен только если агент использует БД для resolve `@test_ref` (искать struct в другом hpp). Оптимизация: `--no-db` (skip Postgres) для standalone-режима.

### 4.9 12 §4.6 «Если блок в стиле `///` — добавлять в том же стиле»
Проблема: `@test { ... }` в одной строке, а `///` doxygen — построчно. Многострочный блок становится:
```cpp
/// @param data ...
///   @test { size=[100..1300000], value=6000, step=10000 }
```
Тут `@test` оказывается на отдельной строке, а в проекте принят `/** ... */`. Лучше явное правило: «`@test*` теги всегда **внутри** `/** */` блока, даже если основной doxygen — `///`. Если файл целиком на `///` — конвертировать описание метода в `/** */` (это нарушает правило «не трогать»). **Решение:** если файл в `///`-стиле, агент пропускает с warning + предлагает Alex'у конвертировать руками.

### 4.10 09 §5.3 → циклы `@test_ref`
Если struct A: `@test_ref B`, struct B: `@test_ref A` — рекурсия. Парсер должен детектить и падать с понятной ошибкой. Добавить «depth limit = 5, циклы → fail-fast».

### 4.11 12 §3 — `.bak` cleanup
«откат из .bak если файл сломался» — а если успех? `.bak` остаётся в репо? Добавить: «после успешного tree-sitter re-validate — `.bak` удаляется, иначе хранится 24ч в `.dsp_assistant_backup/`».

### 4.12 Card example — `_benchmark.hpp` location
Spec 09 §7.5 генерирует benchmark в `<repo>/tests/auto/<ns>_<Class>_benchmark.hpp`. Spec 12 не описывает `tests/auto/`. И `auto/` не упомянут в правиле 15-cpp-testing.md (структура tests/). Нужна согласованная политика: где именно `auto/` → правило 15 расширить или явная подпапка `tests/auto/` пометить «auto-generated, .gitignore? Или коммитим?».

### 4.13 Card example — `proc_.ProcessComplexTimed(...)` закомментирован
```cpp
// proc_.ProcessComplexTimed(in_, params_, d);   // если есть Timed-перегрузка
proc_.ProcessComplex(in_, params_, nullptr);
```
Реальный класс не имеет `ProcessComplexTimed`, но имеет встроенный `ROCmProfEvents* prof_events` параметр. Лучше пример переделать так:
```cpp
void ExecuteKernelTimed() override {
  ROCmProfEvents events;
  proc_.ProcessComplex(in_, params_, &events);
  for (auto& [name, data] : events) RecordROCmEvent(name, data);
}
```

---

## 5. Что точно правильно (галочка после сверки)

| Артефакт | Заявлено в спеке | Реально в коде | Статус |
|---|---|---|---|
| `gpu_test_utils::TestRunner` | card example header | `core/test_utils/test_runner.hpp:23` | ✅ |
| `runner.test(name, lambda)` API | card example | реальные тесты `spectrum/tests/test_fft_processor_rocm.hpp:59` | ✅ |
| `core/services/gpu_benchmark_base.hpp` | §7.5 include | `core/include/core/services/gpu_benchmark_base.hpp` | ✅ |
| `RecordROCmEvent` API | §7.5 пример | (предположительно есть в base) | ⚠️ не проверял — рекомендую проверить |
| Сигнатура `ProcessComplex(CPU)` | card строка 67-71 | `fft_processor_rocm.hpp:74-77` | ✅ полное совпадение |
| `FFTProcessorParams` поля (5/6) | §5.3 + card | реально 6 полей (включая `output_mode`) | ⚠️ см. §3.2 |
| `namespace fft_processor` | card frontmatter | реальный код | ✅ (но конфликтует с rule 10 — см. §3.1) |
| `include <spectrum/fft_processor_rocm.hpp>` | card example | реальный путь | ✅ |
| `ConsoleOutput::Print` (не cout) | §7.1 | правило 07-console-output | ✅ |
| `_RAG.md / .rag/` каталог | §1 | **не существует** ни в одном репо | 🔴 будущий артефакт |
| `schemas/*.schema.json` | §8 | **не существует** | 🔴 см. §2.4 |
| `prompts/009_test_params_extract.md` | 12 §5, §9 | не создан (есть 001-004, 008) | ⚠️ Phase deliverable |

---

## 6. Конкретные правки (минимальный набор для пилота на `spectrum`)

### Phase A (блокеры, до запуска `manifest init --repo spectrum`)

1. **`examples/fft_processor_FFTProcessorROCm.md`** — переписать Method 1 под реальный API (см. §2.1). Удалить блок Google Test variant.
2. **`09_RAG_md_Spec.md` §7.1** — переписать canonical стиль через `runner.test` + `ValidationResult` (см. §2.2).
3. **`09_RAG_md_Spec.md` §7.3** — удалить (Google Test variant).
4. **`09_RAG_md_Spec.md` §5.4** — определить поведение для skipped (попадают как stub) и для `void`-методов (см. §2.3, §3.3).
5. **`09_RAG_md_Spec.md` §3 + card** — заменить `hipError_t` → `std::runtime_error` в `expected_throws` (см. §2.5).
6. **Создать `LLM_and_RAG/schemas/_RAG.schema.json` + `class_card.schema.json`** — даже минимальный draft (§13 шаг 1, ~1ч).

### Phase B (до v1.1)

7. **`09 §5.3`** — добавить `output_mode` в пример struct (см. §3.2).
8. **`09 §1`** — note про legacy namespace `fft_processor::` vs `dsp::spectrum::` (см. §3.1).
9. **`09 §9 vs §11`** — согласовать `manifest refresh` (см. §3.5).
10. **`12 §2`** — добавить `--overload`/`--all-overloads` (см. §3.6).
11. **`12 §10`** — пометка про педагогические стрелки (см. §3.7).

### Phase C (минор, после пилота)

12. Все пункты из §4.

---

## 7. Вопросы Alex'у (нужны решения перед Phase A)

1. **Стиль карточки для skipped-методов**: показывать stub'ы (как в нынешнем card example) или вообще не включать (как требует §5.4)? — Я склоняюсь к stub'ам (полезно человеку видеть «что добавить»).
2. **`auto/`-каталог**: `<repo>/tests/auto/test_*.hpp` коммитим в git или в `.gitignore`?
   - `git`: воспроизводимо, видно diff'ы, можно ревью.
   - `.gitignore`: всегда свежее, но CI должен генерировать перед билдом.
3. **`@autoprofile` дефолт**: Alex говорил «выключено по умолчанию, ставится руками». В §7.5 это так. Подтверди — оставляем или для GPU-Facade-классов включить через эвристику doxytags?
4. **JSON-Schemas (§8)**: создать в Phase A пилота (~1ч моей работы) или отложить до Phase 1 spec'а? — Без них VS Code-валидация YAML не работает, рекомендую сразу.
5. **GTest variant**: Подтверди удаление? Или оставляем для будущего работодателя/проекта на GTest?
6. **Legacy namespace migration** (`fft_processor::` → `dsp::spectrum::`): запланировать отдельной задачей? Или RAG будет жить с двумя namespace'ами?

 ## от Alex отвечал по тексту
 повторю посмотри если что то не так спроси
 1. Да
 2. Да все коммитить
 3. 3.1. когда создается метод или класс и в команде создания будет сказано, что нужно профилирование - при наличии все условий ставиться да иначе нет. 3.2. Сейчас агент будет везде прописывать doxygen и если там есть профилирование ставим да если нет ставим нет.  Если что то спорное давай обсудим.
 4. пока не нужно доработаем doxygen.
 5. GTest variant - я не использую, но мы делаем проатип для промтов для будущей локальной Ai и огромного зактытого проекта там они используею! нужно оставить как напоминание. А то я забуду. А ты будешь напоминать!)) подумай как это сделать!
 6. Да запланируй это правильно!!
---

## 8. Дальнейшие действия (если Alex даст OK)

| Шаг | Артефакт | Время |
|---|---|---|
| A1 | переписать card Method 1 + §7.1/§7.3 | 30 мин |
| A2 | создать schemas/*.schema.json (минимальный draft) | 1 ч |
| A3 | мелкие правки 09 (§5.3, §5.4, §3, §1 note) | 30 мин |
| A4 | мелкие правки 12 (§2 overloads, §10 note) | 15 мин |
| A5 | sanity-check на реальном файле `fft_processor_rocm.hpp` (вручную добавить `@test`-теги к 1 методу) | 1 ч |
| **Итого Phase A** | | **~3.5 ч** |

После Phase A — спеки готовы к запуску `dsp-asst doxytags fill --file fft_processor_rocm.hpp --dry-run` на реальном коде.

---

## 9. Договорённости 2026-05-03 (финал, обсуждено с Alex)

### 9.1 По спорным точкам ревью — решения

| # | Тема | Решение |
|---|---|---|
| §0 | TASK портирование валидаторов из GPUWorkLib | **Active**, создать `tasks/TASK_validators_port_from_GPUWorkLib_2026-05-03.md`. API: `MaxRelError/AbsError/RmseError/ScalarRelError` + `RelativeValidator/AbsoluteValidator/RmseValidator` (C++ + Python зеркало). Источник: `E:\C++\GPUWorkLib\modules\test_utils\test_result.hpp` + `Python_test/common/result.py`. |
| §2.3 | skipped-методы | Stub в карточке (Вариант A) |
| §2.4 | JSON-Schemas | Отложено, после стабилизации doxygen |
| §2.5 | `hipError_t` в `expected_throws` | Заменить на `std::runtime_error` |
| §3.1 | Namespace `fft_processor::` vs `dsp::spectrum::` | **Оставляем как есть.** TASK миграции — в `.future/TASK_namespace_migration_legacy_to_dsp.md` с триггером «после стабилизации doxytags + первого обучения локальной AI». Последовательность: обучаем AI на legacy → выполняем TASK → переобучаем AI → проверяем. |
| §3.4 | GTest variant | **Удалить из 09 §7.3** + удалить блок из card example. Создать `MemoryBank/.future/TASK_gtest_variant_for_external_projects.md` с триггером «когда придёт проект на GTest / при копировании AI на новую локацию». В 09 §7.3 — однострочная ссылка на этот файл. |
| §3.5 | `manifest refresh` / `refresh-all` | Одна форма: `manifest refresh [--repo X]`. В cron — без суффикса. |
| §3.6 | overloads disambiguation | Добавить `--overload <index>` / `--all-overloads` в Spec 12 §2 |
| §3.7 | педагогические маркеры | Note под примером в Spec 12 §10 |
| §4.1 | Даты в frontmatter | Единый таймстамп `2026-05-01T20:00:00Z` |
| §7.2 | `<repo>/tests/auto/` | **Коммитить в git** — воспроизводимо, видны diff'ы, ревьюимо |

### 9.2 Логика `@autoprofile` — переписана с нуля (отменяет Spec 12 §7)

**Старая формулировка** «GPU-класс без `@autoprofile` → НЕ добавляет тег автоматически» — **ОТМЕНЕНА**.

**Новая логика — два режима:**

#### Режим 1. Создание нового модуля AI по запросу Alex'а
```
1. Класс считает на GPU? (использует hip/*, hipfft/*, rocblas/*, BufferSet, GpuContext)
   ├── НЕТ → @autoprofile НЕ ставится (тег для CPU-only классов запрещён)
   └── ДА  → 2. Alex явно просил профилирование?
              ├── ДА  → @autoprofile { enabled: true, warmup, runs, target_method }
              └── НЕТ → @autoprofile { enabled: false } (placeholder для будущего)
```

#### Режим 2. Массовая расстановка doxygen агентом `doxytags` по всем репо
```
1. Класс считает на GPU? (детект по include hip*/rocm*, наличие BufferSet/GpuContext, .hip kernels)
   ├── НЕТ → @autoprofile НЕ ставится
   └── ДА  → 2. Уже есть benchmark-класс? (детект — Вариант A, согласовано)
              Признак: существует <repo>/tests/<Class>_benchmark*.hpp
              ИЛИ класс-наследник drv_gpu_lib::GpuBenchmarkBase для этого class_fqn.
              ├── ДА  → @autoprofile { enabled: true, target_method, warmup, runs }
              │        ⚠️ Защита от дублей: проверить что нет ДРУГОГО benchmark-класса
              │        для того же class_fqn (manifest refresh не должен генерить второй).
              └── НЕТ → @autoprofile { enabled: false } (placeholder)
```

**Признак «уже есть профилирование» = Вариант A** (согласовано с Alex'ом 2026-05-03):
- Есть файл `<repo>/tests/<Class>_benchmark*.hpp` — явный benchmark-класс наследник `GpuBenchmarkBase`.
- Альтернатива B (наличие `ROCmProfEvents*` в API метода) — **не используется**, она шире чем «бенчмарк есть».

**Примеры детекта на `spectrum` (для проверки эвристики):**

| Класс | Benchmark файл | Вердикт агента |
|---|---|---|
| `FFTProcessorROCm` | `spectrum/tests/fft_processor_benchmark_rocm.hpp` ✓ | `@autoprofile { enabled: true, ... }` |
| `FirFilterROCm` | `spectrum/tests/filters_benchmark_rocm.hpp` ✓ | `@autoprofile { enabled: true, ... }` |
| `LchFarrowROCm` | `spectrum/tests/lch_farrow_benchmark_rocm.hpp` ✓ | `@autoprofile { enabled: true, ... }` |
| `KalmanFilterROCm` | (нет отдельного benchmark) | `@autoprofile { enabled: false }` (placeholder) |
| `WindowFunctions` (CPU helpers) | — (CPU-only) | `@autoprofile` не ставится |

Spec 12 §7 целиком переписать под этот алгоритм в Phase A.

### 9.3 TASK'и для создания (по итогам этой сессии)

| Где | Файл | Триггер реактивации |
|---|---|---|
| `tasks/` | `TASK_validators_port_from_GPUWorkLib_2026-05-03.md` | **active** — нужен до запуска AI-генератора тестов |
| `.future/` | `TASK_gtest_variant_for_external_projects.md` | при копировании AI на новую локацию / приходе проекта на GTest |
| `.future/` | `TASK_namespace_migration_legacy_to_dsp.md` | после стабилизации doxytags + первого обучения локальной AI |

### 9.4 Phase A — обновлённый план (с учётом договорённостей)

| Шаг | Артефакт | Время |
|---|---|---|
| A1 | переписать card Method 1 под реальный API (`runner.test` + `ValidationResult{...}` + try/catch для throws) | 30 мин |
| A2 | 09 §7.1 переписать canonical стиль; 09 §7.3 → однострочная ссылка на `.future/TASK_gtest_variant_for_external_projects.md`; удалить `<details>GoogleTest</details>` из card | 30 мин |
| A3 | 09 §5.4 — алгоритм coverage с поддержкой void и нулевых @param + skipped как stub | 20 мин |
| A4 | 09 §3 / card — `hipError_t` → `std::runtime_error` в `expected_throws` | 10 мин |
| A5 | 12 §7 — переписать целиком под новую логику autoprofile (Режим 1 + Режим 2 + Вариант A детект) | 40 мин |
| A6 | 12 §2 — добавить `--overload`/`--all-overloads`; 12 §10 — note про педагогические стрелки | 15 мин |
| A7 | создать 3 TASK'а: `validators_port` (active), `gtest_variant` (.future), `namespace_migration` (.future) | 45 мин |
| A8 | sanity-check: вручную добавить `@test`+`@autoprofile` к 1 методу `FFTProcessorROCm::ProcessComplex` (CPU input), проверить что соответствует новой спеке | 30 мин |
| **Итого** | | **~3.5 ч** |

После A8 — готовы к `dsp-asst doxytags fill --file fft_processor_rocm.hpp --dry-run` пилоту на одном методе.

### 9.5 Что отложено (после Phase A)

- JSON-Schemas (`_RAG.schema.json` + `class_card.schema.json`) — после доработки doxygen-теговой системы.
- Полное портирование валидаторов из GPUWorkLib (TASK active, но фактическое выполнение — после Phase A для doxytags).
- Namespace migration — после первого обучения локальной AI.

---

*Конец ревью. Договорённости в §9 — финальные, согласованы с Alex 2026-05-03. Источник правды для спорных мест — реальный код в `e:\DSP-GPU\` и правила в `.claude/rules/`.*
