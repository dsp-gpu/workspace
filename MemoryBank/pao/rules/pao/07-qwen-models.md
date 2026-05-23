# 07 — Qwen Models Policy (14B/Coder-14B/35B)

## Модели и роли

| Модель | Размер VRAM | Роль | Inference | QLoRA |
|--------|-------------|------|-----------|-------|
| **Qwen2.5-Coder-14B Q4_K_M** | ~10 GB | **Filler** | ✅ | ✅ (Alex проверил) |
| **Qwen3-14B Q4_K_M** | ~10 GB | Альтернативный filler (для compare) | ✅ | ✅ |
| **Qwen3.6-35B Q4_K_M** | ~19 GB (47 GB ROCm-load!) | **Judge** (frozen) | ✅ со swap | ❌ |
| BGE-M3 | ~3 GB | Embedder | ✅ | — |
| bge-reranker-v2-m3 | ~1 GB | Reranker | ✅ | — |

## Model Router

`rag_pao/core/llm_serving/model_router.py`:
```python
class ModelRouter:
    FILLER = "qwen2.5-coder:14b-q4_K_M"
    JUDGE  = "qwen3.6:35b-q4_K_M"

    # Pin по sha256 для воспроизводимости (R6)
    FILLER_SHA = "sha256:abc123..."
    JUDGE_SHA  = "sha256:def456..."

    def get(self, role: Literal["filler", "judge"]) -> LLMClient:
        ...
```

## Queue swap для 35B Judge

35B alone = 19 GB → не влезает с 14B Filler (вместе 29 GB > 16 GB VRAM).

**Решение**: queue swap.
- Когда mentor вызывает `/run_judge` → выгружаем Filler, грузим Judge, делаем оценку, возвращаем Filler.
- Latency +5-10 сек на swap.
- Для batch'а из 30 классов: ~5 минут overhead.

## Temperature defaults

| Роль | Temperature |
|------|-------------|
| Filler | 0.3 (немного креативности для doxygen) |
| Judge | 0.0 (детерминированно — для воспроизводимости score) |
| Oracle (mentor side, Claude) | 0.2 |
| Reviewer (mentor side, Claude) | 0.0 |
| Critic (mentor side, Claude) | 0.5 |

## Backend

| Backend | Когда |
|---------|-------|
| `ollama` | dev (laptop) |
| `vllm` | prod (server, для batch throughput) |

Переключение через `config/stack.{dev,prod}.json`:
```json
"qwen_models": {
  "filler": { "name": "...", "backend": "ollama" }   // или vllm
}
```

## Pin модели

При смене Qwen-revision — обязательно ре-валидация на `golden_set_L3 + Q1_Q10_acceptance`.

```python
# при init модели
if get_model_sha256(model_name) != PINNED_SHA[model_name]:
    raise ModelDriftError(f"Model {model_name} sha changed — re-validate!")
```

## QLoRA после Phase 09

После train (см. `MemoryBank/specs/03_phases_v0.3.md §9`):
- `adapters/<target>-qwen-coder-14b-lora-v1/` → подгружается через `peft.PeftModel.from_pretrained(base, adapter)`
- Альтернатива: merge LoRA → GGUF → Ollama `ollama create qwen-coder-14b-<target>-v1`

## Где живут модели

```
~/.ollama/models/                              # ollama
/srv/models/                                    # vllm prod
adapters/<target>-qwen-coder-14b-lora-v1/      # QLoRA adapters
```
