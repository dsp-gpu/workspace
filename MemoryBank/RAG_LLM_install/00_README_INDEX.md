# 📦 RAG & LLM Install — единый набор для развёртывания

> **Назначение**: самодостаточный набор документов, по которым DSP-GPU RAG+LLM-стек
> разворачивается **с нуля** на новой машине. Заменяет ~90 разбросанных файлов
> истории (`specs/LLM_and_RAG/*`, `specs/rag_mentor_*`, `specs/phase*`, `tasks/TASK_RAG_*`,
> `tasks/TASK_FINETUNE_*`).
> **Создан**: 2026-06-01 · на основе глубокого анализа (4 агента + sequential-thinking)
> **Платформа**: Debian 13 / Ubuntu 24 + ROCm 7.2 + AMD RX 9070 (gfx1201, 16 ГБ) + Python 3.12

> ℹ️ Папка названа `RAG_LLM_install` (нормализовано от «RAD_LLN_instal»).

---

## 🎯 Что это и зачем

Информация про RAG, LLM и датасет была размазана по десяткам файлов разных дат
(Phase 5/6/7, dataset v3/v4/v6/v7, RAG_deep_analysis, rag_mentor, server_deploy…).
Этот набор — **дистиллят**: убраны логи экспериментов, оставлена только
**воспроизводимая инструкция развёртывания** + архитектурный паттерн.

Результат: по этим документам можно поднять стек на новом железе без чтения истории.

---

## 🗺 Состав набора (порядок чтения)

| # | Документ | Что внутри | Статус |
|---|----------|-----------|--------|
| 00 | **README_INDEX** (этот файл) | карта набора, что заменяет | ✅ |
| 01 | **PATTERN_Architecture** | 🧬 **архитектурный паттерн проекта** + почему так + диаграмма слоёв | ✅ |
| 02 | STACK_Components | 5 сервисов, порты, версии, БД-схема, Qdrant, embeddings, systemd | ✅ |
| 03 | **DEPLOY_FromScratch** | 🛠 пошаговый bringup с нуля (ROCm→PG→Qdrant→venv→ingest→MCP) | ✅ |
| 04 | RAG_Pipeline | ingestion→embed→retrieve→rerank→context-pack, atomic tools, агенты, eval | ✅ |
| 05 | DATASET_and_FineTune | RAG БД→JSONL, QLoRA конфиг, unsloth[amd], post-train→GGUF | ✅ |
| 06 | PRODUCTION_Inference | llama-server (ROCm) MTP, llm-switch, выбор моделей, llm_bench | ✅ |
| 07 | OPERATIONS_Runbook | health-check, restart, backup, re-ingest, troubleshooting | ✅ |
| — | **TASK_RAGLLM_deploy_INDEX** + фазы A–F | исполняемые задачи развёртывания с DoD | ✅ |

> Набор полный (00–07 + TASK). Фактура сверена с реальной ФС 2026-06-01.
> Источники-история (~90 файлов) — кандидаты на чистку по решению Alex.

---

## 🧬 Паттерн проекта (одной строкой)

> **Modular Code-Aware RAG over a Knowledge Graph**, доставляемый как
> **Tool-Augmented LLM через MCP**, под принципом **RAG-for-facts / FT-for-style**.

Подробно → [`01_PATTERN_Architecture.md`](01_PATTERN_Architecture.md).

---

## ⚡ Стек в одной таблице

| Слой | Технология | Порт | Роль |
|------|-----------|-----:|------|
| Реляционное хранилище | PostgreSQL 16 + pgvector | 5432 | symbol-graph, BM25 (tsvector), метаданные, `llm_bench` |
| Векторное хранилище | Qdrant | 6333/6334 | коллекция `dsp_gpu_rag_v1` (BGE-M3 1024-dim) |
| Embeddings + reranker | BGE-M3 + bge-reranker-v2-m3 (fp16, ROCm) | — | внутри dsp-asst |
| RAG API | `dsp-asst serve` | 7821 | hybrid search + atomic MCP tools |
| Embed для Continue | BGE-M3 ONNX (CPU) | 8765 | `@codebase` в VSCode |
| LLM inference | **llama-server (ROCm)** | 8080 | production-генерация (MTP/30B/14B) |
| LLM вспом. | Ollama | 11434 | quick-test, nomic-embed |

---

## 🔗 Источники (что дистиллировано)

- `specs/LLM_and_RAG/` (66 файлов): 00_Master_Plan, 01_Stack_Decisions, 03_Database_Schema, 09_RAG_md_Spec, 10_DataFlow, 12_DoxyTags, 13_RAG_Extension_RoadMap, MCP_Setup_Guide, configs/, prompts/, golden_set/, dataset_* …
- `specs/`: server_deploy_2026-05-28, phase6_FINAL, phase7_compare, ollama_vs_llamaserver, training_strategy, rag_mentor_*
- `specs_Linux_Radion_9070/`: rag_stack_cheatsheet, rag_stack_boot_architecture
- `tasks/`: TASK_RAG_* (52), TASK_FINETUNE_* , llm_bench rule 17

После проверки набора эти источники архивируются/прибираются (по решению Alex).

---

*Maintained by: Кодо · 2026-06-01*
