# `collectors/` — синтез пар Q→A для QLoRA dataset (D33)

> **Источник**: [`MemoryBank/specs/05_dataset_v8_reference.md`](../../../MemoryBank/specs/05_dataset_v8_reference.md) — план сестры Sonnet 4.6 от 21.05.26 для DSP-GPU.
> **Адаптация под новый target**: при `cp _template/ <target>_v1/` — настроить шаблоны под known patterns / classes / namespaces target'а.

---

## 10 коллекторов (3 уровня)

### 🔴 P0 (must-have, ~1000 пар, ~2 ч)

Закрывают **factual hallucination** (например, HybridBackend → Strategy вместо Bridge).

| # | Скрипт | Что делает |
|---|--------|-----------|
| 1 | `patterns/reverse_patterns.py` | pattern → classes (reverse mapping). Q: «Какие классы реализуют Bridge?» → A: «HybridBackend (path:line)» |
| 2 | `patterns/synonym_pairs.py` | 1 факт = 4-5 формулировок. Q1: «Какой паттерн использует X?» Q2: «X — это какой паттерн?» Q3: ... → один A |
| 3 | `patterns/confusion_negatives.py` | Q: «X — Singleton?» → «Нет, Bridge». Учит anti-confusion |

**Источники данных**:
- `<target>/Doc/Patterns.md` (если есть)
- `<target>/_META.yaml` (modules + key classes)
- `pipelines/<target>_v1/golden_set/` (Q1-Q10 acceptance)
- L2 symbols из PG schema `rag_pao_<target>`

### 🟡 P1 (high-value, ~150-230 пар, ~3 ч)

| # | Скрипт | Что |
|---|--------|-----|
| 4 | `listings/multi_class_listing.py` | exhaustive listings: «Перечисли все RAII в core» |
| 5 | `facts/migration_history.py` | legacy → current (changelog + git log) |
| 6 | `docs/lessons_learned.py` | real bugs из `MemoryBank/sessions/*.md` (root cause + fix) |
| 7 | `facts/build_cmake_facts.py` | CMake / hipcc / ROCm факты |

### 🟢 P2 (nice-to-have, ~100-150 пар, ~2 ч)

| # | Скрипт | Что |
|---|--------|-----|
| 8 | `code/hip_primitives.py` (или performance_hints) | HIP optimization (LDS / coalescing / banks) |
| 9 | `code/cross_references.py` | кто кого использует (`#include` grep) |
| 10 | `style/api_style_guide.py` | code style (namespaces, файловая раскладка) |

---

## Acceptance после train (Q1-Q10)

После `bash scripts/train_v8.sh <target>` обязательно прогнать:
```bash
python -m rag_pao.finetune.eval.acceptance_test \
    --model adapters/<target>-qwen-coder-14b-lora-v1 \
    --questions pipelines/<target>_v1/golden_set/Q1_Q10_acceptance.jsonl
```

**Pass gate**:
- ≥ 9/10 на новой LoRA
- ≥ 7/10 на v6 pilot baseline (если есть)
- ≤ 5/10 на base Qwen-Coder без FT

Q1-Q10 — это **trap questions** про confusion:
- Q9: «Существует ли класс X?» (X = заведомо не существует) → «Нет, hallucination»
- Q10: «X — это Singleton?» (X — реально Bridge) → «Нет, Bridge»

---

## Naming convention

```
<category>/<collector_name>.py

category    = patterns | facts | docs | code | style | pybind | listings
collector_name = snake_case, описательный
```

Каждый коллектор:
1. Имеет `if __name__ == "__main__":` чтобы можно запустить standalone
2. Выводит JSONL (Alpaca-формат: `instruction`/`input`/`output`/`source`/`weight`)
3. Идемпотентен (запуск 2 раза = тот же результат, dedup по hash)
4. Логирует в Loguru (`utils/logging_setup.py`)

---

## Pre-flight перед train (D33 critical)

См. `MemoryBank/specs/04_policies_v0.3.md §H`:

```bash
bash infra/healthcheck.sh    # swapoff -a + kill GUI + ollama stop + VRAM check
```

Без этого 14B на 9070 даёт 14× замедление из-за swap page faults.
