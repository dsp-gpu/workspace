# TASK: Удалить OPENCL из BackendType enum и весь связанный код

> **Статус**: pending · **Создан**: 2026-05-05 · **Источник**: Phase 0 audit RAG-агентов
> **Приоритет**: medium (не блокирует RAG-агентов, но мешает чистоте)

## Контекст

При аудите `error_values` в spectrum обнаружилось, что `BackendType` enum в `core` всё ещё содержит `OPENCL` — наследие ветки `nvidia` (Windows + clFFT). По правилу `09-rocm-only.md` проект DSP-GPU — **только ROCm**, ветвление давно не нужно.

**Файл-зацепка**: `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp:54`
```cpp
* @param backend_type ROCm (main-ветка) или OPENCL (legacy nvidia-ветка).
*   @test { values=[enum_all] }
```

## Что сделать

1. **`core`** — найти `enum class BackendType` (вероятно в `core/include/core/types/backend_type.hpp` или `core/interface/i_backend.hpp`):
   - Удалить значение `OPENCL`
   - Удалить значение `AUTO` если оно «выбирает между ROCm и OpenCL»
   - Оставить только `ROCM` (или сделать enum однозначным — если только одно значение, может вообще убрать enum)

2. **Поиск использований** во всех 9 репо: `grep -rn "BackendType::OPENCL\|BackendType::AUTO" .`
   - `spectrum/factory/spectrum_processor_factory.hpp/cpp` — точно есть, фабрика выбирает
   - возможно `signal_generators/factory/`, `linalg/factory/` — другие фабрики
   - все if/switch ветки на `OPENCL` → удалить полностью

3. **Doxygen + Doc/*.md** — убрать упоминания «OPENCL ветка», «nvidia ветка», «legacy».

4. **Тесты** — удалить test cases с `BackendType::OPENCL` если есть.

5. **Re-build на Windows** (Кодо) + **на Debian** (Alex) → убедиться что сборка зелёная.

## Связанное правило для doxytags-агента

После аудита Phase 0 RAG-агентов появилось **фундаментальное правило**:

> **Enum-параметры НЕ получают `error_values`.** Прогонка enum'а через невалидное значение `(EnumType)999` — некорректно: компилятор C++ запрещает это в обычном использовании, а unit-тест на UB не имеет смысла.

Это правило нужно записать в:
- `dsp_assistant/agent_doxytags/heuristics.py` — пропускать enum-параметры при предложении `error_values`
- `MemoryBank/specs/LLM_and_RAG/12_DoxyTags_Agent_Spec.md` — добавить в раздел эвристик
- `prompts/009_test_params_extract.md` — отразить в промпте

Аналогично:
- **Bool-параметры** — не получают `error_values` (компилятор не пустит мусор).
- **JSON-пути** — пока **не получают** `error_values` (Alex решит позже, нужны ли).

## Definition of Done

- [ ] `BackendType` содержит только `ROCM` (или enum упразднён)
- [ ] `grep -rn "OPENCL" e:/DSP-GPU/` — пусто (кроме исторических доков и interop комментариев)
- [ ] Сборка spectrum/core зелёная на Windows
- [ ] Тесты spectrum зелёные
- [ ] Правило «no error_values for enum/bool/json-path» добавлено в doxytags spec + heuristics

## Не делать в рамках этого таска

- НЕ трогать ветку `nvidia` в legacy GPUWorkLib — у неё своя жизнь.
- НЕ удалять упоминания OpenCL из interop-комментариев (см. `09-rocm-only.md`: «OpenCL только interop со сторонним кодом»).

---

*Создан Кодо на основе ответа Alex в `RAG_Phase0_error_values_audit_2026-05-05.md`*
