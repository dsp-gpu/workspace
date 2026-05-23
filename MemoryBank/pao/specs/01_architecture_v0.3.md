# RAG_mentor ↔ rag-pao — Architecture (overview)

> **Версия**: 0.3 · **Дата**: 2026-05-23 · **Автор**: Alex + Кодо
> **Скоуп**: dual-RAG (oracle + executor), 2 режима доступа Кодо, customer drops external roots, 3 слоя rag-pao, QLoRA с collectors.

---

## 1. TL;DR

Делаем **2 каталога**:

| Роль | Путь Linux | git |
|------|------------|-----|
| **rag-mentor** (Oracle) | `/home/alex/rag-mentor` | ✅ `github.com/rag-mentor/rag-mentor` (private) |
| **rag-pao** (Executor) | `/srv/rag-pao` (сервер) или `/home/alex/rag-pao` (laptop) | ✅ **локальный git** + bare remote `/srv/git-remotes/rag-pao.git` |

**Customer drops** живут **рядом**, не внутри rag-pao:
- `/srv/pao_contrib/`, `/srv/pao_xxxx_acme/`, `/srv/pao_yyyy_globex/`, …
- Связь через `rag-pao/config/targets.yaml`.

**Платформа**: Linux везде. Laptop = Debian, server = Ubuntu 10.10.4.105 (RX 9070).

**Цель MVP** (5-6 недель): на target репо (старт: `pao_contrib`) показать end-to-end pipeline: header → retriever → Claude PromptBuilder → Qwen filler → name-validator → Qwen judge → Claude reviewer → Claude critic → `.rag/<class>.md` (doxygen + test_cases + GoogleTest skeleton).

**Приоритеты Alex (zero compromise)**: точность (галлюцинации = 0 на известных именах) → корректность кода → всё остальное.

---

## 2. Архитектура (high-level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│   rag-mentor (ORACLE)                  ↔  rag-pao (EXECUTOR)            │
│   Claude Opus 4.7 + свой RAG              Qwen Coder-14B + Qwen 35B     │
│   ────────────────────                    ─────────────────────         │
│   • PG schema rag_mentor                  • PG schema rag_pao_<t>       │
│   • Qdrant mentor_v1                      • Qdrant <t>_v1 per-target    │
│   • 7 локальных MCP-серверов              • FastAPI REST + MCP wrapper  │
│   • rag_mentor/ пакет:                    • rag_pao/ пакет с 3 слоями:  │
│     - orchestrator                          - core/  (stable, общий)   │
│     - prompt_builder                        - pipelines/<name>_vN/ (frozen)│
│     - oracle  ← retrieval mentor_db        - current/ (active dev)     │
│     - reviewer                            • access_control: debug ↔ prod │
│     - comparator  ← diff(эталон, Qwen)    • Indexer (tree-sitter+libclang)│
│     - critic                              • Hybrid retriever (BGE-M3+BM25)│
│     - rag_pao_client (REST+MCP)           • Qwen filler + Qwen judge   │
│     - name_validator (барьер 2)           • finetune/ QLoRA            │
│     - journal (per_prompt+per_class)      • external_corpus (open-src)  │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
            Customer drops (external roots, /srv/pao_<name>/)
            └ contrib/<module>/       (код заказчика)
            └ build/                  (cmake-инфраструктура)
            └ Doc/contrib/<module>/   (наши overlay'и)
            └ Example/contrib/<module>/
            └ Test/contrib/<module>/
            └ GTest/contrib/<module>/
            └ _META.yaml
```

### 2.1 Принцип dual-RAG (oracle ↔ executor)

| Подсистема | Что строит | На основе чего |
|------------|------------|----------------|
| **mentor (Oracle)** | **априорный «мудрый» эталон** ответа + промпт для Qwen | Claude + retrieval из `mentor_db` (golden_sets + prompts + sessions + methodology) |
| **pao (Executor)** | **Qwen-ответ** через filler + judge | retrieval target-кода + external_corpus |

**Comparator** в mentor: `diff(эталон, Qwen-ответ) → score 0-100 → list of issues`.
**Critic** в mentor: правит промпт v1 → v2 если score < 80.
**Retry**: max 3 итерации.

### 2.2 Cycle of self-correction (упрощённо)

```python
for class in target.classes:
    oracle_etalon = mentor.Oracle(class)           # Claude + mentor_db retrieval
    prompt = mentor.PromptBuilder(class, ctx)
    for attempt in range(MAX_RETRIES=3):
        qwen_out = pao.run_filler(prompt)
        if not name_validator(qwen_out): prompt = critic.fix(prompt); continue
        if not schema_lint(qwen_out): prompt = critic.fix(prompt); continue
        judge = pao.run_judge(qwen_out)
        if judge.score >= 80:
            review = mentor.Reviewer(qwen_out)
            if review.score >= 80:
                diff = mentor.Comparator(oracle_etalon, qwen_out)
                if diff.score >= 80:
                    save_to_rag(class, qwen_out)
                    save_distillation_log(prompt, qwen_out, judge, review, diff)
                    break
        prompt = mentor.Critic(prompt, qwen_out, judge.delta, review.notes)
    else:
        mark_for_human_review(class)
```

---

## 3. Принятые решения (D1-D33)

### Архитектурные (D1-D20, из v0.2)

| # | Решение |
|---|---------|
| **D1** | Judge = Qwen3.6-35B (inference only — Alex проверил) |
| **D2** | Контракт = REST primary + MCP гибрид; сервер ВСЕГДА self-hosted |
| **D3** | MVP target = `pao_contrib` (был nlohmann/json — пересмотрено) |
| **D4** | Hardware: filler 14B + judge 35B inference (queue swap) на 9070 |
| **D5** | rag-mentor репо private, open-source потом |
| **D6** | L0 corpus — минимум на старте (customer code + open-source) |
| **D7** | CLAUDE.md ментора — роль «строй промпты Qwen», запрет на правку target |
| **D8** | prompts/ источник истины = rag-mentor; pao читает sync'ом + журнал |
| **D9** | Prompt versioning = `v1/`, `v2/` + git tag |
| **D10** | Первый prompt в код = после Phase 04 |
| **D11** | C++17 only (требование заказчика) |
| **D12** | **QLoRA обязательно** — Qwen-Coder-14B vs Qwen3-14B → выбор лучшего |
| **D13** | GoogleTest подэтап L3b — обязательно |
| **D14** | 7 локальных MCP для Кодо (Context7-local + sequential-thinking + filesystem + git + postgres + qdrant + memory) |
| **D15** | Anthropic API rate — не критично (Max5 plan) |
| **D16** | `prompts/` split: `for_mentor/` + `for_rag_pao/` |
| **D17** | 2 уровня журнала: per-prompt + per-class |
| **D18** | rag-pao = локальный git + bare remote (D29) |
| **D19** | Customer code → external roots `/srv/pao_<name>/` (D21), `external_corpus/` = только public |
| **D20** | Header summarization > 50KB через tree-sitter |

### Дополнения 23.05 (D21-D33)

| # | Решение |
|---|---------|
| **D21** | Customer drops — external roots (`/srv/pao_<name>/`), доступ через `targets.yaml`. Без копирования |
| **D22** | Раскладка `pao_<name>/`: `build/` (cmake-infra) + `contrib/<module>/` (от заказчика) + overlay'и `Doc/Example/Test/GTest/contrib/<module>/`. Layout в `_META.yaml` + `targets.yaml` |
| **D23** | Mentor = полноценная RAG-подсистема. Свой `mentor_db` (PG + Qdrant) + 7 MCP + `oracle/` + `comparator/`. НЕ тонкий клиент |
| **D24** | Платформа: Linux везде. Laptop = Debian. Server = Ubuntu 10.10.4.105 |
| **D25** | Доступ Кодо к pao — **2 режима**: `debug` (full REST) + `production` (safe-endpoints). Per-target `codo_access` |
| **D26** | Collectors в rag-pao — логические градации: `patterns/ facts/ docs/ code/ style/ pybind/ listings/`. НЕ плоско |
| **D27** | Python пакеты: `rag_pao/` и `rag_mentor/` (не плоский `src/`). Скрипты в `scripts/` — тонкие обёртки |
| **D28** | 3 слоя в rag-pao: `core/` (stable) + `pipelines/<name>_vN/` (frozen) + `current/` (active dev) |
| **D29** | Sync mentor↔pao через git bare remote `/srv/git-remotes/rag-pao.git` |
| **D30** | YAML для `targets.yaml` / `_META.yaml` / `pipeline.yaml` / `mcp_servers.yaml`. JSON Schema для Qwen strict output |
| **D31** | Safe endpoints (production): `/show_signature`, `/show_symbols`, `/search` (filtered), `/run_filler` (sanitized) |
| **D32** | Oracle источник = Claude + retrieval из `mentor_db`. Без обращения в rag-pao |
| **D33** | QLoRA dataset = 10 коллекторов из `dataset_v8_plan_2026-05-21.md` в `pipelines/_template/collectors/` (шаблон) + `_logs/L*_distillation.jsonl`. Веса: `weight = final_judge_score / 100` (policies §E:482) |

---

## 4. Risks (актуальные)

| # | Risk | Mitigation |
|---|------|------------|
| **R1** | 35B-judge swap-latency (5-10 сек на класс) | acceptable, контролируем в `eval_runs.metrics` |
| **R2** | Customer code разнообразен по стилю doxygen | per-target `pipelines/<name>_v1/prompts_override/` |
| **R5** | Prompt drift Claude 4.7 → 5.0 | версионирование `v1/v2/` + re-validation на golden_set |
| **R6** | Дрейф Qwen 14B/Coder → новая ревизия | pin модели по sha256 в `model_router.py` |
| **R7** | Win dev → Linux prod path-bugs | `pathlib.Path` + `RAGCTL_STAGE` env, никаких `E:\` |
| **R8** | PG schema coexistence с DSP-GPU | разные schemas (`rag_mentor`, `rag_pao_<t>`, `dsp_gpu`) |
| **R9** | Anti-hallucination не достигнет 95% target | escalate-to-human + manual prompt fix + `manual_review_queue.md` |
| **R10** | 35B не обучается на 9070 (ROCm 47GB) | Phase 09 QLoRA только на 14B (Coder + Qwen3) |
| **R11** 🆕 | Debug-режим Кодо имеет доступ к коду → утечка в продакшен через привычку | flip `mode: debug → production` ОБЯЗАТЕЛЕН перед NDA-drops + regression test |
| **R12** 🆕 | Collectors v8 (DSP-GPU) не применимы 1:1 для нового customer drop | шаблон в `pipelines/_template/collectors/` адаптируется под target при `cp _template/ → <name>_v1/` |

---

## 5. Out of scope MVP

- ❌ Авто-правка target C++ кода (только `.rag/` карточки)
- ❌ Web-UI к retriever (только REST + CLI + MCP)
- ❌ Multi-target параллельно
- ❌ Auto-PR в target репо
- ❌ Auto-обновление промптов через genetic algorithms
- ❌ Fine-tune QLoRA на Qwen3.6-35B (не обучается на 9070)
- ❌ DPO после SFT — отдельная фаза

**В scope** (исправление v0.1):
- ✅ QLoRA 14B — обязательная фаза 09
- ✅ GoogleTest skeleton — обязательный под-слой L3b
- ✅ Collectors для QLoRA dataset — фаза 09.A (D33)
- ✅ 2 режима доступа Кодо (D25)

---

## 6. Estimate

| Фаза | Срок |
|------|------|
| 00 Bootstrap | 1.5-2 дня |
| 01 Infra | 2 дня |
| 02 L0 corpus + collectors P0 | 2-3 дня |
| 03 L1+L2 target | 1-2 дня |
| 04 Prompts v1 | 2 дня |
| 05 L3 pilot | 2-3 дня |
| 05b L3b GTest pilot | 1-2 дня |
| 06 L3+L3b full target | 2-3 дня |
| 07 L4 use_cases | 2 дня |
| 08 Eval + replicate | 2-3 дня |
| **09.A** Dataset synthesis (collectors P0+P1) | 2-3 дня |
| 09 QLoRA train + compare | 3-5 дней |

**Итого MVP**: **5-7 рабочих недель** (раньше говорили 5-6, теперь +1 неделя на 09.A).

---

## 7. Открытое

| # | Вопрос |
|---|--------|
| **Q-D8** | Когда стартуем Phase 00 Bootstrap? Команда Alex'а «делай Phase 00» |

Все Q11-Q20 + Q-D1..Q-D7 + Q-D9..Q-D12 + Q-R1..Q-R2 закрыты в раундах 1-5 (см. родители + dopolnenie v1.1 + review).

---

*v0.3 final. После старта Phase 00 — будут обновления по факту работы.*
