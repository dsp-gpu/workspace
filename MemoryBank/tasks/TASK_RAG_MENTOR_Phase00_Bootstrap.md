# TASK_RAG_MENTOR_Phase00_Bootstrap

> **Версия**: 0.3 (после ответов Alex 2026-05-20) · **Дата**: 2026-05-20 · **Owner**: Alex + Кодо
> **Status**: ✅ READY TO START — все Q-P0-1..4 закрыты, ждёт «делай Phase 00»
> **Estimate**: **1.5 рабочих дня** (8-12 часов). Можно сократить до 1 дня если отложить CAN-DEFER rules (см. R-P0-1)
> **Зависит от**: spec v0.2 утверждён (см. References ↓)
>
> **Принятые ответы Alex (2026-05-20)**:
> - **GitHub org** = `rag-mentor` (Q-P0-1)
> - **LICENSE** = Apache-2.0 (Q-P0-2)
> - **Git email** = `diving_73@gmail.com` (Q-P0-3) ⚠️ НЕ `ltestai73@gmail.com`!
> - **Rules pipeline** = Кодо пишет → Alex ревьюит → Alex правит (Q-P0-4)

---

## 🎯 Цель фазы 00

Создать **скелет двух каталогов** `rag-mentor/` (git → github) и `rag-pao/` (локальный git) **со всей инфраструктурой MemoryBank**, чтобы Claude Code в обоих видел rules и понимал контекст.

**Из чего исходим**:
- Spec [rag_mentor_architecture_2026-05-20.md](../specs/rag_mentor_architecture_2026-05-20.md) + 3 sub-spec (structure / phases / policies) утверждены v0.2.
- Кода (`*.py`, БД, Docker) **ещё не пишем** — фаза 00 чисто организационная.
- К концу фазы — оба каталога открываются в Claude Code, CLAUDE.md грузится, rules видны, первый commit сделан.

---

## ✅ Acceptance criteria (gates)

| # | Gate | Как проверить |
|---|------|---------------|
| **G1** | git репозитории инициализированы и чистые в обоих | `git -C rag-mentor status` + `git -C rag-pao status` → "nothing to commit, working tree clean" |
| **G2** | rag-mentor имеет remote `github.com/rag-mentor/rag-mentor` (private, **push только после OK Alex**) | `git -C rag-mentor remote -v` показывает origin |
| **G3** | rag-pao имеет **локальный git** без remote | `git -C rag-pao remote -v` пусто |
| **G4** | Все 16 файлов rules лежат в каждом каталоге (с реальным содержимым или с placeholder для CAN-DEFER) | `ls -1 rag-mentor/MemoryBank/.claude/rules/*.md \| wc -l` == 16 AND `ls -1 rag-pao/MemoryBank/.claude/rules/*.md \| wc -l` == 16 AND каждый файл ≥ 5 строк (не пустой) |
| **G4b** | Claude Code открывает оба и **видит** rules | manual: открыть в IDE → команда «покажи 10 правило из rules» → должна показать содержимое |
| **G5** | CLAUDE.md в каждом каталоге — корректный, по образцу DSP-GPU | manual review Alex'а (5 минут) |
| **G6** | Все каталоги структуры созданы (включая пустые с `.gitkeep`) | `find rag-mentor -type d \| wc -l` ≥ 30, `find rag-pao -type d \| wc -l` ≥ 30 |
| **G7** | Нет hardcoded путей `E:\...` / `/home/alex/...` в коде/CLAUDE.md | `grep -rE 'E:\\\\\|/home/alex' rag-mentor/ rag-pao/` пусто (кроме примеров в README) |
| **G8** | `.env.example` есть в обоих, **`.env` НЕ в git** | `git -C rag-mentor ls-files \| grep -E '^\.env$'` пусто |
| **G9** | README.md показывает 5-шаговый quick start | manual review |

**Phase 00 закрыта когда**: G1-G9 все ✅, Alex даёт OK словами «Phase 00 PASS».

---

## 📋 Sub-tasks (детализация)

### 00-0 — Pre-flight (критично! правило 03-worktree-safety)

```bash
# 1. НЕ в worktree
pwd                                          # должно быть НЕ E:\DSP-GPU\.claude\worktrees\*
git rev-parse --show-toplevel 2>/dev/null    # если в репо — это main toplevel, не worktree

# 2. Проверить что E:\rag-mentor и E:\rag-pao не существуют ИЛИ пусты ИЛИ не git
ls "E:\rag-mentor" 2>$null
ls "E:\rag-pao" 2>$null
# если существуют с файлами — спросить Alex'а, не затирать!

# 3. Проверить что ~/.claude/CLAUDE.md существует у Alex (глобальные правила Кодо)
ls "C:\Users\user\.claude\CLAUDE.md"
```

**Если хоть один check fails → стоп, спросить Alex'а**.

### 00-1 — Создать `E:\rag-mentor\` + `git init`

```bash
mkdir -p "E:\rag-mentor"
cd "E:\rag-mentor"
git init -b main
git config user.name "Alex Lan"
git config user.email "diving_73@gmail.com"   # Alex Q-P0-3 (2026-05-20)
```

**Output**: пустой git репо.

### 00-2 — Создать `E:\rag-pao\` + локальный `git init`

```bash
mkdir -p "E:\rag-pao"
cd "E:\rag-pao"
git init -b main
git config user.name "Alex Lan"
git config user.email "diving_73@gmail.com"   # тот же что mentor
# NO remote (Alex: имитация офлайн-сервера заказчика, D18)
```

**Output**: пустой локальный git без remote.

### 00-3 — Скелет каталогов rag-mentor/

```
rag-mentor/
├── MemoryBank/
│   ├── .claude/
│   │   ├── rules/                  # 16 файлов в 00-6
│   │   └── specs/                  # DSPy_comparison, TextGrad_notes, RAPTOR_notes, HierarchicalIncrementalRAG (пустые .md в 00-9)
│   ├── specs/
│   ├── tasks/
│   ├── prompts/
│   │   ├── for_mentor/v1/{reviewer,critic,builder_meta,comparator}/
│   │   └── for_rag_pao/v1/{schemas,fewshot}/
│   ├── sessions/
│   ├── changelog/
│   └── feedback/
├── src/runner/
├── mentor_db/tables/
├── tests/fixtures/
├── mcp_servers/{context7_local,sequential_thinking,filesystem,git_mcp,postgres_mcp,qdrant_mcp,memory_mcp}/
├── scripts/
└── config/
```

**Команда**: один Python-скрипт `bootstrap_skeleton.py` (запустить ОДИН РАЗ, не коммитим — он одноразовый).

Каждый пустой каталог получает `.gitkeep` (иначе git его потеряет).

### 00-4 — Скелет каталогов rag-pao/

```
rag-pao/
├── MemoryBank/
│   ├── .claude/{rules,specs}/
│   ├── specs/
│   ├── tasks/
│   ├── prompts/v1/                 # пустой, заполнится при sync из rag-mentor
│   ├── sessions/
│   └── changelog/
├── .rag/                           # пока пустая, заполнится при добавлении первого target
├── retrieval/{indexer,embedder,api}/
├── llm_serving/
├── finetune/
├── pao_db/{tables,migrations}/
├── infra/
├── external_corpus/{doxygen_examples,test_examples,papers,crawler,customer_drop,_summarized}/
├── golden_set/
├── scripts/
└── targets/                        # сюда git submodule в Phase 03
```

### 00-5 — `CLAUDE.md` в обоих каталогах

#### rag-mentor/CLAUDE.md

Структура (по образцу `e:\DSP-GPU\CLAUDE.md`):
- Кто ты (Кодо в роли mentor'а)
- Глобальные rules → `~/.claude/CLAUDE.md`
- Модульные rules → `.claude/rules/*.md`
- Alex profile (см. 01-user-profile.md в rules)
- 3 критических правила (NO pytest, NO worktrees, anti-hallucination приоритет #1)
- Единые точки (Anthropic API client, name_validator, journal logger)
- Структура каталога (краткая)
- Главные команды: «обнови spec», «создай новый prompt», «оцени Qwen output»

#### rag-pao/CLAUDE.md

Структура аналогичная, но роль = executor:
- Кто ты (Кодо в роли executor'а — индексация/retrieval/Qwen/journal)
- Запреты на правку target кода
- Главные команды: «реиндексируй L2», «прогон L3 на классе X», «покажи journal»

**Длина каждого ~40-60 строк**. Не больше — лишний шум.

### 00-6 — 16 rules в `rag-mentor/MemoryBank/.claude/rules/`

Список из spec [structure §2.1](../specs/rag_mentor_structure_2026-05-20.md#21-rag-mentor--git-репо-online-mentor). Каждое правило ~30-100 строк.

| # | Файл | Path-scoped? | Источник адаптации |
|---|------|--------------|-------------------|
| 00 | new-task-workflow.md | нет | DSP-GPU 00-new-task-workflow.md |
| 01 | user-profile.md | нет | DSP-GPU 01-user-profile.md |
| 02 | workflow.md | нет | DSP-GPU 02-workflow.md |
| 03 | worktree-safety.md | нет | DSP-GPU 03-worktree-safety.md |
| 04 | testing-python.md | `src/**`, `tests/**` | DSP-GPU 04 |
| 05 | mentor-roles.md | нет | **NEW**: 4 роли Claude (builder/reviewer/critic/comparator) |
| 06 | prompt-versioning.md | `MemoryBank/prompts/**` | **NEW**: правила v1/v2/tag |
| 07 | no-direct-code.md | нет | **NEW**: Claude НЕ правит target код, только промпты |
| 08 | anti-hallucination.md | нет | **NEW** (приоритет #1): см. [policies §A](../specs/rag_mentor_policies_2026-05-20.md#a--anti-hallucination-policy-приоритет-1-alex) |
| 09 | rag-pao-contract.md | `src/rag_pao_client.py` | **NEW**: REST + MCP гибрид |
| 10 | target-onboarding.md | нет | **NEW**: как добавить новый target в `rag-pao/targets/` |
| 11 | golden-set.md | `golden_set/**` | **NEW**: формат, пополнение |
| 12 | doxygen-tags-dsl.md | нет | DSP-GPU **12_DoxyTags_Agent_Spec.md** + spectrum пример |
| 13 | fewshot-discipline.md | `MemoryBank/prompts/for_rag_pao/fewshot/**` | **NEW**: min 3 fewshot, manual_include.yaml |
| 14 | python-style.md | `src/**`, `tests/**` | DSP-GPU 14-cpp-style.md (адаптировать под Python) |
| 15 | journal-discipline.md | нет | **NEW**: 2 уровня журнала (см. policies §B) |
| 16 | github-sync.md | нет | DSP-GPU 16-github-sync.md (адаптировать: только rag-mentor пушится) |

**8 правил можно прямо скопировать** из DSP-GPU (00, 01, 02, 03, 04, 12, 14, 16) с минимальной адаптацией.
**8 правил надо написать новые** (05, 06, 07, 08, 09, 10, 11, 13, 15).

**Приоритезация (если не успеваем за 1 день)** — пишем в Phase 00:
- 🔴 **MUST**: 05 mentor-roles, 07 no-direct-code, 08 anti-hallucination (приоритет #1!), 15 journal-discipline.
- 🟡 **SHOULD**: 06 prompt-versioning, 09 rag-pao-contract.
- 🟢 **CAN-DEFER**: 10 target-onboarding, 11 golden-set, 13 fewshot-discipline → **placeholder + полное содержимое в Phase 01**.

### 00-7 — 16 rules в `rag-pao/MemoryBank/.claude/rules/`

Список из spec [structure §2.2](../specs/rag_mentor_structure_2026-05-20.md#22-rag-pao--соседний-каталог-offline-executor).

| # | Файл | Источник |
|---|------|----------|
| 00 | new-task-workflow.md | копия из rag-mentor |
| 01 | user-profile.md | копия |
| 02 | workflow.md | копия |
| 03 | worktree-safety.md | копия |
| 04 | testing-python.md | копия |
| 05 | executor-roles.md | **NEW**: indexer/retriever/filler/judge |
| 06 | rag-layering.md | **NEW**: L0-L5 gates (см. phases §1) |
| 07 | qwen-models.md | **NEW**: 14B/Coder-14B/35B policy |
| 08 | ollama-vllm.md | **NEW**: backend switching |
| 09 | rocm-only.md | копия из DSP-GPU `09-rocm-only.md` |
| 10 | postgres-schema.md | **NEW**: coexistence (см. structure §4) |
| 11 | qdrant-collections.md | **NEW**: UUIDv5, payload schema |
| 12 | incremental-index.md | **NEW**: blake3 hash + skip |
| 13 | target-onboarding.md | **NEW**: git submodule в targets/ |
| 14 | anti-hallucination.md | копия из rag-mentor |
| 15 | journal-discipline.md | копия из rag-mentor |
| 16 | github-sync.md | **адаптация**: rag-pao не пушится |

**7 правил копия** (00, 01, 02, 03, 04, 14, 15) — но это просто rsync.
**9 правил новые** (05, 06, 07, 08, 10, 11, 12, 13, 16) + 1 копия из DSP-GPU (09).

**Приоритезация** (аналогично mentor):
- 🔴 **MUST**: 05 executor-roles, 07 qwen-models, 09 rocm-only (копия), 12 incremental-index, 14 anti-hallucination.
- 🟡 **SHOULD**: 06 rag-layering, 10 postgres-schema, 11 qdrant-collections.
- 🟢 **CAN-DEFER**: 08 ollama-vllm, 13 target-onboarding → placeholder.

### 00-8 — `.gitignore` + `.env.example` + `LICENSE` + `README.md` в обоих

#### rag-mentor/.gitignore

Содержание — см. [structure §5](../specs/rag_mentor_structure_2026-05-20.md#5-gitignore-политика).

#### rag-pao/.gitignore

Содержание — см. structure §5, **с правкой Alex**: артефакты `.rag/` и `_logs/` коммитятся, только binary blob БД (`pao_db/data/`, `qdrant_storage/`) — игнор.

#### .env.example (оба)

```
# === rag-mentor ===
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL_OPUS=claude-opus-4-7
ANTHROPIC_MODEL_SONNET=claude-sonnet-4-6

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rag_mentor
POSTGRES_USER=rag_mentor
POSTGRES_PASSWORD=<set-locally>

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# === rag-pao ===
OLLAMA_BASE_URL=http://localhost:11434
VLLM_BASE_URL=http://localhost:8000

QWEN_FILLER_MODEL=qwen2.5-coder-14b
QWEN_JUDGE_MODEL=qwen3.6-35b

RAGCTL_STAGE=dev_windows         # dev_windows | prod_debian | offline_air_gapped
RAGCTL_TARGET=nlohmann_json
```

#### LICENSE

- rag-mentor: **Apache-2.0** (Alex Q-P0-2 утвердил 2026-05-20).
- rag-pao: **Apache-2.0** (тот же — для совместимости + локальный git без публикации).

#### README.md (оба)

5-шаговый quick start:
1. `git clone ...` (для rag-mentor) / `mkdir rag-pao && cd rag-pao && git init` (для rag-pao)
2. `cp config/secrets.env.example config/secrets.env` → заполнить
3. `bash scripts/bootstrap.sh` (будет в Phase 01)
4. Открыть в Claude Code → проверить rules
5. Ссылка на TASK_RAG_MENTOR_Phase01.md (следующая фаза)

### 00-9 — Placeholder файлы для будущих фаз (`.gitkeep` + минимальные README)

В каждом пустом каталоге — `.gitkeep`.

В смысловых каталогах — `README.md` с одной строкой «заполнится в Phase XX».

Например:
- `rag-mentor/MemoryBank/.claude/specs/DSPy_comparison.md` → `# TBD Phase 04` (research через локальный Context7)
- `rag-mentor/MemoryBank/prompts/for_rag_pao/v1/README.md` → правила нумерации 001-, 002-
- `rag-pao/external_corpus/customer_drop/README.md` → «Alex кладёт сюда код заказчика (Phase 02)»

### 00-9b — `.mcp.json` placeholder в rag-mentor (project-level MCP config)

Чтобы Claude Code при открытии rag-mentor подхватывал локальные MCP-серверы автоматически:

`rag-mentor/.mcp.json`:
```json
{
  "$schema": "https://modelcontextprotocol.io/schema",
  "_comment": "Заполнится в Phase 01 Infra. Полный config — см. config/mcp_servers.yaml.",
  "mcpServers": {}
}
```

`rag-mentor/config/mcp_servers.yaml.template` — копия из [policies §D.3](../specs/rag_mentor_policies_2026-05-20.md#d3-конфиг-для-rag-mentor) (с placeholder'ами вместо реальных путей).

В Phase 01 — конкретные `command/args` для 6 обязательных MCP.

### 00-10 — `MASTER_INDEX.md` в обоих

Структура аналог DSP-GPU: ссылки на rules, specs, tasks, sessions последних.

В обоих:
- Ссылка на текущий TASK `tasks/TASK_RAG_MENTOR_Phase00_Bootstrap.md`
- Ссылка на spec родительский (4 файла в DSP-GPU)

### 00-11 — Первый commit в обоих

```bash
git -C rag-mentor add -A
git -C rag-mentor commit -m "feat(bootstrap): Phase 00 — skeleton + 16 rules + CLAUDE.md"

git -C rag-pao add -A
git -C rag-pao commit -m "feat(bootstrap): Phase 00 — skeleton + 16 rules + CLAUDE.md (local git, no remote)"
```

### 00-12 — Push rag-mentor → github.com/rag-mentor/rag-mentor (**только после OK Alex**)

```bash
# Alex: создаёт org rag-mentor в github (manual)
# Alex: создаёт private репо rag-mentor в этом org

git -C rag-mentor remote add origin git@github.com:rag-mentor/rag-mentor.git
git -C rag-mentor push -u origin main
```

**Триггер**: Alex говорит «делай push» (см. правило 16-github-sync — переспрос обязателен).

### 00-13 — Verify Claude Code открывает оба

Manual checklist:
- Открыть `E:\rag-mentor` в Claude Code → выдать команду «прочти CLAUDE.md и расскажи что я в этом репо» → должна понять что mentor-роль.
- Открыть `E:\rag-pao` в Claude Code → то же → должна понять что executor-роль.
- В обоих: команда «покажи список 16 rules» → выводит 16 файлов.

---

## 🔗 Dependencies

| Зависит от | Что |
|------------|-----|
| Spec v0.2 утверждён | ✅ 2026-05-20 (4 файла в `DSP-GPU/MemoryBank/specs/`) |
| Q12 ответ Alex | ⏳ MVP target (рекомендую nlohmann/json пока ждём заказчика) — **не блокирует Phase 00** |
| Q19 ответ Alex | ⏳ submodule vs clone — **не блокирует Phase 00** (фаза 03) |
| GitHub org `rag-mentor` создан | ⏳ Alex делает в 00-12 (manual в GitHub UI) |
| Anthropic API key есть | ✅ Max5 plan |

**Что не блокирует**: фаза 00 — чисто скелет, БД / Python / Docker / Anthropic — Phase 01+.

---

## ⚠️ Risks

| # | Risk | Mitigation |
|---|------|-----------|
| **R-P0-1** | 18 новых rules написать за день — **натяжка**, реально ~9 часов | приоритезация (см. 00-6 и 00-7): 🔴 MUST пишем полностью, 🟢 CAN-DEFER кладём placeholder'ом с TODO. Полное содержимое — Phase 01 |
| **R-P0-2** | CLAUDE.md плохо адаптирован → Claude путается | manual review Alex'а; первые 2-3 ответа Claude в каждом репо проверять руками |
| **R-P0-3** | Push в github без OK | правило 16-github-sync применяется, переспрос обязателен (см. 00-12) |
| **R-P0-4** | git init под worktree (`.claude/worktrees/*/`) | **00-0 pre-flight** проверяет это **до** init |
| **R-P0-5** | Hardcoded paths `E:\` попадут в коммит | grep-check в G7; pre-commit hook добавим в Phase 01 |
| **R-P0-6** | `E:\rag-mentor\` или `E:\rag-pao\` уже существуют с файлами | **00-0 pre-flight** проверяет и спрашивает Alex'а перед затиранием |
| **R-P0-7** | `~/.claude/CLAUDE.md` Alex'а отсутствует на новой машине | 00-0 проверяет; если нет — копируем из DSP-GPU + адаптируем |

---

## ✅ Closed questions (Alex ответил 2026-05-20)

| # | Вопрос | Ответ Alex |
|---|--------|-----------|
| ~~Q-P0-1~~ | GitHub org name | ✅ **`rag-mentor`** |
| ~~Q-P0-2~~ | LICENSE | ✅ **Apache-2.0** |
| ~~Q-P0-3~~ | Email для git config | ✅ **`diving_73@gmail.com`** (НЕ `ltestai73@gmail.com`) |
| ~~Q-P0-4~~ | Кто пишет 10 новых rules | ✅ **Кодо пишет → Alex ревьюит → Alex правит** |

**Все вопросы Phase 00 закрыты. Стартовый блокер снят.**

---

## 📊 Tracking

```
[ ] 00-0   pre-flight (НЕ worktree, не существуют с файлами, ~/.claude/CLAUDE.md есть)
[ ] 00-1   git init rag-mentor
[ ] 00-2   git init rag-pao (local, no remote)
[ ] 00-3   skeleton rag-mentor/
[ ] 00-4   skeleton rag-pao/
[ ] 00-5   CLAUDE.md в обоих
[ ] 00-6   16 rules rag-mentor (приоритезация: 🔴 MUST полные, 🟢 CAN-DEFER placeholder)
[ ] 00-7   16 rules rag-pao (приоритезация аналог)
[ ] 00-8   .gitignore + .env.example + LICENSE + README
[ ] 00-9   placeholders + .gitkeep
[ ] 00-9b  .mcp.json + mcp_servers.yaml.template в rag-mentor
[ ] 00-10  MASTER_INDEX.md в обоих
[ ] 00-11  первый commit в обоих
[ ] 00-12  push rag-mentor (после OK Alex, правило 16-github-sync)
[ ] 00-13  verify Claude Code открывает оба и грузит rules

Gates: [ ] G1  [ ] G2  [ ] G3  [ ] G4  [ ] G4b  [ ] G5  [ ] G6  [ ] G7  [ ] G8  [ ] G9
```

---

## 📚 References

- Spec overview: [rag_mentor_architecture_2026-05-20.md](../specs/rag_mentor_architecture_2026-05-20.md)
- Структура каталогов: [rag_mentor_structure_2026-05-20.md](../specs/rag_mentor_structure_2026-05-20.md)
- Фазы и HI-RAG: [rag_mentor_phases_2026-05-20.md](../specs/rag_mentor_phases_2026-05-20.md)
- Policies (rules-источник): [rag_mentor_policies_2026-05-20.md](../specs/rag_mentor_policies_2026-05-20.md)
- DSP-GPU rules для копии: `e:\DSP-GPU\.claude\rules\*.md` (16 файлов — 8 для копии в rag-mentor, 7 для копии в rag-pao)
- DSP-GPU CLAUDE.md как шаблон: `e:\DSP-GPU\CLAUDE.md`

---

## 🚦 Definition of Done

Phase 00 **DONE** когда:
4. Создан **TASK_RAG_MENTOR_Phase01_Infra.md** (следующая фаза) — кратко (1-2 страницы) с targets для Phase 01.
5. `MASTER_INDEX.md` в обоих обновлён (link на Phase01).
6. Запись в `sessions/2026-05-2X.md` + `changelog/2026-05.md`.

---

## ⏭️ Next phase preview

**Phase 01 Infra** (1-2 дня):
- docker-compose.dev.yml для PG 16 + Qdrant 1.13 + Ollama
- `mentor_db/postgres_init.sql` создание schema `rag_mentor` + 5 таблиц
- `pao_db/postgres_init.sql` создание schema `rag_pao_<target>` + 7 таблиц (см. template_rag_mcp_cpp_plan §2.2)
- Qdrant collections (`mentor_v1`, `nlohmann_json_v1`)
- Ollama: `ollama pull qwen2.5-coder:14b-q4_K_M` + `ollama pull qwen3.6:35b-q4_K_M`
- Локальные MCP-сервера для Кодо (Context7, sequential-thinking, filesystem, git, postgres, qdrant)
- Smoke test: Claude Code дёргает MCP postgres → видит схему

---

*End of TASK_RAG_MENTOR_Phase00_Bootstrap v0.3. Все Q-P0-1..4 закрыты. Ждёт команды Alex'а «делай Phase 00».*
