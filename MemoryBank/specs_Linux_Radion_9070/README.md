# Linux + Radeon 9070 — миграция LLM/RAG на работу

> **Папка:** материалы по миграции LLM+RAG инфраструктуры с Windows (WSL Ubuntu) на рабочий Debian + RX 9070.
> **Целевая дата:** 12.05.2026
> **Maintainer:** Кодо main #1

## Файлы

- `inventory_2026-05-10.md` — глубокий анализ что есть на Windows (БД, скрипты, модели, размеры)
- `migration_plan_2026-05-10.md` — пошаговый план 6 фаз с командами и ETA
- `ssd_transfer_list_2026-05-10.md` — что нести через SSD (двоичные модели + размеры)
- `task_phase_b_debian_setup_2026-05-12.md` — TASK-файл для исполнения 12.05
- `INSTALL_DEBIAN_offline_2026-05-10.md` — пошаговая install из offline pack (Debian)
- `offline_pack_download_list_2026-05-10.md` — что скачивать на Windows для тайги
- `finetune_env_reorg_plan_2026-05-10.md` — план reorg структуры finetune-env (в ревью)
- `postgres_grounded_inference_2026-05-11.md` — anti-galлюц через PG+Qdrant
- `halluc_metrics_2026-05-11.md` — экспериментальные метрики 4 моделей

## Статус (2026-05-11)

📋 **План в ревью** — см. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md`:
- 21 находка по плану + 4 соседним spec'ам
- CRITICAL: HF token ревокать, кириллица в `collect_acк_advanced.py` починить, BGE dim 768→1024 fix
- Cross-platform `core/paths.py` v2 (Windows E:/ + Debian /home/alex)
- Миграция `C:\finetune-env` → `E:\finetune-env` спроектирована (M0-M5)

## Связано

- `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` — **главное ревью + миграция C:→E:**
- `MemoryBank/specs/LLM_and_RAG/dataset_post_phase_b_plan_2026-05-10.md` — что делать после обучения
- `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md` — root-cause smoke train
- `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md` — таск обучения

---

*Created: 2026-05-10 поздняя ночь · после глубокого анализа finetune-env / dsp_assistant / WSL setup*
