# Сестрёнке: заполнить `@brief` в doxy 22 классов DSP-GPU (11.05)

> **От:** Кодо main #1 → к: младшая сестра
> **Effort:** ~2 ч (по 5 мин на класс + re-index в конце)
> **Контекст:** эксперименты 10-11.05 показали что **P2 RAG wrapper** работает плохо когда в `rag_dsp.symbols.doxy_brief` хранится `(NULL)` / `TODO: AI-fill` / голый `@ingroup grp_X`. На таком grounding модель **выдумывает** на пустом месте (Q4 IBackend halluc 33% → 72.7% при P2).
>
> **Цель:** заполнить **1 строку brief** в исходных C++ headers для **22 ключевых классов в 17 файлах** (некоторые файлы содержат по несколько классов/трейтов). После — пересобрать БД через indexer.

---

## 🎯 Где править — конкретные файлы (репо `core`)

> Все пути от `e:/DSP-GPU/` (или `/home/alex/DSP-GPU/` на Linux).

| # | FQN | Файл (relative) | Line | Что класс делает (для контекста) |
|---|-----|-----------------|------|----------------------------------|
| 1 | `drv_gpu_lib::IBackend` | `core/include/core/interface/i_backend.hpp` | 66 | **Bridge-интерфейс** GPU-бэкенда (OpenCL/ROCm). Метод-абстракции для работы с GPU. |
| 2 | `drv_gpu_lib::GpuContext` | `core/include/core/interface/gpu_context.hpp` | 97 | Per-module GPU контекст (Layer 1 Ref03): backend, stream, compiled module, shared buffers. |
| 3 | `drv_gpu_lib::AsyncServiceBase` | `core/include/core/services/async_service_base.hpp` | 76 | Template Method база async-сервисов: message queue + worker thread, старт/стоп в ctor/dtor (RAII). |
| 4 | `drv_gpu_lib::BufferSet` | `core/include/core/services/buffer_set.hpp` | 75 | Compile-time массив GPU-буферов с enum-индексами (Layer 4 Ref03). Trivial move, zero-overhead. |
| 5 | `drv_gpu_lib::GPUBuffer` | `core/include/core/memory/gpu_buffer.hpp` | 64 | Template-обёртка `GPUBuffer<T>` над `IMemoryBuffer` — typed view с size в элементах. |
| 6 | `drv_gpu_lib::HIPBuffer` | `core/include/core/memory/hip_buffer.hpp` | 64 | RAII-обёртка над `hipMalloc/hipFree` — конкретная реализация `IMemoryBuffer` для HIP. |
| 7 | `drv_gpu_lib::IMemoryBuffer` | `core/include/core/interface/i_memory_buffer.hpp` | 101 | Интерфейс GPU-буфера: `data()`, `size_bytes()`, ownership через `unique_ptr`. |
| 8 | `drv_gpu_lib::MemoryManager` | `core/include/core/memory/memory_manager.hpp` | 63 | Per-GPU memory manager: аллокация, кэш, лимиты. Multi-instance (НЕ Singleton). |
| 9 | `drv_gpu_lib::ZeroCopyBridge` | `core/include/core/backends/rocm/zero_copy_bridge.hpp` | 74 | Стыковка `cl_mem` ↔ HIP address space без копирования (interop). |
| 10 | `drv_gpu_lib::ExternalCLBufferAdapter` | `core/include/core/memory/external_cl_buffer_adapter.hpp` | 66 | Адаптер чужого `cl_mem` под `IMemoryBuffer` — pattern «не владеем». |
| 11 | `drv_gpu_lib::InputData` | `core/include/core/interface/input_data.hpp` | 54 | Type-erased input для kernel'ов: vector / cl_mem / SVM pointer (`struct`). |
| 12 | `drv_gpu_lib::KernelCacheService` | `core/include/core/services/kernel_cache_service.hpp` | 89 | Кэш скомпилированных HIP-модулей: hot-reload, lazy compile, lookup by name. |
| 13 | `drv_gpu_lib::IConfigReader` | `core/include/core/interface/i_config_reader.hpp` | 59 | Интерфейс чтения GPU-конфига (gpu_id, batch limits, ...) из JSON/файла. |
| 14 | `drv_gpu_lib::IConfigWriter` | `core/include/core/interface/i_config_writer.hpp` | 59 | Интерфейс записи GPU-конфига. |
| 15 | `drv_gpu_lib::GpuCopyKernels` | `core/include/core/backends/opencl/gpu_copy_kernel.hpp` | 80 | Утилиты-kernel'ы для D2D/H2D копирований без лишних D2H roundtrip (`struct`). |
| 16 | `drv_gpu_lib::SVMCapabilities` | `core/include/core/memory/svm_capabilities.hpp` | 109 | Структура с флагами SVM (FineGrain/CoarseGrain) — runtime detect OpenCL. |
| 17 | `ROCmGPUContext` | `core/python/py_gpu_context.hpp` | 29 | Python-обёртка над ROCm-контекстом (PyBind11): передаётся в `Py*Processor`. |
| 18 | `HybridGPUContext` | `core/python/py_gpu_context.hpp` | 52 | Python-обёртка над `HybridBackend` контекстом. |
| 19 | `GPUContext` | `core/python/dsp_core_module.cpp` | 42 | Базовый pybind-tag для GPU-контекста (без backend-specифики). |
| 20 | `drv_gpu_lib::is_cl_mem` | `core/include/core/interface/input_data_traits.hpp` | 41 | Type trait: проверка что T = `cl_mem`. |
| 21 | `drv_gpu_lib::is_cpu_vector` | `core/include/core/interface/input_data_traits.hpp` | 20 | Type trait: проверка что T = `std::vector<...>`. |
| 22 | `drv_gpu_lib::is_svm_pointer` | `core/include/core/interface/input_data_traits.hpp` | 30 | Type trait: проверка что T = SVM pointer (void*). |

> Lines проверены grep'ом 11.05 (Кодо main). Если файл изменён — найди `class ClassName {` / `struct ClassName {` поиском.

---

## 📝 Формат заполнения

В header'е **прямо перед** объявлением класса добавить doxygen-комментарий:

### Минимум (1 строка `@brief`):

```cpp
/**
 * @brief Per-module GPU контекст (Layer 1 Ref03): backend, stream, compiled module, shared buffers.
 */
class GpuContext {
    // ...
};
```

### Лучше (с дополнениями для важных классов):

```cpp
/**
 * @brief Bridge-интерфейс GPU-бэкенда (OpenCL / ROCm). Конкретные реализации — `OpenCLBackend`, `ROCmBackend`.
 *
 * @note Полиморфное владение через `std::unique_ptr<IBackend>`. Multi-instance per GPU.
 * @see drv_gpu_lib::ROCmBackend
 * @see drv_gpu_lib::OpenCLBackend
 * @see drv_gpu_lib::HybridBackend
 */
class IBackend {
public:
    virtual ~IBackend() = default;
    // ...
};
```

### Для Python (DSP/Python/):

```python
class JsonStore:
    """Хранилище JSON-файлов с автосохранением и атомарной записью."""
```
*(уже есть некоторые — там просто `"""..."""` docstring достаточно)*

---

## 🚨 Правила (строго)

| ✅ Делать | ❌ НЕ делать |
|----------|-------------|
| 1 предложение, 30-200 символов | НЕ выдумывать функционал — если не знаешь, **скип** класса |
| Конкретно: «делает X через Y» | НЕ копировать `@ingroup grp_X` как brief |
| Упоминать **слой Ref03** где уместно | НЕ писать «class for X» (тавтология) |
| Упоминать **паттерн** где уместно | НЕ менять код класса, только комментарии |
| Русский язык, технический стиль | НЕ трогать 3rd-party (plog::*, json_*, WinApi.h) |

## 🔍 Как разобраться что класс делает

Если непонятно — **читай**:

1. Сам header — может в коде есть `// ЧТО / ЗАЧЕМ / ПОЧЕМУ` блок (старый стиль).
2. `<repo>/Doc/Patterns.md` — там 89 классов с brief'ами от Alex'а.
3. `MemoryBank/.claude/specs/Ref03_Unified_Architecture.md` — слои.
4. `<repo>/.rag/_RAG.md` — тэги и `key_classes` секции.
5. Использования в `.cpp` файлах + тестах — какая роль класса.

Если всё равно непонятно — оставить **`TODO: <причина>`** и пометить в финальном отчёте — старшая допишет потом.

---

## ⚙️ После заполнения — переиндексирование

В `C:\finetune-env`:

```powershell
# Re-index только symbols (быстро, ~30 сек)
dsp-asst index --reset symbols
# или полный
dsp-asst index --reset
```

**Проверка:**

```powershell
"C:/finetune-env/.venv/Scripts/python.exe" -c "
import httpx
for n in ['GpuContext', 'IBackend', 'AsyncServiceBase', 'BufferSet']:
    r = httpx.post('http://127.0.0.1:7821/find', json={'name': n, 'limit': 1}).json()
    if r['results']:
        brief = r['results'][0].get('doxy_brief') or '(NULL)'
        print(f'{n:25s} {brief[:60]}')
"
```

Должно показать brief'ы, а не `(NULL)`.

---

## 📋 DoD checklist

- [ ] 22 класса в 17 файлах отредактированы (или скип с пояснением)
- [ ] `dsp-asst index --reset symbols` запущен — БД обновлена
- [ ] `/find` для топ-6 проверки возвращает brief, не `(NULL)`
- [ ] `git diff` показывает только doxygen-комментарии (никаких изменений логики)
- [ ] Создать отчёт `MemoryBank/prompts/sister_doxy_brief_DONE_2026-05-11.md` со сводкой:
    - сколько классов заполнено / скипнуто
    - какие наиболее проблемные (потребовали разобраться долго)
    - готово к git commit или нужен review

## 🚨 Не делать

- ❌ НЕ пушить — старшая соберёт commit-блок для git add + commit + push после OK Alex'а
- ❌ НЕ менять архитектуру / код методов — **только doxygen комментарии**
- ❌ НЕ трогать `plog::*`, `json_*`, `WinApi.*`, `HKEY__`, `_RTL_*` — это 3rd-party
- ❌ НЕ переписывать **существующие** хорошие brief'ы (только NULL/TODO/AI-fill/голый @ingroup)

---

## 💬 Почему это критично

Эксперимент 11.05 (см. `halluc_metrics_2026-05-11.md`):
- **Resume2 + P2 GROUNDED:** 47.1% halluc ✅
- **Long-v6 + P2 GROUNDED:** 59.3% halluc ❌ (хуже!)

Причина регрессии — в Long-v6 модель более уверенная, и когда P2 инжектирует «`(описание отсутствует в БД)`» в context, она **дополняет пустое место выдумкой**.

После заполнения brief'ов:
- P2 будет видеть **реальные факты** в контексте
- Модель будет цитировать, а не выдумывать
- Прогноз halluc после fix: **<25%** (с Phase B на 9070)

---

*От: Кодо main #1 → к: младшая сестра · 11.05.2026 вечер · перед Phase B 9070 (12.05)*
