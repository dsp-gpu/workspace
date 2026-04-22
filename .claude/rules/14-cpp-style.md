---
paths:
  - "**/*.cpp"
  - "**/*.hpp"
  - "**/*.h"
  - "**/*.hip"
---

# 14 — C++ Style & Design (ООП / SOLID / GRASP / GoF)

> Стиль программирования DSP-GPU. Применяется ко всем C++ файлам.

## 🎯 Базовые принципы

- **ООП** — инкапсуляция, наследование, полиморфизм.
- **SOLID**:
  - **S**RP — один класс, одна ответственность (Op делает одну операцию, Facade — только координирует).
  - **O**CP — новые реализации через Strategy / Factory, не через правку существующих.
  - **L**SP — подклассы не нарушают контракт (`IGpuOperation::IsReady` всегда возвращает bool).
  - **I**SP — интерфейсы узкие (`IPipelineStep` отдельно от `IGpuOperation`).
  - **D**IP — зависеть от абстракций: `IGpuOperation*` а не `MeanReductionOp*`.
- **GRASP**:
  - **Information Expert** — данные и поведение в одном классе.
  - **Creator** — кто владеет объектом, тот его создаёт.
  - **Low Coupling / High Cohesion** — модули независимы, внутри — связные.
  - **Controller** — Facade координирует, не делает сам.
- **GoF-паттерны (применяемые)**:
  - **Facade** — `StatisticsProcessor`, `FFTProcessor`, `HeterodyneDechirp`.
  - **Strategy** — `MedianStrategy`, `PipelineBuilder`.
  - **Singleton** (осторожно!) — `ConsoleOutput`, `Logger`, `ProfilingFacade`.
  - **Factory Method** — `DrvGPU::Create*`, `Logger::SetInstance`.
  - **Template Method** — `AsyncServiceBase<T>` (ProcessMessage — виртуал).
  - **RAII** — `ScopedProfileTimer`, `ScopedHipEvent`.

## 🚫 Не плодить новые сущности

Перед созданием нового класса:
1. Ищи существующий (Grep по namespace / похожему имени).
2. Существующий почти подходит → расширь / подклассируй (OCP), не копируй.
3. Новая сущность — только если **реально** нужна (SRP нарушается без неё).

## 📁 Файловая организация

- **Один класс — один файл** (`class.hpp` + `class.cpp`).
- Интерфейсы объединяются по смыслу (напр. `i_gpu_operation.hpp` содержит `IGpuOperation` + `IPipelineStep`).
- HIP kernels — в отдельные `.hip` в `{repo}/kernels/rocm/` (не inline в `.cpp`).

## 🔤 Naming & Style

- **Google C++ Style Guide** + **2-space** indent.
- **CamelCase** классы: `FFTProcessor`, `MedianStrategy`.
- **snake_case** методы / переменные: `process_fft()`, `sample_rate`.
- **kCamelCase** константы: `kMaxBufferSize`, `kDefaultSampleRate`.
- **`_` суффикс** приватные поля: `buffers_`, `enabled_`.
- **Namespace**: `dsp::{repo}` (`dsp::spectrum`, `dsp::stats`, ...).
- **Legacy**: `drv_gpu_lib::*` остаётся только в `core/` для инфраструктуры.

## 🧱 Типовые контракты

```cpp
// Layer 2 — интерфейс GPU-операции
class IGpuOperation {
public:
    virtual ~IGpuOperation() = default;
    virtual std::string Name() const = 0;
    virtual void Initialize(GpuContext& ctx) = 0;
    virtual bool IsReady() const = 0;
    virtual void Release() = 0;
};

// Layer 4 — типизированный буферный набор
template <size_t N, typename IdxEnum>
class BufferSet {
    // enum-индексы, trivial move, zero overhead
};

// Layer 6 — Facade
class StatisticsProcessor {
public:
    // API НЕ меняется → Python bindings не ломаются
    Result ProcessMean(const InputData& data);
private:
    std::unique_ptr<IGpuOperation> mean_op_;
    // ...
};
```

## ⚠️ Запреты в коде

- `std::cout` / `std::cerr` / `printf` — только `ConsoleOutput` (см. `07`).
- Прямой `plog::init` / `PLOG_*` — только через `Logger::GetInstance` (см. `08`).
- Raw `void*` буферы — только `BufferSet<N>` с enum-индексами.
- Прямой `new` / `delete` — только `std::unique_ptr` / `std::shared_ptr` / RAII.
- `goto`, макросы для логики (кроме `DRVGPU_LOG_*`), дикие `using namespace` в headers.
