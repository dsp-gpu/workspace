# 011 — C++ Use-Case Generator (TASK_RAG_07)

## Цель

Сгенерировать metadata для **C++ use-case** карточки в `<repo>/.rag/use_cases/<slug>.md`. Use-case — это семантическая задача («как решить X через класс Y»), которая ложится между «карточкой класса» (TASK_RAG_05) и «pipeline'ом» (TASK_RAG_09).

Гранулярность **B** (план §10): одна семантическая задача = одна карточка. Образец: [`examples/use_case_fft_batch_signal.example.md`](../examples/use_case_fft_batch_signal.example.md).

## Когда вызывается

В `usecase_gen.py` методе `build_use_case_md(...)` — секции `title`, `when_to_use`, `synonyms`, `tags`. Остальные поля (`primary_class`, `related_classes`, `block_refs`, граничные случаи, пример кода) собираются **детерминированно** caller'ом из:

- ретривала Qdrant по `primary_class` FQN (related_classes),
- AST + Doxygen парсера (граничные случаи через `@throws`),
- `tests/test_*.cpp` или `examples/cpp/*.cpp` (пример кода),
- `<repo>/.rag/test_params/<class>.md` (параметры из TASK_RAG_05).

LLM **не выдумывает** код, FQN, имена методов и параметры. Только title/synonyms/tags/when_to_use.

## Источник use-case'ов (для caller'а — справочно)

1. Из `Doc/` h2 секций: `## Pipeline:`, `## Use-case:`, маркеры `<!-- usecase: <slug> -->`.
2. Из `tests/test_*.cpp` — каждый `TEST(...)` с осмысленным `brief` или комментарием.
3. Из `examples/cpp/*.cpp` (если есть).
4. Опция `--suggest-via-ai` — Qwen предлагает 5-15 кандидатов из class-card + Doc/, Alex отбирает.

## Вход (caller передаёт LLM)

1. **Use-case slug** (детерминированный, например `fft_batch_signal`)
2. **Primary class**: FQN, repo, namespace, файл
3. **Primary method**: имя + сигнатура (если определилось)
4. **Doxygen блок** primary_class (`doxy_brief`, `doxy_full`)
5. **Doxygen primary_method** (`@param`, `@throws`, `@return` — для граничных случаев)
6. **Related classes** (топ-5 из retrieval по primary_class FQN), краткие brief'ы
7. **Doc/ excerpts** (топ-3 блока упоминающих primary_class или slug, обрезанные до 600 символов)
8. **Test/Example snippet** (если найден в `tests/` или `examples/cpp/`) — реальный фрагмент использования (10-30 строк)

## Системный промпт

```
Ты — технический писатель проекта DSP-GPU (C++/HIP/ROCm GPU computing
для радиолокационной обработки сигналов).

Тебе дан C++ use-case — описание семантической задачи, которую решает
один (primary) класс с помощью одного-двух методов. Твоя роль —
написать metadata блок для retrieval-системы. Реальный пример кода и
ссылки уже подготовлены caller'ом, ты их не переписываешь.

ПРАВИЛА:
- Пиши на русском как доминирующий язык документации проекта.
- Стиль — техническая сводка, без воды и маркетинга.
- Опирайся ТОЛЬКО на предоставленный контекст (класс, методы, doxygen,
  Doc/-выдержки, фрагмент теста). Не выдумывай факты, FQN, имена.
- title — короткая постановка задачи с точки зрения пользователя
  ("Как сделать X на GPU"). НЕ описание класса.
- when_to_use — 1-2 предложения: КОГДА разработчик берёт именно этот
  use-case (а не соседний). Если в Doc/ или тесте есть готовая
  формулировка — используй её, не переписывай.
- synonyms_ru/en — формулировки от лица пользователя ("как посчитать
  БПФ батчем", "fft for antenna array signal"). По 8 шт.
- tags — короткие keywords lowercase snake_case (5-10 шт), включая
  репо и ключевые термины (rocm, fft, batch, antenna и т.п.).

Формат — СТРОГО JSON, без markdown-обёртки, без комментариев:

{
  "title": "...",
  "when_to_use": "...",
  "synonyms_ru": ["...", "...", "...", "...", "...", "...", "...", "..."],
  "synonyms_en": ["...", "...", "...", "...", "...", "...", "...", "..."],
  "tags": ["...", "...", "...", "...", "..."]
}

ОГРАНИЧЕНИЯ:
- title: 5-10 слов, без точки в конце.
- when_to_use: ≤ 280 символов.
- 8 synonyms на каждый язык (для retrieval boost).
- 5-10 tags. Один из тегов — имя репо.
```

## Шаблон пользовательского сообщения

```
Use-case slug: {use_case_slug}
Репо:          {repo}

Primary class:  {primary_class_fqn}
Primary method: {primary_method_signature}
Файл:           {file_path}:{line_start}

Doxygen primary_class:
{class_doxy}

Doxygen primary_method:
{method_doxy}

Related classes ({n_related}):
{related_classes_brief}

Релевантные секции Doc/ ({n_doc_blocks}):
{doc_excerpts}

Фрагмент использования (test/example):
{test_or_example_snippet}
```

(Caller передаёт `{class_doxy}` и `{method_doxy}` как `doxy_full or doxy_brief or "(нет)"`. `{related_classes_brief}` — `- {fqn}: {brief}` по строке. `{doc_excerpts}` — `### {block_id}` + первые 600 символов content_md, разделённые двойным переводом строки. `{test_or_example_snippet}` — `(нет)` если caller не нашёл.)

## Формат вывода

Только JSON. Без markdown-обёртки ` ```json `. Без пояснений до/после. Без `\n` в строковых полях (используй пробел вместо переноса).

## Примеры

### Вход (fft_batch_signal — образец)

```
Use-case slug: fft_batch_signal
Репо:          spectrum

Primary class:  fft_processor::FFTProcessorROCm
Primary method: std::vector<FFTComplexResult> ProcessComplex(const std::vector<std::complex<float>>& data, const FFTProcessorParams& params, ROCmProfEvents* prof_events = nullptr)
Файл:           E:/DSP-GPU/spectrum/include/spectrum/fft_processor_rocm.hpp:53

Doxygen primary_class:
/// @ingroup grp_fft_func

Doxygen primary_method:
@brief Прямое БПФ для batch CPU-данных
@param data входные IQ-сэмплы [beam_count × n_point]
@param params конфигурация FFT
@throws std::invalid_argument если n_point == 0
@throws std::runtime_error если требуемая VRAM > memory_limit

Related classes (3):
- fft_processor::FFTProcessorParams: конфиг для FFTProcessorROCm
- spectrum::SpectrumProcessorROCm: обёртка верхнего уровня
- spectrum::ComputeMagnitudesOp: подсчёт |X|² на GPU без D2H

Релевантные секции Doc/ (1):
### spectrum__fft_pipeline__overview__v1
Pipeline FFT: input IQ → ProcessComplex → MagnitudesOp → result.
Используется для batch-FFT с антенного массива...

Фрагмент использования (test/example):
TEST(FFTProcessorROCm, BatchSignal128x6000) {
    auto gpu = drv_gpu_lib::DrvGPU::CreateROCm(0);
    FFTProcessorROCm proc(gpu.GetBackend());
    FFTProcessorParams p{.beam_count=128, .n_point=6000, .sample_rate=10e6f};
    auto results = proc.ProcessComplex(iq_data, p);
    ASSERT_EQ(results.size(), 128u);
}
```

### Выход (ожидаемый)

```json
{
  "title": "Прямой FFT для batch-сигнала с антенного массива",
  "when_to_use": "Когда есть IQ-сигнал с массива антенн (beam_count × n_point) и нужно посчитать прямое БПФ независимо для каждой антенны на GPU. Для амплитуд без D2H — см. fft_batch_to_magnitudes.",
  "synonyms_ru": [
    "как посчитать БПФ батчем",
    "FFT для антенн на GPU",
    "спектр сигнала с антенного массива",
    "параллельный FFT для нескольких лучей",
    "пакетный БПФ ROCm",
    "batch FFT обработка",
    "ProcessComplex антенны",
    "GPU спектр массива"
  ],
  "synonyms_en": [
    "how to compute batch FFT on GPU",
    "FFT for antenna array signal",
    "parallel FFT for multiple beams",
    "hipFFT batch processing",
    "ROCm batch FFT",
    "GPU FFT antenna array",
    "ProcessComplex batch",
    "FFT batch IQ samples"
  ],
  "tags": ["fft", "hipfft", "batch", "antenna", "gpu", "rocm", "beamforming", "spectrum"]
}
```

## Параметры LLM

- **Model**: `qwen3:8b` (через Ollama на `localhost:11434`)
- **Temperature**: `0.2` (детерминированно — техническое описание)
- **Max tokens**: `1500` (8+8 synonyms + tags + when_to_use в JSON помещаются)
- **num_ctx**: `8192` (Doc/-выдержки + test snippet могут быть длинными)
- **Stop sequences**: `[]` (модель сама закроет JSON)

## Что caller делает с выходом LLM

```python
# В usecase_gen.py build_use_case_md(...)
meta_llm = call_011_prompt(use_case_slug, primary_class, ...)

frontmatter = {
    "schema_version": 1,
    "kind": "use_case",
    "id": use_case_slug,
    "repo": repo,
    "title": meta_llm["title"],
    "synonyms": {"ru": meta_llm["synonyms_ru"], "en": meta_llm["synonyms_en"]},
    "primary_class": primary_class_fqn,         # детерминированно
    "primary_method": primary_method_name,      # детерминированно
    "related_classes": retrieval_top5,          # детерминированно: Qdrant search
    "related_use_cases": retrieval_top3,        # детерминированно: Qdrant search
    "tags": meta_llm["tags"],
    "ai_generated": True,                       # human_verified=False
    "human_verified": False,
    "updated_at": today_iso,
}

body = render_use_case_md(
    title       = meta_llm["title"],
    when_to_use = meta_llm["when_to_use"],
    code_snippet= test_or_example_snippet,      # из tests/, NOT LLM
    params_table= test_params_md_excerpt,       # из TASK_RAG_05 class-card
    edge_cases  = parse_throws(method_doxy),    # из @throws, NOT LLM
    next_steps  = related_use_cases_links,
    refs        = [class_card_link, example_link],
)
```

LLM никогда не пишет: код, FQN, имена методов, параметры, ссылки на use-case'ы. Только title/when_to_use/synonyms/tags.

## Связано

- [`prompts/010_class_card.md`](010_class_card.md) — class-card AI summary (TASK_RAG_05)
- [`prompts/012_pipeline.md`](012_pipeline.md) — pipeline-агент (TASK_RAG_09, ещё не написан)
- [`prompts/013_python_usecase.md`](013_python_usecase.md) — Python use-case (TASK_RAG_02.6)
- [`tasks/TASK_RAG_07_usecase_agent_2026-05-05.md`](../../tasks/TASK_RAG_07_usecase_agent_2026-05-05.md) — спека агента
- [`examples/use_case_fft_batch_signal.example.md`](../examples/use_case_fft_batch_signal.example.md) — образец карточки
- `dsp_assistant/modes/usecase_gen.py` — реализация (создаётся в TASK_RAG_07)
