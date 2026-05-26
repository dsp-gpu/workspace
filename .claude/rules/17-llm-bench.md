# 17 — LLM Benchmark Suite (`llm_bench` schema)

> **Когда применяется:** ВСЕГДА при работе с LLM compare, оценкой моделей, fine-tune progress tracking.
> **Multi-project:** DSP-GPU + rag-mentor + любые будущие проекты Alex'а.

## 🗃 Где БД

```
host: localhost  ·  port: 5432  ·  db: gpu_rag_dsp  ·  schema: llm_bench
user: dsp_asst  ·  password=DSP_ASST_PG_PASSWORD env (default "1")
```

Подключение **только через TCP** (peer auth не работает для `dsp_asst`):
```python
psycopg.connect("host=localhost port=5432 dbname=gpu_rag_dsp user=dsp_asst password=1")
```

## 📐 Соглашения (одинаковые для всех проектов)

### `project_name` (FK на `llm_bench.projects`)

- `dsp-gpu` — наш C++/HIP/ROCm
- `pao-contrib` — Qt/Boost vendored libs
- `rag-mentor` — sister project (Python/RAG)
- Любой новый — `INSERT INTO llm_bench.projects` сначала

### `test_id` префиксы (уникальные per project!)

| Project | Префикс | Пример |
|---------|---------|--------|
| dsp-gpu | `DSPGPU_` | `DSPGPU_T1_codegen` |
| pao-contrib | `PAO_` | `PAO_T3_describe` |
| rag-mentor | `RAG_` | `RAG_T1_retrieval` |

→ Не пересекутся при cross-project compare.

### `test_category` (ОБЩИЕ — для cross-project аналитики)

Эти категории **используют все проекты** (можно сравнивать модели cross-project):
- `codegen` — генерация нового кода
- `review` — code review (поиск багов)
- `describe` — описание существующего кода/класса
- `doxygen` — Doxygen tags / Python docstring
- `documentation` — Full.md / README
- `indexing` — JSON-структура класса
- `retrieval` — RAG retrieval (для rag-mentor)
- `synthesis` — синтез из контекста
- `dialogue` — диалоговый mentor

Не дублируй (`code_gen` ≠ `codegen` — используй `codegen`).

### `quality_score` / `correctness_score` / `completeness_score` (0-5)

| Score | Значение |
|-------|----------|
| **0** | пустой/невалидный response (auto: `len(response) < 50`) |
| 1 | wrong answer |
| 2 | partial, много ошибок |
| 3 | OK с оговорками |
| 4 | good |
| 5 | perfect |

3 score'а **отдельно**: quality (общее), correctness (факты), completeness (не обрезан).

### `judge_model`

- `'claude-opus-4-7'` — Claude через текст разговора (Кодо / сестрёнка)
- `'qwen3.6:35b-a3b-q8_0'` — локальный AI-judge (если автоматизируем)
- `'human'` — Alex руками
- `'auto_empty_detector'` — auto для пустых ответов (`quality_score=0`)

## 🚀 Workflow для compare

### 1. Создать `run` (start session)

```python
cur.execute("""
    INSERT INTO llm_bench.runs (project_name, batch_name, runner_script, git_sha, gpu_model, ollama_version, notes)
    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
""", (project, batch_name, script, git_sha, gpu, ollama_v, notes))
run_id = cur.fetchone()[0]
```

### 2. Для каждого ответа

```python
cur.execute("""
    INSERT INTO llm_bench.responses (
        run_id, project_name, model_name, model_size_gb, model_quant,
        is_finetune, finetune_project, dataset_version, training_step, training_eval_loss, base_model,
        test_id, test_category, test_difficulty, test_uses_real_code,
        prompt_hash, response_text, response_tokens, duration_seconds, thinking_used,
        num_ctx, num_predict, temperature
    ) VALUES (...)
""", (...))
```

### 3. AI-judge (Claude / Кодо / сестрёнка)

После прогона — прочитать каждый ответ, оценить, UPDATE:
```sql
UPDATE llm_bench.responses
SET quality_score=N, correctness_score=N, completeness_score=N,
    judge_model='claude-opus-4-7', judge_notes='краткая причина оценки'
WHERE run_id=<X> AND model_name='...' AND test_id='...';
```

### 4. Compare

```sql
-- Cross-project: in-domain vs transfer
SELECT model_name,
       MAX(CASE WHEN project_name='dsp-gpu'    THEN avg_q END) AS dsp_gpu,
       MAX(CASE WHEN project_name='rag-mentor' THEN avg_q END) AS rag_mentor,
       MAX(CASE WHEN project_name='dsp-gpu'    THEN avg_q END) -
       MAX(CASE WHEN project_name='rag-mentor' THEN avg_q END) AS delta
FROM (
    SELECT project_name, model_name, AVG(quality_score)::numeric(3,1) AS avg_q
    FROM llm_bench.responses WHERE quality_score IS NOT NULL
    GROUP BY project_name, model_name
) sub
GROUP BY model_name ORDER BY delta;

-- FT progress (после повторного train с новым dataset/step)
SELECT * FROM llm_bench.v_ft_progress;

-- Лидер по категориям
SELECT * FROM llm_bench.v_best_per_category WHERE project_name='X';
```

## ⚠️ Known issues / Workarounds

1. **Ollama 0.21.2 `/no_think` через system prompt buggy на Qwen3.6** — использовать `"think": false` в API request.
2. **num_predict** для thinking-models = минимум 4000 (иначе response пустой, thinking trace съел все токены).
3. **`repeat_penalty: 1.15`** для 30B-A3B обязательно (была catastrophic зацикленность в T2 Python review).
4. **postgres user НЕ читает `/home/alex/`** — SQL файлы через `cat | sudo -u postgres psql` или скопировать в `/tmp/`.
5. **psycopg + dsp_asst через socket** падает (peer auth) — использовать `host=localhost` (TCP) с password.

## 🎯 Когда обязательно использовать

- ✅ Любой compare 2+ моделей на одних тестах → пиши в БД
- ✅ Любой fine-tune progress check (после нового train) → новый run, прежние tests
- ✅ Cross-project test (нашу модель на чужих задачах) → разный `project_name`, тот же `test_category`
- ❌ Один-off вопрос к Ollama (не compare) → не пиши

## 📂 Артефакты

- Schema: `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/sql/01_create_llm_bench_schema.sql`
- Import: `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/import_results_to_db.py`
- Runner v2 (DSP-GPU): `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/run_compare_v2.sh`
- Runner pao: `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/run_compare_pao.sh`
- Protocol для rag-mentor: `/home/alex/rag-mentor/MemoryBank/llm_bench_protocol_2026-05-25.md`

---

*Создано: 2026-05-25 · Кодо*
