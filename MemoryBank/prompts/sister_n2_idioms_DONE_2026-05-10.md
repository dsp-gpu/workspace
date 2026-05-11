# Сестра #2 → старшей: N2 IDIOMS DONE (10.05 поздняя ночь, виток #3)

> **От:** Кодо main #2 (сестра)
> **Кому:** Кодо main #1 (старшая) — на ревью deep-reviewer'ом
> **Эффорт:** ~45 мин
> **Статус:** ✅, ждём ревью + OK Alex'а на финальный rebuild + push.

---

## ✅ N2 IDIOMS / Best Practices (DONE)

**Файл:** `C:/finetune-env/collect_idioms.py` (~430 строк)
**Output:** `dataset_idioms.jsonl` = **20 пар** (20 идиом × 1 формулировка), 5 категорий.

### 5 категорий (20 идиом)

| Категория | Кол-во | Идиомы |
|-----------|--------|--------|
| **raii_ownership** | 5 | `scoped_hip_event`, `unique_ptr_polymorphic`, `move_only_raii`, `buffer_set`, `owns_resources_flag` |
| **api_design** | 5 | `auto_ref_singleton`, `noexcept_contract`, `nodiscard_factory`, `const_ref_value_params`, `override_final` |
| **naming** | 4 | `camelcase_class_snakecase_file`, `suffix_conventions`, `namespace_convention`, `enum_class` |
| **cmake_build** | 3 | `find_package_lowercase`, `target_sources_no_glob`, `pragma_once` |
| **modern_cpp** | 3 | `structured_bindings`, `std_span`, `explicit_ctor` |

Все 20 идиом из твоего списка — покрыты.

### Соблюдённые правила

- ✅ **Тон позитивный** — «правильно как X», не «запрещено Y» (нет дубля с REFUSAL).
- ✅ **Не паттерны GoF** — Bridge/Facade/Strategy не упоминаются (это Patterns.md).
- ✅ **Не математика** — формулы FFT/Capon/Welford не трогала (это твой N1).
- ✅ **CUDA/OpenCL** — упомянуты только в `find_package_lowercase` для контекста ROCm (в hard_negatives и REFUSAL детально).
- ✅ **Реальный API** — все примеры из `core/services/scoped_hip_event.hpp`, `i_pipeline_step.hpp`, `magnitude_op.hpp` etc.

### Связки с правилами и memory

Каждая идиома ссылается на `.claude/rules/*.md` или конкретный header:

| Идиома | Источник |
|--------|----------|
| `scoped_hip_event` | `09-rocm-only` + memory `project_scoped_hip_event` (38 утечек 15.04) |
| `find_package_lowercase` | `09-rocm-only` + `12-cmake-build` |
| `target_sources_no_glob` | `12-cmake-build` |
| `worktree_*` (NB: в REFUSAL уже) | `03-worktree-safety` |
| `namespace_convention` | `10-modules.md` § «Каноничные имена» |
| `noexcept_contract` | `05-architecture-ref03` (Ref03 контракт) + `14-cpp-style` |
| остальные | `14-cpp-style.md` |

---

## ✅ Build dataset_v3 после N2

**Замечание:** обнаружила что в `build_dataset_v3.py SOURCES` ты уже добавила
`arch_rationale` + `error_handling` (свои треки) к моменту моего rebuild'а — это норм,
просто отмечаю чтобы ты знала что мой rebuild подхватил всё.

```
🧹 Mid-clean (max-15/class):
   уникальных классов: 2775
   dropped: 864
   итого: 6066
```

**`dataset_v3.jsonl` 5985 → 6066 (+81)**:
- мои **20 idiom** (`class_fqn = idiom_<topic>` → все уникальны → все в финале);
- твои 61 пара из `arch_rationale` + `error_handling` (rebuild собрал и их).

---

## 📁 Файлы (finetune-env)

| Файл | Статус |
|------|--------|
| `collect_idioms.py` | NEW (~430 строк) |
| `dataset_idioms.jsonl` | NEW (20 пар) |
| `dataset_idioms_report.txt` | NEW |
| `build_dataset_v3.py` | M (+`idiom` в SOURCES) |
| `dataset_v3.jsonl` | M (rebuild → 6066) |

В DSP-GPU репо ничего не правила (чистый dataset-генератор).

---

## 🚦 DoD checklist

- [x] N2: `collect_idioms.py` написан (~430 строк)
- [x] `dataset_idioms.jsonl` (20 пар, 5 категорий ≥ 4 как в требовании)
- [x] Подключено в `build_dataset_v3.py SOURCES` (label=`idiom`)
- [x] Rebuild dataset_v3 → +20 пар от меня (5985 → ≥ 6005, фактически 6066 с твоими)
- [x] Создан `MemoryBank/prompts/sister_n2_idioms_DONE_2026-05-10.md`
- [ ] **На ревью у старшей** (deep-reviewer) → push после OK Alex'а
- [ ] **Финальный rebuild + dedup + snapshot v4** — твой ход (как договорились).

---

## 🚧 На твоё усмотрение

- **Pseudo-class prefix `idiom_*`** — добавь в blacklist в `class_facts` / dedup-скриптах если есть фильтр.
- **Возможный мини-overlap с REFUSAL** в идиомах `scoped_hip_event`, `find_package_lowercase` — у меня тон «как правильно», у REFUSAL тон «нельзя так». На семантическом dedup может стрельнуть похожесть, но instruction'ы разные («какая идиома» vs «можно ли»). Если deep-reviewer найдёт — выкину пересечения.
- **`override_final` идиома** — пишу что Op'ы Layer 5 финальные. Если у тебя в hard_negatives есть «можно ли наследоваться от MagnitudeOp» — это не дубль, у меня про синтаксис, у тебя про факт.

---

## 📊 Кумулятивный вклад сестры за три витка (10.05)

| Виток | Треки | Пар |
|-------|-------|-----|
| #1 | A1+A2+A3+D2 | 30 (D2 reasoning_chains) |
| #2 | D3+REFUSAL | 49 (25 code_template + 24 refusal) |
| #3 | N2 IDIOMS | 20 idiom |
| **Итого** | — | **99 пар, +4 источника** (`reasoning_chain`, `code_template`, `refusal`, `idiom`) |

`dataset_v3` за три витка: 5885 → 5936 → 5985 → **6066** (мой вклад +99, твой arch_rationale+error_handling +61 в последнем rebuild).

---

*От: Кодо main #2 → к: Кодо main #1 · 10.05 поздняя ночь · последний виток до Phase B 12.05*
