# 13 — Few-shot Discipline

> **paths:** `MemoryBank/prompts/for_rag_pao/v1/fewshot/**`

## Принципы

1. **Минимум 3 fewshot** в каждом промпте к Qwen.
2. **Fewshot = только из проверенных артефактов**: либо из `golden_set` (manual), либо из `.rag/<target>/` где `judge_score >= 90` и `human_verified=true`.
3. **Никогда из distillation_logs с retries** — учим Qwen только на лучшем.

## Структура

```
prompts/for_rag_pao/v1/fewshot/
├── L3_doxygen_FFTProcessorROCm.json
├── L3_doxygen_SpectrumMaximaFinder.json
├── L3_doxygen_HybridBackend.json
├── L3_test_cases_FFTProcessorROCm.json
├── L3b_gtest_FFTProcessorROCm.cpp.example
├── L4_use_case_fft_batch_signal.json
└── manual_include.yaml             # forced include даже если фильтр отверг
```

## `manual_include.yaml`

Если Alex хочет насильно включить файл (даже если фильтр не пустил):
```yaml
- path: customer_drop/anti_pattern_example.hpp
  reason: "Эталон того как НЕ надо — учим reviewer'а"
  bypass_filters: [size, license]
```

## Retrieval policy для fewshot

```python
def select_fewshot(class_fqn, layer="L3", top_k=3):
    candidates = retrieve(
        L0_fewshot,
        similar_to=class_fqn,
        filter={layer: layer, verified: True, score: ">=90"},
        top_k=top_k * 2                   # over-fetch
    )
    # diversity: разные типы (header-only, lib, single-file)
    return diversify(candidates, top_k=top_k)
```

## Per-target fewshot override

`pipelines/<target>_v1/prompts_override/fewshot/L3_<target>__<Class>.json` — для target-specific стиля.

При retrieval `prompt_builder` сначала ищет в `prompts_override/fewshot/`, потом в `MemoryBank/prompts/v1/fewshot/`.

## Накопление через L3b GoogleTest

Каждый успешный gtest на L3b → `external_corpus/test_examples/gtest_examples/<target>__<Class>_test.cpp`. Это **самопополняющийся** fewshot для будущих классов.

## Метрики

- `avg_fewshot_used_per_prompt` — должен быть **≥ 3**
- `fewshot_hit_rate` — % случаев когда retrieval нашёл similar
- `diversity_score` — типы файлов в fewshot top-3
