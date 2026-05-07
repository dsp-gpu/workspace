# Handoff 2026-05-07 → 12.05 (Radeon 9070 / работа)

> **Закрыто 07.05**: end-to-end pipeline проторён (train → Ollama). Модель слабая.
> **Открыто на 12.05**: full train на 9070 + ROCm. См. `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`.

---

## ✅ Что закрыто 07.05

| Что | Результат |
|---|---|
| `train_simple.py` (без trl) | работает на Win + 2080 Ti |
| Smoke train 15 шагов | ~2 мин ✅ |
| Full train 411 шагов / 3 эпохи | 44 мин, loss 2.45 → 1.18 |
| `inference_test.py` (BASE vs LoRA) | LoRA выучила терминологию (`rocfft`, `hipfft`), не выучила классы |
| `merge_lora` → `convert_hf_to_gguf` → `quantize Q4_K_M` | 4.8 GB GGUF |
| `ollama create qwen3-8b-dsp` | модель в Ollama 5 GB |
| Шпаргалка по метрикам | `cheatsheet_qlora_train_metrics_2026-05-07.md` |

## ❌ Что не получилось / на 12.05

- **Inference в Ollama зацикливается** на повторах (`**Class**: ... **Module**: ...`). Это train-time проблема (r=4 + повторяющиеся YAML заголовки в датасете).
- **VSCode Continue/Cline** — не подключены, ждут нормальной модели.
- **Qwen2.5-Coder параллельно** — TODO для 9070.

---

## 🚀 Команды для старта 12.05 (на работе, Linux + 9070)

```bash
# 1. Перенести с Windows: dataset_enriched.jsonl, train_simple.py, qwen3-8b/
rsync -avz /mnt/win/finetune-env/dataset_enriched.jsonl ~/finetune/
rsync -avz /mnt/win/finetune-env/qwen3-8b/ ~/finetune/qwen3-8b/

# 2. ROCm + bnb окружение
python -m venv ~/finetune/.venv && source ~/finetune/.venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/rocm6.0
pip install transformers peft bitsandbytes datasets accelerate

# 3. Проверка bf16
python -c "import torch; print('bf16:', torch.cuda.is_bf16_supported())"

# 4. Доработать train_simple.py: добавить eval_split + load_best_model_at_end
# (см. TASK_FINETUNE_phase_B_2026-05-12.md)

# 5. Full train (3-4 ч)
python -u train_simple.py \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --bf16 \
  --output-dir ~/finetune/output/full-r16-9070

# 6. Параллельно: Qwen2.5-Coder
huggingface-cli download Qwen/Qwen2.5-Coder-7B --local-dir ~/finetune/qwen2.5-coder-7b
# тренировать с теми же параметрами

# 7. Post-training (на Linux нужен llama.cpp с ROCm)
git clone https://github.com/ggerganov/llama.cpp.git ~/tools/llama.cpp
cd ~/tools/llama.cpp && cmake -B build -DGGML_HIPBLAS=ON && cmake --build build -j

# 8. inference_test → post_training → ollama create → VSCode Continue
```

---

## Состояние файлов

**Готово (Win-машина дома, не трогать до 12.05):**
- `C:/finetune-env/dataset_enriched.jsonl` (1093) — финальный датасет
- `C:/finetune-env/train_simple.py` — без trl, рабочий
- `C:/finetune-env/inference_test.py` — BASE vs LoRA сравнение
- `C:/finetune-env/train_diag.py` — диагностика 1 forward+backward
- `C:/finetune-env/post_training.py` — merge → GGUF → Ollama (4 шага)
- `C:/finetune-env/output/full-r4-2026-05-07/` — LoRA Phase A (для сравнения)
- `C:/finetune-env/output/qwen3-8b-dsp-Q4_K_M.gguf` (4.8 GB) — Phase A модель
- `C:/finetune-env/output/Modelfile_qwen3-8b-dsp_v4` — рабочий Modelfile с правильным TEMPLATE
- `E:/tools/llama.cpp/build/bin/llama-quantize.exe` — готовый бинарник

**В Ollama (Win):**
- `qwen3-8b-dsp:latest` (5 GB) — Phase A, зацикливается, baseline для сравнения

---

## TASK для 12.05

→ `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`

Главные улучшения: r=16, max_seq_len=1024, bf16, eval_split + load_best_model_at_end, опционально dataset cleanup (убрать YAML дубли которые сломали Phase A), Qwen2.5-Coder параллельно.

## Шпаргалка по метрикам

→ `MemoryBank/specs/LLM_and_RAG/cheatsheet_qlora_train_metrics_2026-05-07.md`

Loss / lr / grad_norm / epoch / batch / grad_accum / max_seq_len / lora_r / 4bit / fp16 — всё расписано + грабли которые уже прошли.

---

**Главный вывод 07.05:** инфраструктура fine-tune готова end-to-end. На 12.05 — только полноценный train на нормальной железке + интеграция в VSCode.
