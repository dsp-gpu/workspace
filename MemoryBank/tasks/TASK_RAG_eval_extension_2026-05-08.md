# TASK_RAG_eval_extension — RAGAs LLM-judge + golden-set v2 + CI

> **Этап:** EVAL · **Приоритет:** 🟠 P1 · **Effort:** ~4.5 ч · **Зависимости:** CONTEXT-FUEL этап (после C-этапа метрики имеют смысл)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Расширить **существующий** eval-harness (`dsp_assistant/eval/runner.py` 171 строк, 50 typed запросов в `golden_set/qa_v1.jsonl`):
- v1 (50) → v2 (100) + intent-типизация (E1)
- RAGAs LLM-judge поверх runner (E2)
- CI workflow на push/merge (E3)
- Pre-commit hook `_RAG.md` старения (E4)

## 📋 Подэтапы

### E1 — Golden-set v2 (~1.5 ч)

`MemoryBank/specs/LLM_and_RAG/golden_set/qa_v2.jsonl`:
- v1 (50 ✅) → v2 (100) — расширить + добавить поле `intent`
- 7 intent-категорий: `find_class` / `how_to` / `test_gen` / `pipeline` / `python_binding` / `migrate` / `debug`
- Распределение: ~14-15 запросов на каждый intent

`dsp_assistant/eval/golden_set.py` — добавить поле `intent` в `GoldenItem`.
`runner.py` — поддержка `--intent test_gen` для фильтрации.

### E2 — RAGAs LLM-judge (~1 ч)

`dsp_assistant/eval/ragas_metrics.py`:
```python
def faithfulness(answer: str, retrieved: list[str], judge_llm: LLM) -> float:
    """Ответ AI основан на retrieved chunks?"""

def answer_relevance(question: str, answer: str, judge_llm: LLM) -> float:
    """Ответ отвечает на вопрос?"""

def context_precision(question: str, retrieved: list[str], judge_llm: LLM) -> float:
    """Retrieved chunks релевантны?"""

def context_recall(question: str, expected_fqns: list[str], retrieved: list[str], judge_llm: LLM) -> float:
    """Все нужные chunks нашлись?"""
```

Judge-LLM: Qwen3-8B (локально) ИЛИ опционально Claude API.

CLI: `dsp-asst eval run --ragas` — поверх обычного runner.

### E3 — CI workflow (~1.5 ч)

`.github/workflows/rag_eval.yml`:
```yaml
on: [push, pull_request]
jobs:
  rag-eval:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker/eval-compose.yml up -d  # postgres+qdrant
      - run: pip install -e dsp_assistant
      - run: dsp-asst eval run --ragas --json-out eval-result.json
      - uses: actions/github-script@v7
        with:
          script: |
            // postcomment: дельта R@5/MRR/RAGAs vs baseline на main
```

Baseline на main — последние 5 eval_reports/ → median.

### E4 — Pre-commit hook `_RAG.md` старения (~30 мин)

`MemoryBank/hooks/pre-commit`:
```bash
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    rag_md="$repo/.rag/_RAG.md"
    if [ ! -f "$rag_md" ]; then continue; fi
    last_repo_change=$(git log -1 --format="%at" -- "$repo/")
    rag_age=$(git log -1 --format="%at" -- "$rag_md")
    if [ $((last_repo_change - rag_age)) -gt 864000 ]; then  # 10 days
        echo "WARN: $rag_md устарел (>10 дней с последнего изменения репо)"
    fi
done
```

## ✅ DoD

### E1
- [ ] `qa_v2.jsonl` 100 строк, поле `intent` у каждой
- [ ] Распределение 14-15 запросов на intent
- [ ] `runner.py --intent test_gen` фильтрует

### E2
- [ ] `ragas_metrics.py` 4 функции
- [ ] `dsp-asst eval run --ragas` печатает faithfulness/answer_relevance/context_precision/context_recall
- [ ] faithfulness ≥ 0.7 на v2

### E3
- [ ] `.github/workflows/rag_eval.yml` зелёный на push
- [ ] PR-комментарий показывает Δ метрик vs baseline

### E4
- [ ] Pre-commit hook предупреждает (не блокирует) при устаревшем `_RAG.md`
- [ ] Тест: `touch core/foo.cpp && git commit -m test` → warning

## Артефакты

- `MemoryBank/specs/LLM_and_RAG/golden_set/qa_v2.jsonl`
- `dsp_assistant/eval/ragas_metrics.py`
- `dsp_assistant/eval/runner.py` — расширение `--intent`, `--ragas`, `--json-out`
- `.github/workflows/rag_eval.yml`
- `docker/eval-compose.yml` — Postgres+Qdrant для CI
- `MemoryBank/hooks/pre-commit` — расширение

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Существующий код (переиспользовать): `dsp_assistant/eval/{runner,golden_set,retrieval_metrics}.py`
- Spec 09 §10 — `_RAG.md` старения

*Maintained by: Кодо · 2026-05-08*
