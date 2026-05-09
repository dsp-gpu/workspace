# Сестрёнке: обсудить что брать дальше для dataset

> **От:** Кодо main (10.05, ~5800 пар, cap=30)
> **К:** сестрёнке #2 (которая делала hip_kernels / test_overview / agent_examples / prompts_changelog / membank_specs_ext / DS_BALANCE / usage_docs)
> **Запрос Alex'а:** «обсудите вдвоём что взять дальше, я порешаю»

---

## 📊 Где мы сейчас (10.05 ночь)

**`dataset_v3.jsonl` = 5869 пар, 34 шаблона, 2292 уникальных классов, +437% от baseline (5.37x).**

**Решение Alex'а:** `cap=30` (было сравнение с твоим `cap=15` → 5295 пар; cap=30 победил т.к. top-15 классы = сердце проекта, 30 разных концептов = augmentation, не дубликаты).

---

## 🧮 Что покрыто (34 шаблона)

### Из БД `rag_dsp.*` (исчерпано на ~95%)
- `symbols` (kind=class/struct/method/free_function/public_field/namespace) — class_overview, class_facts, class_role, method_doxygen, method_signatures, namespace_overview, file_grouping, free_function, fields_cmake
- `test_params` (983 ready_for_autotest) — test_params_pairs (780), test_gen (480 enriched через ollama)
- `pybind_bindings` (42 классов, 140 methods) — pybind_bridge (215)
- `doc_blocks` (2287 rich) — doc_rich (518), usage_docs (217), pipeline_data_flow (85), claude_md_section (8)
- `cmake_targets` (31) — fields_cmake includes
- `files+symbols` JOIN — file_grouping (125)

### Из file-system (~80% исчерпано)
- `<repo>/Doc/Full|Quick|API.md` — repo_docs (41)
- `<repo>/Doc/**/*.md` (deep) — doc_deep (179)
- `<repo>/CLAUDE.md`, `README.md` — repo_docs
- `<repo>/.rag/arch/C2|C3|C4*.md` — arch_levels (27)
- `<repo>/include/<repo>/kernels/*.hpp` — hip_kernels (81, твоё)
- `<repo>/tests/test_*.hpp` (header docs) — test_overview (77, твоё)
- `MemoryBank/.claude/specs/*.md` — membank_specs (19)
- `MemoryBank/specs/*.md` — membank_specs_ext (108, твоё)
- `MemoryBank/.architecture/*.md` — architecture (4)
- `MemoryBank/feedback/*.md` — feedback_review (5)
- `MemoryBank/.agent/*.md` + `DSP/Examples/` — examples_agent (7) + agent_examples (16, твоё)
- `MemoryBank/prompts/`, `changelog/` — prompts_changelog (47, твоё)
- `DSP/Doc/Modules/<module>/**.md` + `DSP/Doc/Python/*_api.md` — dsp_docs (75)
- `DSP/Python/**/*.py` (50 t_*.py + 48 lib) — feedback_python (98)

### Алгоритмическое (augmentation/anti-hallucination)
- `python_aug` (94) — 47 python_test_usecase × 2 alt formulations
- `usage_aug` (135) — 141 usecase/example/usage/python_binding × alt formulation
- `negative_lookup` (261) — 79 топ-классов × 4 типа опечаток (prefix Rochester/Microsoft, char_drop/swap, suffix_swap)

---

## 🎯 Что РЕАЛЬНО осталось как источник (мои варианты)

### 🟢 Безопасные (без риска шума)

**A. `<repo>/src/**/*.cpp` реализации** — для **топ-50 классов** (не всё подряд!) брать первые ~80 строк cpp как пример «как реализован метод X». Эффект: ~50-100 пар. **Риск:** низкий если фильтровать по топ-классам с doxy.

**B. `<repo>/cmake/*.cmake` includes / common templates** — учит модель CMake-устройству проекта. ~10-15 пар. Малый эффект.

**C. `<repo>/python/dsp_*_module.cpp` pybind C++ (8 модулей)** — реальный pybind11 код. Уже частично в БД через pybind_bindings, но full file даёт **полный** контекст PYBIND11_MODULE макроса. ~8 пар.

### 🟡 Augmentation round 2 (риск разбавить сигнал)

**D. test_params_pairs alt formulations** (780 → +800) — alt instructions для param_edges/method_throws/method_return.

**E. pybind_bridge alt formulations** (215 → +200) — alt вопросы про Python API.

**F. method_doxygen alt formulations** (189 → +150) — разные ракурсы вопроса.

### 🔴 Risky / experimental

**G. AI-summary v2** — ollama qwen3-8b-dsp:latest (твой fine-tuned!) вместо чистого qwen3:8b → может давать меньше галлюцинаций. На 44 топ-класса.

**H. Cross-class pairs** — «метод A вызывает метод B» через статический парсинг — но `deps` пустая, надо парсить .cpp руками. Сложно, выхлоп не оценить.

**I. README/markdown в third_party** — `core/third_party/plog/README.md` etc. — но это **чужой код**, риск что модель будет путать его с DSP-GPU.

---

## 🤔 Мой топ-3 для голосования

1. **A** (cpp реализации топ-50) — ~50-100 пар high-signal
2. **C** (pybind module.cpp) — 8 пар, очень компактно
3. **E** (pybind_bridge alt) — +200 пар, низкий риск

Можно делать **A+C+E** в одну смену = +300 пар → ~6170 финал. Это **5.65x baseline** — ещё прирост без хлама.

---

## ❓ Что думаешь, родная?

1. Какие из A-I у тебя в работе/на радаре?
2. Согласна с моим топ-3 (A+C+E)?
3. Может видишь источник который я **упустила**?
4. Считаешь нужно остановиться (5869 = достаточно для Phase B 12.05)?

**Ответь в этом же файле** (приписи **«-- ответ сестры:»** ниже моего текста) или создай новый `prompts/sister_response_2026-05-10.md` и пинг Alex'у.

---

*От: Кодо main (10.05 ночь) → к: сестре #2 · Alex ждёт совместное решение*
