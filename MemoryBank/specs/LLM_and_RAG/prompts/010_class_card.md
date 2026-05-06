# 010 — Class-card AI summary

## Цель

Сгенерировать AI-summary для **class_overview** блока в class-card карточке (TASK_RAG_05 v2). Промпт зовётся когда:
- В Doc/ репо нет готовой секции про класс
- Doxygen-блок класса слабый (`@brief` короткий или вообще `@ingroup` без описания)
- Нужно уплотнить разрозненный контекст в единое связное описание

## Когда использовать

- В `class_card.py` метод `build_class_card_md()` — секция `## Описание класса` (заменяет fallback на одну строку doxy_brief)
- Опционально: для `usage_example` блока если в Doc/ не найден пример

## Вход

LLM получает:
1. **Метаданные класса**: `name`, `fqn`, `repo`, `namespace`, `file_path`
2. **Doxygen блок над классом** (если есть): `doxy_brief`, `doxy_full`
3. **Сигнатуры public-методов** (5-15 штук, отфильтрованные по `_filter_public_methods`)
4. **Релевантные блоки из Doc/** (топ-5 из `find_doc_blocks_mentioning`, обрезанные до 800 символов каждый)

## Системный промпт

```
Ты — технический писатель проекта DSP-GPU (C++/HIP/ROCm GPU computing
для радиолокационной обработки сигналов).

Тебе дан C++ класс — его сигнатуры методов, Doxygen-комментарий и
выдержки из проектной документации.

Сгенерируй СТРУКТУРИРОВАННОЕ описание класса для RAG-системы.
Это часть class-card .md файла который попадёт в локальный AI-ассистент
для разработчиков.

ПРАВИЛА:
- Пиши на русском (как доминирующий язык документации проекта).
- Стиль — техническая сводка, без воды, без маркетинга.
- Опирайся ТОЛЬКО на предоставленный контекст. Не выдумывай факты.
- Если в контексте нет информации для какого-то поля — оставь "".
- Никаких "Этот класс представляет собой..." — сразу по сути.

Формат — СТРОГО JSON, без markdown-обёртки, без комментариев:

{
  "what":  "1-2 предложения: ЧТО делает класс (роль/функция). Технично.",
  "why":   "1-2 предложения: ЗАЧЕМ существует (что скрывает / какую проблему решает).",
  "how":   "2-3 предложения: КЛЮЧЕВЫЕ design choices (lazy init, кэши, batch, паттерны).",
  "usage_example": "5-10 строк C++ кода — реалистичный пример использования. Используй namespace и метод из сигнатур.",
  "synonyms_ru": ["синоним1", "синоним2", ...],
  "synonyms_en": ["synonym1", "synonym2", ...],
  "tags": ["tag1", "tag2", ...]
}

ОГРАНИЧЕНИЯ:
- what + why + how вместе ≤ 600 символов (чтобы блок embedding'а влез в контекст retrieval).
- 4-8 synonyms на каждый язык (для retrieval boost).
- 3-6 tags (короткие keywords).
- usage_example — рабочий C++ синтаксис (укажи #include или namespace using-decl сверху).
```

## Шаблон пользовательского сообщения

```
Класс: {class_fqn}
Репо:  {repo}
Файл:  {file_path}:{line_start}

Doxygen блок:
{doxy}

Public-методы ({n_methods}):
{methods_list}

Релевантные секции из Doc/ ({n_doc_blocks}):
{doc_excerpts}
```

(Caller передаёт `doxy` уже как `doxy_full or doxy_brief or "(нет)"`. `methods_list` — это `- ReturnType MethodName(args)` по строке на метод. `doc_excerpts` — `### {block_id}` + первые 800 симв content_md, разделённые двойным переводом строки.)

## Формат вывода

Только JSON. Без markdown-обёртки ` ```json `. Без пояснений до/после.

## Примеры

### Вход (FFTProcessorROCm)

```
Класс: fft_processor::FFTProcessorROCm
Репо:  spectrum
Файл:  E:/DSP-GPU/spectrum/include/spectrum/fft_processor_rocm.hpp:53

Doxygen блок:
/// @ingroup grp_fft_func

Public-методы (5):
- std::vector<FFTComplexResult> ProcessComplex(const std::vector<std::complex<float>>& data, const FFTProcessorParams& params, ROCmProfEvents* prof_events = nullptr)
- std::vector<FFTComplexResult> ProcessComplex(void* gpu_data, const FFTProcessorParams& params, ROCmProfEvents* prof_events = nullptr)
- std::vector<MagPhaseResult> ProcessMagPhase(...)
- ...
```

### Выход (ожидаемый)

```json
{
  "what": "Layer-6 facade для batch-FFT через hipFFT + hiprtc kernels на AMD ROCm GPU. Поддерживает три output-режима: COMPLEX, MAGNITUDE_PHASE, MAGNITUDES_GPU.",
  "why": "Скрывает hipFFT plan management, lazy-аллокацию device-буферов и выбор kernel-перегрузки. Python-биндинги работают через стабильный публичный API без знания о hipfftHandle/BufferSet.",
  "how": "LRU-2 кэш hipfftPlan1d (re-allocate ~5ms). BufferSet<4> переиспользует device-память. PadDataOp + MagPhaseOp вынесены в Layer-5 Op'ы. Move-only (owns hipfftHandle).",
  "usage_example": "auto proc = std::make_unique<FFTProcessorROCm>(rocm_backend);\nFFTProcessorParams p{.beam_count=128, .n_point=6000, .sample_rate=10e6f};\nauto results = proc->ProcessComplex(iq_data, p);",
  "synonyms_ru": ["batch FFT", "пакетный БПФ", "GPU FFT", "ROCm FFT", "FFT процессор"],
  "synonyms_en": ["batch FFT", "GPU FFT processor", "hipFFT wrapper", "ROCm FFT", "FFT facade"],
  "tags": ["fft", "hipfft", "rocm", "batch", "gpu", "facade"]
}
```

## Параметры LLM

- **Model**: `qwen3:8b` (через Ollama на `localhost:11434`)
- **Temperature**: `0.2` (детерминированно — техническое описание)
- **Max tokens**: `1500`
- **Stop sequences**: `[]` (модель сама закроет JSON)

## Связано

- `prompts/001_index_class_summary.md` — старый JSON-summary индекса (используется отдельно)
- `prompts/011_usecase.md` — следующий промпт (use-case-агент TASK_RAG_07)
- `tasks/TASK_RAG_05_class_card_agent_2026-05-05.md` — спека агента
- `dsp_assistant/modes/class_card.py` — реализация
