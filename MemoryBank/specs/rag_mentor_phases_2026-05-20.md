# RAG_mentor — Hierarchical Incremental RAG + фазы

> **Версия**: 0.2 · **Дата**: 2026-05-20 · **Автор**: Кодо для Alex
> **Родительский документ**: [rag_mentor_architecture_2026-05-20.md](rag_mentor_architecture_2026-05-20.md)
> **Скоуп**: HI-RAG (L0-L5), 10 фаз 00-09, QLoRA как обязательная фаза, GoogleTest подэтап.

---

## 1. HI-RAG (Hierarchical Incremental RAG) — слоистая модель

**Принципиальная идея Alex**: Qwen-окно маленькое → подаём слоями, не весь header целиком. Каждый слой — отдельный gate. **Следующий слой стартует только если предыдущий прошёл свой gate.**

| Слой | Источник | Как индексируется | Артефакт | Gate | Кто генерит |
|------|----------|-------------------|----------|------|-------------|
| **L0** | external_corpus (Boost / Eigen / OpenCV / fmt / spdlog / nlohmann) | crawler → markdown chunker → BGE-M3 → Qdrant + PG.tsvector | `.rag/_corpus/*.md` + векторы | `golden_set_L0` R@5 ≥ 0.9 | crawler (без Qwen) |
| **L1** | C4-диаграммы target + CMake граф | человек C4 + cmake-parser + libclang AST (опц.) | `.rag/<t>/L1_architecture/*.md` | `golden_set_L1` R@5 ≥ 0.9 | человек + Claude-помогает |
| **L2** | classes / methods / variables target | tree-sitter + libclang XML → `symbols` table | `.rag/<t>/L2_symbols/*.md` | `golden_set_L2` R@5 ≥ 0.85 | автомат (без Qwen) |
| **L3** | doxygen-шапки + test_cases | **Qwen14B filler → Qwen35B judge → Claude critic** | `.rag/<t>/L3_descriptions/classes/*.md` | per-class quality ≥ 80 на ≥90% | **Qwen + Claude** |
| **L3b** | GoogleTest skeleton 🌟 NEW | Qwen14B на основе L3 test_cases → schema-validated cpp | `.rag/<t>/L3_descriptions/tests/*_test.cpp` | gtest_compile_pass ≥ 90% | **Qwen + cppcheck/gcc lint** |
| **L4** | use_cases / pipelines | Qwen14B + Claude review | `.rag/<t>/L4_use_cases/*.md` | `golden_set_L4` R@5 ≥ 0.8 | **Qwen + Claude** |
| **L5** | QLoRA Qwen14B + Coder-14B на L3-L4 логах 🌟 NEW обязательно (Alex против out-of-scope) | `finetune/train_*_qlora.py` | LoRA adapters | ΔR@5 ≥ +0.05 vs frozen + side-by-side compare | **finetune scripts** |

### 1.1 Retriever-policy per layer (как кормим Qwen маленькое окно)

```python
def retrieve_for_L3(class_fqn):
    """Подаём Qwen только нужное, не весь header."""
    arch_brief    = retrieve(L1, filter=class_relevance(class_fqn), top_k=1)
    symbols_self  = retrieve(L2, fqn=class_fqn)              # сам класс
    symbols_deps  = retrieve(L2, related_to=class_fqn, top_k=3)
    fewshot       = retrieve(L0, similar_to=class_fqn, top_k=3)
    return Context(arch_brief, symbols_self, symbols_deps, fewshot)


def retrieve_for_L3b_gtest(class_fqn):
    """Для GoogleTest skeleton — добавляем примеры тестов."""
    base = retrieve_for_L3(class_fqn)
    test_examples = retrieve(L0_test_examples, similar_to=class_fqn, top_k=3)
    target_test_cases = retrieve(L3, fqn=class_fqn)   # уже сгенерированные test_cases
    return Context(*base, test_examples, target_test_cases)
```

### 1.2 Прохождение gate (что значит «обучили RAG»)

«**Обучили RAG**» = слой полностью загружен в PG + Qdrant + прошёл `golden_set_Lx ≥ threshold`. Без gate — следующий слой не стартует, иначе мусор размножается.

`golden_set_Lx.jsonl` — 30-50 QA-пар, написанных вручную. Структура:

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

## 2. Cycle of self-correction (RAG_mentor ↔ rag-pao)

```
for class in target.classes:
    ctx     = rag_pao.retrieve_L3(class.fqn)
    prompt  = Claude.PromptBuilder(class, ctx)                 # 1 вызов
    journal = open_session(class.fqn)                          # 🌟 Alex Q8

    for attempt in range(MAX_RETRIES=3):
        qwen_out = rag_pao.run_filler(prompt, model="qwen2.5-coder-14b")

        # Anti-hallucination первый барьер (см. policies.md §A)
        names_check = name_validator.check(qwen_out, ctx.symbols)
        if not names_check.ok:
            prompt = Claude.Critic.fix_hallucinations(prompt, names_check.errors)
            journal.log("hallucination_fail", names_check.errors)
            continue

        # JSON schema + doxygen lint
        valid = Validator.check(qwen_out)
        if not valid.ok:
            prompt = Claude.Critic.fix_schema(prompt, valid.errors)
            journal.log("schema_fail", valid.errors)
            continue

        # Qwen35B как эталон (frozen, inference only — Alex подтвердил)
        judge = rag_pao.run_judge(class, qwen_out, model="qwen3.6-35b")
        if judge.score >= 80:
            # Claude double-check
            review = Claude.Reviewer(class, qwen_out, ctx)
            if review.score >= 80:
                save_to_rag(class, qwen_out)
                # L3b — GoogleTest skeleton
                gtest = run_L3b_gtest_generation(class, qwen_out)
                save_to_rag_tests(class, gtest)
                # 🌟 фиксируем в журнал (Alex Q8)
                journal.finalize(prompt, qwen_out, judge, review, gtest)
                log_distillation(...)
                break

        # quality low → critic правит промпт
        prompt = Claude.Critic.improve(prompt, qwen_out, judge.delta, review.notes)
        journal.log("retry", attempt + 1)
    else:
        mark_for_human_review(class)
        journal.log("escalated_to_human")
```

**Параметры (дефолт, подлежат тюнингу)**:
- `MAX_RETRIES = 3`
- `judge_threshold = 80`
- `reviewer_threshold = 80`
- `reviewer_sample = 100%` для MVP, далее 10%
- `temperature_filler = 0.3`
- `temperature_judge = 0.0`

---

## 3. Фазы 00-09

| Фаза | Что | Срок | Output | Gate |
|------|-----|------|--------|------|
| **00 Bootstrap** | создать rag-mentor (git/каталог) + rag-pao (каталог), MemoryBank, CLAUDE.md, rules в каждом, .gitignore, .env.example | 1 день | 2 каталога открываются в Claude Code, rules грузятся | первый commit в rag-mentor |
| **01 Infra** | docker-compose, PG schemas (`rag_mentor` + `rag_pao_<t>`), Qdrant collections, Ollama smoke, локальные MCP-серверы для Кодо | 1-2 дня | контейнеры up, MCP подключены | `psql \dt rag_*.*`, `qdrant get_collections`, Claude видит локальный Context7 |
| **02 L0 corpus** | crawler doxygen из Boost (либы от заказчика или наши selected) + Eigen + OpenCV + fmt + spdlog + nlohmann + test_examples (gtest/catch2) | 2-3 дня | external_corpus/ заполнен, ~500-700 классов с tagged doxygen | `golden_set_L0` R@5 ≥ 0.9 |
| **03 L1+L2 target** | nlohmann/json как target — tree-sitter + libclang → PG + Qdrant. **Alex**: «дадим задание Claude чтобы подобрала для старта 3 маленьких модулей заказчика» | 1-2 дня | таблицы symbols, deps заполнены | `golden_set_L1+L2` R@5 ≥ 0.85 |
| **04 Prompts v1** | builder/judge/reviewer/critic + 3 fewshot из DSP-GPU spectrum + schemas JSON | 2 дня | `rag-mentor/MemoryBank/prompts/v1/` | manual prompt-trial на 1 классе nlohmann даёт качество ≥ 70 |
| **05 L3 pilot 5 classes** | end-to-end Qwen filler/judge + Claude reviewer/critic + name-validator + journal на 5 классах nlohmann | 2-3 дня | `.rag/nlohmann_json/L3/classes/*.md` + `.rag/.../sessions/001-005_*.md` | quality ≥ 80 на ≥ 4 из 5 + 0 галлюцинаций на именах |
| **05b L3b GTest pilot** 🌟 NEW | для тех же 5 классов сгенерировать GoogleTest skeleton + проверить компиляцию | 1-2 дня | `.rag/.../L3/tests/*_test.cpp` | gtest скелет компилируется на ≥ 4 из 5 |
| **06 L3 + L3b full target** | автоматический прогон по всем ~30 классам nlohmann_json | 2-3 дня | весь L3 + L3b заполнен | quality ≥ 80 на ≥90% классов, gtest compile ≥ 90% |
| **07 L4 use_cases** | use_cases + pipelines target | 2 дня | `.rag/.../L4_use_cases/` | `golden_set_L4` R@5 ≥ 0.8 |
| **08 Eval + replicate** | replicate на 2-ом target (spdlog или модуль заказчика) — измерить переносимость pipeline'а | 2-3 дня | сравнительная таблица target1 vs target2 | delta_quality < 10% между target'ами |
| **09 QLoRA** 🌟 обязательно (Alex) | export `_logs/L3_distillation.jsonl` → finetune-env → QLoRA на Qwen14B и Qwen-Coder-14B → side-by-side compare | 3-5 дней | 2 LoRA adapters | ΔR@5 ≥ +0.05 vs frozen, выбор «лучшего варианта» (Alex) |

### Honest estimate

**Фазы 00-08**: **3-4 рабочие недели** для одного человека (раньше говорила 2-3, после учёта L3b GoogleTest + 3 модулей заказчика + anti-hallucination разработки — ближе к 4).

**Фаза 09 QLoRA**: **+1-2 недели** сверху, зависит от объёма distillation dataset (нужно минимум 200-500 примеров для адекватной LoRA).

**Итого MVP до production-ready**: **5-6 рабочих недель**.

---

## 4. Boost — теперь от заказчика (Alex 2026-05-20)

> Alex: «в Boost у заказчика не много модулей! можно не волноваться) создадим каталог я туда скопирую код от заказчика и отрегулируем».

**Принятый подход**:
- **L0 corpus НЕ собираем crawler'ом из public Boost** — Alex положит **локальный код заказчика** в `rag-pao/external_corpus/customer_drop/` (~10-30 MB).
- Crawler из public Boost остаётся **fallback** на случай если у заказчика мало примеров (≤ 20 классов).
- В `customer_drop/` идут **только разрешённые** заказчиком фрагменты (NDA — Alex проверяет).

### 4.1 Selection policy простыми словами

«Selection policy» = правила «какие header'ы берём в RAG, какие — нет». Зачем нужны:
- LLM учится на примерах. **Хороший пример = хороший результат**, мусор = мусор.
- Не все .hpp одинаково полезны: автогенерёнка, гигантский monolith, тривиальные одностроки — это шум.

**4 фильтра**:

| # | Правило | Почему |
|---|---------|--------|
| 1 | ≥ 3 doxygen-тэга (`@param`/`@brief`/`@throws`) | Без doxygen нет чему учиться |
| 2 | Нет маркера `DO NOT EDIT` / `@autogenerated` | Сгенерёнка обычно с кривым doxygen |
| 3 | **`size_kb ≤ 50`** ИЛИ есть «cleaned-копия» (см. 4.2) | Большие файлы плохо чанкуются, теряется контекст. **`≤` правильно** — пропускаем БОЛЬШИЕ |
| 4 | License: BSL-1.0 / MIT / BSD / Apache-2.0 | GPL/AGPL «инфицирует» наш код. Customer code — отдельно по NDA |

### 4.2 Header summarization — обход правила #3 (Alex's идея)

> Alex: «давай подумаем как это обойти, может создать промежуточный файл убрать всё лишнее».

**Идея**: если header > 50 KB — генерируем «cleaned-копию» где остаются только **public API** + doxygen, всё impl-detail/anonymous-namespaces/internal — вырезано.

**Алгоритм** (в `retrieval/indexer/header_summarizer.py`):

```python
def summarize_large_header(hpp_path: Path) -> Path:
    """tree-sitter: вырезаем impl-detail, оставляем public-секцию + doxygen.

    Сохраняем в external_corpus/_summarized/<orig_name>.cleaned.hpp
    """
    tree = tree_sitter_parse(hpp_path)
    keep_nodes = []
    for node in tree.walk():
        if node.type == "class_specifier":
            # оставляем public-section + doxygen-комменты ДО неё
            public_parts = extract_public_only(node)
            keep_nodes.extend(public_parts)
        elif node.type == "comment" and is_doxygen(node):
            keep_nodes.append(node)
        # пропускаем: anonymous_namespace, function_definition (только декларации),
        # template instantiations, internal helpers (`detail::`, `impl::`)
    cleaned_path = OUT_DIR / f"{hpp_path.stem}.cleaned.hpp"
    cleaned_path.write_text("\n".join(n.text.decode() for n in keep_nodes))
    return cleaned_path


def is_corpus_worthy(hpp_path: Path) -> Path | None:
    text = hpp_path.read_text(encoding="utf-8")
    if "DO NOT EDIT" in text or "@autogenerated" in text:
        return None
    if not has_compatible_license(hpp_path):
        return None
    doxy_tags = re.findall(r"@(param|brief|throws|return)", text)
    if len(doxy_tags) < 3:
        return None
    # 🌟 Alex's идея: large → summarize вместо skip
    if len(text) > 50_000:
        cleaned = summarize_large_header(hpp_path)
        if cleaned.stat().st_size <= 50_000:
            return cleaned                 # indexer возьмёт cleaned-версию
        return None                        # даже после cleanup всё ещё огромный
    return hpp_path                        # обычный путь
```

**Где живут cleaned-копии**: `rag-pao/external_corpus/_summarized/<orig>.cleaned.hpp` (внутри git, видно diff).

**Когда применять**: автоматически на индексации L0 + опционально для L1/L2 target если у заказчика есть гигантские монолиты.

### 4.3 Manual override

Если **Alex** хочет насильно включить файл который не прошёл — `rag-pao/external_corpus/manual_include.yaml`:

```yaml
- path: customer_drop/big_legacy.hpp
  reason: "Эталон того как НЕ надо — учим reviewer'а на анти-паттернах"
  bypass_filters: [size]
```
---

## 5. Customer drop policy (Alex 2026-05-20 — заменяет Boost-crawler)

**Источник L0**: Alex кладёт код заказчика в `rag-pao/external_corpus/customer_drop/`. Никаких public Boost crawler'ов в MVP.

**Стратегия Phase 02**:
1. Alex копирует customer code в `customer_drop/` (NDA уже разрешён).
2. Indexer прогоняет `is_corpus_worthy` (см. §4.2) + при необходимости `summarize_large_header`.
3. Дополняем open-source мини-набором (только nlohmann/json + fmt) — для **сравнения с эталоном**.
4. `golden_set_L0.jsonl` — пишем на customer drop + open-source примерах.

**Никаких** Boost.Beast/Asio/Hana если они не нужны заказчику — это уменьшает шум в RAG.

---

## 6. Hardware budget RX 9070 (с правками Alex 2026-05-20)

> Alex: «Qwen 2.5-Coder-14B, Qwen 3-14B — протестированно работает обучается на 9070. Qwen 3.6-35B протестированно работает хорошо но не обучается, rocm преобразует память в размер 47гига — но не обучается».

| Модель | Размер | Inference на 9070? | QLoRA fine-tune на 9070? |
|--------|--------|--------------------|--------------------------|
| Qwen2.5-Coder-14B Q4_K_M | ~10 GB VRAM | ✅ да | ✅ да (Alex проверил) |
| Qwen3-14B Q4_K_M | ~10 GB VRAM | ✅ да | ✅ да (Alex проверил) |
| **Qwen3.6-35B** Q4_K_M | ~19 GB → 47 GB при ROCm-load | ✅ да (со swap) | ❌ нет (Alex проверил) |
| BGE-M3 + reranker | ~3 GB | ✅ | (не нужен FT) |

**Распределение ролей в pao**:
- **Filler** = Qwen2.5-Coder-14B (trainable, потом QLoRA-fine-tuned) → MVP L3/L3b/L4
- **Judge** = Qwen3.6-35B (frozen, inference only) → MVP critic-эталон
- **Reviewer (double-check)** = Claude Sonnet 4.6 (online)
- **Critic (промпт-фикс)** = Claude Opus 4.7 (online)
- **Embedder** = BGE-M3 (никогда не FT)

**Одновременный запуск**:
- 14B + BGE-M3 + reranker = ~13 GB → влезает.
- 35B alone = ~19 GB → **не влезает** в 16 GB одновременно с 14B. **Решение**: queue (по очереди swap'ом). Это и есть «нужен queue» из v0.1.
- «Queue» простыми словами: одновременно держим в VRAM только одну тяжёлую модель. Когда нужен Judge — выгружаем Filler, грузим Judge, делаем оценку, возвращаем Filler. Латентность +5-10 сек на swap. Для batch'а из 30 классов это ОК.

**Альтернатива (если swap слишком медленный)**:
- Filler на 9070 постоянно.
- Judge на CPU + offload (Qwen35B-Q3_K_M на CPU = ~15 сек/класс, медленно но работает).

---

## 7. 3 модуля заказчика для старта (Alex's идея)

> Alex: «дадим задание Claude чтобы подобрала для старта 3 маленьких [модуля заказчика]».

**Когда заказчик даёт доступ к репо** — фаза 03 разделяется:

1. **3a** Кодо (Claude) обходит target репо, формирует ranked-список модулей по: количество классов, размер кода, наличие тестов, простота API.
2. **3b** Alex выбирает 3 «маленьких» (≤ 10 классов каждый).
3. **3c** Эти 3 модуля → L1 + L2 + golden_set per module.
4. **3d** L3 пилот на самом маленьком из трёх.

Это пилот **внутри** target — оцениваем шаблон на 3 разных по сложности модулях.

---

## 8. GoogleTest подэтап L3b (Alex's требование)

> Alex: «нужно будет писать google тест. Предлагаю во время работы добавлять примеры кода и тобой написанного теста».

**Алгоритм L3b** (после успешного L3 для класса):

```
input:
  - L3.classes/<Class>.md (doxygen + test_cases tagged DSL)
  - L0 test_examples (gtest fewshot)
  - L2.symbols (сигнатуры методов класса)

prompt to Qwen14B-Coder:
  "Сгенерируй GoogleTest skeleton для класса {fqn}.
   Используй tagged test_cases из {L3 doc} как источник граничных значений.
   Формат — gtest TEST_F с fixture. Schema attached."

output: <Class>_test.cpp

validator (3 уровня):
  1. JSON schema (структура: includes, fixture, list of TEST_F)
  2. cppcheck / clang-tidy lint
  3. **попытка скомпилировать** (без линковки самого target — только проверка синтаксиса с -fsyntax-only)

gate: gtest_compile_pass ≥ 90% классов
```

**Накопление примеров**: каждый успешный gtest идёт в `external_corpus/test_examples/gtest_examples/<target>__<Class>_test.cpp`. Это **самопополняющийся** corpus — со временем fewshot для новых классов будет богаче.

---

## 9. QLoRA как обязательная фаза (Alex)

> Alex: «не согласен !!!! мы все делаем для этого!!! QLoRA! пробуем Qwen14B и Qwen 2.5 Coder-14B и выбираем лучший вариант».

**Phase 09 — обязательная**, не out-of-scope.

### 9.1 Dataset preparation

Из `_logs/L*_distillation.jsonl` (накопленных за фазы 05-08):

```json
{
  "system": "<builder prompt от Claude>",
  "user": "<retrieval context + class info>",
  "assistant_target": "<качественный Qwen35B-Judge output ИЛИ Claude Reviewer fix>",
  "assistant_qwen14b_baseline": "<что Qwen14B выдал до FT>",
  "judge_score": 92,
  "human_verified": true
}
```

Фильтр: только `judge_score >= 85` И `human_verified = true` (или `judge_score >= 90` без проверки).

Целевой объём: **минимум 200 примеров**, идеал 500-1000.

### 9.2 Train

```bash
finetune/train_qwen14b_qlora.py \
    --base qwen-2.5-coder-14b \
    --dataset _logs/L3_distillation_filtered.jsonl \
    --rank 16 --alpha 32 \
    --epochs 3 \
    --batch 4 --grad_accum 4 \
    --output adapters/qwen-coder-14b-lora-v1
```

Параметры берём из DSP-GPU `finetune-env/train_simple.py` — Alex уже отладил.

### 9.3 Evaluation (side-by-side)

```bash
finetune/compare_models.py \
    --model_a qwen-2.5-coder-14b/base \
    --model_b qwen-2.5-coder-14b/adapters/v1 \
    --golden golden_set/L5_qlora.jsonl \
    --metrics judge_score quality_0_100 latency
```

**Gate**: `ΔR@5 ≥ +0.05` И `Δquality ≥ +5 points` И `Δlatency < +30%`.

«Выбор лучшего варианта» (Alex): между Qwen-Coder-14B-LoRA и Qwen3-14B-LoRA — берём ту, что выиграла на golden_set L5.

---

*End of phases spec v0.2*
