# TASK: GoogleTest variant для AI-генератора (external projects)

**Создано**: 2026-05-03
**Статус**: 📌 perspective (не запланировано)
**Триггер реактивации**: при копировании локальной AI на новую локацию / когда придёт проект на GoogleTest

---

## Зачем

DSP-GPU использует **свой** стиль тестирования (`gpu_test_utils::TestRunner` + `ValidationResult`/`TestResult`, правило `15-cpp-testing.md` явно запрещает GoogleTest/Catch2). Но прототип AI-ассистента, который мы строим (`dsp_assistant`), **копируется** на:

1. Локальную AI Алекса дома (текущий пилот, Qwen3 8B).
2. Локальную AI на работе (Qwen3 32B на Debian).
3. Будущий мини-сервер (общий) — vLLM.
4. Production на A100 — DeepSeek-V3 / Qwen Max.

**На (4) или на стороннем закрытом проекте** может быть стек на GoogleTest. Тогда наш AI должен уметь генерировать **второй вариант теста** — в стиле `TEST(...)/EXPECT_*/ASSERT_THROW`, рядом с основным.

Если эту опцию **сейчас удалить**, при переезде Alex забудет. Поэтому фиксируем как perspective task — он всплывёт когда мы будем настраивать AI на новой локации.

---

## Что нужно сделать

### 1. Шаблон-промпт для GTest variant
`prompts/010_test_cpp_gtest_variant.md` — отдельный промпт, по тем же `@test`-тегам генерирует:
```cpp
#include <gtest/gtest.h>
#include <spectrum/fft_processor_rocm.hpp>

TEST(FFTProcessorROCmTest, ProcessComplex_Smoke) {
  FFTProcessorROCm proc(rocm_backend);
  std::vector<std::complex<float>> data(6000);
  FFTProcessorParams params{.beam_count=128, .n_point=6000, .sample_rate=10e6f};
  auto result = proc.ProcessComplex(data, params, nullptr);
  ASSERT_EQ(result.size(), params.beam_count);
  ASSERT_EQ(result[0].magnitudes.size(), 8192u);
}
```

### 2. CLI-флаг
```
dsp-asst manifest refresh --repo X --gtest-variant
```
По умолчанию — выключено. Включается только на локациях где известно «проект на GTest».

### 3. Per-repo конфиг
`<repo>/.rag/_RAG.md` frontmatter:
```yaml
test_framework: dsp_runner   # или: gtest, catch2
```
Если не `dsp_runner` — AI-генератор использует соответствующий промпт.

### 4. Удалить из 09 спеки `<details>Google Test variant</details>` блок
Уже сделано в Phase A 2026-05-03 — заменено на ссылку на этот файл.

---

## Зависимости

- Спека `09_RAG_md_Spec.md` — нужно дополнить раздел про `test_framework` поле.
- Спека `12_DoxyTags_Agent_Spec.md` — без изменений (теги одинаковые).
- AI-генератор тестов (`dsp_assistant/modes/test_gen.py`) — добавить switch по `test_framework`.

---

## Связанные документы

- `MemoryBank/specs/Review_LLM_RAG_specs_2026-05-03.md` §3.4, §9.1 — контекст почему отложено
- `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md` §7.3 — placeholder с ссылкой сюда
- `MemoryBank/specs/LLM_and_RAG/examples/fft_processor_FFTProcessorROCm.md` — образец card (без GTest сейчас)
- `MemoryBank/.claude/rules/15-cpp-testing.md` — текущий запрет GTest для DSP-GPU

---

## Заметки

- В DSP-GPU (этот проект) **не активируем никогда** — рабочий стек `gpu_test_utils::TestRunner`.
- Этот файл — **напоминание для AI** что задача существует. При сетапе AI на новой локации Alex видит `.future/` и может активировать.
- После активации — переехать в `tasks/` (active).

*Maintained by: Кодо.*
