# 📋 TASK — Развёртывание RAG+LLM (фазы A–F)

> Исполняемый план развёртывания по набору `RAG_LLM_install/`. Каждая фаза — DoD + шаги + ссылка на спеку.
> **Платформа**: Debian 13 / Ubuntu 24 + ROCm 7.2 + RX 9070 (gfx1201, 16 ГБ) + Python 3.12.
> **Статус**: 📋 готов к исполнению · **Создан**: 2026-06-01

---

## Карта зависимостей фаз

```
A (storages) ──► B (ingestion) ──► C (retrieval+MCP) ──► F (eval)
                                          │
                      E (production inference) ◄─── (независимо от B/C)
                                          │
                      D (dataset+FT, опц.) ◄─── зависит от C (RAG-БД)
```

---

## Фаза A — Хранилища (storages)

**Спека**: `02_STACK` + `03_DEPLOY` Шаги 1-4.
**Шаги**: ROCm 7.2 → PostgreSQL 16 + pgvector (5 SQL по порядку) → Qdrant (`dsp_gpu_rag_v1`) → Ollama.
**DoD**:
- [ ] `hipcc --version` ROCm 7.2; `rocm-smi` видит GPU
- [ ] `psql -h localhost -U dsp_asst -d gpu_rag_dsp -c '\dt rag_dsp.*'` → 14 таблиц
- [ ] `curl localhost:6333/collections/dsp_gpu_rag_v1` → exists, vector_size=1024
- [ ] `ollama list` → nomic-embed-text

## Фаза B — Ingestion (наполнение RAG)

**Спека**: `04_RAG_Pipeline` + `03_DEPLOY` Шаги 5-8.
**Шаги**: venv (torch 2.11+rocm7.2) → HF stubs → `index build/embeddings/extras` → `re_ingest_all.sh` → `ingest_test_tags.py` (на 9 репо, build_order).
**DoD**:
- [ ] `symbols` > 6000, `doc_blocks` > 2000, `use_cases` > 100
- [ ] 🔴 `test_params` > 0 (P0; иначе генерация тестов вслепую) — нужны `@test*` теги (агент doxytags)
- [ ] embeddings залиты в Qdrant `dsp_gpu_rag_v1`

## Фаза C — Retrieval-сервис + MCP

**Спека**: `02_STACK` §5-6 + `03_DEPLOY` Шаги 7,9,11.
**Шаги**: systemd user-units (embed/dsp-asst) → linger → регистрация MCP в Claude Code.
**DoD**:
- [ ] `systemctl --user is-active dsp-asst.service` → active; `curl :7821/health` ok
- [ ] `loginctl show-user alex | grep Linger` → yes
- [ ] `claude mcp get dsp-asst` → ✓ Connected
- [ ] `dsp_search('как профилировать ядро')` возвращает релевантный top-5

## Фаза D — Dataset + Fine-Tune (ОПЦИОНАЛЬНО)

**Спека**: `05_DATASET_and_FineTune`.
**Когда**: только если нужен «стилевой» сигнал (v8a). Факты — через RAG (Фаза C), FT для них не нужен.
**Шаги**: `collect_rag_v6.py` → `build_dataset_v3.py` → `prepare_phase_b.py` → `unsloth[amd]` → `train_simple.py` (Plan-D патч) → `run_with_resume.sh` → `post_train.sh`.
**DoD**:
- [ ] dataset_train/val.jsonl + health-report
- [ ] train без `hipErrorIllegalAddress` (unsloth[amd]); eval_loss < 1.0
- [ ] GGUF Q4_K_M создан, Modelfile-формат = train-формат
- [ ] результат записан в `llm_bench` (is_finetune, eval_loss)

## Фаза E — Production Inference

**Спека**: `06_PRODUCTION_Inference`.
**Шаги**: сборка llama.cpp ROCm (на целевой машине, fix commit) → GGUF-модели → `llm-switch` env-файлы → деплой `:8080`.
**DoD**:
- [ ] `curl :8080/v1/models` ok
- [ ] `llm-switch mtp` → 36 tok/s, draft accept > 75%
- [ ] Continue VSCode → `http://127.0.0.1:8080/v1` отвечает
- [ ] `--reasoning off` (нет thinking-trap), `repeat_penalty 1.15`

## Фаза F — Eval + автоматизация

**Спека**: `04_RAG_Pipeline` §8.
**Шаги**: golden_set прогон (`eval/runner.py` hybrid/dense/sparse) → метрики → pre-commit + weekly cron.
**DoD**:
- [ ] R@5 hybrid ≥ 0.88 (symbols)
- [ ] (улучшение) sparse на doc_blocks/use_cases → R@5 RAG-таблиц ≥ 0.78
- [ ] weekly cron `manifest refresh` (вт 09:00)
- [ ] (опц.) RAGAs faithfulness ≥ 0.7, CI `rag_eval.yml`

---

## Известные блокеры (приоритет)

| P | Блокер | Фаза | Фикс |
|---|--------|------|------|
| P0 | `test_params` = 0 → тесты вслепую | B | `ingest_test_tags.py` + doxytags `@test*` + ручная верификация 20 классов |
| P1 | sparse не на RAG-таблицах → use-case не находятся | F | tsvector+GIN на doc_blocks/use_cases/pipelines |
| P2 | FT блокирован bnb 0.49.2 NaN | D | `unsloth[amd]` |

---

*Maintained by: Кодо · 2026-06-01*
