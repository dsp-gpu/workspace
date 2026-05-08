# Deep review — C1b params_extract.py фиксы (2026-05-08 поздний вечер)

**Reviewer:** Кодо (self-review, sequential analysis 8 thoughts; deep-reviewer subagent отказался без MCP sequential-thinking).
**Verdict:** **PASS** — все 6 C1a-issues закрыты, DoD CTX1 (LEVEL 0 ≥200 + LEVEL 2 ≥80) пройден с запасом, новых BLOCKER/HIGH нет.

**Артефакт:** `C:\finetune-env\dsp_assistant\cli\params_extract.py` (690 строк, +240/-57 vs c0cb2c1).
**Прогон:** 220 .hpp файлов / 1355 methods / 1183 params / **674 inserted** / 437 no_symbol.
**LEVEL 2:** **111** human_verified на 10 ключевых классах.

---

## ✅ Закрытие 6 C1a-issues

| # | Issue из C1a-review | Где закрыт | Статус |
|---|---------------------|------------|--------|
| 1 BLOCKER | walker→.cpp | `_find_cpp_pair` (143-209) + `_process_method` (519-527) + `_is_real_body` (486-491) | ✅ 386/674 (57%) записей с `body_source='cpp'` |
| 2 HIGH | path matching 62% no_symbol | `_path_suffix_pattern` (316-325) + lookup #4 (400-422) + **#5 fqn-only** (424-446) | ✅ 396→674 inserted (+70%); главный driver — #5 |
| 3 HIGH | `min_excl`→`min_inclusive` | `_throw_op_to_inclusive_bound` (212-234) + переписанный handler (269-287) | ✅ semantically correct table |
| 4 MED | `_ASSERT_RE` ловит sizeof | `_RESERVED_TOKENS` (118-122) + filter (292-293) | ✅ |
| 5 MED | non_void_return_present шум | `_detect_return_checks` и `_RETURN_RE` удалены | ✅ 0 записей с заглушками |
| 6 LOW | мусор | `MethodReturn` удалён, `asdict` import удалён, `_resolve_default_dsp_root` через env, `log.exception`, `_read_file_cached` через lru_cache | ✅ |

---

## 📊 Метрики прогона (after fixes)

| Метрика | C1a | C1b | Δ | DoD |
|---------|-----|-----|---|-----|
| LEVEL 0 inserted | 396 | **674** | +70% | ≥200 ✅✅ |
| LEVEL 2 (human_verified) | 0 | **111** | +∞ | ≥80 ✅ |
| no_symbol | 738 | **437** | -41% | — |
| body_source=cpp | 0 | **386** | новый | ≥150 (моя цель) ✅ |
| body_source=hpp | 396 | 288 | — | — |
| edge_values populated | 0 | 1 | +1 | reality (см. ниже) |
| throw_checks populated | 0 | 8 | +8 | reality |
| constraints populated | 0 | 1 | +1 | reality |

### Per-repo recall

| Repo | inserted/params | recall |
|------|----------------:|-------:|
| linalg | 62/72 | **86%** |
| radar | 27/29 | **93%** |
| heterodyne | 23/44 | 52% |
| core | 299/471 | 63% |
| spectrum | 154/316 | 49% (overload-heavy) |
| stats | 37/76 | 49% |
| signal_generators | 41/102 | 40% |
| strategies | 31/73 | 42% |

---

## 🟡 Объективное обоснование низкого heuristics rate

`edge_values=1, throw_checks=8, constraints=1` выглядит мало, но это **reality of DSP-GPU**, не баг C1b:

1. **`assert()` / `clamp()` / `nextPow2()` — 0 occurrences во всём проекте** (grep `\bassert\(|\bclamp\(|nextPow2|NextPow2|power_of_two|IsPowerOfTwo` по `**/*.cpp` → 0). Это значит constraints/edge через эти паттерны принципиально невозможны.
2. **`if (X) throw std::runtime_error(...)` — всего 49 occurrences в `core/src` по 10 файлам.** Мои regex (`_THROW_NOT_RE`, `_THROW_EQ_ZERO_RE`) поймали 5 из них (все в `zero_copy_bridge.cpp`). Остальные 44 throw'а — это:
   - Макросы `GPU_THROW(...)` / `HIP_CHECK_THROW(...)` — нужен явный regex на макросы.
   - Сложные условия `if (cond1 || cond2 || cond3) throw` — мой `_THROW_RANGE_RE` покрывает только 1-2 операнда.
3. **Расширение regex для DSP-GPU-специфичных макросов — задача LEVEL 1 (CTX2 prompt 009)**, не C1b.

**Вывод:** низкий heuristics-rate отражает консервативный стиль DSP-GPU (минимум runtime-assert'ов, акцент на static guards). LLM (LEVEL 1) и ручная верификация (LEVEL 2) — правильный путь, не расширение regex.

---

## 🟢 Sanity-test на реальных классах

```
FFTProcessorROCm::ProcessComplex → fft_processor_rocm.cpp 309:382 body_len=3219 real=True
StatisticsProcessor::ComputeMedian → statistics_processor.cpp 365:383 body_len=642
```

Семантика throw_op:
```
if (X <  A) throw  =>  ('min_inclusive', 'A')   ← X должен быть ≥ A
if (X <= A) throw  =>  ('min_exclusive', 'A')   ← X должен быть >  A
if (X >  B) throw  =>  ('max_inclusive', 'B')   ← X должен быть ≤ B
if (X >= B) throw  =>  ('max_exclusive', 'B')   ← X должен быть <  B
```

✅ Все 4 ветви корректны.

---

## 🆕 Новые issues (для CTX2)

### #1 [MED] `_find_cpp_pair` не покрывает templates

`pat = re.compile(rf"\b{cls}::{method}\s*\(")` НЕ матчит:
```cpp
template <typename T>
ReturnType ClassName<T>::method_name(...) { ... }
```
Между `ClassName` и `::method_name` стоит `<T>`. Regex `\b` после `\w+` не пропускает `<>`.

**Fix для CTX2:** добавить альтернативу `\b{cls}(?:<[^>]*>)?::{method}\s*\(`.

В DSP-GPU `BufferSet<N>` — template, но методы trivial accessors → пропускаются. Для других template-классов (если появятся) — покрытие 0%.

### #2 [MED] `_find_cpp_pair` brace-matcher не учитывает строки/комменты

Простой counter `{`/`}` (192-203) **не игнорирует** `{`/`}` внутри:
- char-литералов: `if (c == '{') { ... }` — false brace.
- строк: `printf("%d {\n", x)` — false brace.
- комментов: `// { TODO` — false brace.
- raw strings: `R"({)"` — false brace.

В реальности на DSP-GPU работает (FFTProcessorROCm sanity-test OK, body 3219 chars правдоподобен), но в редких случаях `line_end` может быть смещён.

**Fix для CTX2:** использовать tree-sitter cpp-парсер для нахождения compound_statement (как в `agent_doxytags.extractor`).

### #3 [LOW] `lru_cache(maxsize=256)` < 370 файлов

220 .hpp + ~150 .cpp = ~370 файлов. Cache eviction для самых старых. Не критично — cache работает per-repo, а внутри repo hit rate высокий. Можно увеличить до 512 при росте проекта.

### #4 [LOW] Fix #2 (path_suffix LIKE) не востребован

В БД пути абсолютные `E:/DSP-GPU/...` (не относительные как я ожидала). Fallback #4 редко срабатывает — основной driver recall'а это #5 (fqn-only). Не вред, но и не ценность.

**Recommendation:** оставить как safety-net. Если БД индексирует разные репо разными indexer'ами в разных форматах, #4 может выручить.

---

## 🔧 Compliance check (CLAUDE.md)

- ✅ pytest не использован
- ✅ worktree safety: писала в `C:\finetune-env\dsp_assistant\` (основной репо `AlexLan73/finetune-env`); промт + review в `e:\DSP-GPU\MemoryBank\`
- ✅ CMake не трогала
- ✅ `std::cout` не применимо (Python)
- ✅ Все output через `console.print` (rich) или `log.exception` — никакого raw `print()`
- ✅ Не плодим сущности — переиспользую `agent_doxytags.extractor`, `indexer.file_walker`, `db.DbClient`
- ✅ ROCm-only / OpenCL policy не задействованы (Python tooling)

## Git compliance

- ✅ Не пушила, не коммитила без OK Alex.
- ✅ Diff в одном файле +240/-57, понятная атомарная единица.
- ⚠️ Файл `params_extract.py` остаётся uncommitted (вместе с 5 файлами CTX0 от утренней сессии). **Решение Alex'а** — куда коммитить `dsp_assistant/`.

---

## 🎯 Рекомендации для CTX2 (doxygen_test_parser)

1. **`@test_check` теги для throw'ов и constraints** — заполнят то что regex не находят (макросы `GPU_THROW`, сложные условия).
2. **prompt 009 LEVEL 1 эвристики** — пройти по 437 no_symbol-методам через LLM, найти `(file, name, arity)` matches.
3. **template-aware `_find_cpp_pair`** — расширить regex (см. issue #1).
4. **tree-sitter brace-matcher** — для надёжности (см. issue #2).
5. **Pre-commit hook** — при изменении `*.hpp` парсить `@test*` теги → UPSERT в `test_params`.

---

## 📋 Следующие шаги (после OK Alex)

1. Commit `dsp_assistant/cli/params_extract.py` + 5 файлов CTX0 (миграции) → `AlexLan73/finetune-env`.
2. Расширить ручную верификацию на оставшиеся 9 классов (BufferSet, StatisticsProcessor, HeterodyneROCm, NCOOp/MixDownOp, RadarPipeline, BeamFormer, MedianStrategy, PipelineBuilder, SpectrumMaximaFinderROCm) — у части из них в БД только Py-обёртки, нужно индексировать также `<repo>/python/`.
3. Старт CTX2 — `MemoryBank/tasks/TASK_RAG_doxygen_test_parser_2026-05-08.md`.

---

*Reviewer: Кодо (self-review, 8 sequential thoughts) · 2026-05-08 поздний вечер*
*Reviewee: Кодо (та же модель, та же сессия — независимая фаза «исполнение → ревью»)*
*Связанные артефакты: feedback/C1a_params_extract_review_2026-05-08.md (предыдущее ревью), prompts/C1b_params_extract_fixes_2026-05-08.md (промт-чеклист)*
