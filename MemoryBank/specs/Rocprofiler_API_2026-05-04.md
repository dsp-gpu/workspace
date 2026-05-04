# rocprofiler-sdk API диалект (ROCm 7.2.0, gfx1201) — Q7.0 spike notes

> **Дата**: 2026-05-04
> **Source**: `/opt/rocm/share/rocprofiler-sdk/samples/api_callback_tracing/`, `api_buffered_tracing/`
> **Headers**: `/opt/rocm/include/rocprofiler-sdk/rocprofiler.h`
> **Lib**: `/opt/rocm/lib/librocprofiler-sdk.so.1.1.0`
> **Goal**: зафиксировать API contract до начала Q7.A-E, чтобы не блуждать.

---

## 1. Решение: rocprofiler-sdk vs roctracer

**Вердикт**: используем **rocprofiler-sdk** (modern, ROCm 7+ official).

| Критерий | roctracer (legacy) | rocprofiler-sdk (modern) |
|----------|---------------------|--------------------------|
| Headers | `/opt/rocm/include/roctracer/*.h` ✅ | `/opt/rocm/include/rocprofiler-sdk/*.h` ✅ |
| Library | `libroctracer64.so.4.1` ✅ | `librocprofiler-sdk.so.1.1.0` ✅ |
| Status в ROCm 7+ | **DEPRECATED** | **OFFICIAL** |
| API style | C-style, callback-only | Context + Buffer/Callback Tracing |
| Counters | rocprofiler v1 (старый) | rocprofiler-sdk dispatch counters (Q7.F) |
| Future | будет удалён | поддерживается AMD |

**Минус rocprofiler-sdk**: API сложнее (см. ниже tool registration), требует `libdw-dev` для samples с frame-decoding (нам это **не нужно** в production).

---

## 2. Что нам нужно из API (минимальный комплект)

### 2.1 Tool registration (важно!)

rocprofiler-sdk использует **двухуровневую** инициализацию:

1. **Внешний preload** (samples паттерн) — `LD_PRELOAD=client.so` + `rocprofiler_configure(...)` экспортится из .so. Это для CLI-tooling типа `rocprofv3`.
2. **In-process** (наш кейс) — `rocprofiler_force_configure(rocprofiler_configure)` в начале программы. Подходит для интеграции в ProfilingFacade.

**Наш путь — in-process**: при включении Rocprofiler timing source мы вызываем `rocprofiler_force_configure()` один раз при создании `RocprofilerTimingSource`.

```cpp
// in RocprofilerTimingSource::Start()
extern "C" rocprofiler_tool_configure_result_t* rocprofiler_configure(
    uint32_t version, const char* runtime_version,
    uint32_t priority, rocprofiler_client_id_t* id);

void RocprofilerTimingSource::Start() {
    rocprofiler_force_configure(rocprofiler_configure);
}
```

### 2.2 Создание context + buffer

```cpp
rocprofiler_context_id_t  ctx{0};
rocprofiler_buffer_id_t   buf_id{0};

// 1. Context — изолированная "сессия" трассировки
rocprofiler_create_context(&ctx);

// 2. Buffer — куда пишутся activity records (GPU side)
rocprofiler_create_buffer(
    ctx,
    /*size=*/      4096 * sizeof(rocprofiler_buffer_tracing_kernel_dispatch_record_t),
    /*watermark=*/ 4096 / 2,
    ROCPROFILER_BUFFER_POLICY_LOSSLESS,  // не дропать при переполнении (vs DISCARD)
    /*callback=*/  &OnBufferRecords,      // зовётся из rocprofiler thread'а
    /*user_data=*/ this,
    &buf_id);

// 3. Подписаться на нужные record kinds
auto subscribe = [&](rocprofiler_buffer_tracing_kind_t kind) {
    rocprofiler_configure_buffer_tracing_service(
        ctx, kind, /*ops=*/nullptr, /*ops_count=*/0, buf_id);
};
subscribe(ROCPROFILER_BUFFER_TRACING_KERNEL_DISPATCH);   // GPU kernel start/end
subscribe(ROCPROFILER_BUFFER_TRACING_HIP_RUNTIME_API);   // host-side hipLaunchKernel
subscribe(ROCPROFILER_BUFFER_TRACING_MEMORY_COPY);       // hipMemcpy*

// 4. Старт
rocprofiler_start_context(ctx);
```

### 2.3 Buffer callback (где приходят данные)

```cpp
void OnBufferRecords(
    rocprofiler_context_id_t      context,
    rocprofiler_buffer_id_t       buffer_id,
    rocprofiler_record_header_t** headers,
    size_t                        num_headers,
    void*                         user_data,
    uint64_t                      drop_count)
{
    auto* self = static_cast<RocprofilerTimingSource*>(user_data);

    for (size_t i = 0; i < num_headers; ++i) {
        auto* header = headers[i];
        if (header->category != ROCPROFILER_BUFFER_CATEGORY_TRACING) continue;

        switch (header->kind) {
            case ROCPROFILER_BUFFER_TRACING_KERNEL_DISPATCH:
                self->HandleKernelDispatch(
                    static_cast<rocprofiler_buffer_tracing_kernel_dispatch_record_t*>(header->payload));
                break;
            case ROCPROFILER_BUFFER_TRACING_HIP_RUNTIME_API:
                self->HandleHipApi(
                    static_cast<rocprofiler_buffer_tracing_hip_api_record_t*>(header->payload));
                break;
            case ROCPROFILER_BUFFER_TRACING_MEMORY_COPY:
                self->HandleMemcpy(
                    static_cast<rocprofiler_buffer_tracing_memory_copy_record_t*>(header->payload));
                break;
        }
    }
}
```

### 2.4 Kernel dispatch record — наши 5 полей

```cpp
struct rocprofiler_buffer_tracing_kernel_dispatch_record_t {
    rocprofiler_buffer_tracing_kind_t kind;        // = KERNEL_DISPATCH
    rocprofiler_tracing_operation_t   operation;
    uint64_t                          thread_id;
    rocprofiler_correlation_id_t      correlation_id;  // internal + external
    uint64_t                          start_timestamp;  // ← start_ns (GPU clock!)
    uint64_t                          end_timestamp;    // ← end_ns   (GPU clock!)
    rocprofiler_dispatch_info_t       dispatch_info;
    // dispatch_info.kernel_id        — для kernel_name lookup
    // dispatch_info.agent_id         — GPU id
    // dispatch_info.queue_id         — stream id
    // dispatch_info.workgroup_size, grid_size, private_segment_size, group_segment_size
};
```

### 2.5 HIP API record — для queued/submit

```cpp
struct rocprofiler_buffer_tracing_hip_api_record_t {
    rocprofiler_buffer_tracing_kind_t kind;        // = HIP_RUNTIME_API
    rocprofiler_tracing_operation_t   operation;   // = HIP_LAUNCH_KERNEL и т.п.
    uint64_t                          thread_id;
    rocprofiler_correlation_id_t      correlation_id;  // ← связка с kernel_dispatch
    uint64_t                          start_timestamp;  // ← queued_ns (когда API вызван host'ом)
    uint64_t                          end_timestamp;    // ← submit_ns (когда API вернулся)
};
```

### 2.6 Korrelyaciya API ↔ Activity (ключевое!)

Связь — `correlation_id.internal` (uint64_t).

**Алгоритм** (наш A4):
```cpp
// Ловим HIP_RUNTIME_API:HIP_LAUNCH_KERNEL → запоминаем (queued, submit) по cid
// Ловим KERNEL_DISPATCH → берём cid, ищем pending entry → собираем 5-field record

class RocprofilerTimingSource {
    std::unordered_map<uint64_t, PartialRecord> pending_;
    std::mutex pending_mu_;
    std::vector<ProfilingRecord> drain_queue_;
    std::mutex drain_mu_;

    void HandleHipApi(const auto* rec) {
        if (rec->operation != HIP_LAUNCH_KERNEL_ID) return;
        std::lock_guard g(pending_mu_);
        pending_[rec->correlation_id.internal] =
            PartialRecord{ .queued_ns = rec->start_timestamp,
                           .submit_ns = rec->end_timestamp };
    }

    void HandleKernelDispatch(const auto* rec) {
        std::unique_lock g(pending_mu_);
        auto it = pending_.find(rec->correlation_id.internal);
        if (it == pending_.end()) return;  // activity без api — orphan, дропаем (A5 filter)
        PartialRecord pr = std::move(it->second);
        pending_.erase(it);
        g.unlock();

        ProfilingRecord pr2{};
        pr2.queued_ns      = pr.queued_ns;
        pr2.submit_ns      = pr.submit_ns;
        pr2.start_ns       = rec->start_timestamp;
        pr2.end_ns         = rec->end_timestamp;
        pr2.complete_ns    = rec->end_timestamp;  // в kernel-dispatch это и есть completion
        pr2.correlation_id = rec->correlation_id.internal;
        pr2.kind           = 0;  // kernel
        pr2.queue_id       = rec->dispatch_info.queue_id.handle;
        pr2.kernel_name    = LookupKernelName(rec->dispatch_info.kernel_id);
        // ... domain, op ...

        if (PassesFilter(pr2)) {
            std::lock_guard g2(drain_mu_);
            drain_queue_.push_back(std::move(pr2));
        }
    }
};
```

### 2.7 Drain — забор записей в worker

```cpp
std::vector<ProfilingRecord> RocprofilerTimingSource::Drain() {
    rocprofiler_flush_buffer(buf_id_);  // блокирует пока buffer не пуст
    std::lock_guard g(drain_mu_);
    auto out = std::move(drain_queue_);
    drain_queue_.clear();
    return out;
}
```

### 2.8 Stop + cleanup

```cpp
void RocprofilerTimingSource::Stop() {
    rocprofiler_stop_context(ctx_);
    rocprofiler_destroy_buffer(buf_id_);
    // context живёт до конца процесса — rocprofiler-sdk одноразовый
}
```

---

## 3. Filtering policy (A5 = α + blacklist)

### 3.1 Kind filter

Принимаем только:
- `ROCPROFILER_BUFFER_TRACING_KERNEL_DISPATCH` (с `kind=0` в нашей классификации)
- `ROCPROFILER_BUFFER_TRACING_MEMORY_COPY` (с `kind=1`)
- `ROCPROFILER_BUFFER_TRACING_HIP_RUNTIME_API` — только для корреляции, в ProfilingRecord не пушим как самостоятельную

Блокируем:
- HSA API (низкий уровень, нам не нужен)
- Markers (это для пользовательских меток, не сейчас)

### 3.2 Kernel name blacklist

Чужие либы профилируем как часть пайплайна верхнего уровня (через ScopedProfileTimer). Их низкоуровневые kernel'ы — шум:

```cpp
constexpr std::array<std::string_view, 4> kBlacklist = {
    "rocfft_",
    "rocblas_",
    "rocsolver_",
    "hipfft_"  // на всякий
};
```

Реализация: префикс-match (быстро, без regex).

### 3.3 На будущее (если шумит)

- `kernel_name` regex (Variant β из TASK)
- ROCTx markers `roctxRangePush("dsp_module")` (Variant γ)

Сейчас — α + blacklist хватит.

---

## 4. Performance overhead expectations (A7)

| Метрика | Ожидание | Quality gate |
|---------|----------|--------------|
| HIP API callback overhead | 200-500 ns | G8R: Record < 5 µs |
| Kernel dispatch record | амортизирован батчем | — |
| Buffer memory | 4096 records × ~200 B = ~1 MB | G9R: 100K records < 500 MB |
| Buffer flush latency | ~10 µs на flush | вызывается worker'ом редко |

**Quality gate G8 (HipEvent < 1 µs)** — остаётся для default mode.
**Quality gate G8R (Rocprofiler < 5 µs)** — для opt-in mode.

---

## 5. CMake — что нужно прописать

```cmake
# core/CMakeLists.txt
option(DSP_PROFILING_ROCTRACER "Enable rocprofiler-sdk-based 5-field GPU timing" OFF)

if(DSP_PROFILING_ROCTRACER)
    find_package(rocprofiler-sdk REQUIRED)
    target_compile_definitions(DspCore PRIVATE DSP_PROFILING_ROCTRACER=1)
    target_link_libraries(DspCore PRIVATE rocprofiler-sdk::rocprofiler-sdk)
    message(STATUS "[DspCore] rocprofiler-sdk timing source ENABLED")
endif()
```

**`rocprofiler-sdk-roctx`** не нужен (это для `roctxMark`/`roctxRange*` — пользовательские маркеры, мы их не используем).

---

## 6. Quirks / подводные камни

### 6.1 `rocprofiler_force_configure` — only once!

Если вызвать дважды (в одном процессе) — UB. Решение: гард-флаг + mutex в `Start()`.

### 6.2 Buffer callback зовётся **из другого thread'а**

rocprofiler внутренне держит worker. Поэтому `pending_` и `drain_queue_` обязательно под mutex'ами.

### 6.3 `start_timestamp`/`end_timestamp` — это **GPU clock в наносекундах**

Совместимо с нашими `start_ns/end_ns` — конверсия не нужна.

### 6.4 Drop count

При `ROCPROFILER_BUFFER_POLICY_LOSSLESS` — `drop_count` всегда 0 (rocprofiler блокирует если буфер полный, ждёт). При `DISCARD` — может быть > 0, тогда нужна метрика "сколько потеряли".

**Наш выбор**: LOSSLESS (потери для профайлера хуже чем небольшая блокировка).

### 6.5 HIP_LAUNCH_KERNEL operation ID

В headers есть enum `rocprofiler_hip_runtime_api_id_t::HIP_API_ID_hipLaunchKernel` (или похожий — точное имя проверить при Q7.B спайке).

### 6.6 Kernel name lookup

`dispatch_info.kernel_id` — это handle, не имя. Имя надо запросить отдельно:

```cpp
// при первой встрече kernel_id — резолвим
rocprofiler_query_kernel_name(kernel_id, &name_str, &name_len);
// кешируем в std::unordered_map<uint64_t, std::string>
```

Кеш в `RocprofilerTimingSource`.

### 6.7 libdw dependency для samples — НЕ для нашего кода

Samples требуют `libdw-dev` для symbol resolution. **Нам не нужно** — мы не делаем callstack decoding.

---

## 7. Вопросы для Q7.B (отложенные на спайк)

1. Точное имя `HIP_API_ID_hipLaunchKernel` в `rocprofiler_hip_runtime_api_id_t` (проверить header).
2. Нужен ли `rocprofiler_register_external_correlation_id` для нашего use case?
3. Как rocprofiler ведёт себя с multi-device (RX 9070 + другие)?
4. Можно ли `rocprofiler_create_context` создать второй контекст (для счётчиков в Q7.F)?

Все эти вопросы — на маленьком спайке Q7.B (`core/spike/rocprofiler_spike.cpp`), не блокируют Q7.A (рефактор).

---

## 8. Decision log

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-05-04 | Использовать rocprofiler-sdk, не roctracer | Roctracer DEPRECATED в ROCm 7+, sdk — official |
| 2026-05-04 | In-process tool registration через `rocprofiler_force_configure` | Нам не нужен LD_PRELOAD — мы embedded |
| 2026-05-04 | Buffer policy = LOSSLESS | Потери для профайлера хуже блокировки |
| 2026-05-04 | Kind filter = α (kernel/memcpy + HIP API для корреляции) | Простой, минимальный шум |
| 2026-05-04 | Blacklist = rocfft_/rocblas_/rocsolver_/hipfft_ | Чужие либы как часть пайплайна |

---

## 9. Ссылки

- `/opt/rocm/share/rocprofiler-sdk/samples/api_callback_tracing/client.cpp` — callback tracing
- `/opt/rocm/share/rocprofiler-sdk/samples/api_buffered_tracing/client.cpp` — buffered tracing
- `/opt/rocm/share/rocprofiler-sdk/samples/external_correlation_id_request/client.cpp` — корреляция
- `/opt/rocm/include/rocprofiler-sdk/rocprofiler.h` — главный header
- `/opt/rocm/include/rocprofiler-sdk/buffer_tracing.h` — структуры record'ов
- `/opt/rocm/include/rocprofiler-sdk/callback_tracing.h` — callback service
- AMD ROCm docs: https://rocm.docs.amd.com/projects/rocprofiler-sdk/

---

*Created: 2026-05-04 by Кодо. Q7.0 spike. Used as Q7.A-E reference.*
