# TASK_RAG_context_fuel — INDEX/координатор подтасков RAG до Phase B QLoRA (12.05)

> **Создан:** 2026-05-08 · **Тип:** INDEX (мета-таск, не делает работу сам)
> **Strategic brief:** `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2
> **КФП design:** `MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md`
> **Принцип Alex 2026-05-08:** «Делаем по максимуму, сколько успеем до 12.05» — без жёсткого таймбюджета.

## 🎯 Цель координатора

13 атомарных подтасков для RAG-стека: **CONTEXT-FUEL** + **GRAPH** + **EVAL** + параллельный
трек **dataset для QLoRA**. После 12.05 — **AGENTIC RAG** (Phase C+).

Каждый подтаск — самостоятельный файл со своим DoD, может закрываться независимо.

---

## 🗂️ Карта подтасков (13 шт)

### Этап 0 — предусловие

| # | Файл | Effort | Зависимости |
|---|------|--------|-------------|
| 0 | [TASK_RAG_schema_migration_2026-05-08.md](TASK_RAG_schema_migration_2026-05-08.md) | ~1 ч | — |

### Этап 1 — CONTEXT-FUEL (C1-C10)

| # | Файл | Этап C | Effort | Зависимости |
|---|------|--------|--------|-------------|
| 1 | [TASK_RAG_test_params_fill_2026-05-08.md](TASK_RAG_test_params_fill_2026-05-08.md) | C1a+C1b | ~4.5 ч | schema_migration |
| 2 | [TASK_RAG_doxygen_test_parser_2026-05-08.md](TASK_RAG_doxygen_test_parser_2026-05-08.md) | C2 | ~3 ч | test_params_fill |
| 3 | [TASK_RAG_hybrid_upgrade_2026-05-08.md](TASK_RAG_hybrid_upgrade_2026-05-08.md) | C3+C4 | ~3.5 ч | schema_migration |
| 4 | [TASK_RAG_mcp_atomic_tools_2026-05-08.md](TASK_RAG_mcp_atomic_tools_2026-05-08.md) | C5+C6 | ~1.5 ч | test_params_fill, doxygen_test_parser |
| 5 | [TASK_RAG_context_pack_2026-05-08.md](TASK_RAG_context_pack_2026-05-08.md) | C7 | ~2 ч | mcp_atomic_tools; опц. graph_extension |
| 6 | [TASK_RAG_code_embeddings_2026-05-08.md](TASK_RAG_code_embeddings_2026-05-08.md) | C8 | ~5-6 ч | — |
| 7 | [TASK_RAG_late_chunking_2026-05-08.md](TASK_RAG_late_chunking_2026-05-08.md) | C9 | ~2 ч | ⏸️ **ОТЛОЖЕН до 12.05.26 (AMD Radeon)** — BGE-M3 не работает (cos 0.99), Jina/Nomic несовместимы с transformers 5.x на Win venv. Перепробовать на Debian + AMD Radeon RX 9070 в свежем venv |
| 8 | [TASK_RAG_telemetry_2026-05-08.md](TASK_RAG_telemetry_2026-05-08.md) | C10 | ~1 ч | TestRunner::OnTestComplete (linalg pilot) |

### Этап 2 — GRAPH

| # | Файл | Этап G | Effort | Зависимости |
|---|------|--------|--------|-------------|
| 9 | [TASK_RAG_graph_extension_2026-05-08.md](TASK_RAG_graph_extension_2026-05-08.md) | G1-G5 | ~9 ч | — (G2-calls = Phase B+ на Debian) |

### Этап 3 — EVAL

| # | Файл | Этап E | Effort | Зависимости |
|---|------|--------|--------|-------------|
| 10 | [TASK_RAG_eval_extension_2026-05-08.md](TASK_RAG_eval_extension_2026-05-08.md) | E1-E4 | ~4.5 ч | C-этап (метрики имеют смысл после улучшений) |

### Параллельный трек — fine-tune dataset

| # | Файл | Effort | Зависимости |
|---|------|--------|-------------|
| 11 | [TASK_RAG_dataset_generation_for_qlora_2026-05-08.md](TASK_RAG_dataset_generation_for_qlora_2026-05-08.md) | ~6-8 ч | test_params, use_cases, pipelines (частично) |

### Phase B+ (после 12.05)

| # | Файл | Этап A | Effort | Зависимости |
|---|------|--------|--------|-------------|
| 12 | [TASK_RAG_agentic_loop_2026-05-08.md](TASK_RAG_agentic_loop_2026-05-08.md) | A1-A4+G-calls | ~9-11 ч | Phase B QLoRA done + CONTEXT-FUEL/GRAPH/EVAL зелёные |

---

## 📐 Граф зависимостей

```
schema_migration (предусловие)
        │
        ├──► test_params_fill ─── doxygen_test_parser ──┐
        │                                                ├──► mcp_atomic_tools ──► context_pack
        │                                                │           │                  │
        ├──► hybrid_upgrade ─────────────────────────────┤           │                  │
        │                                                │           │                  ▼
        ├──► graph_extension (G1-G5) ────────────────────┘           │              eval_extension
        │                                                            │
        ├──► code_embeddings (C8) ────── параллельно ────────────────┤
        │                                                            │
        ├──► late_chunking (C9) ──────── параллельно ────────────────┤
        │                                                            │
        └──► telemetry (C10, ждёт TestRunner) ──────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Параллельный трек (не блокирует CONTEXT-FUEL):                       │
│   dataset_generation_for_qlora (можно стартовать после C1)           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Phase B+ (после 12.05):                                              │
│   agentic_loop = CRAG + Self-RAG + feedback + G-calls (clangd)       │
└─────────────────────────────────────────────────────────────────────┘
```

**Задачи без зависимостей** (можно стартовать одновременно):
- schema_migration
- code_embeddings (C8)
- late_chunking (C9)
- graph_extension (G — все 5 пунктов)

---

## 🔗 Связь с другими активными TASK

| Активный TASK | Связь |
|---------------|-------|
| `TASK_python_migration_phase_B_debian_2026-05-03` | Параллельный трек — пилотные python-тесты на 9070 |
| `TASK_validators_linalg_pilot_2026-05-04` | Блокирует TASK_RAG_telemetry (нужен `TestRunner::OnTestComplete`) |
| `TASK_FINETUNE_phase_B_2026-05-12` | Кормится: RAG inference готов на 12.05; параллельный track dataset_v3 |
| `TASK_remove_opencl_legacy_classes_2026-05-08` | Не пересекается (другая тема) |
| `TASK_remove_opencl_pybind_2026-05-06` | Part A DONE 08.05 (3 dead pybind удалены) |

---

## 📊 Сводка effort (для планирования, не дедлайн)

| Этап | Сумма | Комментарий |
|------|-------|-------------|
| schema_migration | ~1 ч | предусловие |
| CONTEXT-FUEL (C1-C10, без C8/C9) | ~16-17 ч | основной поток |
| GRAPH (G1-G5) | ~9 ч | независимо |
| EVAL (E1-E4) | ~4.5 ч | после C |
| code_embeddings + late_chunking (C8+C9) | ~7-8 ч | параллельно |
| dataset_generation_for_qlora | ~6-8 ч | параллельный трек |
| **Сумма до 12.05** | **~44-48 ч** | за 4 дня = ~11-12 ч/день — **нереалистично без сокращения** |

→ **При нехватке времени** убираем (по приоритету ROI):
- 🥇 P3 откладывают: code_embeddings (C8), late_chunking (C9), telemetry (C10)
- 🥈 P2: dataset_generation_for_qlora (можно после Phase B)
- 🥉 P1 минимум: schema_migration + test_params_fill + doxygen_parser + hybrid_upgrade + mcp_atomic_tools + graph_extension + eval_extension = **~26 ч** = 6-7 ч/день за 4 дня = **реалистично**.

12.05 → Phase B QLoRA на 9070 стартует на готовой RAG-базе (что успели — то baseline).

---

## DoD (координатора в целом)

- [ ] Все 13 подтасков имеют статус (📋/🚧/✅) в IN_PROGRESS.md
- [ ] Минимум **schema_migration + test_params_fill + doxygen_parser + hybrid_upgrade + mcp_atomic_tools** закрыты до 12.05
- [ ] eval_extension (E1+E2 минимум) закрыт до 12.05 для baseline-метрик Phase B
- [ ] Phase B QLoRA на 9070 12.05 стартует — RAG-инфраструктура готова на baseline-уровне

---

## Точки опоры для Phase B (12.05 утро)

1. Прочитать **этот файл** (карта 13 подтасков)
2. `RAG_deep_analysis_2026-05-08.md` v1.2 — strategic brief
3. `RAG_kfp_design_2026-05-08.md` — детали `test_params`
4. `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md` — план QLoRA на 9070
5. `MemoryBank/specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md` — почему именно так
6. `MemoryBank/specs/LLM_and_RAG/setup_instructions_2026-05-12.md` — общий setup на работе

---

*Maintained by: Кодо · 2026-05-08 · INDEX 13 подтасков (был monolith ~110 строк, теперь координатор).*
