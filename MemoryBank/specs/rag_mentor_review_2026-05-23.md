# RAG_mentor / RAG_pao — deep review (2026-05-23)

> **Дата**: 2026-05-23 · **Автор**: Кодо
> **Объект ревью**: dopolnenie v1.0 + 4 родительских файла (architecture / structure / phases / policies от 2026-05-20) + `TASK_RAG_MENTOR_Phase00_Bootstrap.md` v0.3
> **Тип**: deep review — gaps / противоречия / устаревшее / связь с dataset_v8_plan
> **Метод**: чтение всех 6 файлов целиком + grep по «weight/вес/обучен/scoring» + проверка реальной структуры `E:\pao_contrib`

---

## 1. Главная находка — gap про «веса для обучения»

### 1.1 Что просил Alex

«Сформировать и добавить веса» (предложение сестры Кодо от 21.05.26, в TASK или спеке).

### 1.2 Где это лежит

**`MemoryBank/specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md`** — план сестры (Sonnet 4.6 на Debian) для **существующего** `finetune-env` (DSP-GPU QLoRA).

Содержит:
- **10 коллекторов пар** (Q→A) для дообучения Qwen-Coder-14B:
  - **P0** (must-have, ~1000 пар): `collect_reverse_patterns.py`, `collect_synonym_pairs.py`, `collect_confusion_negatives.py`
  - **P1** (high-value, ~150-230 пар): `collect_multi_class_listing.py`, `collect_migration_history.py`, `collect_lessons_learned.py`, `collect_build_cmake_facts.py`
  - **P2** (nice-to-have, ~100-150 пар): `collect_performance_hints.py`, `collect_cross_references.py`, `collect_api_style_guide.py`
- **Acceptance Q1-Q10** для проверки factual hallucination (HybridBackend → Bridge не Strategy)
- Train strategies A/B/C
- Audit команды

### 1.3 Связь с rag-mentor/rag-pao

| dataset_v8_plan (DSP-GPU finetune-env) | rag-mentor/rag-pao (новый проект) |
|----------------------------------------|------------------------------------|
| Источник — `MemoryBank/.claude/*` DSP-GPU + RAG schema `dsp_gpu` + Doc/Patterns.md | Источник — `pao_<target>/<module>/` + `external_corpus/` + `mentor_db` |
| Цель — научить Qwen фактам про DSP-GPU | Цель — научить Qwen фактам про **target customer drop** (boost / qwt / sqlite / ...) |
| Один target (DSP-GPU) | N targets (`pao_contrib`, `pao_xxxx_acme`, ...) |
| Скрипты в корне `finetune-env/` (анти-пример) | Скрипты внутри `rag_pao/finetune/dataset_builders/` + collectors в `current/collectors/` (D26) |

**Концепция переносима 1:1**, но:
- собирать пары надо **per-target** (фaкт «HybridBackend = Bridge» применим только к DSP-GPU; для pao_contrib будут свои факты)
- collectors живут в **frozen-snapshot** `pipelines/pao_<name>_v1/collectors/` чтобы между targets не было утечек

### 1.4 Что не учтено в dopolnenie v1.0

- В §4.2 у меня есть `current/collectors/{patterns, facts, docs, code, style, pybind, listings}/` — **категории совпадают** с v8 plan, но я **не сослалась** на сам plan и не привела конкретные имена 10 коллекторов.
- В §3 mentor — я **НЕ описала** что pipeline сбора пар начинается в mentor (формирование промптов/Q) и оседает в `mentor_db.golden_sets` + `_logs/L*_distillation.jsonl`. Comparator измеряет качество → судьба пары решается через `weight = judge_score / 100` (policies §E:482).
- В §7.3 phases — фаза 09 QLoRA не упоминает шаг «синтез пар через collectors» (только «из `_logs/L*_distillation.jsonl`»). А плана v8 показывает что **distillation_logs ≠ единственный источник** — есть ещё **синтез из RAG + MemoryBank**.

### 1.5 Что предложить добавить

**Новый раздел в phases.md (или новый sub-task в Phase 09)**:

> **Phase 09.A — Dataset synthesis (collectors)**
> Перед обучением QLoRA Qwen-Coder-14B на target — синтезировать пары Q→A через 10 коллекторов, аналогично [dataset_v8_plan_2026-05-21.md](../specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md).
> Pipeline: `pipelines/pao_<target>_v1/collectors/{patterns,facts,docs,...}` → JSONL → dedup → merge с `_logs/L*_distillation.jsonl` → `dataset_v8_<target>_train.jsonl`.
> Acceptance: ≥9/10 на 10 per-target factual questions (как Q1-Q10 в v8 plan).

**Новый D33 в dopolnenie**:

| # | Тема | Решение |
|---|------|---------|
| **D33** | Источники train dataset для QLoRA фазы 09 | (1) `_logs/L*_distillation.jsonl` (накопленный во время фаз 05-08); (2) **synthesised pairs через collectors** — 10 категорий из `dataset_v8_plan_2026-05-21.md` адаптированных под per-target. Веса train примеров: `weight = final_judge_score / 100` (policies §E) |

---

## 2. Gaps и несоответствия dopolnenie v1.0 ↔ 4 родителя

### 2.1 dopolnenie §3 (mentor Oracle) ↔ structure §1

| Что в dopolnenie | Что в structure | Статус |
|------------------|-----------------|--------|
| `rag_mentor/oracle/` подпакет (retrieval + reasoner + fallback) | НЕТ в `src/` структуре v0.2 | 🆕 NEW |
| `rag_mentor/comparator/` (diff_vs_etalon + issue_categorizer) | Есть `src/comparator.py` (один файл) | ⚠️ нужно разнести в подпакет |
| `mentor_db/` (PG schema rag_mentor + tables) | ✅ Есть, идентично | 🟢 OK |
| 7 локальных MCP | ✅ Есть, идентично | 🟢 OK |

**Action**: при переносе в structure v0.3 §1 — заменить плоский `src/` на пакет `rag_mentor/` с подпакетами `oracle/` + `comparator/` + остальное (orchestrator, prompt_builder, reviewer, critic, rag_pao_client, name_validator, journal, utils).

### 2.2 dopolnenie §4 (rag-pao 3 слоя) ↔ structure §2

| Что в dopolnenie | Что в structure | Статус |
|------------------|-----------------|--------|
| `rag_pao/core/` STABLE | НЕТ — там плоский `retrieval/`, `llm_serving/`, `finetune/` на root | 🆕 NEW (D28) |
| `pipelines/<name>_vN/` frozen | НЕТ | 🆕 NEW (D28) |
| `current/collectors/{patterns,facts,...}` active dev | НЕТ | 🆕 NEW (D28) |
| `targets/` symlinks | Есть `targets/<name>/` (git submodule) | ⚠️ заменить на symlinks (D21) |
| `core/access_control/` (mode_switch + nda_guard) | НЕТ | 🆕 NEW (D25) |

**Action**: structure §2 — **переписать целиком** под новые 3 слоя (как в карте dopolnenie §7.2).

### 2.3 dopolnenie §2 (pao_<name>) ↔ structure (НЕТ такого раздела)

Раздел про структуру customer drop'ов в structure v0.2 **отсутствует**. Это **новое** в dopolnenie §2.

**Action**: добавить **NEW §6 в structure v0.3** — «Структура `pao_<name>/`» с реальной раскладкой `pao_contrib` (build/ + contrib/ + наши Doc/Example/Test/GTest overlay'и).

### 2.4 dopolnenie §5 (2 режима доступа Кодо) ↔ policies

`policies §C` описывает контракт REST + MCP, но **НЕ упоминает** 2 режима. Нужен NEW §E или §F.

**Action**: добавить **NEW §E в policies v0.3** — «Политика 2 режимов доступа Кодо: debug ↔ production. Переключатель `mode` в targets.yaml. Per-target `codo_access`. Safe-endpoints для production: `/show_signature`, `/show_symbols`, `/search` (filtered), `/run_filler` (sanitized)».

### 2.5 dopolnenie §6 D29 (git bare remote) ↔ structure §3 sources of truth

structure §3 говорит «prompts/ источник истины = rag-mentor», но **не описывает механизм sync**. Нужно дополнить.

**Action**: structure §3 дополнить — sync через `/srv/git-remotes/rag-pao.git` (D29).

### 2.6 dopolnenie §6 D30 (YAML/JSON) ↔ ничего не противоречит

В родителях смешано YAML и JSON произвольно (architecture §2.1 schemas в JSON, structure §5 .gitignore без формата). Зафиксируем правило в policies или в новой §F structure.

---

## 3. Противоречия (внутри dopolnenie или с родителями)

### 3.1 Противоречие 1 — нет

После переписки v1.0 явных противоречий не осталось. Главное что было — «mentor = тонкий клиент» из v0.3/v0.4 — снято в v0.5/v1.0.

### 3.2 Двусмысленность в access_control (D25)

В §5.3 написано:
```python
def check_access(target, endpoint, mode) -> bool:
    if mode == "debug" and targets[target].codo_access == "full":
        return True
    return endpoint in SAFE_ENDPOINTS
```

Логически нормально, но **не покрыт случай** `mode=production AND codo_access=full` — что делать? Скорее всего forced fallback на `rest-only` (production mode = глобальный override).

**Action**: уточнить логику в `policies §E` (NEW): `mode=production` → forced `rest-only` для всех targets, per-target `codo_access` игнорируется.

### 3.3 `pipeline:` поле в `targets.yaml` (§1.2)

В YAML примере есть `pipeline: pao_contrib_v1` — указывает какой snapshot применять. Но **не сказано** что происходит когда snapshot ещё не frozen (только `current/` есть).

**Action**: в structure NEW §6 описать состояния target'а:
- `pipeline: current` — в активной разработке (используется `current/`)
- `pipeline: pao_<n>_v1` — frozen snapshot
- `pipeline: pao_<n>_v2` — если переделывали

---

## 4. Устаревшее (нужно убрать или переформулировать)

### 4.1 architecture §3 D1-D20

Часть устарела:
- **D17** «2 уровня журнала в `rag-pao/MemoryBank/prompts/`» — **дополнено** D29 (git bare remote). Уточнить что sync журнала pao → mentor работает по тому же каналу.
- **D18** «rag-pao = локальный git» — это про **полный** rag-pao, но теперь `pipelines/<name>_v1/` явно frozen — стоит уточнить что снапшоты тоже коммитятся.
- **D19** «Boost source = customer drop в `external_corpus/customer_drop/`» — устарело: D21 убирает drops наружу. customer_drop теперь = `/srv/pao_<name>/`. `external_corpus/` остаётся **только для public open-source**.
- **D20** «Header summarization >50KB» — норм, остаётся.

### 4.2 phases §5 «Customer drop policy»

«Alex кладёт код заказчика в `rag-pao/external_corpus/customer_drop/`» — **устарело** по D21. Теперь `/srv/pao_<name>/`, доступ через `targets.yaml`.

**Action**: phases §5 переписать — заменить путь, добавить ссылку на dopolnenie §1.

### 4.3 TASK_RAG_MENTOR_Phase00_Bootstrap v0.3

Не учитывает 7 новых решений (D21-D27 + D28 + 3 слоя rag-pao + 2 режима):
- 00-3 skeleton rag-mentor: нет `rag_mentor/oracle/`, `rag_mentor/comparator/` подпакетов
- 00-4 skeleton rag-pao: плоский `retrieval/`, `llm_serving/` — должны быть в `rag_pao/core/`. Нет `pipelines/_template/`. Нет `current/`. Нет `access_control/`.
- 00-6: rules для rag-mentor — нет `17-access-modes.md` (правило про 2 режима) или дополнения 09-rag-pao-contract.md
- 00-7: rules для rag-pao — то же
- 00-8: `.env.example` не описывает `RAG_PAO_MODE` (debug/production) и `PAO_DROPS_DIR`

**Action**: обновить task → v0.4 (по карте в dopolnenie §7.3 + §7.4).

---

## 5. Что НЕ зафиксировано но звучало в обсуждениях

| # | Тема | Где звучало | Действие |
|---|------|-------------|----------|
| **G1** | Веса/collectors для QLoRA | Сестра 21.05 → `dataset_v8_plan_2026-05-21.md` | Добавить D33 (см. §1.5 выше) + новый Phase 09.A в phases |
| **G2** | Acceptance Q1-Q10 per-target | dataset_v8_plan §1 | Перенести как шаблон в phases §1.2 («golden_set_L*») + указать что для каждого pao_<name> делается свой Q1-Q10 |
| **G3** | Pre-flight train hygiene (swapoff -a, kill GUI) | dataset_v8_plan §5 | Внести в `rag-pao/infra/healthcheck.sh` + новое rule «18-train-hygiene.md» |
| **G4** | Stratified split + dedup для val (data leakage от synonyms) | dataset_v8_plan §10 Q5 | Добавить в `rag_pao/finetune/dataset_builders/dedup.py` (упомянуто в §4.2 dopolnenie) — но без явного решения по semantic dedup |
| **G5** | Pin Qwen-модели по sha256 | architecture §4 R6 | Уже зафиксировано, но не реализовано в `model_router.py` спецификации. ОК |
| **G6** | Manual override `manual_include.yaml` для headers | phases §4.3 | Перенести в `rag-pao/pipelines/_template/manual_include.yaml` (раньше был в `external_corpus/`) |

---

## 6. Структура переноса dopolnenie v1.0 → 4 родителя

Готовая карта в dopolnenie §7 правильная, но требует дополнений:

### 6.1 architecture v0.3

- §2 диаграмма — добавить `comparator` в mentor box (был, но не выделен).
- §3 принятые решения — добавить D21-D33 (учитывая новый D33 про collectors).
- §6 Open questions — закрыть Q11-Q20 как закрытые в раундах 1-5.
- **NEW §10** — `dataset_v8_plan_2026-05-21.md` reference в Map of related docs.

### 6.2 structure v0.3

- §0 общие правила: дополнить D29 (git bare remote), D30 (YAML/JSON).
- §1 rag-mentor: подпакеты `oracle/` + `comparator/`.
- §2 rag-pao: **полностью** переписать под 3 слоя.
- §3 sources of truth: sync через bare remote.
- **NEW §6** — структура `pao_<name>/`.

### 6.3 phases v0.3

- Phase 00: добавить mentor_db init + 7 MCP + `pipelines/_template/` + `current/` + `access_control/`.
- Phase 01: targets.yaml parser + layout-aware indexer.
- Phase 05: debug-режим, oracle из mentor_db.
- Phase 06: flip debug → production + regression тест.
- **NEW Phase 09.A** — Dataset synthesis (collectors) до 09 QLoRA.
- §5 Customer drop policy: переписать (drops в `/srv/pao_<name>/`, не `external_corpus/customer_drop/`).

### 6.4 policies v0.3

- §A: барьер 2 (name_validator) дублирован в обоих репо.
- §C: добавить safe-endpoints (D31).
- **NEW §E** — Politka 2 режимов доступа Кодо (D25): когда debug ↔ когда production, как flip'ать, что проверить.
- §F (можно объединить с §E): pre-flight train hygiene.

### 6.5 TASK_RAG_MENTOR_Phase00_Bootstrap v0.4

- 00-3/00-4 skeletons под новые подпакеты.
- 00-6/00-7 добавить rule про 2 режима (или дополнить 09-rag-pao-contract.md).
- 00-8 `.env.example`: `RAG_PAO_MODE`, `PAO_DROPS_DIR`.
- 00-9 placeholders для `pipelines/_template/`, `current/collectors/`.

---

## 7. Открытые вопросы для Alex

Только то что реально требует решения (не плодить):

| # | Вопрос | Контекст |
|---|--------|----------|
| **Q-R1** | Перенести dataset_v8 коллекторы как **шаблон** в `pipelines/_template/collectors/` (общий) или как **frozen** в `pipelines/_dsp_gpu_v1/collectors/` (специфичный)? | dataset_v8 спроектирован под DSP-GPU; pao_contrib (boost/qwt/...) ≠ DSP-GPU. Шаблон + примеры — лучше, чем frozen |
| **Q-R2** | Q1-Q10 acceptance per target — кто пишет? | Alex — для DSP-GPU; Кодо помогает синтезировать для нового target из symbols+patterns? |
| **Q-D8** | Когда стартуем Phase 00 Bootstrap (после переноса dopolnenie в родителей)? | сейчас / завтра / после ещё ревью |

---

## 8. План работ (порядок)

1. **Сейчас**: ответ Alex на Q-R1 (важно для §6.3 структуры pipelines), Q-R2 опционально.
2. **После ответа** — Кодо обновляет:
   - dopolnenie v1.0 → v1.1 (добавить D33 + ссылка на dataset_v8 + §10 Phase 09.A overview)
   - перенос в 4 родителя (architecture / structure / phases / policies → v0.3)
   - TASK_RAG_MENTOR_Phase00_Bootstrap → v0.4
3. **Alex отвечает на Q-D8** → старт Phase 00.

---

*End of review. Главный gap: collectors из dataset_v8_plan не интегрированы в план rag-mentor/rag-pao. Это и есть «веса для обучения» из правки Alex.*
