# Handoff: сестричке для продолжения 2026-05-07 вечер → 2026-05-08

> Старт: предыдущая Кодо потратила контекст на доделку Phase A (push, RAG re-ingest, Qwen2.5-Coder скрипты).
> Цель: довести «исследуем умную систему» до конца — train Qwen2.5-Coder + сравнение с qwen3-8b-dsp + Continue/Cline в VSCode.

---

## ✅ Что готово к моменту твоего старта

1. **QLoRA Phase A end-to-end** — `qwen3-8b-dsp` в Ollama (5 GB, Q4_K_M). Качество слабое, в Ollama зацикливается, но pipeline проторен.
2. **Continue config.yaml** — добавлен `dsp-asst` MCP-сервер (`C:\finetune-env\.venv\Scripts\dsp-asst.exe mcp`).
3. **dsp-asst HTTP** — работает на :7821, RAG живой (`dsp_search('FFTProcessorROCm')` → rerank score 0.97).
4. **llama.cpp** — готовые бинарники в `E:\tools\llama.cpp\build\bin\` + `LLAMA_CPP_DIR` env.
5. **Все 10 репо запушены на GitHub** — workspace HEAD `35865f9`.
6. **Documentation в MemoryBank**: sessions, changelog, cheatsheet, TASK_FINETUNE_phase_B_2026-05-12, этот handoff.

## 📋 Подготовлено для запуска (Alex запустит сам)

| Файл | Назначение | Команда |
|------|-----------|---------|
| `C:\finetune-env\re_ingest_all.ps1` | Full RAG re-ingest (idempotent) | `cd C:\finetune-env; .\re_ingest_all.ps1` |
| `C:\finetune-env\download_qwen25_coder.ps1` | Скачка Qwen2.5-Coder-7B (~14 GB, ~30-60 мин) | `.\download_qwen25_coder.ps1` |
| `C:\finetune-env\train_qwen25_coder.py` | Train с тем же датасетом и форматом промпта что у qwen3-8b-dsp | `python -u train_qwen25_coder.py` |

## 🎯 Что должно быть сделано Кодо-сестричкой

### Этап 1 — проверить Continue MCP (5 мин)

Alex должен был перезагрузить VSCode (`Ctrl+Shift+P → Developer: Reload Window`). Спросить статус:
- В Continue Chat виден ли `@dsp-asst`?
- Если да — попросить Alex написать в Continue: `@dsp-asst найди FFTProcessorROCm` → показывает результаты?
- Если нет — проверить логи Continue (View → Output → Continue), возможно опечатка в `C:\Users\user\.continue\config.yaml`.

### Этап 2 — проверить статус Qwen2.5-Coder download

Alex запустил `download_qwen25_coder.ps1` в фоне? Проверить:
```powershell
ls C:\finetune-env\qwen2.5-coder-7b\ | measure -Property Length -Sum
# должно быть ~14 GB; если меньше — ещё качается или упало
```

### Этап 3 — train Qwen2.5-Coder (если базовая модель скачалась)

```powershell
cd C:\finetune-env
python -u train_qwen25_coder.py --max-seq-len 384 --epochs 3 --lora-r 4 --grad-accum 8
```

Ожидание: ~50-70 мин на 2080 Ti (7B чуть легче 8B).

После train — `inference_test.py` параметризован, прогнать на новом адаптере:
```powershell
python -u inference_test.py --model C:\finetune-env\qwen2.5-coder-7b --adapter C:\finetune-env\output\qwen25-coder-7b-dsp
```

Сравнить ответы с qwen3-8b-dsp (старые ответы в `MemoryBank/sessions/2026-05-07.md`):
- Лучше ли понимает namespace::Class?
- Лучше ли по C++ синтаксису?
- Меньше ли зацикливания?

### Этап 4 — post-training pipeline (если inference Qwen2.5 ОК)

```powershell
python -u post_training.py `
  --lora-dir C:\finetune-env\output\qwen25-coder-7b-dsp `
  --base-model C:\finetune-env\qwen2.5-coder-7b `
  --output-merged C:\finetune-env\output\qwen25-coder-merged `
  --gguf-out C:\finetune-env\output\qwen25-coder-7b-dsp-Q4_K_M.gguf `
  --ollama-name qwen25-coder-7b-dsp `
  --llama-cpp E:\tools\llama.cpp
```

**ВАЖНО**: Modelfile для Qwen2.5-Coder будет **тот же что для qwen3** (наш формат `### Задача:`). НЕ родной FIM-формат Qwen2.5-Coder — это для autocomplete, а у нас instruction tuning.

### Этап 5 — обновить Continue config

Добавить в `C:\Users\user\.continue\config.yaml` третью модель:
```yaml
  - name: Qwen2.5-Coder DSP (chat)
    provider: ollama
    model: qwen25-coder-7b-dsp
    apiBase: http://localhost:11434
    roles:
      - chat
      - edit
```

И сравнить в реальном использовании: Qwen3 vs Qwen2.5-Coder DSP.

### Этап 6 — финал сессии

Записать в:
- `MemoryBank/sessions/2026-05-08.md` — итог дня
- `MemoryBank/changelog/2026-05.md` — одна строка
- Push workspace (`git -C e:/DSP-GPU push origin main`)

Если получился рабочий Qwen2.5-Coder DSP — он становится **default chat model** в Continue до 12.05, когда на 9070 переучим в r=16.

---

## ⚠️ Грабли которые могут возникнуть

1. **Triton долгая компиляция** на первом шаге train — норма (см. cheatsheet).
2. **VRAM может не хватить** на max_seq_len=512 + r=8 на 11 GB — снижай до 384/r=4 (как у qwen3).
3. **download_qwen25_coder упадёт** если HF Hub требует token → `huggingface-cli login` сначала.
4. **Continue не видит dsp-asst MCP** — посмотреть `View → Output → Continue` логи. Часто причина — опечатка пути в config.yaml.
5. **Cline + 8B модель** = плохо работает (Cline сам предупреждает). Continue — основной инструмент, Cline — на 9070 с моделью 14B+.

---

## 📌 Точки опоры (что прочитать перед стартом)

1. `MemoryBank/sessions/2026-05-07.md` — что сделано Phase A
2. `MemoryBank/specs/LLM_and_RAG/cheatsheet_qlora_train_metrics_2026-05-07.md` — метрики loss/lr/grad + грабли
3. `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md` — план на 9070
4. `MemoryBank/specs/LLM_and_RAG/_session_handoff_2026-05-07.md` — общий handoff (это файл — расширение)

---

**Главное: Alex исследует "умную систему" — не просто хочет работающий чат-бот, а понять что лучше работает на DSP-GPU датасете. Сравнение Qwen3 vs Qwen2.5-Coder — критически важно для выбора base model на работе 12.05.**
