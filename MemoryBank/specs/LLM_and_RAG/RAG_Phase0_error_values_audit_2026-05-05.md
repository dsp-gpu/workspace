# Phase 0 — Аудит `error_values` в spectrum

> **Цель**: дополнить 15 `@test { ... }` блоков, где нет `error_values`, перед запуском трёх RAG-агентов (class-card / usecase / pipeline) на репо `spectrum`.
>
> **Workflow**: Alex смотрит, правит / подтверждает предлагаемые значения → Кодо вписывает в код одним коммитом.

**Метрики**:
- Всего `@test { ... }` блоков в spectrum: **315**
- С `error_values`: **300** (95%)
- **Без `error_values`: 15** в 13 файлах (см. ниже)

---

## Рабочие примеры (как должно быть)

```cpp
// Пример 1 — массив complex'ов с диапазоном размера
* @param data Input: beam_count * n_point complex<float> values
*   @test { size=[100..1300000], value=6000, unit="elements",
*           error_values=[-1, 3000000, 3.14] }

// Пример 2 — GPU-указатель
* @param gpu_data Device pointer to complex data
*   @test { pattern=gpu_pointer, values=["valid_alloc", nullptr],
*           error_values=[0xDEADBEEF, null] }
```

**Логика `error_values`**:
- **size_t / int с диапазоном** → отрицательное, выход за верхний лимит, дробное (`-1`, очень большое, `3.14`)
- **enum** → невалидное приведение, `null` (`(BackendType)999, null`)
- **bool** — обычно нет смысла (компилятор не пустит мусор), можно опустить или `[null]` если nullable
- **string-path** → несуществующий путь, пустая строка, null (`"/no/such/file.json", "", null`)
- **указатель** → `nullptr`, мусор-адрес (`0xDEADBEEF, null`)
- **float множитель** → 0.0, отрицательное, `nan`/`inf` (`0.0, -1.0, NaN`)

---

## 15 блоков для дозаполнения

### Условные обозначения
- ✏️ **TODO** — Alex редактирует / подтверждает / отмечает «не нужно»
- 🟢 — Кодо предложила сразу (по эвристике), Alex может оставить или поправить

---

### 1. `spectrum/factory/spectrum_processor_factory.hpp:54`
```cpp
* @param backend_type ROCm (main-ветка) или OPENCL (legacy nvidia-ветка).
*   @test { values=[enum_all] }
```
🟢 **Предложение**: `error_values=[(BackendType)999, null, -1]`
✏️ **Твоё решение**:
не трогаем
 мы должны были давно убрать любое ветвление  OPENCL! 
 создай такск в котором будет удалить энумератор с  OPENCL и все что этим связано и в агенте должна была быть запись что не проганм переменные enum 
---

### 2. `spectrum/factory/spectrum_processor_factory.hpp:57`
```cpp
* @param backend non-owning указатель на DrvGPU backend (должен жить дольше processor'а).
*   @test { values=["valid_backend"] }
```
🟢 **Предложение**: `error_values=[nullptr, 0xDEADBEEF]`
✏️ **Твоё решение**:
ДА

---

Предлагаю все enum & json 
пока оставить!

### 3. `spectrum/fft_processor_rocm.hpp:179`
```cpp
* @param squared  false = |X| (default), true = |X|² (square-law, no sqrt)
*   @test { values=[true, false] }
```
🟢 **Предложение**: для `bool` error_values избыточно — оставить как есть, либо `error_values=[]` явно, либо `[null]` если param становится `std::optional<bool>`
✏️ **Твоё решение**:
Да
---

### 4. `spectrum/fft_processor_rocm.hpp:181`
```cpp
* @param window  WindowType::None (default) / Hann / Hamming / Blackman
*   @test { values=[None, Hann, Hamming, Blackman, Kaiser] }
```
🟢 **Предложение**: `error_values=[(WindowType)999, null, -1]`
✏️ **Твоё решение**:

---

### 5. `spectrum/filters/fir_filter_rocm.hpp:92`
```cpp
* @brief Загружает FIR-конфиг из JSON-файла.
* @param json_path Путь к JSON-файлу (формат FilterConfig::LoadJson).
*   @test { values=["/tmp/test_config.json"] }
```
🟢 **Предложение**: `error_values=["/no/such/file.json", "", "/tmp/malformed.json", null]`
✏️ **Твоё решение**:

---

### 6. `spectrum/filters/iir_filter_rocm.hpp:90`
```cpp
* @param json_path Путь к JSON-файлу (формат FilterConfig::LoadJson).
*   @test { values=["/tmp/test_config.json"] }
```
🟢 **Предложение**: `error_values=["/no/such/file.json", "", "/tmp/malformed.json", null]`
✏️ **Твоё решение**:

---

### 7. `spectrum/filters/moving_average_filter_rocm.hpp:89`
```cpp
* @param type Тип скользящего среднего (SIMPLE / EXPONENTIAL / WEIGHTED / ...).
*   @test { values=[enum_all] }
```
🟢 **Предложение**: `error_values=[(MovingAverageType)999, null, -1]`
✏️ **Твоё решение**:

---

### 8. `spectrum/lch_farrow.hpp:100`
```cpp
* @brief Load Lagrange matrix from JSON file
* @param json_path Path to JSON (format: { "data": [[...], ...] })
*   @test { values=["/tmp/test_config.json"] }
```
🟢 **Предложение**: `error_values=["/no/such/file.json", "", "/tmp/malformed.json", null]`
✏️ **Твоё решение**:

---

### 9. `spectrum/lch_farrow_rocm.hpp:114`
```cpp
* @param json_path Путь к JSON-файлу с матрицей (формат: { "data": [[...], ...] }).
*   @test { values=["/tmp/test_config.json"] }
```
🟢 **Предложение**: `error_values=["/no/such/file.json", "", "/tmp/malformed.json", null]`
✏️ **Твоё решение**:

---

### 10. `spectrum/operations/magnitude_op.hpp:82` (на `@param squared`)
```cpp
* @param squared  false (default) = |X|; true = |X|² (без sqrt, ~7× быстрее).
*   @test { values=[true, false] }
```
🟢 **Предложение**: bool — оставить пустым, либо `error_values=[]` явно
✏️ **Твоё решение**:
Да не нужно
---

### 11. `spectrum/operations/pad_data_op.hpp:89` (на `@param window`)
```cpp
* @param window  Window function (default None = rectangular, legacy).
*   @test { values=[None, Hann, Hamming, Blackman, Kaiser] }
```
🟢 **Предложение**: `error_values=[(WindowType)999, null, -1]`
✏️ **Твоё решение**:

---

### 12. `spectrum/operations/spectrum_post_op.hpp:90`
```cpp
* @param peak_mode     ONE_PEAK или TWO_PEAKS.
* @throws std::runtime_error при сбое hipModuleLaunchKernel.
*   @test_check throws on hipModuleLaunchKernel != hipSuccess
*   @test { values=[enum_all] }
```
🟢 **Предложение**: `error_values=[(PeakMode)999, null, -1]`
✏️ **Твоё решение**:

---

### 13. `spectrum/types/fft_params.hpp:45` (поле `output_mode`)
```cpp
/** Формат возвращаемых данных.
 *  @test { values=[COMPLEX, MAGNITUDE_PHASE, MAGNITUDE_PHASE_FREQ] } */
```
🟢 **Предложение**: `error_values=[(FFTOutputMode)999, null, -1]`
✏️ **Твоё решение**:

---

### 14. `spectrum/types/filter_params.hpp:104`
```cpp
* @brief Load filter config from JSON file (minimal parser, no nlohmann)
* @param path Path to JSON file
*   @test { values=["/tmp/test_config.json"] }
```
🟢 **Предложение**: `error_values=["/no/such/file.json", "", "/tmp/malformed.json", null]`
✏️ **Твоё решение**:

---

### 15. `spectrum/utils/cpu_fft.hpp:206` (на `@param squared`)
```cpp
* @param squared  true → |X|², false → |X|
*   @test { values=[true, false] }
```
🟢 **Предложение**: bool — оставить пустым, либо `error_values=[]` явно
✏️ **Твоё решение**:
не нужно
---

## Что делать дальше

1. **Alex** проходит по 15 пунктам, ставит галочки / правит предложения / добавляет комментарий «не нужно».
2. **Кодо** одним коммитом вписывает в `.hpp` файлы (`patcher.py`-стиль — точечно в существующий блок, без нарушения структуры).
3. **Re-run audit** — проверить что покрытие 100%.
4. **Phase 1 START**: ingestion блоков `Doc/*.md` → `doc_blocks` PG → запуск class-card-generator на пилоте `FFTProcessorROCm`.

---

*Аудит сгенерирован: 2026-05-05 · Кодо*
