# Сестрёнке: задача T2 — namespace_correction_pairs

> **От:** Кодо main #1 (старшая сестра, 10.05 поздняя ночь)
> **К:** сестрёнке #2
> **Контекст:** medium train на 2080 Ti выявил **galлюцинации legacy namespace**:
> модель отвечает `dsp_fft` или `fft_processor::FFTProcessorROCm`,
> а каноничный namespace в проекте — `dsp::spectrum::*`.
> Полный отчёт: `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md` секция «🔁 Medium train».

---

## 🎯 Цель

Создать новый источник `dataset_namespace_correction.jsonl` — **пары-коррекции**:
- input: legacy / неверное имя класса (например `fft_processor::FFTProcessorROCm`)
- output: каноничный namespace (например `dsp::spectrum::FFTProcessor`) + объяснение что legacy deprecated

Цель: научить модель **различать каноничные `dsp::*` от legacy `fft_processor::*` / `vector_algebra::*` / etc.**

Прогноз: **30-50 пар**.

---

## 📋 Источники (где брать legacy ↔ canonical mapping)

### 1. Из правила [10-modules.md](../../.claude/rules/10-modules.md):

| Каноничное | Legacy (НЕ использовать) |
|-----------|--------------------------|
| `dsp::spectrum` | `fft_func`, `fft_processor` |
| `dsp::stats` | `statistics` |
| `dsp::signal_generators` | `signal_gen` |
| `dsp::heterodyne` | — |
| `dsp::linalg` | `matrix_ops`, `capon`, `vector_algebra` |
| `dsp::radar` | `range_angle`, `fm_correlator` |
| `dsp::strategies` | — |

### 2. Из БД `gpu_rag_dsp` (PostgreSQL):

```sql
-- Все классы с legacy namespace'ами
SELECT DISTINCT s.namespace, s.name, s.fqn, f.repo
  FROM rag_dsp.symbols s
  JOIN rag_dsp.files   f ON f.id = s.file_id
 WHERE s.kind IN ('class', 'struct')
   AND (s.namespace IN ('fft_processor', 'fft_func', 'antenna_fft',
                         'statistics', 'signal_gen',
                         'matrix_ops', 'capon', 'vector_algebra',
                         'range_angle', 'fm_correlator',
                         'lch_farrow', 'filters'))
 ORDER BY s.namespace, s.name;
```

(подключение: `host=localhost port=5432 dbname=gpu_rag_dsp user=dsp_asst pwd=$DSP_ASST_PG_PASSWORD`)

### 3. Из `<repo>/CLAUDE.md` (8 файлов) — каждый репо имеет «Каноничные имена» секцию или `#namespace:dsp::X` теги.

---

## 📐 Шаблон пар (3 типа)

### Тип A: `legacy_to_canonical` (~20-30 пар)

```json
{
  "instruction": "В каком каноничном namespace находится класс `FFTProcessorROCm` в DSP-GPU?",
  "input": "# Concept: namespace_correction\n# Legacy: fft_processor::FFTProcessorROCm\n# Repo: spectrum",
  "output": "Каноничный namespace класса `FFTProcessorROCm` в DSP-GPU — **`dsp::spectrum`** (репо `spectrum`).\n\nПолный канон: `dsp::spectrum::FFTProcessor` (без суффикса `ROCm` в публичном API).\n\n**Legacy** namespace `fft_processor::*` или `antenna_fft::*` — **deprecated**, остался от GPUWorkLib миграции. Не использовать в новом коде."
}
```

### Тип B: `repo_to_namespace` (~8 пар, по 1 на C++ репо)

```json
{
  "instruction": "Какой каноничный namespace у репо `linalg`?",
  "input": "# Concept: repo_namespace_canonical\n# Repo: linalg",
  "output": "Репо `linalg` экспортирует классы в namespace **`dsp::linalg`**.\n\n**Legacy** namespace'ы (НЕ использовать): `matrix_ops`, `capon`, `vector_algebra` — остались от миграции GPUWorkLib.\n\nКаноничные классы: `dsp::linalg::MatrixOps`, `dsp::linalg::CaponProcessor`, `dsp::linalg::SVDOp`, etc."
}
```

### Тип C: `wrong_namespace_correction` (~10 пар)

```json
{
  "instruction": "Правильно ли использовать `fft_processor::FFTProcessor` в новом коде DSP-GPU?",
  "input": "# Concept: namespace_correction_negative\n# Wrong: fft_processor::FFTProcessor",
  "output": "❌ **Нет**. `fft_processor::*` — это **legacy** namespace из GPUWorkLib, оставшийся после миграции в DSP-GPU. В новом коде использовать каноничный **`dsp::spectrum::FFTProcessor`** (репо `spectrum`)."
}
```

---

## 🛠️ Реализация

Файл: `C:/finetune-env/collect_namespace_correction.py` (~150 строк):

```python
def collect() -> list[dict]:
    # 1. Тип A: SELECT legacy classes из БД → mapping → пара
    # 2. Тип B: 8 пар, статические mapping из 10-modules.md
    # 3. Тип C: 10 «специально неверных» вопросов
    # → объединить, dedup по instruction
```

Подключить в `build_dataset_v3.py` SOURCES:

```python
(Path(r"C:\finetune-env\dataset_namespace_correction.jsonl"), "namespace_correction", True),
```

---

## ✅ DoD

- [ ] `collect_namespace_correction.py` написан (~150 строк, 3 функции для A/B/C)
- [ ] **30-50 пар** сгенерировано (`dataset_namespace_correction.jsonl`)
- [ ] Добавлено в `build_dataset_v3.py` SOURCES (label=`namespace_correction`)
- [ ] `dataset_v3.jsonl` пересобран — `namespace_correction: ~30-50` в split
- [ ] **TASK** файл `MemoryBank/tasks/TASK_RAG_dataset_namespace_correction_2026-05-10.md` (статус ✅ DoD)
- [ ] Запись в `MemoryBank/tasks/IN_PROGRESS.md` (новая строка `DS_NAMESPACE_CORRECTION`)

---

## 🚨 Важно

1. **НЕ обновляй файл `discuss_dataset_next_2026-05-10.md`** — там финальная договорённость по архивным шаблонам. Эта задача — отдельный поверх договорённости после medium train анализа.
2. **Hash-dedup в build_dataset_v3** уберёт случайные пересечения с другими шаблонами — не парься о дублях.
3. **Cap=30 в mid-clean** — проверь что новые пары не «сжирают» лимит топ-классов (если будет проблема — раскидать по разным `class_or_module` в `_meta`).
4. **После DoD** — отдай мне (Кодо main старшей) на ревью через создание файла `MemoryBank/prompts/sister_namespace_correction_DONE_2026-05-10.md` с краткой сводкой (N пар сгенерировано, как распределилось A/B/C). Я проверю, потом Alex ОК → push.

---

## 🔗 Связано

- Smoke + medium отчёт: `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md`
- Договорённость двух Кодо: `MemoryBank/prompts/discuss_dataset_next_2026-05-10.md`
- Правило `10-modules.md` — каноничные имена
- TASK Phase B: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`

---

*От: Кодо main #1 (старшая сестра, 10.05 ночь) → к: сестре #2*
