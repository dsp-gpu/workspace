# TASK: ScriptGenerator DSL on ROCm (perspective)

**Создано**: 2026-04-30
**Статус**: 📌 perspective (не запланировано)
**Контекст**: Phase A2 миграция Python тестов (см. [migration_plan_2026-04-29.md](../specs/python/migration_plan_2026-04-29.md))
**Триггер реактивации**: появится реальный заказчик/use-case, требующий runtime-генерации DSP сигналов из текстового скрипта без пересборки C++

---

## 🎯 Зачем

В legacy GPUWorkLib был `ScriptGenerator` (`PyScriptGenerator` в [gpu_worklib_bindings.cpp:507+](file://e:/C%2B%2B/GPUWorkLib/python/gpu_worklib_bindings.cpp)) — он принимал текстовый DSL и **компилировал его в OpenCL kernel в runtime**. Использовался в legacy-тестах `test_script_generator` и `test_script_fft_pipeline` (всего ~360 строк demo-кода).

Преимущества:
- Гибкость: математическая формула в текстовом виде → исполняется на GPU без пересборки C++.
- Применение: исследовательские прогоны, квази-DSL для DSP-инженеров без C++.

В DSP-GPU (ROCm-only) **аналога нет** — при миграции тесты 8, 9 из `t_gpuworklib.py` (теперь `t_signal_to_spectrum.py`) удалены, файл `t_signal_to_spectrum.py` НЕ покрывает эту функциональность.

---

## 🛠 Что нужно сделать

Концептуально — runtime HIP-компилятор для DSP формул. Варианты подхода:

### Вариант A: hipRTC (рекомендуется)

Использовать **hipRTC** (`<hip/hiprtc.h>`) — runtime compilation для HIP. Поддерживается ROCm 7.2+.

```cpp
hiprtcProgram prog;
hiprtcCreateProgram(&prog, kernel_text, "user.cu", 0, nullptr, nullptr);
hiprtcCompileProgram(prog, 1, &arch_flag);
// получить bitcode → hipModuleLoadData → hipModuleGetFunction
```

Шаги:
1. Парсер DSL: `[Params] / [Defs] / [Signal]` → IR.
2. Кодогенерация: IR → HIP kernel source (как в `gpu_worklib_bindings.cpp:507+`).
3. hipRTC compile → module → kernel function.
4. Кеш скомпилированных kernel'ов (как `PyFormScriptGenerator` в legacy).
5. Pybind11 binding `dsp_script_dsl.ScriptGeneratorROCm` или подмодуль в `dsp_signal_generators`.

### Вариант B: Pre-compile via codegen + CMake

DSL-файлы при сборке преобразуются в HIP source через Python-скрипт, компилируются hipcc как обычные kernels. Не runtime, но без надобности hipRTC.

### Вариант C: Embedded LLVM (overkill)

Прямой emit LLVM IR для AMDGPU target. Слишком сложно для DSP use-case.

---

## 📦 Зависимости

- ROCm 7.2+ с hipRTC (вариант A) или hipcc (B)
- Парсер DSL — можно взять из legacy `e:/C++/GPUWorkLib/modules/signal_generators/src/script_generator_rocm.cpp` (там есть готовая логика)
- Pybind11 binding (по образцу `dsp_signal_generators`)

---

## 🔗 Связанные документы

- Legacy bindings: `e:/C++/GPUWorkLib/python/gpu_worklib_bindings.cpp:500-555` (`PyScriptGenerator`)
- Legacy headers: `e:/C++/GPUWorkLib/modules/signal_generators/include/generators/script_generator{,_rocm}.hpp`
- Legacy impl: `e:/C++/GPUWorkLib/modules/signal_generators/src/script_generator_rocm.cpp`
- Legacy tests: `e:/C++/GPUWorkLib/Python_test/integration/test_gpuworklib.py:514+` (test_script_generator, test_script_fft_pipeline)
- DSP-GPU миграция: [migration_plan_2026-04-29.md](../specs/python/migration_plan_2026-04-29.md) §«Реальные проблемы миграции» (тесты 8, 9 удалены)

---

## ⏱ Оценка усилий

- Вариант A (hipRTC): ~5-10 дней (парсер + codegen + cache + binding + тесты)
- Вариант B (CMake): ~2-3 дня (проще, но не runtime)
- Вариант C (LLVM): ~2-3 недели (overkill)

---

## 🚦 Когда брать в работу

- ✅ Когда появится исследовательский use-case требующий runtime DSL
- ✅ Когда DSP-инженеры захотят писать формулы без C++ (PyPanel-стиль интеграция)
- ❌ НЕ брать «для полноты миграции» — без use-case это технический долг ради долга
