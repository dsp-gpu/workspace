# `golden_set/` — Q&A per-target для gate'ов и acceptance

## Файлы

| Файл | Что | Кто пишет | Когда |
|------|-----|-----------|-------|
| `L0.jsonl` | 30+ Q&A по external_corpus (open-source примеры) | Кодо (auto + Alex review) | Phase 02 |
| `L1.jsonl` | 30+ Q&A по architecture (C4 + cmake deps) | Кодо + Alex | Phase 03 |
| `L2.jsonl` | 30+ Q&A по symbols (classes/methods/throws) | автомат из L2 schema | Phase 03 |
| `L3.jsonl` | 30+ Q&A по doxygen + test_cases | Кодо + Alex review | Phase 04-05 |
| `L4.jsonl` | 30+ Q&A по use_cases / pipelines | Кодо + Alex | Phase 07 |
| `Q1_Q10_acceptance.jsonl` | 10 trap-вопросов для QLoRA acceptance | **Alex для DSP-GPU; Кодо синтезирует для новых targets** (Q-R2) | Phase 09.A |

## Формат `Lx.jsonl`

```json
{
  "id": "L3-Q001",
  "query": "Какие throw'ы возможны у FFTProcessorROCm::ProcessComplex?",
  "expected_artifacts": [
    {"layer": "L3", "class_fqn": "dsp::spectrum::FFTProcessorROCm", "rank_max": 5}
  ],
  "difficulty": "easy|medium|hard"
}
```

## Формат `Q1_Q10_acceptance.jsonl`

См. `Q1_Q10_acceptance.jsonl.template` — 10 строк JSON, по 1 на вопрос.

Категории:
- `pattern_forward` — class → pattern
- `pattern_reverse` — pattern → classes
- `namespace_lookup` / `module_lookup` / `class_listing`
- `migration_history` / `build_facts` / `config_facts`
- `anti_hallucination` (Q9) — несуществующая сущность → должно отвечать «Нет»
- `anti_confusion` (Q10) — правильный паттерн ≠ wrong_pattern

## Gate

| Layer | Метрика | Threshold |
|-------|---------|-----------|
| L0-L4 | R@5 | ≥ 0.9 (L0), ≥ 0.85 (L1-L2), ≥ 0.8 (L3-L4) |
| Q1-Q10 acceptance (после QLoRA) | correct/10 | **≥ 9/10 на новой LoRA** |
