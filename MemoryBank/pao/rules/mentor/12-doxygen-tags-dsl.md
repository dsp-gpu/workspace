# 12 — Doxygen Tags DSL (@test / @test_ref / @test_check)

> Расширение стандартного doxygen — наши кастомные теги для test_cases.
> Источник: DSP-GPU `MemoryBank/.claude/specs/12_DoxyTags_Agent_Spec.md`.

## Стандартные теги (от Doxygen)

```cpp
/**
 * @brief Кратко (1 строка).
 * @param[in] text Входная строка JSON.
 * @param[out] result Результат разбора.
 * @return true если успешно.
 * @throws std::invalid_argument если text не JSON.
 * @see JsonWriter
 */
bool parse(const std::string& text, Json& result);
```

## Наши кастомные теги (DSL для test_cases)

### `@test`

```cpp
/**
 * @brief Парсит JSON строку.
 *
 * @test { name: "valid_json",  input: "{\"a\":1}",  expected: success, expected_result: {a:1} }
 * @test { name: "empty_string", input: "",         expected: throws[std::invalid_argument] }
 * @test { name: "null_byte",   input: "a\0b",      expected: throws[std::invalid_argument] }
 * @test { name: "max_depth",   input: "[[[[...]]]]" (depth=1000), expected: throws[json_overflow] }
 */
bool parse(...);
```

### `@test_ref`

Ссылка на готовый тест-файл:
```cpp
/** @test_ref tests/test_json_parse.cpp::TestParseValidJson */
```

### `@test_check`

Что обязательно проверить:
```cpp
/** @test_check
 *  - boundary: input.length == max_buffer_size → success
 *  - boundary: input.length == max_buffer_size + 1 → throws
 *  - null_safety: nullptr → throws (если non-nullable)
 *  - thread_safety: 2 threads concurrent calls — no data race
 */
```

## Schema validation

`MemoryBank/prompts/for_rag_pao/v1/schemas/test_cases.schema.json`:
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "required": ["name", "input", "expected"],
    "properties": {
      "name": {"type": "string", "minLength": 1},
      "input": {},
      "expected": {"oneOf": [
        {"const": "success"},
        {"type": "object", "properties": {"throws": {"type": "array"}}}
      ]}
    }
  }
}
```

## Использование на L3b (GoogleTest)

Когда L3 готов, `@test` блоки → input для Qwen filler в L3b:
```
prompt:
  «Сгенерируй GoogleTest skeleton для класса {fqn}.
   Используй @test блоки из {L3.classes/X.md} как источник граничных значений.»
```

Один `@test` блок → один `TEST_F(...)` в `<Class>_test.cpp`.

## Где брать примеры

- `MemoryBank/prompts/for_rag_pao/v1/fewshot/L3_doxygen_FFTProcessorROCm.json` — образец L3
- `MemoryBank/prompts/for_rag_pao/v1/fewshot/L3b_gtest_FFTProcessorROCm.cpp.example` — образец L3b
