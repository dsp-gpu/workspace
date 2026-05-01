# dsp-asst — Session Handoff (2026-05-01)

> **Обновлено:** 2026-05-01 ~12:00 (после Phase 5.1 + chunker bugfix + Phase 3.1 + 3.2 + Phase 4 MCP + Phase 8/C eval).
>
> ## TL;DR последней сессии
>
> 1. **Phase 4 MCP** — Claude Code в `E:\DSP-GPU` подключён к нашему RAG через `.mcp.json`, реально вызывает `dsp_search`, `dsp_find`. ✅
> 2. **Phase 5.1** — `gen test` теперь обогащает class_summary через `pybind_bindings` + `methods_from_db`. Результат: 8 из 8 ошибок предыдущего теста починены без обучения.
> 3. **Bugfix chunker_cpp** — добавил рекурсию в `preproc_if/preproc_ifdef/extern "C"/template_declaration`. Без этого пропускали ВСЁ внутри `#if ENABLE_ROCM` (а это половина проекта). Было **3385 символов → стало 5256** (+55%).
> 4. **Phase 3.1** — `gen ai-summaries` прогоняет классы без doxygen через Qwen, пишет `ai_summary` + переэмбеддит. 107 классов получили AI-сводки на русском.
> 5. **Phase 3.2** — расширил tree-sitter индексер: `includes` (3395 #include), `pybind_bindings` (42 связи C++↔Python), `cmake_targets` (31 target).
> 6. **Phase 8/C eval** — golden_set 50 Q&A, runner с recall@k/MRR. **R@5=0.64 на hybrid+rerank+CUDA, 26.6s/50 запросов**. Метрика суффиксная (метод класса = попадание в класс).
> 7. **Reranker на GPU** — `cuda.is_available()=True` после `torch==2.6.0+cu118`. Reranker полностью на GPU, скорость x15.
> 8. **Embeddings 5221 в pgvector** (после `--force` re-index).
>
> ## Что осталось — приоритеты
>
> - **Поправить golden_set** (Q007, Q017, Q019, Q020, Q023, ...) — половина промахов это неправильные expected_fqn. Через `dsp-asst find <name>` найти реальный namespace в БД и обновить `qa_v1.jsonl`. Потом ожидаю R@5 ≈ 0.75-0.80.
> - **TODO: автоматизация индекса** — git post-commit hook + cron, чтобы `index build/extras/embeddings` запускались сами при правках кода. Алекс просил.
> - **Phase 6** — промпты `doxy / explain / refactor / agent`.
> - **QdrantStore** — реализация для переезда на work Debian (stage 2).
> - **Phase 9-10** — SFT-корпус из `rag_logs` + QLoRA на Qwen3-8B.
>
> ## Финальная цифра качества (baseline без обучения)
>
> | Mode | R@1 | R@5 | R@10 | MRR@10 | Time |
> |------|-----|-----|------|--------|------|
> | dense (без rerank) | 0.28 | 0.32 | 0.32 | 0.30 | 21.5s |
> | sparse (без rerank) | 0.48 | 0.48 | 0.48 | 0.48 | 0.28s |
> | hybrid + rerank на CUDA | **0.48** | **0.64** | **0.66** | **0.54** | **26.6s** |
>
> По категориям hybrid+rerank: exact_name R@5=0.70, semantic_ru R@5=0.62, semantic_en R@5=0.57.
>
> ---


> **Назначение:** новый чат Кодо в этом проекте читает этот файл первым,
> чтобы подхватить работу без перечитывания всей переписки.
> **Кому:** будущему Кодо (или новой сессии текущего Кодо после компакта).
> **Стиль:** факты, не объяснения. Полные пути, точные имена.

---

## 1. Состояние — что построено за день

| Phase | Статус | Где код | Где спека |
|-------|--------|---------|-----------|
| 0. Foundation: PostgreSQL 16 + pgvector + конфиги | ✅ | `configs/postgres_init.sql`, `configs/postgres_init_pgvector.sql` | `00_Master_Plan_2026-04-30.md`, `01_Stack_Decisions_2026-04-30.md`, `03_Database_Schema_2026-04-30.md` |
| 1. Indexer MVP (1225 файлов, 3385 символов в БД) | ✅ | `dsp_assistant/indexer/{file_walker,file_hasher,chunker_cpp,chunker_python,persister,build}.py` | (см. Master Plan) |
| 2. Retrieval BGE-M3 + tsvector + RRF | ✅ | `dsp_assistant/retrieval/{embedder,vector_store,pipeline,text_builder}.py` | |
| 2.A. BGE-reranker-v2-m3 (cross-encoder) | ✅ | `dsp_assistant/retrieval/reranker.py` | |
| 2.B. HTTP сервер с warm моделями + portproxy | ✅ | `dsp_assistant/server/http_api.py` | `MCP_Setup_Guide_2026-05-01.md` |
| 4. MCP-сервер для Claude Code / Continue | ✅ | `dsp_assistant/server/mcp_server.py`, `E:\DSP-GPU\.mcp.json` | `MCP_Setup_Guide_2026-05-01.md` |
| 5. LLM gen (test/summary через Qwen3 8B) | ✅ | `dsp_assistant/{llm,modes}/`, промпты `prompts/001-004` | (промпты на месте) |
| 3.1. AI-summary через Qwen для 107 классов + re-embed | ✅ | `cli/main.py: gen ai-summaries` | |
| 3.2. tree-sitter extras: includes/pybind/cmake | ✅ | `dsp_assistant/indexer/{cpp_extras,cmake_parser,extras_build}.py` | |
| 3.3. clangd LSP → call-graph deps | ⏸ отложен до WSL | — | (нужен `compile_commands.json`, не сгенерируется на Win) |
| 6. Промпты doxy / refactor / explain / find / agent | ⏳ next | — | — |
| QdrantStore (для stage 2 work Debian) | ⏳ next | `vector_store.py` (заглушка с `NotImplementedError`) | |

---

## 2. Окружение Алекса — особенности

### 2.1. Платформы и stages (из `configs/stack.json`)

| Stage | OS | LLM-runtime | Vector DB | Когда |
|-------|----|-------------|-----------|-------|
| `1_home` (сейчас) | Windows 11 21H2 (build 22000.2538) | Ollama qwen3:8b | **pgvector** | сейчас |
| `2_work_local` | Debian | Ollama qwen3:32b | Qdrant native | потом |
| `3_mini_server` | Ubuntu | vLLM (systemd) | Qdrant native | прототип сервера |
| `4_production` | Linux + A100 | vLLM (DeepSeek-V3 / Qwen Max) | Qdrant | через 3-4 мес |

### 2.2. Где что лежит на dev-машине Win

- **Проект DSP-GPU**: `E:\DSP-GPU\` (10 git-репо: core, spectrum, stats, signal_generators, heterodyne, linalg, radar, strategies, DSP, workspace)
- **Наш код**: `C:\finetune-env\dsp_assistant\`
- **Спеки/конфиги/промпты**: `E:\DSP-GPU\MemoryBank\specs\LLM_and_RAG\`
- **Runtime данные** (модели, кэш, логи): `C:\finetune-env\.dsp_assistant\` (план, не используется ещё) + `~\.cache\huggingface\hub\`
- **PostgreSQL**: в WSL2 Ubuntu, localhost:5432 → проброшен через `netsh portproxy` на Windows localhost:5432

### 2.3. **ВАЖНО: два venv** (источник путаницы)

У Алекса исторически два Python venv:
- `C:\finetune-env\.venv` — где лежит `Scripts\dsp-asst.exe`
- `F:\Program Files (x86)\Python312\.venv` — куда uv ставит пакеты по `Using Python 3.12.8 environment at: F:\...`

`uv pip install -e .` ставит во второй (потому что python.exe оттуда). exe запускается из первого. Если поставил пакет — ставится в оба, всё работает. Если хочешь явно поставить только в правильный:
```powershell
C:\finetune-env\.venv\Scripts\python.exe -m pip install <package>
```

Python 3.12.8. PyTorch 2.6.0+cu118. RTX 2080 Ti, 11 GB VRAM. CUDA 13.1 driver 591.86.

### 2.4. WSL networking

- WSL версия 2.6.3, Ubuntu noble (24.04).
- Mirrored networking **не поддерживается** на Windows 22000 — используется NAT.
- Каждый рестарт WSL даёт новый IP (172.22.x.y).
- `start-dsp-asst.bat` (`C:\finetune-env\start-dsp-asst.bat`) от админа: запускает Postgres в WSL + обновляет `netsh portproxy 5432→WSL_IP`.
- DNS в WSL зафиксирован вручную (`/etc/wsl.conf` с `generateResolvConf=false`).

### 2.5. Postgres подключение

- БД: `dsp_assistant`, схема: `dsp_gpu`, пользователь: `dsp_asst`, пароль: `1`.
- `pg_hba.conf`: `host all all 172.22.16.0/24 scram-sha-256` + `127.0.0.1/32`.
- 10 таблиц: files, symbols, deps, includes, enum_values, pybind_bindings, test_params, rag_logs, cmake_targets, embeddings.
- Расширения: pg_trgm, btree_gin, vector (pgvector 0.6).

### 2.6. HuggingFace

- HF_TOKEN был дважды засвечен в чате — пользователь должен их revoke и создать новый.
- `DSP_ASST_OFFLINE_HF=1` по умолчанию (модели в кэше). Для скачивания — `=0` + `HF_HUB_ENABLE_HF_TRANSFER=1`.
- BGE-M3 и BGE-reranker-v2-m3 уже скачаны в `~\.cache\huggingface\hub\`.

### 2.7. Ollama

- Стоит на Win, http://localhost:11434, OpenAI-compatible API.
- Модели: `qwen3:8b` (5.2 GB Q4_K_M), `qwen2.5-coder:1.5b`, `nomic-embed-text:latest`.
- На RTX 2080 Ti с `num_ctx=8192` — qwen3:8b на 100% GPU, ~30-50 t/s.
- При дефолтном context 40960 — VRAM не хватало, было 27%/73% CPU/GPU.

---

## 3. Команды CLI (что есть)

```
dsp-asst ping                              — проверка PG + 10 таблиц + extensions
dsp-asst llm-health                        — проверка Ollama
dsp-asst find <name> [--kind class]        — substr+trgm
dsp-asst query "..." [--repo X --kind Y]   — гибридный поиск (через сервер если жив)
dsp-asst index build [--root E:\DSP-GPU]   — Phase 1: tree-sitter
dsp-asst index extras                      — Phase 3.2: includes/pybind/cmake
dsp-asst index embeddings [--re-embed]     — Phase 2: BGE-M3 в pgvector
dsp-asst index stats                       — счётчики таблиц
dsp-asst gen summary <ClassName>           — промпт 001 (JSON)
dsp-asst gen test <ClassName> --kind X     — промпт 002/003/004 (Python/CPP/benchmark)
dsp-asst gen ai-summaries [--re-embed]     — Phase 3.1: пройти по всем классам
dsp-asst serve                             — HTTP server BGE-M3 + reranker (warmup ~15с)
dsp-asst mcp                               — MCP stdio (для Claude Code / Continue)
```

### Workflow Алекса

1. Утром: запустить `start-dsp-asst.bat` от админа → Postgres + portproxy готовы.
2. В PyCharm Terminal окно №1: `dsp-asst serve` (греет BGE-M3 + reranker).
3. В Окне №2: `dsp-asst query "..."` или `gen test ...`.
4. В Claude Code: автоматически через MCP.

---

## 4. Известные проблемы / наблюдения

### 4.1. Качество gen test
- Структура (TestRunner/setUp/test_*) — правильная.
- Импорты — путает: пишет `from dsp_fft import` вместо `from dsp_spectrum import`. **Phase 3.2 (pybind_bindings, 28 записей) это починит**, если в test_gen.py начать передавать pybind инфу из БД в промпт. См. TODO ниже.
- `runner.run(TestX)` — передаёт класс вместо экземпляра. Промпт 002 надо ужесточить.
- `runner.print_summary()` без `results` — то же.
- `process_complex` возвращает массив, модель путает с `process_mag_phase` (dict). Промпт надо дополнить чтением `args_jsonb` / `return_type` каждого метода.

### 4.2. Reranker заметно дороже на CPU (BGE-reranker-v2-m3 на CPU = ~5с на 30 пар vs <1с на GPU). Если bottleneck — перевести reranker на GPU тоже (сейчас он на CPU потому что на Win torch видит CUDA, но reranker создаётся с `device='cpu'` при загрузке когда модель не помещается с BGE-M3). Проверить.

### 4.3. RTX 2080 Ti VRAM:
- BGE-M3 fp16 ~ 1.2 GB
- reranker fp16 ~ 1.1 GB (если на GPU)
- Qwen 8B Q4 + 8K context ~ 6.6 GB
- → если всё на GPU вместе ~ 9 GB, влезает.

### 4.4. Алекс работал с 5 утра (это 30 апр) → к 9 утра 1 мая он ~28 часов в работе. Фоновое — скоро устанет, может делать опечатки в командах. Терпеливо чинить.

### 4.5. Алекс присылал HF токены в чат **дважды**. Если снова пришлёт — отказаться использовать, попросить revoke и создать новый, оставить только у него локально.
### от Alexa - спасибо)) берегите меня)
---

## 5. Что делать дальше (очередь)

### 5.1. Улучшить gen test через Phase 3.2 данные

Сейчас `modes/test_gen.py` передаёт в промпт только `class_summary` (из 001) + пример теста. Добавить:
- **Pybind mapping** из БД: для C++ класса `FFTProcessorROCm` найти в `pybind_bindings` запись `dsp_spectrum.FFTProcessorROCm` + список method mappings. Передать в промпт явным блоком «Python imports: `from dsp_spectrum import FFTProcessorROCm` / methods exposed: ..."`.
- **Реальные args_jsonb** методов класса — чтобы модель видела типы.

Ожидаемый эффект: импорты будут правильные, модель не будет путать `process_complex` (массив) с `process_mag_phase` (dict).

### 5.2. Phase 6: ещё промпты

Создать в `prompts/`:
- `005_explain_class.md` — режим explain (объяснение класса в проекте)
- `006_doxy_for_class.md` — генерация doxygen-комментов
- `007_refactor_solid.md` — рефакторинг под SOLID/GRASP

Добавить CLI: `dsp-asst gen doxy <class>`, `dsp-asst explain "..."`, `dsp-asst refactor <file>`.

### 5.3. Phase 7: agent-mode

Tool-calling loop. Qwen 8B плохо в этом — fallback на цепочки промптов. На 32B (work) реальный agent с tools `dsp_search`, `dsp_find`, `read_file`, `grep`.

### 5.4. QdrantStore

Реализовать в `dsp_assistant/retrieval/vector_store.py:QdrantStore`. ~100 строк. Нужно перед переездом на work Debian. Тестировать только когда там будет Qdrant native.

### 5.5. Phase 8: eval harness

Golden set 30-100 Q&A → измерять recall@5, MRR, LLM-judge. Файл `golden_set/qa_v1.jsonl` запланирован но пуст.

### 5.6. Phase 9-10: SFT + QLoRA

Когда наберём ~200 RAG-логов с user_rating ≥ 4 (из таблицы `rag_logs`) — собирать SFT-корпус. Модель уже QLoRA через `train.py` Алекса (есть готовый скрипт в `C:\finetune-env\`).

---

## 6. Критичные правила (из CLAUDE.md Алекса)

- **НИКОГДА** не использовать `pytest`. Только `common.runner.TestRunner` + `SkipTest`.
- **НИКОГДА** `std::cout` / `std::cerr` / `printf` в C++. Только `ConsoleOutput::GetInstance()`.
- **НИКОГДА** упоминать `GPUProfiler` (deprecated, удалён 2026-04-27). Только `ProfilingFacade::BatchRecord()`.
- Ручной вывод профилирования через `GetStats()` + цикл — запрещён. Только `ProfilingFacade::Export*`.
- Файлы тестов Python: имя `t_*.py` (не `test_*.py`).
- Не писать в `.claude/worktrees/*/`.
- Абсолютные Windows-пути в финальном production-коде запрещены — проект едет на Debian.
- Тон с Алексом — «Кодо», по делу, без лести, минимум воды. Эмодзи 1-2 в ответе по делу.

---

*Конец handoff. Если нужны детали — смотри Master Plan, Stack Decisions, Database Schema, MCP Setup Guide. Если нужен полный диалог — он архивируется в Claude Code projects.*
