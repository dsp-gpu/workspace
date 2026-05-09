# TASK_RAG_dataset_balance — добор под-представленных классов в dataset_v3

> **Этап:** Phase B+ pre-train полировка датасета · **Приоритет:** 🟡 P2 (NICE-to-have перед 12.05)
> **Effort:** ~1-1.5 ч · **Зависимости:** dataset_v3 ✅ (2221 пар), `_RAG.md` tags ✅
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`
> **Связано с:** `TASK_FINETUNE_phase_B_2026-05-12.md`

---

## 🎯 Цель

Подтянуть **хвост распределения классов** в `dataset_v3.jsonl`. Сейчас (после ENRICH_TG ✅):

```
top-15 (по построению): hybrid_backend / opencl_backend / rocm_backend / spectrum_processor_rocm / antenna_processor_test / fft / statistics_processor — 30 (cap)
                        SpectrumProcessorROCm 18 / heterodyne_processor_rocm 17 / ... ← НЕ упёрлись в cap
1137 уникальных классов всего в датасете → у большинства 1-2 пары.
```

**Гипотеза:** под-представленные классы (1-2 пары) дают модели слабый сигнал → на inference она будет «галлюцинировать» имена / API / namespace для них (как было с CLEAN-247: «Rochester GPU» при выпадении critical mass повторений `drv_gpu_lib::`).

**Задача:** для классов с `< 5` пар догенерить ещё 2-3 пары через 2 новых шаблона. Cap 30/class сохраняется (top уже на cap).

**Ожидаемый эффект:** dataset_v4 ≈ **2400-2600** пар, хвост подтянется.

---

## 📋 Подэтапы

### 1. Анализ распределения (~10 мин)

Скрипт `C:/finetune-env/analyze_class_distribution.py`:

```python
# Прочитать dataset_v3.jsonl
# Сгруппировать по _meta.class_fqn (или эвристике из instruction если нет meta)
# Вывод:
#   - count classes with N pairs (N=1..30)
#   - top-30 most-represented (для контроля)
#   - bottom-30 least-represented (под-доноры)
#   - сохранить под-представленные (count < 5) → underrepresented_classes.txt (FQN per line)
```

DoD: вывод histogram + TXT файл `underrepresented_classes.txt` со списком ~600-800 классов.

### 2. Два новых шаблона генерации (~30 мин)

`C:/finetune-env/collect_balance_pass.py`:

| Шаблон | Instruction | Input (RAG context) | Output |
|---|---|---|---|
| **class_role_in_repo** | «Опиши роль класса {ClassName} в репо {repo}: какую задачу решает, к какому слою архитектуры относится» | `_RAG.md` tags ({repo}, layer) + class_overview из doc_blocks + namespace | 3-5 предложений на русском |
| **method_listing** | «Перечисли публичные методы класса {ClassName} с краткой ролью каждого (1 строка на метод)» | `rag_dsp.symbols` где kind=method и parent=ClassName, + doxygen brief | Markdown bullet list (5-15 строк) |

**Источники данных** (только READ, без LLM-вызовов):
- `rag_dsp.symbols` — для имён методов и parent-class
- `rag_dsp.doc_blocks` — для doxygen brief
- `<repo>/.rag/_RAG.md` — для tags и repo namespace

**Без ollama** — это deterministic шаблонизация (как `collect_more_dataset.py` делал для signatures). Быстрее, дешевле, контролируемее. ollama звать только если будем delight'ить под-представленные через `enrich_dataset` style — это уже опциональный 3-й шаг.

### 3. Сборка dataset_v4 (~20 мин)

```bash
python collect_balance_pass.py \
    --underrepresented underrepresented_classes.txt \
    --output dataset_balance_pass.jsonl \
    --max-pairs-per-class 3   # каждому донору +max 3 пары

python build_dataset_v3.py --output dataset_v4.jsonl --max-per-class 30
# build_dataset_v3 уже умеет concat всех источников + dedup + cap-30
# Расширить SOURCES в build_dataset_v3.py: добавить dataset_balance_pass.jsonl
```

### 4. Smoke-проверка качества (~15 мин)

Random 10 sample из новых пар → ручной аудит на:
- Правильный namespace (`drv_gpu_lib::` / `dsp::spectrum::` / т.д.)
- Output не путает класс (instruction про `FFTProcessor`, output про `IIRFilter` ❌)
- ≥ 30 символов в output

Если >2/10 битых → откатить шаблон, посмотреть RAG context'ы.

### 5. (опц.) LLM polish для top-100 худших (~30 мин)

Для самых проблемных под-представленных классов (брать первые 100 из `underrepresented_classes.txt`) — прогнать через `enrich_dataset.py` style: ollama qwen3:8b улучшает текст пары. По образцу `enrich_test_gen.py`, но для текстовых описаний.

⚠️ Опционально — если шаги 1-4 дали приличный результат, шаг 5 можно отложить.

---

## ✅ DoD

- [ ] `analyze_class_distribution.py` отчёт сохранён
- [ ] `underrepresented_classes.txt` ≥ 500 классов (count < 5)
- [ ] `collect_balance_pass.py` сгенерил **+200-400** новых пар (2 шаблона × среднее 1-2 пары/класс)
- [ ] `dataset_v4.jsonl` собран, total ≥ **2400 пар**
- [ ] Top-15 классов по-прежнему ≤ 30 (cap уважается)
- [ ] Smoke 10 random — ≥ 8/10 OK на ручном аудите
- [ ] Распределение хвоста: количество классов с count=1 уменьшилось хотя бы на 30%
- [ ] Запись в `MemoryBank/sessions/2026-05-XX.md` + `changelog/2026-05.md`

---

## ⚠️ НЕ делать

- **НЕ** трогать существующие шаблоны `class_overview` / `method_doxygen` / `method_signatures` / `pipeline_data_flow` / `claude_md_section` / `enriched` / `test_gen` — они работают, не ломать.
- **НЕ** превышать cap 30/class — модель не должна перекоситься на и без того представленные.
- **НЕ** генерить ничего про классы которых нет в `rag_dsp.symbols` (фантазии запрещены — реальный код или ничего).
- **НЕ** использовать pytest / GTest API в output (правило 04-testing-python).

---

## 💡 Подводные камни (на которые я бы наступила первой)

1. **`_meta.class_fqn` есть не везде** — для старых пар (Phase A 1093 dirty) его нет. Используй эвристику: regex по instruction `"класс ([A-Z]\w+)"` + по input `class_fqn:` поле YAML-блока.
2. **`rag_dsp.symbols` parent_id** — может быть NULL для top-level классов. Используй `name` фильтр, не parent.
3. **CamelCase vs snake_case** — `SpectrumProcessorROCm` (FQN) vs `spectrum_processor_rocm` (file/repo name). В `analyze_class_distribution.py` нормализуй один из вариантов до показа.
4. **Дубли при concat** — `build_dataset_v3.py` уже делает dedup по `(instruction, input)` хеш. Не паникуй если из 400 новых пар 50 dedup'нутся.
5. **8 саб-репо `_RAG.md`** — JSON frontmatter + body. Парсь YAML-frontmatter через `python -c "import yaml; yaml.safe_load(open(...).read().split('---')[1])"`.

---

## Артефакты

| Файл | Что |
|---|---|
| `C:/finetune-env/analyze_class_distribution.py` | NEW · отчёт по распределению |
| `C:/finetune-env/underrepresented_classes.txt` | NEW · ~500-800 FQN per line |
| `C:/finetune-env/collect_balance_pass.py` | NEW · 2 шаблона генерации |
| `C:/finetune-env/dataset_balance_pass.jsonl` | NEW · ~200-400 новых пар |
| `C:/finetune-env/build_dataset_v3.py` | M · добавить новый источник в SOURCES |
| `C:/finetune-env/dataset_v4.jsonl` | NEW · 2400-2600 пар, готов для Phase B |

---

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Источник 1: `dataset_v3.jsonl` 2221 пар (✅ DoD ENRICH_TG)
- Источник 2: 8 саб-репо `_RAG.md` (✅ DoD CLAUDE_C4)
- Источник 3: `rag_dsp.symbols` (CTX1 ✅), `doc_blocks` (CTX1 ✅)
- Spec на формат пар: `MemoryBank/specs/LLM_and_RAG/dataset_format_spec.md` (если есть; иначе посмотри `dataset_v3.jsonl` head)

---

## Альтернативы (НЕ выбраны, но если DS_BALANCE упрётся)

| # | Задача | Effort | Что даёт |
|---|---|---|---|
| **B** | Negative/contrastive pairs (anti-hallucination) | ~2 ч | -галлюцинации на inference, лечит кейс «Rochester GPU» |
| **C** | Quality gate: mini-eval baseline на 10 ключевых методов ПЕРЕД train | ~1.5 ч | страховка против повторения CLEAN-247 |
| **D** | Перепрогнать 13 SHORT records из ENRICH_TG с `--num-predict 1500` | ~15 мин | +13 валидных C++ snippets |

---

*Создан: 2026-05-09 вечер · Кодо main → next session (сестрёнке) · Maintained by: Кодо*
