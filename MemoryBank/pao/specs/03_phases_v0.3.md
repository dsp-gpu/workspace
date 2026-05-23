# RAG_mentor — Phases v0.3 (HI-RAG L0-L5 + 11 фаз)

> **Версия**: 0.3 · **Дата**: 2026-05-23
> **Скоуп**: HI-RAG (Hierarchical Incremental RAG), фазы 00→09 + новая 09.A (collectors), QLoRA, GoogleTest.

---

## 1. HI-RAG — слоистая модель

**Принципиальная идея**: Qwen-окно маленькое → подаём слоями, не весь header целиком. Каждый слой — отдельный gate. **Следующий слой стартует только если предыдущий прошёл свой gate.**

| Слой | Источник | Артефакт | Gate | Кто генерит |
|------|----------|----------|------|-------------|
| **L0** | external_corpus (open-src) + customer drop | `.rag/_corpus/*.md` + векторы | `golden_set_L0` R@5 ≥ 0.9 | crawler (без Qwen) |
| **L1** | C4-диаграммы + CMake граф | `.rag/<t>/L1_architecture/*.md` | `golden_set_L1` R@5 ≥ 0.9 | человек + Claude помогает |
| **L2** | classes/methods из target | `.rag/<t>/L2_symbols/*.md` | `golden_set_L2` R@5 ≥ 0.85 | автомат (tree-sitter+libclang) |
| **L3** | doxygen + test_cases | **Qwen filler → judge → Claude critic** | quality ≥ 80 на ≥90% классов | Qwen + Claude |
| **L3b** 🌟 | GoogleTest skeleton | Qwen14B + cppcheck/gcc lint | gtest_compile_pass ≥ 90% | Qwen + lint |
| **L4** | use_cases + pipelines | Qwen + Claude review | `golden_set_L4` R@5 ≥ 0.8 | Qwen + Claude |
| **L5** 🌟 | QLoRA Qwen14B на L3-L4 + collectors v8 | LoRA adapters | ΔR@5 ≥ +0.05 + ≥9/10 Q1-Q10 acceptance | finetune scripts |

### 1.1 Retriever-policy per layer

```python
def retrieve_for_L3(class_fqn):
    arch_brief    = retrieve(L1, filter=class_relevance(class_fqn), top_k=1)
    symbols_self  = retrieve(L2, fqn=class_fqn)
    symbols_deps  = retrieve(L2, related_to=class_fqn, top_k=3)
    fewshot       = retrieve(L0, similar_to=class_fqn, top_k=3)
    return Context(arch_brief, symbols_self, symbols_deps, fewshot)


def retrieve_for_L3b_gtest(class_fqn):
    base = retrieve_for_L3(class_fqn)
    test_examples = retrieve(L0_test_examples, similar_to=class_fqn, top_k=3)
    target_test_cases = retrieve(L3, fqn=class_fqn)
    return Context(*base, test_examples, target_test_cases)
```

### 1.2 Gate format

`golden_set_Lx.jsonl` — 30-50 QA-пар вручную:

```json
{
  "id": "L3-Q001",
  "query": "Какие throw'ы возможны у FFTProcessorROCm::ProcessComplex?",
  "expected_artifacts": [
    {"layer": "L3", "class_fqn": "dsp::spectrum::FFTProcessorROCm", "rank_max": 5}
  ],
  "difficulty": "easy|medium|hard"
}
```

---

## 2. Cycle of self-correction (mentor ↔ pao)

```python
for class in target.classes:
    # Oracle — априорный эталон через свой mentor_db
    oracle_etalon = mentor.Oracle(class)                        # Claude + retrieval из mentor_db

    ctx     = pao.retrieve_L3(class.fqn)
    prompt  = mentor.PromptBuilder(class, ctx)
    journal = open_session(class.fqn)

    for attempt in range(MAX_RETRIES=3):
        qwen_out = pao.run_filler(prompt, model="qwen2.5-coder-14b")

        # Барьер 1: name validator
        names_check = name_validator.check(qwen_out, ctx.symbols)
        if not names_check.ok:
            prompt = mentor.Critic.fix_hallucinations(prompt, names_check.errors)
            journal.log("hallucination_fail")
            continue

        # Schema lint
        valid = Validator.check(qwen_out)
        if not valid.ok:
            prompt = mentor.Critic.fix_schema(prompt, valid.errors)
            continue

        # Qwen35B judge
        judge = pao.run_judge(class, qwen_out, model="qwen3.6-35b")
        if judge.score >= 80:
            # Claude reviewer (double-check)
            review = mentor.Reviewer(class, qwen_out, ctx)
            if review.score >= 80:
                # Comparator — diff(эталон, Qwen)
                diff = mentor.Comparator(oracle_etalon, qwen_out)
                if diff.score >= 80:
                    save_to_rag(class, qwen_out)
                    gtest = run_L3b_gtest_generation(class, qwen_out)
                    save_to_rag_tests(class, gtest)
                    journal.finalize(prompt, qwen_out, judge, review, diff, gtest)
                    log_distillation(...)
                    break

        prompt = mentor.Critic.improve(prompt, qwen_out, judge.delta, review.notes, diff.issues)
        journal.log("retry", attempt + 1)
    else:
        mark_for_human_review(class)
        journal.log("escalated_to_human")
```

**Параметры (default)**:
- `MAX_RETRIES = 3`
- `judge_threshold = 80`, `reviewer_threshold = 80`, `comparator_threshold = 80`
- `reviewer_sample = 100%` для MVP, далее 10%
- `temperature_filler = 0.3`, `temperature_judge = 0.0`, `temperature_oracle = 0.2`

---

## 3. Фазы 00→09

| Фаза | Что | Срок | Output | Gate |
|------|-----|------|--------|------|
| **00 Bootstrap** | 2 каталога, MemoryBank, CLAUDE.md, 17 rules, dual-RAG dirs, 7 MCP | 1.5-2 дня | оба каталога открываются в Claude Code | G1-G15 ✅ |
| **01 Infra** | docker-compose, PG schemas, Qdrant collections, Ollama smoke, 7 MCP подключены | 2 дня | контейнеры up, MCP подключены | `psql \dt rag_*.*` показывает таблицы, MCP видит схему |
| **02 L0 corpus** | crawler external_corpus + customer drop indexer | 2-3 дня | external_corpus/ + L0 индексирован | `golden_set_L0` R@5 ≥ 0.9 |
| **03 L1+L2 target** | tree-sitter + libclang → PG + Qdrant для `pao_contrib` | 1-2 дня | symbols + deps + C4 | `golden_set_L1+L2` R@5 ≥ 0.85 |
| **04 Prompts v1** | builder/judge/reviewer/critic + 3 fewshot + JSON schemas | 2 дня | `prompts/for_rag_pao/v1/` готов | manual trial на 1 классе → quality ≥ 70 |
| **05 L3 pilot 5 classes** | end-to-end на 5 классах `pao_contrib` | 2-3 дня | `.rag/pao_contrib/L3/classes/*.md` + sessions | quality ≥ 80 на ≥ 4 из 5 + 0 hallucinations |
| **05b L3b GTest pilot** | GoogleTest для тех же 5 + compile-check | 1-2 дня | `.rag/.../L3/tests/*_test.cpp` | gtest_compile_pass ≥ 4 из 5 |
| **06 L3+L3b full** | автомат на всех классах `pao_contrib` | 2-3 дня | весь L3 + L3b | quality ≥ 80 на ≥90% + gtest ≥ 90% |
| **07 L4 use_cases** | use_cases + pipelines | 2 дня | `.rag/.../L4_use_cases/` | `golden_set_L4` R@5 ≥ 0.8 |
| **08 Eval + replicate** | replicate на 2-ом target (`pao_xxxx_acme` если есть) | 2-3 дня | сравнительная таблица target1 vs target2 | delta_quality < 10% |
| **🌟 09.A Dataset synthesis** | **NEW** — collectors P0+P1 (см. §10) | 2-3 дня | `dataset_v8_<target>_train.jsonl` ~5000 пар | acceptance Q1-Q10 ≥ 9/10 на base+v6 ≥ 7/10 |
| **09 QLoRA** | export + train Qwen-Coder-14B vs Qwen3-14B → выбор | 3-5 дней | 2 LoRA adapters | ΔR@5 ≥ +0.05 + Δquality ≥ +5 |

### Honest estimate

- Фазы 00-08: **3-4 рабочих недели**
- 09.A + 09: **+2 недели**
- **Итого MVP**: **5-7 недель**

---

## 4. Customer drop policy (заменяет старый Boost crawler)

**Источник target**: Alex кладёт код заказчика в `/srv/pao_<name>/`. Indexer читает по пути из `targets.yaml`.

**Стратегия Phase 02**:
1. Alex копирует customer code в `/srv/pao_<name>/` (NDA уже разрешён).
2. `pao_<name>/_META.yaml` заполняется (modules, license_map, layout).
3. `rag-pao/config/targets.yaml` дополняется записью + `codo_access` (full/rest-only).
4. Indexer прогоняет `is_corpus_worthy` + `summarize_large_header` (D20).
5. **`external_corpus/` остаётся только public** (boost_selected, fmt, spdlog, nlohmann).
6. `golden_set_L0.jsonl` пишется на customer drop + open-source.

### 4.1 Selection policy (для public open-source в external_corpus)

| # | Правило | Зачем |
|---|---------|-------|
| 1 | ≥ 3 doxygen-тэга | Без doxygen нет чему учиться |
| 2 | Нет `DO NOT EDIT` / `@autogenerated` | Сгенерёнка с кривым doxygen |
| 3 | `size_kb ≤ 50` ИЛИ есть cleaned-копия (D20) | Большие плохо чанкуются |
| 4 | License: BSL-1.0 / MIT / BSD / Apache-2.0 | GPL/AGPL «инфицирует» |

### 4.2 Header summarization >50KB (D20)

`retrieval/indexer/header_summarizer.py`: tree-sitter → public-секция + doxygen → cleaned-копия в `external_corpus/_summarized/<orig>.cleaned.hpp`.

---

## 5. Hardware budget RX 9070

| Модель | VRAM | Inference | QLoRA |
|--------|------|-----------|-------|
| Qwen2.5-Coder-14B Q4_K_M | ~10 GB | ✅ | ✅ (Alex проверил) |
| Qwen3-14B Q4_K_M | ~10 GB | ✅ | ✅ |
| **Qwen3.6-35B** Q4_K_M | ~19 GB → 47 GB ROCm-load | ✅ (со swap) | ❌ |
| BGE-M3 + reranker | ~3 GB | ✅ | — |

**Распределение ролей**:
- **Filler** = Qwen2.5-Coder-14B (trainable, потом QLoRA)
- **Judge** = Qwen3.6-35B (frozen)
- **Reviewer** = Claude Sonnet 4.6 (online)
- **Critic** = Claude Opus 4.7 (online)
- **Oracle reasoner** = Claude Opus 4.7
- **Embedder** = BGE-M3

**Одновременный запуск**: 14B + BGE = ~13 GB ✅. 35B alone = ~19 GB → нужен **queue swap** (5-10 сек на класс).

---

## 6. GoogleTest подэтап L3b

**Алгоритм** (после успешного L3 для класса):

```
input:
  - L3.classes/<Class>.md (doxygen + test_cases DSL)
  - L0 test_examples (gtest fewshot)
  - L2.symbols (сигнатуры методов)

prompt → Qwen14B-Coder:
  "Сгенерируй GoogleTest skeleton для класса {fqn}.
   Используй tagged test_cases как источник граничных значений.
   Формат — gtest TEST_F с fixture. Schema attached."

output: <Class>_test.cpp

validator (3 уровня):
  1. JSON schema (includes, fixture, list of TEST_F)
  2. cppcheck / clang-tidy lint
  3. compile с -fsyntax-only (без линковки)

gate: gtest_compile_pass ≥ 90% классов
```

**Накопление примеров**: каждый успешный gtest → `external_corpus/test_examples/gtest_examples/<target>__<Class>_test.cpp`. **Самопополняющийся** corpus.

---

## 7. 3 модуля заказчика для старта (deprecated v0.3)

Раньше (v0.2) — Alex выбирает 3 маленьких модуля. Сейчас (v0.3):
- target = `pao_contrib` целиком (с ~45 модулями).
- Pilot Phase 05 — 5 КЛАССОВ (не модулей) внутри 1-2 «маленьких» модулей (например, `contrib/STL-main` или `contrib/sgp4`).

---

## 8. 2 режима доступа Кодо (D25)

| Mode | Кому | Endpoint'ы |
|------|------|------------|
| **debug** | DSP-GPU pilot, `pao_contrib` (открытый) | Полный REST: `/show_file`, `/run_filler`, `/show_journal`, `/search`, ... |
| **production** | NDA-drops (`pao_xxxx_acme`, `pao_yyyy_globex`) | Safe-only: `/show_signature`, `/show_symbols`, `/search` (filtered), `/run_filler` (sanitized) |

**Переключение**:
- Глобально: `mode: debug | production` в `targets.yaml`.
- Per-target: `codo_access: full | rest-only` (NDA-drops всегда `rest-only`, даже при global=debug).
- Production-mode = forced rest-only для всех targets (per-target `codo_access` игнорируется).

**Реализация** (`rag_pao/core/access_control/nda_guard.py`):
```python
SAFE_ENDPOINTS = {"/show_signature", "/show_symbols", "/search", "/run_filler"}

def check_access(target, endpoint, mode):
    if mode == "production":
        return endpoint in SAFE_ENDPOINTS    # forced safe для всех
    if mode == "debug" and targets[target].codo_access == "full":
        return True                           # полный доступ
    return endpoint in SAFE_ENDPOINTS        # NDA-drop в debug — safe-only
```

**Flip debug → production** перед NDA-drops: regression тест на golden_set_L3 + manual review acceptance Q1-Q10.

---

## 9. QLoRA — обязательная фаза 09 (Alex)

### 9.1 Dataset preparation (теперь с collectors — D33)

**Источники** для `dataset_<target>_train.jsonl`:
1. **`_logs/L*_distillation.jsonl`** (накопленные за фазы 05-08): `judge_score ≥ 85` + `human_verified` ИЛИ `reviewer_score ≥ 90`
2. **Synthesised pairs через collectors** (фаза 09.A — см. §10)

**Format**:
```json
{
  "system": "<builder prompt от Claude>",
  "user": "<retrieval context + class info>",
  "assistant": "<reference output>",
  "weight": metadata.final_judge_score / 100.0,
  "verified": metadata.human_verified
}
```

Целевой объём: **минимум 1000 пар**, идеал 3000-5000.

### 9.2 Train

```bash
finetune/train/qwen_coder_14b.py \
    --base qwen-2.5-coder-14b \
    --dataset dataset_v8_<target>_train.jsonl \
    --rank 16 --alpha 32 --epochs 3 \
    --batch 4 --grad_accum 4 \
    --output adapters/<target>-qwen-coder-14b-lora-v1
```

Параметры из DSP-GPU `finetune-env/train_simple.py` + Plan-D patch для 14B на 9070.

### 9.3 Evaluation

```bash
finetune/eval/acceptance_test.py \
    --model adapters/<target>-qwen-coder-14b-lora-v1 \
    --questions golden_set/Q1_Q10_<target>.jsonl
```

**Gate**:
- `ΔR@5 ≥ +0.05` vs frozen base
- Δquality ≥ +5 points
- Δlatency < +30%
- **Q1-Q10 acceptance ≥ 9/10** (как в dataset_v8_plan §1)

«Выбор лучшего варианта»: side-by-side Qwen-Coder-14B-LoRA vs Qwen3-14B-LoRA → берём ту что выиграла.

---

## 10. 🌟 Phase 09.A — Dataset synthesis через collectors (NEW, D33)

> Источник плана: [05_dataset_v8_reference.md](05_dataset_v8_reference.md) (от сестры Sonnet 4.6, 21.05).

### 10.1 Где живут collectors

`pipelines/_template/collectors/` — **абстрактный шаблон** для нового target.
При создании нового target: `cp pipelines/_template/collectors/ pipelines/<name>_v1/collectors/` → адаптируется под target.

### 10.2 10 коллекторов

#### 🔴 P0 (must-have, ~1000 пар, ~2 ч)

| # | Скрипт | Что | Источник |
|---|--------|-----|----------|
| 3.1 | `collectors/patterns/reverse_patterns.py` | pattern → classes (reverse mapping) | `<target>/Doc/Patterns.md` или `_META.yaml` |
| 3.2 | `collectors/patterns/synonym_pairs.py` | 1 факт = 4-5 формулировок | топ-200 ключевых фактов |
| 3.3 | `collectors/patterns/confusion_negatives.py` | pattern confusion (Q: Singleton? A: Нет, Bridge) | все классы из patterns |

#### 🟡 P1 (high-value, ~150-230 пар, ~3 ч)

| # | Скрипт | Что |
|---|--------|-----|
| 3.4 | `collectors/listings/multi_class_listing.py` | exhaustive listings ("все RAII классы в core") |
| 3.5 | `collectors/facts/migration_history.py` | legacy → current (changelog + git log) |
| 3.6 | `collectors/docs/lessons_learned.py` | real bugs из `MemoryBank/sessions/*.md` |
| 3.7 | `collectors/facts/build_cmake_facts.py` | CMake / hipcc / ROCm факты |

#### 🟢 P2 (nice-to-have, ~100-150 пар, ~2 ч)

| # | Скрипт | Что |
|---|--------|-----|
| 3.8 | `collectors/code/hip_primitives.py` (или performance_hints) | HIP optimization idioms |
| 3.9 | `collectors/code/cross_references.py` | кто кого использует (`#include` grep) |
| 3.10 | `collectors/style/api_style_guide.py` | DSP-GPU code style (namespaces, файловая раскладка) |

### 10.3 Acceptance Q1-Q10

Для каждого target — свой набор Q1-Q10:
- **DSP-GPU**: уже готов в `dataset_v8_plan §1` (HybridBackend → Bridge, namespace `drv_gpu_lib::`, ...).
- **`pao_contrib`**: Кодо синтезирует из `_META.yaml` + symbols + patterns + key classes (по утверждённой методике).
- **NDA-drops**: то же, но из metadata доступной через REST.

### 10.4 Pre-flight train hygiene (важно)

Перед каждым train на 14B (см. `dataset_v8_plan §5`):
```bash
sudo systemctl stop systemd-coredump 2>/dev/null
killall pycharm code Telegram firefox chromium 2>/dev/null || true
sudo swapoff -a                                     # БЕЗ swapon обратно
free -h | head -3                                   # Swap should be 0
systemctl --user stop dsp-asst.service              # если стоит
pkill -f "ollama serve" 2>/dev/null || true
rocm-smi --showmemuse | grep VRAM                   # < 10%
```

Внести в `rag-pao/infra/healthcheck.sh`.

### 10.5 Stratified split + dedup

```python
# rag_pao/finetune/dataset_builders/dedup.py
# 1. Sentence-BERT embed Q+A
# 2. Cluster по cosine sim > 0.85
# 3. Из каждого cluster — 1 в train, 0/1 в val (не дублировать)
# 4. Не учим val на формулировках которые уже в train (защита от synonym leakage)
```

---

## 11. Прогресс tracking

Каждая фаза → `tasks/TASK_RAG_MENTOR_Phase<NN>_<name>.md` с **Definition of Done** + acceptance gates.

После каждой фазы:
1. `sessions/YYYY-MM-DD.md` — что сделали
2. `changelog/YYYY-MM.md` — одна строка
3. `MASTER_INDEX.md` — обновить статус фаз

---

*v0.3 final.*
