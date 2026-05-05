# TASK_RAG_12 — Retrieval validation: baseline ДО + замер ПОСЛЕ ingestion'а

> **Статус**: pending · **Приоритет**: LOW (контроль качества) · **Время**: ~1.5 ч · **Зависимости**: TASK_RAG_11
> **Версия**: v2 (после ревью v2.1) · добавлен Step 0 — baseline ДО ingestion'а

## Цель

Доказать прирост R@5 от RAG-карточек **сравнением с реальным baseline**, замеренным ДО ingestion'а (не с план-оценкой 0.88 из §16).

## Шаги

### Step 0 — Baseline ДО ingestion'а (новый шаг, обязательный)

Запустить **сразу после TASK_RAG_02** (БД с пустыми новыми таблицами, retrieval работает только по symbols через `dsp_gpu_code_v1`):

```bash
dsp-asst eval run \
  --golden_set MemoryBank/specs/LLM_and_RAG/golden_set/qa_v1.jsonl \
  --collections dsp_gpu_code_v1 \
  > MemoryBank/specs/LLM_and_RAG/_baseline_pre_rag_$(date +%Y-%m-%d).txt
```

Результат — реальный R@5 на «голом» symbol-retrieval. Это и есть baseline для сравнения.

### Step 1 — Замер ПОСЛЕ полной раскатки (TASK_RAG_11 завершён)

```bash
dsp-asst eval run \
  --golden_set MemoryBank/specs/LLM_and_RAG/golden_set/qa_v1.jsonl \
  --collections dsp_gpu_code_v1,dsp_gpu_rag_v1 \
  > MemoryBank/specs/LLM_and_RAG/_eval_post_rag_$(date +%Y-%m-%d).txt
```

### Step 2 — Сравнение

Сравнить:
- R@1, R@5, R@10, MRR@10
- Семантические misses (Q006, Q016, Q018 из roadmap §8) — должны закрыться new RAG-карточками.

### Step 3 — Опционально: статичный HyDE через synonyms

Включить в pipeline expansion `query → query + " " + use_case.synonyms_ru/en` для тех же запросов → ещё замер.

## DoD

- [ ] Step 0 выполнен сразу после TASK_RAG_02 — файл `_baseline_pre_rag_YYYY-MM-DD.txt` создан, реальный R@5 зафиксирован.
- [ ] Step 1 выполнен после TASK_RAG_11 — файл `_eval_post_rag_YYYY-MM-DD.txt` создан.
- [ ] Отчёт `MemoryBank/specs/LLM_and_RAG/_eval_report_2026-05-XX.md` с таблицей baseline ↔ post + дельта.
- [ ] **Доказан прирост**: post-R@5 > baseline-R@5 минимум на +0.03.
- [ ] R@5 (post) ≥ 0.93 (целевое из roadmap §8) — при условии что baseline был ≥0.85.
- [ ] Семантические misses ≤1 (было 3 в плане §16).
- [ ] Если прирост <0.03 ИЛИ post-R@5 <0.93 — open issue с разбором (что не сработало: парсер? embedding? reranker?).

## Связано с

- План: §16 метрики
- Roadmap: §8 (целевые метрики)
- Ревью v2.1: §«Таски → TASK_RAG_12»
- Финальный таск серии RAG-агентов
