# RAG_mentor ↔ rag-pao — архитектура (overview)

> **Версия**: 0.2 (после правок Alex) · **Дата**: 2026-05-20 · **Автор**: Кодо (Opus 4.7) для Alex
> **Статус**: spec, предкодовая фаза. На диске ещё ничего не создано.
>
> **v0.1**: одиночный 580-строчный файл. **v0.2**: разбит на 4 файла + обновлены ответы Alex.

---

## 📚 Map of related docs (читать в порядке)

| Файл | О чём |
|------|-------|
| **этот файл** | overview · принятые решения · risks · open questions · next actions |
| [rag_mentor_structure_2026-05-20.md](rag_mentor_structure_2026-05-20.md) | детальная структура каталогов rag-mentor/ и rag-pao/, .gitignore, PG schema coexistence |
| [rag_mentor_phases_2026-05-20.md](rag_mentor_phases_2026-05-20.md) | HI-RAG слои L0-L5, фазы 00-09, QLoRA как обязательная фаза, GoogleTest L3b, hardware budget |
| [rag_mentor_policies_2026-05-20.md](rag_mentor_policies_2026-05-20.md) | anti-hallucination (приоритет №1 Alex), формат журнала, контракт REST+MCP, локальные MCP-сервера |

**Источники (внутренние)**:
- [template_rag_mcp_cpp_plan_2026-05-19.md](template_rag_mcp_cpp_plan_2026-05-19.md) — базовый план
- [template_rag_mcp_cpp_review_2026-05-19.md](template_rag_mcp_cpp_review_2026-05-19.md) — ревью, A1-A8
- [LLM_and_RAG/09_RAG_md_Spec.md](LLM_and_RAG/09_RAG_md_Spec.md) — формат `.rag/` (используем)
- [LLM_and_RAG/12_DoxyTags_Agent_Spec.md](LLM_and_RAG/12_DoxyTags_Agent_Spec.md) — `doxytags fill` CLI (переиспользуем)
- [LLM_and_RAG/13_RAG_Extension_RoadMap.md](LLM_and_RAG/13_RAG_Extension_RoadMap.md) — HyDE / use_cases / examples (применимо)
- [LLM_and_RAG/01_Stack_Decisions_2026-04-30.md](LLM_and_RAG/01_Stack_Decisions_2026-04-30.md) — обоснование стека
- `spectrum/include/dsp/spectrum/fft_processor_rocm.hpp` — эталон формата doxygen+@test DSL

---

## 1. TL;DR

Делаем **1 git репо + 1 локальный git** (Alex 2026-05-20):

| Роль | Путь Windows | Путь Debian | git |
|------|--------------|-------------|-----|
| **rag-mentor** (online mentor) | `E:\rag-mentor\` | `/home/alex/rag-mentor` | ✅ `github.com/rag-mentor/rag-mentor` (private) |
| **rag-pao** (offline executor) | `E:\rag-pao\` | `/home/alex/rag-pao` | ✅ **локальный git** (без remote — имитация офлайн-сервера заказчика) |

- **rag-mentor**: Claude Opus 4.7 строит промпты + Claude Sonnet 4.6 reviewer + Claude Opus 4.7 critic. У ментора **свой PG + Qdrant + MCP-server** — чтобы Claude знал что есть в проекте при составлении промптов (Alex).
- **rag-pao**: Qwen2.5-Coder-14B (filler, trainable QLoRA) + Qwen3.6-35B (judge, inference-only) + BGE-M3 + Qdrant + PG.

Цикл обучения — **Hierarchical Incremental RAG (HI-RAG)** + **QLoRA** в конце. Слои **L0 → L1 → L2 → L3 → L3b (GoogleTest) → L4 → L5 (QLoRA)**, каждый закрыт `golden_set_Lx`-гейтом.

**Приоритеты Alex (zero compromise)**: 1. точность (галлюцинаций = 0 на известных переменных) → 2. кодинг минимум ошибок → 3. всё остальное.

Цель MVP — на target репо (старт: `nlohmann/json`) показать end-to-end pipeline: header → retriever → Claude PromptBuilder → Qwen filler → name-validator → Qwen judge → Claude reviewer → Claude critic → `.rag/<class>.md` (doxygen + test_cases в DSL как в `spectrum/include/dsp/spectrum/fft_processor_rocm.hpp`) + GoogleTest skeleton.

После стабилизации MVP — Alex подсовывает рабочий проект заказчика в `targets/`. Harness переиспользуется.

---

## 2. Архитектура (high-level)

```
┌──────────────────────────────────────────────────────────────────────┐
│              TARGET C++ CODEBASE  (read-only, в rag-pao/targets/)    │
│  include/  src/  tests/  CMakeLists.txt   Doc/                       │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ tree-sitter + libclang (C++17 only)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│        rag-pao  (offline executor, Debian RX 9070 + Windows dev)        │
│                                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────────┐    │
│  │ Indexer  │ → │  PG schema   │ ↔ │  Qdrant    │   │  MCP-server  │    │
│  │ ts + lc  │   │ rag_pao_<t>  │   │ <t>_v1     │   │  (Claude     │    │
│  │ doxytags │   │              │   │ BGE-M3     │   │   debug)     │    │
│  └──────────┘   └──────────────┘   └────────────┘   └──────────────┘    │
│                       │                                                 │
│                       ▼                                                 │
│            ┌──────────────────────┐                                     │
│            │  HybridRetriever     │   L0/L1/L2/L3 aware                 │
│            │  (BM25 + dense +     │                                     │
│            │   reranker + RRF)    │                                     │
│            └──────────┬───────────┘                                     │
│                       │                                                 │
│   ┌───────────────────┼─────────────────────────┐                       │
│   ▼                   ▼                         ▼                       │
│ ┌─────────┐    ┌─────────────┐    ┌──────────────────┐                  │
│ │ Qwen2.5 │    │ Qwen3.6-35B │    │  name_validator  │                  │
│ │ Coder14B│    │ JUDGE       │    │  + schema lint   │                  │
│ │ FILLER  │    │ (frozen,    │    │  + doxygen lint  │                  │
│ │ trainab │    │  inference) │    │  + forbidden     │                  │
│ └────┬────┘    └──────┬──────┘    └──────┬───────────┘                  │
│      │                │                  │                              │
│      └────────┬───────┴──────────────────┘                              │
│               ▼                                                         │
│   ┌─────────────────────┐    ┌─────────────────────┐                    │
│   │   .rag/<target>/    │    │  finetune/ (Phase 9)│                    │
│   │   L1...L4 + tests/  │    │  QLoRA: Coder-14B   │                    │
│   │   sessions/001_...  │    │       & Qwen3-14B   │                    │
│   │   _logs/distill.    │ →  │  выбираем лучший    │                    │
│   └─────────────────────┘    └─────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ REST (primary) + MCP (debug)
                              │
┌─────────────────────────────┴────────────────────────────────────┐
│  rag-mentor  (online, Windows / Debian / Ubuntu + Anthropic API) │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐   │
│  │  PG schema   │   │   Qdrant     │   │   локальные MCP     │   │
│  │  rag_mentor  │   │   mentor_v1  │   │   (Context7 local,  │   │
│  │  (prompts,   │   │   (промпты + │   │   sequential-think, │   │
│  │   sessions,  │   │   fewshot)   │   │   filesystem, git,  │   │
│  │   targets,   │   │              │   │   postgres, qdrant, │   │
│  │   eval_runs) │   │              │   │   memory)           │   │
│  └──────────────┘   └──────────────┘   └─────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Orchestrator (Python harness)                           │    │
│  │                                                          │    │
│  │   ┌──────────────────┐                                   │    │
│  │   │  PromptBuilder   │ ← Claude Opus 4.7                 │    │
│  │   │  с retrieval-    │   (видит свою PG/Qdrant — Alex)   │    │
│  │   │  grounding       │                                   │    │
│  │   └─────────┬────────┘                                   │    │
│  │             │                                            │    │
│  │             ▼ REST → rag-pao                             │    │
│  │     (filler / judge / save_rag / name_validator)         │    │
│  │             │                                            │    │
│  │             ▼ JSON ответ                                 │    │
│  │   ┌──────────────────┐                                   │    │
│  │   │   Reviewer       │ ← Claude Sonnet 4.6               │    │
│  │   └─────────┬────────┘                                   │    │
│  │             │ if score < 80                              │    │
│  │             ▼                                            │    │
│  │   ┌──────────────────┐                                   │    │
│  │   │   Critic         │ ← Claude Opus 4.7                 │    │
│  │   │   правит prompt  │                                   │    │
│  │   └─────────┬────────┘                                   │    │
│  │             │ retry max 3                                │    │
│  │             └─→ back to PromptBuilder                    │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 2.1 Принципиальные изменения после правок Alex

| Что | Было (v0.1) | Стало (v0.2) |
|-----|-------------|--------------|
| **Кол-во репо** | 2 git (github) репо под org | 1 git репо `rag-mentor` + 1 соседний каталог `rag-pao` (Q11 — git (локальный) ) |
| **mentor хранилища** | stateless | **свой PG `rag_mentor` + Qdrant `mentor_v1` + MCP-server** (Alex: «чтобы знать что есть») |
| **mentor локация** | только Windows | Windows ИЛИ Debian/Ubuntu |
| **QLoRA** | out-of-scope | **обязательная фаза 09** (Alex: «мы всё делаем для этого») |
| **GoogleTest** | не было | **новый под-слой L3b** + новая фаза 05b/06 |
| **Boost selection** | сами выбираем 7 либ | ждём список от заказчика, на старте минимум (Boost.JSON + fmt + nlohmann + Eigen Core) |
| **Anti-hallucination** | rejection sampling | **4 барьера** + name_validator + trap-вопросы + forbidden_terms (приоритет №1 Alex) |
| **Journal format** | не было | `.rag/<t>/sessions/NNN_<Class>_<date>.md` + prompts/outputs внутри (Alex Q8) |
| **Локальные MCP** | не упоминалось | **6 обязательных + 4 рекомендуемых** для Кодо (Alex запросил) |
| **Стек контракт** | REST / MCP / files обсуждаем | **REST primary + MCP гибрид, сервер всегда наш** (Alex) |
| **Estimate MVP** | 2-3 недели | **3-4 недели** (учли L3b + 3 модуля + anti-hallucination), **+1-2 недели QLoRA** |
| **Honest no-rate-limit** | cost_tracker критичен | у Alex Max5 → cost_tracker нужен только для аналитики |
| **C++ standard** | до C++20 | **C++17 only** (заказчик) |
| **PG coexistence** | новый instance | **разные schemas** в существующем PG (`rag_mentor`, `rag_pao_<t>`) рядом с `dsp_gpu` |

---

## 3. Принятые решения (бывшие Q1-Q10 — ответы Alex)

| # | Решение | Источник |
|---|---------|----------|
| **D1** | **Judge = Qwen3.6-35B** (есть, протестирован, работает inference — Alex проверил) | Alex Q1 |
| **D2** | **Контракт = REST primary + MCP гибрид**, сервер ВСЕГДА наш self-hosted | Alex Q2 + комментарий «сервер — всегда наш» |
| **D3** | **MVP target = nlohmann/json** (Alex согласен, доустановим если что) | Alex Q3 |
| **D4** | **Hardware**: filler 14B на 9070 норм, judge 35B inference норм (через swap-queue), QLoRA — только 14B (Alex проверил что 35B не обучается на 9070) | Alex Q4 |
| **D5** | **Репо private**, переедет в open-source когда стабилизируется | Alex Q5 |
| **D6** | **L0 corpus на старте — минимум**: 3-4 либы, ждём список Boost от заказчика | Alex Q6 |
| **D7** | **CLAUDE.md ментора** = роль «строй промпты Qwen'у», запрет на финальную правку target кода | Alex Q7 |
| **D8** | **prompts/ источник истины = rag-mentor**; rag-pao читает sync'ом + **журнал с описанием в pao** для каждого выполнения (Alex: «получим набор документов для обучения локальной кодовой базы») | Alex Q8 |
| **D9** | **Versioning prompts** = папки `v1/`, `v2/` + git tag на каждой версии | Alex Q9 |
| **D10** | **Первый prompt в код** = когда Claude настроен на rag-mentor (после Phase 04) | Alex Q10 |
| **D11** | **C++17 only** (требование заказчика) | Alex R4 |
| **D12** | **QLoRA — обязательно**, сравниваем Qwen-Coder-14B vs Qwen3-14B → выбираем лучший | Alex §12 «не согласен!!!!» |
| **D13** | **GoogleTest** — добавлять примеры кода и тестов во время работы, накапливать в external_corpus | Alex §6 |
| **D14** | **Локальные MCP для Кодо** — Context7-local + sequential-thinking минимум, остальное (filesystem/git/postgres/qdrant/memory) — рекомендую | Alex §14 |
| **D15** | **Anthropic API rate** — не критично (Max5 plan), `cost_tracker.py` оставляем для аналитики | Alex R3 |
| **D16** | **prompts split** в `rag-mentor/MemoryBank/prompts/`: 2 подкаталога — `for_mentor/` (как Claude себя ведёт) + `for_rag_pao/` (нумерованные 001-, 002- для Qwen) | Alex 2026-05-20 |
| **D17** | **2 уровня журнала**: per-prompt в `rag-pao/MemoryBank/prompts/NNN_*.journal.md` (история промпта) + per-class в `rag-pao/.rag/<t>/sessions/NNN_<Class>_<date>.md` (что получилось у класса) | Alex 2026-05-20 |
| **D18** | **rag-pao = локальный git** (без remote), имитация офлайн-сервера. Артефакты `.rag/`, `_logs/`, журналы — коммитим | Alex Q11 |
| **D19** | **Boost source = customer drop** в `external_corpus/customer_drop/` (NDA OK). Public Boost crawler — fallback | Alex 2026-05-20 |
| **D20** | **Header summarization** — для `size > 50KB` генерим cleaned-копию через tree-sitter (только public-секция + doxygen) | Alex's идея 2026-05-20 |

---

## 4. Risks (актуализированные)

| # | Risk | Mitigation |
|---|------|------------|
| **R1** | **35B-judge swap-latency** — queue swap'ом ~5-10 сек на класс, batch из 30 классов = +5 минут | acceptable, контролируем latency в `eval_runs.metrics` |
| **R2** | **Boost разный по стилю doxygen** — corpus получится зашумлённым | strict selection policy (см. [phases §4](rag_mentor_phases_2026-05-20.md#4-boost--selection-policy-объяснение-для-alex)) + manual cleanup 10% sample |
| ~~R3~~ | ~~Anthropic API rate-limit / cost~~ | **снят** — Alex Max5 |
| ~~R4~~ | ~~tree-sitter C++20 modules~~ | **снят** — C++17 only |
| **R5** | **Prompt drift Claude 4.7 → 5.0** | версионирование `prompts/v1`, `v2` обязательно + ре-валидация на golden_set при апгрейде |
| **R6** | **Дрейф Qwen14B Instruct → Coder → новая ревизия** | pin модели в `model_router.py` по sha256 |
| **R7** | **Windows dev → Debian prod path-bugs** | всё через `pathlib.Path`, `RAGCTL_STAGE` env, никаких `E:\` |
| **R8** | **PG schema coexistence с DSP-GPU данными** | разные schemas — `rag_mentor`, `rag_pao_<t>` — рядом с `dsp_gpu` |
| **R9** | **Anti-hallucination не достигнет 95% target** | escalate-to-human + manual prompt fix + лог в `manual_review_queue.md` |
| **R10** | **35B обучается через ROCm-load 47GB** — Alex сказал «не обучается» | Phase 09 QLoRA только на 14B-моделях (Coder-14B + Qwen3-14B) |

---

## 5. Out of scope MVP

- ❌ Авто-правка исходного C++ кода target (только `.rag/` карточки до полной отладки).
- ❌ Web-UI к retriever (только REST + CLI + MCP).
- ❌ Multi-target одновременно (один target = один pipeline run; параллельно — после MVP).
- ❌ Auto-PR в target репо.
- ❌ Auto-обновление промптов через genetic algorithms (PromptBreeder) — только Claude-critic ручной коррекцией.
- ❌ Fine-tune QLoRA на Qwen3.6-35B (Alex проверил — не обучается на 9070).
- ❌ DPO после SFT — отдельная фаза, не в MVP.

**Не в out-of-scope (исправление v0.1)**:
- ✅ QLoRA 14B — **обязательная** фаза 09.
- ✅ GoogleTest skeleton — **обязательный** под-слой L3b.

---

## 6. Open questions (актуальные)

| # | Вопрос | Статус / рекомендация |
|---|--------|------------------------|
| ~~Q11~~ | rag-pao git? | ✅ **Закрыт Alex 2026-05-20**: локальный git без remote |
| **Q12** | 3 модуля заказчика — когда даст доступ? | предлагаю **стартуем на nlohmann/json**, ждём заказчика без блокировки |
| **Q13** | Anthropic API ключ — где живёт? | `rag-mentor/config/secrets.env` (НЕ в git) + `.env.example` шаблон |
| **Q14** | Schema migrations — alembic? | предлагаю **да, alembic** (как в DSP-GPU `01_Stack_Decisions`) |
| **Q15** | Логирование уровни — куда live logs? | `rag-pao/logs/YYYY-MM-DD/` + Loguru, не stdlib logging |
| **Q16** | Backup PG schemas — частота, retention? | предлагаю **pg_dump weekly** + manual перед каждой phase'ой |
| **Q17** | GoogleTest CMakeLists.txt — кто пишет? | предлагаю **шаблон + CMake-substitute**, без Qwen (детерминированно) |
| **Q18** | Doxytags pre-skeleton — переиспользовать `dsp-asst doxytags fill --file`? | предлагаю **да** — даёт пустую структуру, Qwen заполняет (меньше галлюцинаций) |
| **Q19** | `target` clone механизм | предлагаю **git submodule** в `rag-pao/targets/<name>/` |
| **Q20** | `golden_set_L*.jsonl` — кто пишет? | предлагаю: Alex пишет 30 QA для L1+L2; Кодо помогает с L3+ автоматически |

## от Alex 
ответы
Q11 - **`rag-pao/` — git репо или просто runtime каталог?** | (A) git репо `github.com/rag-mentor` (рекомендую — артефакты `.rag/` и `_logs/` ценные, нужна история). - Да,  /rag-pao - создать локальный git без выхода на github - эмитируем локальный сервер без выхода в интернет!
Q12 -  **3 модуля заказчика для старта** — когда Alex даст доступ? - они лежат на столе на ssd диске. создадим каталог rag-pao и я туда сразу скопирую!
Q13 - **Anthropic API ключ** — где живёт? | - работаем без ключа через Claude Code. как сейчас с тобой.
Q14 - **Schema migrations** — alembic в `rag-pao/pao_db/migrations/`? | предлагаю **да, alembic** (как в DSP-GPU `01_Stack_Decisions`) - Да
Q15 - **Логирование уровни** — где live logs? | `rag-pao/logs/YYYY-MM-DD/` + Loguru, не stdlib logging - Да
Q16 - ** | **Backup PG schemas** — частота, retention? | предлагаю **pg_dump per-target weekly** + manual перед каждой phase'ой - Да
Q17 -  **GoogleTest CMakeLists.txt** — кто пишет? Qwen или скриптом-шаблоном? | предлагаю **шаблон + CMake-substitute**, без Qwen (детерминированно) - почти да. я считаю что должен писать Qwen. Но набловы готовит Кодо!)
Q18-  **Doxytags pre-skeleton** — переиспользовать `dsp-asst doxytags fill --file` как pre-step перед Qwen? | предлагаю **да** — `doxytags` даёт пустую структуру, Qwen её заполняет (меньше работы, меньше галлюцинаций) - Да - нужно использовать по максим. брать что есть за основу!
Q19 - **`target` clone механизм** — git submodule, отдельный clone, vendoring? | предлагаю **git submodule** в `rag-pao/targets/<name>/` — простая синхронизация |- писал но еще раз мы эмитируем rag-pao - как локальный сервер без интернета используем локальный git - то есть без github!
Q20 **`golden_set_L*.jsonl` — кто пишет?** | предлагаю: Alex пишет 30 QA вручную для L1+L2 перед фазой 03; Кодо помогает генерировать L3+ автоматически на основе уже-сгенерированных артефактов - думаю будем делать вместе. Ты пишешь задачу, ищем вместе решение создаем абстрактный вариант решения и потом теражируешь. Если нет давай обсудим.

## от Alex 
я не увидел аданацию файлов в архитектуре CLAUDE.md + rules+ остальные, под конкретный rag-pao + rag-mentor - нашел но всеравно заострил внимание.
## от Alex 
я не увидел протокол с наботом промтов 001_описание.., 002_описание.. ... набор последовательных промтов + описание по шагам что делаем (протоколтрование), что бы потом это решение перенести на локальную базу.
нашел в файле MemoryBank\specs\rag_mentor_structure_2026-05-20.md там уточнол 
---

## 7. Next actions

1. **Alex ревьюит 4 файла** (этот + structure + phases + policies) → даёт OK или просит правки.
2. **Alex отвечает на Q11-Q20** (хотя бы Q11, Q12, Q19, Q20 — критичные).
3. **Кодо создаёт `TASK_RAG_MENTOR_Phase00_Bootstrap.md`** в `DSP-GPU/MemoryBank/tasks/` — детальный план фазы 00.
4. После OK от Alex — Кодо локально создаёт каркасы:
   - `E:\rag-mentor\` (с git init + первый commit)
   - `E:\rag-pao\` (git init или нет — по Q11)
5. После git init локально — **Alex даёт OK на push в `github.com/rag-mentor/`**.
6. Параллельно — research через локальные MCP (Context7 + sequential-thinking) на DSPy/RAPTOR/TextGrad — что переиспользуем готовое.

---

## 8. Action items A1-A8 из ревью template_rag_mcp v1.0 (закрытие)

| # | Action | Закрытие в этом плане |
|---|--------|------------------------|
| **A1** | сузить indexer до markdown-only | ✅ L0 markdown crawler, L2 tree-sitter+libclang (опц.), L3/L3b/L4 — markdown |
| **A2** | pilot Claude→Qwen на 10 use_cases с замером метрик | ✅ Phase 05 (5 классов nlohmann) — критерий успеха фазы |
| **A3** | MCP для non-Claude (Qwen) клиентов | ⚠️ частично — наш REST + MCP server, но Qwen дёргается через `rag_pao.run_filler` (Python harness), не нативный MCP-клиент Qwen'а. Полный MCP-tool-calling Qwen'а — после MVP |
| **A4** | `eval_runs` таблица | ✅ в `rag-mentor/mentor_db/tables/eval_runs.sql` |
| **A5** | manual bootstrap (НЕ vapor) | ✅ `scripts/bootstrap.sh` 5 шагов в каждом каталоге |
| **A6** | honest estimate | ✅ 3-4 нед MVP + 1-2 нед QLoRA = **5-6 нед** |
| **A7** | VRAM footprint RX 9070 | ✅ Alex проверил, см. [phases §6](rag_mentor_phases_2026-05-20.md#6-hardware-budget-rx-9070-с-правками-alex-2026-05-20) |
| **A8** | prompt versioning | ✅ `prompts/v1/`, `v2/` + git tag |

---

## 9. Что нужно от тебя сейчас (Alex)

1. ✅ Прочти 4 файла (~1500 строк суммарно, но 80% — readable таблицы).
2. ❓ Ответы на **Q11, Q12, Q19, Q20** (минимум) — без них не стартую Phase 00.
3. ❓ OK на следующий шаг — создание `TASK_RAG_MENTOR_Phase00_Bootstrap.md`?
4. ❓ Когда хочешь начать локальное создание каталогов? Сейчас / завтра / после ревью спеки?

## от Alex 
1. ✅ Прочти 4 файла  - прочитал
2. ❓ Ответы на **Q11, Q12, Q19, Q20** ответил на все
3. ❓ OK на следующий шаг — создание `TASK_RAG_MENTOR_Phase00_Bootstrap.md`? - делаем сегодня
- TASK_RAG_MENTOR_Phase00_Bootstrap.md -потом запускаешь глубокое ревью и сразу правишь.
4. ❓ Когда хочешь начать - после завтра 22.05.26

## от Alex 
посмотри может гдето удобно будет применять не json а yaml?
---

*End of architecture overview v0.2. Этот файл — главный entry point. Детали в structure/phases/policies.*
