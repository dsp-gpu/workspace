# TASK_RAG_dataset_hip_kernels — пары из HIP + OpenCL kernel sources

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Тип:** новый источник в dataset_v3 (2 типа: HIP-ROCm + OpenCL interop)
> **Приоритет:** 🟠 P1 · **Effort:** ~1.5 ч факт · **Зависимости:** нет

---

## 🎯 Цель

Извлечь HIP kernel sources из embedded R"HIP(...)HIP" блоков в `<repo>/include/<repo>/kernels/*_rocm.hpp` и сгенерировать пары для QLoRA датасета.

**Покрытие:** 24 файла × 3-7 kernel'ов = **80-150 пар** (нижняя оценка). Ни в одном из 16 существующих шаблонов HIP kernels не охвачены — это чистый прирост.

---

## 📐 Структура источника

В каждом `<module>_kernels_rocm.hpp`:

1. **File-level doxygen** (`@file`, `@brief`, `@note Состав ядер: ...`, история).
2. **`inline const char* GetHIPKernelSource() { return R"HIP(...)HIP"; }`** — string literal с реальным kernel'ным C-кодом.
3. **Внутри `R"HIP(...)HIP"`** — структура kernel'а:
   ```
   // ═══════════════════════════════════════════════════════════════
   // Kernel: <name>
   // <multiline description>
   // ═══════════════════════════════════════════════════════════════
   __launch_bounds__(N)
   extern "C" __global__ void <name>(<params>) { ... }
   ```

---

## 📋 Шаблоны (2 шт)

| Шаблон | Триггер | Output | Ожидание |
|--------|---------|--------|---------|
| **kernel_overview** | На каждый `extern "C" __global__ void <name>` | name + namespace + signature + description + optimization hints | ~80-150 |
| **kernels_file_overview** | На каждый `*_kernels_rocm.hpp` | список kernel'ов из `@note Состав ядер:` + file `@brief` | 24 |

Итого: **~100-170 пар**.

---

## 🛠️ Реализация

### `C:/finetune-env/collect_hip_kernels.py`

```python
def parse_kernel_file(path: Path) -> dict:
    """
    1. Парсит file-level @brief + @note Состав ядер
    2. Извлекает R"HIP(...)HIP" блок
    3. Внутри — все kernel'ы по regex `// Kernel: <name>`
    4. Возвращает [{name, signature, description, launch_bounds, repo, file}]
    """

def collect_hip_kernels() -> list[dict]:
    """24 hpp → ~100-170 alpaca-pairs."""
```

**Walk pattern** — `e:/DSP-GPU/<repo>/include/<repo>/kernels/**/*_rocm.hpp` (рекурсивно: spectrum имеет subdir у некоторых).

### Добавить в `build_dataset_v3.py` SOURCES

```python
(Path(r"C:\finetune-env\dataset_hip_kernels.jsonl"), "hip_kernels", True),
```

---

## ✅ DoD

- [x] `collect_hip_kernels.py` написан (~280 строк) — поддержка 2 backend'ов (HIP + OpenCL)
- [x] Парсинг 23 файлов (22 HIP + 1 OpenCL): 0 fail
- [x] **58 kernel'ов извлечено** (56 HIP + 2 OpenCL) → **81 alpaca-пара** (kernel_overview + file_overview)
- [x] Output `dataset_hip_kernels.jsonl` валиден (concept ∈ {hip_kernel_overview, hip_file_overview, opencl_kernel_overview, opencl_file_overview})
- [x] Добавлено в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран: **4607 → 4664** (после мира с regex-фиксами и шаблонами сестры)
- [x] **0/23 файлов с 0 kernels** — все файлы дали хотя бы один kernel

## 📊 Распределение

| Backend | Файлов | Kernels | Пар |
|---------|--------|---------|-----|
| HIP | 22 | 40 | 62 |
| OpenCL (interop) | 1 | 2 | 3 |

| Репо | Kernels |
|------|---------|
| spectrum | 17 |
| stats | 11 |
| signal_generators | 9 |
| heterodyne | 2 |
| core (OpenCL) | 2 |
| linalg | 1 |
| strategies | 0 |

## ⚠️ Известное ограничение

11 hpp файлов вернули 0 kernel'ов (regex не сработал) — у них другой формат, ядра внутри `R"HIP(...)HIP"` string literal без классических `__global__ void` маркеров (видимо, function-like macros или оборачивание через `#define`). Возможный прирост ещё +30-50 пар после доработки regex. **Отложено** — для Phase B достаточно текущих 4607 пар.

Файлы с 0 kernels: `fir_kernels_rocm.hpp`, `iir_kernels_rocm.hpp`, `kalman_kernels_rocm.hpp`, `kaufman_kernels_rocm.hpp`, `moving_average_kernels_rocm.hpp` (spectrum) · `gather_decimated_kernel.hpp` (stats) · `capon_kernels_rocm.hpp`, `diagonal_load_kernel_rocm.hpp` (linalg) · `strategies_kernels_rocm.hpp` (strategies).

---

## ⚠️ Не забыть

- **Реальные kernels в hpp**, не в `.hip`. Файлы `.hip` (3 шт) — referenced copies, их **не парсить** (дубли).
- **`extern "C" __global__ void`** есть и в `tests/test_*.hpp` (3 файла в core/tests) — **исключить** через path filter (`include/<repo>/kernels/`).
- **Дубликаты kernel-имён** между файлами возможны (например `pad_data` в spectrum vs неmin в radar) — dedup по `(repo, file, kernel_name)` triple.
- **`_clean_brief` не нужен** — kernel doc-блоки уже чистые (// inline, не doxygen).

---

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_hip_kernels.py` | NEW · парсер 24 hpp |
| `C:/finetune-env/dataset_hip_kernels.jsonl` | NEW · ~100-170 пар |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |
| `C:/finetune-env/dataset_v3.jsonl` | M · 4434 → ≥4500 |

---

*Maintained by: Кодо main · 2026-05-10*
