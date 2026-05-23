# 06 — RAG Layering (L0-L5 gates)

> HI-RAG (Hierarchical Incremental RAG). Каждый слой — отдельный gate. **Следующий стартует только после прохождения предыдущего**.

## Слои

| Layer | Источник | Артефакт | Кто генерит | Gate |
|-------|----------|----------|-------------|------|
| **L0** | external_corpus + customer drop | `.rag/_corpus/*.md` + векторы | crawler/indexer (без Qwen) | `golden_set_L0` R@5 ≥ 0.9 |
| **L1** | C4-диаграммы + cmake граф | `.rag/<t>/L1_architecture/*.md` | человек + Claude помогает | `golden_set_L1` R@5 ≥ 0.9 |
| **L2** | classes/methods | `.rag/<t>/L2_symbols/*.md` | автомат (tree-sitter+libclang) | `golden_set_L2` R@5 ≥ 0.85 |
| **L3** | doxygen+test_cases | `.rag/<t>/L3_descriptions/classes/*.md` | Qwen + Claude | quality ≥ 80 на ≥ 90% классов |
| **L3b** | GoogleTest skeleton | `.rag/<t>/L3_descriptions/tests/*_test.cpp` | Qwen + lint | gtest_compile_pass ≥ 90% |
| **L4** | use_cases + pipelines | `.rag/<t>/L4_use_cases/` | Qwen + Claude | `golden_set_L4` R@5 ≥ 0.8 |
| **L5** | QLoRA на L3-L4 + collectors | LoRA adapters | finetune scripts | ΔR@5 ≥ +0.05 + Q1-Q10 ≥ 9/10 |

## Retriever policy per layer

```python
# rag_pao/core/retrieval/hybrid_retriever.py
def retrieve_for_L3(class_fqn):
    return Context(
        arch_brief    = retrieve(L1, class_fqn, top_k=1),
        symbols_self  = retrieve(L2, fqn=class_fqn),
        symbols_deps  = retrieve(L2, related_to=class_fqn, top_k=3),
        fewshot       = retrieve(L0, similar_to=class_fqn, top_k=3),
    )

def retrieve_for_L3b_gtest(class_fqn):
    base = retrieve_for_L3(class_fqn)
    return Context(*base,
        test_examples = retrieve(L0_test_examples, similar_to=class_fqn, top_k=3),
        target_test_cases = retrieve(L3, fqn=class_fqn),
    )
```

## Gate enforcement

`orchestrator/hi_rag_runner.py`:
```python
for layer in [L0, L1, L2, L3, L3b, L4]:
    artefacts = run_layer(layer)
    gate_pass = check_gate(layer, golden_set[layer])
    if not gate_pass:
        log.error(f"Layer {layer} failed gate. Stop.")
        break
    save_metrics(layer, gate_pass.metrics)
```

## Хранение

- `.rag/<target>/Lx/` — артефакты per-target. **Коммитятся** (D18).
- PG `rag_pao_<target>.symbols` — для L2 fast lookup
- Qdrant `<target>_v1` — для L3/L4 dense retrieval
- `_logs/L*_distillation.jsonl` — для QLoRA (Phase 09)

## Источники для L5 (QLoRA, D33)

1. `_logs/L*_distillation.jsonl` (накопленные за фазы 05-08)
2. **Synthesised pairs через collectors** (Phase 09.A) — `pipelines/<target>_v1/collectors/`

См. `MemoryBank/specs/03_phases_v0.3.md §10`.
