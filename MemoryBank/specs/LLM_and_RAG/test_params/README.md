# test_params — База граничных значений (для генерации тестов)

> **Что это:** JSON-файлы с граничными значениями параметров каждого тестируемого класса/метода.
> **Откуда берётся:** AI читает код → находит `if/throw/assert/clamp/min/max` → пишет JSON автоматически (`auto_extracted: true`).
> **Кто правит:** оператор (Alex) → редактирует JSON в VSCode → ставит `human_verified: true`.
> **Кто использует:** промпты `002`, `003`, `004` (генерация тестов) — берут эти значения как контекст.

---

## 1. Workflow

```
1. dsp-asst index build           — индексер находит классы и методы
   └─→ для каждого метода с параметрами AI генерит черновик test_params
       └─→ запись в Postgres + экспорт в test_params/<repo>_<class>.json

2. Оператор (Alex) открывает test_params/<repo>_<class>.json в VSCode
   └─→ правит edge_values, добавляет typical, comments
   └─→ ставит "human_verified": true, "operator": "alex"

3. dsp-asst params sync          — синк JSON → Postgres
   (или auto-sync по git-hook)

4. dsp-asst test generate FFTProcessorROCm
   └─→ промпт 003 / 004 получает test_params как контекст
   └─→ модель генерирует тест с реалистичными значениями
```

---

## 2. Формат файла

`<repo>_<class>.json` (например `spectrum_FFTProcessorROCm.json`):

```json
{
  "class": "FFTProcessorROCm",
  "namespace": "fft_processor",
  "file": "spectrum/include/spectrum/fft_processor_rocm.hpp",
  "indexed_at": "2026-04-30T14:00:00Z",

  "params": {
    "fft_size": {
      "type": "size_t",
      "edge_values": {
        "min": 1,
        "max": "N_input",
        "typical": [256, 1024, 4096],
        "edge": [0, 3, "N_input + 1", "max_size_t"]
      },
      "constraints": {
        "power_of_two": true,
        "throws_if_zero": true,
        "must_match_input_length": false
      },
      "auto_extracted": true,
      "human_verified": false,
      "comments": "DSP: FFT для радара 1k-8k, всегда степень 2",
      "extracted_from": {
        "file": "spectrum/include/spectrum/fft_processor_rocm.hpp",
        "line": 142,
        "snippet": "if (n & (n-1)) throw std::invalid_argument(\"fft_size must be power of 2\")"
      },
      "operator": null,
      "updated_at": "2026-04-30T14:00:00Z"
    },

    "input_data.size": {
      "type": "size_t",
      "edge_values": {
        "typical": [1024, 4096],
        "edge": [0, 1]
      },
      "constraints": {
        "matches_fft_size": true
      },
      "auto_extracted": true,
      "human_verified": false,
      "comments": ""
    }
  }
}
```

---

## 3. Поля JSON

| Поле | Тип | Что |
|------|-----|-----|
| `class` | string | Имя класса |
| `namespace` | string | C++ namespace (если есть) |
| `file` | string | Относительный путь к .hpp |
| `indexed_at` | ISO-8601 | Когда индексер сгенерил черновик |
| `params.<name>.type` | string | C++ тип параметра |
| `params.<name>.edge_values.min` | значение | Минимально допустимое |
| `params.<name>.edge_values.max` | значение / выражение | Максимально допустимое (можно строкой: `"N_input"`) |
| `params.<name>.edge_values.typical` | array | Типичные значения для smoke-тестов |
| `params.<name>.edge_values.edge` | array | Граничные/тестируемые случаи |
| `params.<name>.constraints` | object | Особые условия (`power_of_two`, `throws_if_zero`, …) |
| `params.<name>.auto_extracted` | bool | true = AI извлёк, false = ручная правка |
| `params.<name>.human_verified` | bool | true = оператор проверил и подтвердил |
| `params.<name>.comments` | string | Свободный комментарий оператора |
| `params.<name>.extracted_from` | object | Файл/строка/сниппет где AI это нашёл |
| `params.<name>.operator` | string\|null | `'alex'` если верифицировано |
| `params.<name>.updated_at` | ISO-8601 | Последнее изменение |

---

## 4. Соглашения

### 4.1. Имена параметров

- Простые: `window_size`, `fft_size`, `gpu_id`.
- Структурные: `params.fft_size`, `cfg.n_warmup` — через точку.
- Массивы: `input_data.size`, `coefficients.length`.

### 4.2. Значения

- **Числа** — целые или float по типу.
- **Строки-выражения** — для значений зависящих от других параметров: `"N_input"`, `"fft_size + 1"`, `"max_size_t"`.
- **Спец. константы** — `"max_size_t"`, `"sizeof_max"`, `"hipMallocMax"`.

### 4.3. Constraints (типичные)

| Constraint | Что значит |
|------------|------------|
| `power_of_two` | Должно быть степенью 2 |
| `throws_if_zero` | При 0 бросается исключение |
| `throws_if_negative` | Только > 0 |
| `must_match_input_length` | Должно совпадать с длиной входа |
| `matches_fft_size` | Должно совпадать с другим параметром `fft_size` |
| `gpu_id_valid_range` | 0..GetAvailableDeviceCount() |
| `dtype_must_be` | Конкретный dtype, например `float32` |

---

## 5. Команды CLI

```bash
# Сгенерировать черновики для всех классов в репо
dsp-asst params extract --repo spectrum

# Открыть один файл в VSCode для правки
dsp-asst params edit FFTProcessorROCm

# Синк JSON-файлов → Postgres (после ручных правок)
dsp-asst params sync

# Показать какие файлы НЕ верифицированы
dsp-asst params unverified

# Использовать в генерации теста (берётся автоматически)
dsp-asst test gen FFTProcessorROCm --kind cpp_benchmark
```

---

## 6. Git versioning

- Каталог `test_params/` в git (правки оператора — это история знаний о коде).
- Один файл на класс — `<repo>_<class>.json` — git diff показывает что менял оператор.
- При re-index AI **не перезаписывает** уже верифицированные параметры (`human_verified: true`). Только обновляет `extracted_from` если строка кода сдвинулась.

---

## 7. Что дальше

Phase 5 — наполнение этого каталога для всех ~200 публичных классов DSP-GPU. Стартуем с `core` и `spectrum` (наиболее используемые).

---

*Конец README. Спецификация полей и таблица в Postgres — см. `03_Database_Schema_2026-04-30.md`, секция 2.8.*
