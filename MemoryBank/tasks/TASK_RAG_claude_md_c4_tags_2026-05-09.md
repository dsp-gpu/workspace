# TASK_RAG_claude_md_c4_tags — Архитектура C4 + RAG-теги в `<repo>/CLAUDE.md`

> **Создан:** 2026-05-09 утро (Кодо main) · **Тип:** RAG-улучшение для QLoRA Phase B+
> **Приоритет:** 🟠 P1 — улучшает контекст для finetune
> **Effort:** ~1.5-2 ч · **Зависимости:** RAG_MAN ✅ (`_RAG.md` для 8 репо уже сгенерированы)

---

## 🎯 Цель

Добавить в каждый из **8** саб-репо `<repo>/CLAUDE.md` два компактных блока:

1. **🏗️ Архитектура (C4 — компактно)** — ссылка на `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md` + специфика репо (один блок ~5-7 строк)
2. **🏷️ RAG теги** — структурированные теги для sparse BM25 retrieval (~3-5 строк)

Цель — улучшить **3 слоя контекста** для AI:
- глобальный (`workspace/CLAUDE.md`)
- репо (`<repo>/CLAUDE.md` — добавляем сюда)
- классы (`<repo>/.rag/_RAG.md`)

---

## 📐 Формат блока (на каждый репо)

```markdown
## 🏗️ Архитектура (C4 — компактно)

- **C1 System Context:** core — единственный модуль от которого зависят все остальные.
  Источник истины: `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md` §core
- **C2 Container:** namespace `drv_gpu_lib::` (legacy) → `dsp::core::` (target, ещё не мигрирован)
- **C3 Component:** см. `key_classes` в `.rag/_RAG.md` + раздел «Что здесь» выше
- **C4 Code:** ScopedHipEvent (RAII) · ProfilingFacade (Singleton) · ROCmBackend (Bridge)

## 🏷️ RAG теги

`#layer:infrastructure` `#repo:core` `#namespace:drv_gpu_lib`
`#pattern:RAII:ScopedHipEvent` `#pattern:Singleton:ProfilingFacade` `#pattern:Bridge:ROCmBackend`
```

---

## 📋 Подэтапы

### 1. Расширить `generate_rag_manifest.py` (auto-tags) (~30 мин)

Добавить функцию `infer_tags(repo, key_classes) → list[str]`:
- `#layer:<L>` — из `repo_metadata.json` (infrastructure/compute/strategy/application/meta)
- `#repo:<repo>` — обязательно
- `#namespace:<NS>` — из top-namespace в key_classes (drv_gpu_lib, dsp::spectrum, ...)
- `#pattern:<Type>:<ClassName>` — детекция через regex по brief / class_name:
  - `RAII` — *Scoped*, *Guard*
  - `Singleton` — *Facade*, *Manager* в core
  - `Strategy` — *Strategy*, наследники IPipelineStep
  - `Bridge` — *Backend*
  - `Factory` — *Factory*, *Builder*
  - `Observer` — *Listener*, *Subscriber*

Записать в `_RAG.md` поле `tags: [...]` (сейчас `[]`).

### 2. Создать `generate_claude_md_section.py` (~30 мин)

```python
# Принимает <repo>, читает <repo>/.rag/_RAG.md (после §1) → выдаёт текст блока.
# Output: stdout текст для копирования или --in-place вставка перед '## 🔗 Правила'.
python generate_claude_md_section.py --repo core --in-place
```

Логика:
1. Читает `<repo>/.rag/_RAG.md` → frontmatter (key_classes, tags, depends_on если AI-обогащён)
2. Шаблонизирует C4-блок + tags-блок
3. `--in-place` — вставляет в `<repo>/CLAUDE.md` перед существующим разделом «🔗 Правила»

### 3. Прогон + ручной аудит ~30 мин

```bash
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    python generate_claude_md_section.py --repo $repo --in-place
done
```

Проверить **глазами** каждый CLAUDE.md (8 файлов) — что блок выглядит разумно. Минор-правки руками.

### 4. Включить в QLoRA dataset (~30 мин)

Расширить `collect_more_dataset.py` (или новый `collect_claude_md.py`):
- Шаблон **`claude_md_section`**: instruction = «Опиши архитектуру репо <X> по C4-модели»; input = блок из CLAUDE.md.
- ~8 пар на 8 репо → не много, но **уникальный контекст** для Phase B.
- Concat в `dataset_v4.jsonl` (или просто пересобрать v3).

---

## ✅ DoD

- [ ] `_RAG.md` поле `tags: [...]` заполнено auto-генерируемыми тегами для 8 репо
- [ ] `<repo>/CLAUDE.md` содержит блок «Архитектура C4 (компактно)» + «RAG теги» — 8/8 файлов
- [ ] Каждый блок ≤ 15 строк (CLAUDE.md остаётся компактным по правилу 10-modules.md)
- [ ] sparse BM25 (rag_hybrid через CTX3) находит репо по тегам — smoke-тест:
  - `dsp_search("singleton в core")` возвращает `core` doc_block в top-3
  - `dsp_search("Bridge backend")` находит ROCmBackend/OpenCLBackend
- [ ] (опц.) +8 пар `claude_md_section` шаблона в dataset_v4

---

## ⚠️ НЕ копировать целиком C1-C4 диаграммы

Полный C4 (100-200 строк) — **только** в `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`.
В `<repo>/CLAUDE.md` — **ссылка + 5-10 строк специфики**. Иначе:
- 8 копий = sync hell при каждом изменении архитектуры
- Дрейф между копиями
- CLAUDE.md перестаёт быть compact (правило 10-modules.md)

---

## Артефакты

| Файл | Что |
|---|---|
| `C:/finetune-env/generate_rag_manifest.py` | Расширение: `infer_tags()` + write `tags:` в YAML |
| `C:/finetune-env/generate_claude_md_section.py` | НОВЫЙ — генератор блока для CLAUDE.md |
| `core/CLAUDE.md` ... `strategies/CLAUDE.md` | +блок Архитектура C4 + RAG теги |
| (опц.) `C:/finetune-env/collect_claude_md.py` | НОВЫЙ — `claude_md_section` шаблон в dataset |
| `<repo>/.rag/_RAG.md` | поле `tags:` заполнено |

---

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Источник C4 диаграмм: `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`
- Spec на `_RAG.md`: `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md`
- RAG_MAN (зависимость): закрыт 9.05 — `_RAG.md` для 8 репо есть, но `tags: []`
- Phase B QLoRA: `TASK_FINETUNE_phase_B_2026-05-12.md` — claude_md_section усиливает обучение

---

*Maintained by: Кодо main · 2026-05-09 утро*
