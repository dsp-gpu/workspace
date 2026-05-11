# DONE: `sister_doxy_brief_fill_2026-05-11.md` — выполнено старшей (Кодо main)

> **Дата:** 2026-05-11 вечер
> **Исполнитель:** Кодо main #1 (старшая, без сестры — она была занята)
> **Промт-источник:** `MemoryBank/prompts/sister_doxy_brief_fill_2026-05-11.md`
> **Контекст:** перед Phase B QLoRA на 9070 (12.05) — фикс P2 RAG grounding через `doxy_brief` в БД.

---

## ✅ Итог

| Метрика | Значение |
|---------|----------|
| Целевых классов в промте | 22 (в 17 файлах) |
| **Уже имели качественный brief** (СКИП по правилу) | **15** |
| **Реально требовали правки** | **7** |
| Файлов отредактировано | **5** |
| Reindex (`dsp-asst index build --root core --lang cpp --force`) | ✅ 181 файл, 1927 символов |
| Brief в БД после reindex | **4/7 ✅** (3 трейта блокированы багом chunker_cpp.py — см. §Findings) |

---

## 📊 Разбор по 22 классам

### 🔵 СКИП — brief уже был хороший (15 классов)

| # | FQN | Файл | Текущий brief (в БД) |
|---|-----|------|-----------------------|
| 1 | `IBackend` | `core/include/core/interface/i_backend.hpp:66` | «Абстрактный интерфейс GPU-runtime (Bridge поверх ROCm/OpenCL/Hybrid).» |
| 2 | `GpuContext` | `core/include/core/interface/gpu_context.hpp:97` | «Per-module shared state для GPU-операций (Layer 1 Ref03).» |
| 3 | `AsyncServiceBase` | `core/include/core/services/async_service_base.hpp:76` | «Template Method база async-сервисов…» ⚠️ template — в БД null |
| 4 | `BufferSet` | `core/include/core/services/buffer_set.hpp:75` | «Compile-time массив N GPU-буферов…» ⚠️ template — в БД null |
| 5 | `GPUBuffer` | `core/include/core/memory/gpu_buffer.hpp:64` | «Backend-агностичный RAII-буфер…» ⚠️ template — в БД null |
| 6 | `HIPBuffer` | `core/include/core/memory/hip_buffer.hpp:64` | «Non-owning обёртка над hipDeviceptr_t…» ⚠️ template — в БД null |
| 7 | `IMemoryBuffer` | `core/include/core/interface/i_memory_buffer.hpp:101` | «Pure-virtual интерфейс GPU-буфера (Strategy)…» |
| 8 | `MemoryManager` | `core/include/core/memory/memory_manager.hpp:63` | «Per-backend фабрика GPUBuffer<T> + учёт аллокаций…» |
| 9 | `ZeroCopyBridge` | `core/include/core/backends/rocm/zero_copy_bridge.hpp:74` | «RAII-мост cl_mem → HIP address space…» |
| 10 | `ExternalCLBufferAdapter` | `core/include/core/memory/external_cl_buffer_adapter.hpp:66` | «Типобезопасный (template) RAII-адаптер…» ⚠️ template — в БД null |
| 11 | `InputData` | `core/include/core/interface/input_data.hpp:54` | «Универсальный template-контейнер…» ⚠️ template — в БД null |
| 12 | `KernelCacheService` | `core/include/core/services/kernel_cache_service.hpp:89` | «Key-based disk-cache compiled HIP HSACO модулей…» |
| 13 | `IConfigReader` | `core/include/core/interface/i_config_reader.hpp:59` | «Pure-virtual интерфейс чтения конфигурации (Composite + ISP).» |
| 14 | `IConfigWriter` | `core/include/core/interface/i_config_writer.hpp:59` | «Pure-virtual интерфейс записи конфигурации (Composite + ISP).» |
| 15 | `SVMCapabilities` | `core/include/core/memory/svm_capabilities.hpp:109` | «Хранит информацию о поддержке SVM на устройстве.» |

### 🟢 ИСПРАВЛЕНО — добавлен @brief (7 классов в 5 файлах)

| # | FQN | Файл | Изменение | Brief в БД |
|---|-----|------|-----------|-----------|
| 16 | `GpuCopyKernels` (struct) | `core/include/core/backends/opencl/gpu_copy_kernel.hpp:80→88` | + 9-строчный doxygen-блок перед struct | ✅ |
| 17 | `ROCmGPUContext` | `core/python/py_gpu_context.hpp:29→39` | + 10-строчный doxygen-блок | ✅ |
| 18 | `HybridGPUContext` | `core/python/py_gpu_context.hpp:52→73` | + 13-строчный doxygen-блок | ✅ |
| 19 | `GPUContext` | `core/python/dsp_core_module.cpp:42→50` | старый `//`-коммент → полноценный doxygen-блок | ✅ |
| 20 | `is_cpu_vector` (struct, template) | `core/include/core/interface/input_data_traits.hpp:20→26` | `///` → полноценный `/** @brief */` блок | ⚠️ null (баг) |
| 21 | `is_svm_pointer` (struct, template) | `core/include/core/interface/input_data_traits.hpp:30→39` | `///` → полноценный `/** @brief */` блок | ⚠️ null (баг) |
| 22 | `is_cl_mem` (struct, template) | `core/include/core/interface/input_data_traits.hpp:41→52` | `///` → полноценный `/** @brief */` блок | ⚠️ null (баг) |

---

## 🐛 Major Finding: баг `chunker_cpp.py` — template-классы теряют doxygen

При проверке `doxy_brief` через MCP `dsp_show_symbol` обнаружено:

**Все 6 template-классов с качественными brief'ами в исходниках имеют `doxy_brief = null` в БД:**
- `AsyncServiceBase<TMessage>` (line 75-76)
- `BufferSet<N>` (line 74-75)
- `GPUBuffer<T>` (line 63-64)
- `HIPBuffer<T>` (line 63-64)
- `ExternalCLBufferAdapter<T>` (line 65-66)
- `InputData<T>` (line 53-54)
- + 3 трейта из input_data_traits.hpp (`is_cpu_vector` / `is_svm_pointer` / `is_cl_mem`)

**Корневая причина** — `dsp_assistant/indexer/chunker_cpp.py:65-76` (`_get_doxy_above`):
```python
def _get_doxy_above(node: Node, source: bytes) -> str | None:
    prev = node.prev_sibling
    if prev is None or prev.type != "comment":
        return None  # ← возвращает None для template-классов
    ...
```

Для `template<typename T> class Foo { ... }` tree-sitter-cpp выдаёт:
```
template_declaration
├── (parameters)
└── class_specifier   ← node.prev_sibling = template params, НЕ comment
```

`_walk_class` получает `node = class_specifier`, и `prev_sibling` указывает на параметры template'а, а не на doxygen-комментарий **над** `template<...>`.

**Impact на Phase B grounding:**
- 9 классов (включая ключевые `GPUBuffer`, `BufferSet`, `InputData`) **не дают brief в P2 RAG context**.
- Это **скорее всего основная причина** парадокса Long-v6 + P2 GROUNDED 59.3% halluc (см. `halluc_metrics_2026-05-11.md`): модель видит `"(описание отсутствует)"` для центральных шаблонных классов и выдумывает.

**Решение** (separate task — не входит в этот промт):
```python
def _get_doxy_above(node, source):
    prev = node.prev_sibling
    # NEW: для класса внутри template_declaration искать комментарий выше template
    if prev is None and node.parent and node.parent.type == "template_declaration":
        prev = node.parent.prev_sibling
    if prev is None or prev.type != "comment":
        return None
    ...
```

→ создать `TASK_chunker_cpp_template_doxy_fix_2026-05-11.md` с приоритетом **P0 перед Phase B 12.05**.

---

## 🐛 Secondary Finding: stale records после reindex

`dsp-asst index build --root core --lang cpp --force` создаёт **новые** записи с `repo=include` или `repo=python` (по path-чистоте), но **старые записи** с `repo=core` НЕ удаляются.

Результат: после reindex в `rag_dsp.symbols` для каждого класса по 2 записи (старая stale + новая).

**Impact:** `dsp_find` иногда возвращает stale (с старым line_start и null brief), хотя новая запись с правильным brief тоже есть.

**Решение:**
- либо `index build` должен DELETE WHERE path LIKE '%/core/%' OR repo='core'
- либо явная команда `dsp-asst index prune-stale`

---

## 📁 Изменённые файлы

```
core/include/core/backends/opencl/gpu_copy_kernel.hpp       (+8 строк)
core/python/py_gpu_context.hpp                              (+22 строки)
core/python/dsp_core_module.cpp                             (+8 строк, заменён старый коммент)
core/include/core/interface/input_data_traits.hpp           (+22 строки, заменены 3 короткие ///)
```

Все изменения — **только doxygen-комментарии**, ноль изменений в логике класса/методов.

---

## 🧪 Проверка результата (через MCP `dsp_find` + `dsp_show_symbol`)

| Класс | symbol_id | line_start | doxy_brief в БД |
|-------|----------:|-----------:|-----------------|
| GpuCopyKernels (новая) | 17562 | 88 | ✅ полный текст в БД |
| ROCmGPUContext (новая) | 16782 | 39 | ✅ полный текст в БД |
| HybridGPUContext (новая) | 16783 | 73 | ✅ полный текст в БД |
| GPUContext (новая, dsp_core_module) | 16776 | 50 | ✅ полный текст в БД |
| is_cpu_vector (новая) | 17390 | 26 | ❌ null (баг template) |
| is_svm_pointer (новая) | — | ~39 | ❌ null (баг template) |
| is_cl_mem (новая) | — | ~52 | ❌ null (баг template) |

---

## 🚀 Следующий шаг (Alex решает)

1. **Готово к commit** для 4 файлов с правками — старшая подготовит сообщение после OK.
2. **P0 перед Phase B 12.05:** пофиксить `chunker_cpp.py:65-76` чтобы template-классы тоже подхватывали doxygen — иначе 9 классов остаются без grounding и Long-v6 + P2 будет давать 59% halluc.
3. **P1 после Phase B:** prune-stale в indexer (мусор не критичен, но грязнит `find` UX).

---

## 📝 Commit-блок (заготовка, ждёт OK Alex'а)

```
docs(core): add doxygen @brief to 7 classes for P2 RAG grounding

- GpuCopyKernels (struct in opencl/gpu_copy_kernel.hpp)
- ROCmGPUContext / HybridGPUContext (python/py_gpu_context.hpp)
- GPUContext (python/dsp_core_module.cpp) — заменён // коммент на doxygen
- is_cpu_vector / is_svm_pointer / is_cl_mem (input_data_traits.hpp) —
  расширены до полноценных @brief блоков

Цель: после reindex `rag_dsp.symbols.doxy_brief` заполнен реальными
описаниями для ключевых классов. Это режет halluc-rate в P2 RAG
grounding (см. halluc_metrics_2026-05-11.md).

Note: template-классы (3 трейта + 6 уже задокументированных шаблонов)
индексируются с doxy_brief=null из-за бага в chunker_cpp.py:65-76 —
отдельный таск перед Phase B 12.05.

Co-Authored-By: Кодо (Claude Sonnet 4.6) <noreply@anthropic.com>
```

---

*Выполнено: Кодо main #1 · 2026-05-11 вечер · перед Phase B 9070 12.05*
