# 08 — Ollama vs vLLM (Backend Switching)

## Когда что

| Backend | Когда | Profile |
|---------|-------|---------|
| **Ollama** | dev (laptop), single-query latency не критична | `stack.dev.json` |
| **vLLM** | prod (server), batch throughput критичен | `stack.prod.json` |

## Различия

| Аспект | Ollama | vLLM |
|--------|--------|------|
| Установка | `ollama` бинарник | Python wheel (ROCm-build) |
| Прогрев | мгновенный (ленивая загрузка) | ~30 сек первый запрос |
| Single query latency | средняя | средняя |
| **Batch throughput** | **низкий** | **высокий (4-10× vs ollama)** |
| Память | per-request load/unload | model резидентно |
| Quantization | Q4_K_M / Q4_K_S / Q5_K_M | Q4_K_M / FP16 |
| API | OpenAI-compatible (port 11434) | OpenAI-compatible (port 8000) |

## Клиенты

```python
# rag_pao/core/llm_serving/clients/ollama_client.py
from ollama import Client as OllamaClient

class OllamaFiller:
    def __init__(self, config):
        self.client = OllamaClient(host=config.url)
        self.model = config.model
    def generate(self, prompt: str, **kwargs) -> str: ...

# rag_pao/core/llm_serving/clients/vllm_client.py
from openai import OpenAI

class VLLMFiller:
    def __init__(self, config):
        self.client = OpenAI(base_url=config.endpoint, api_key="EMPTY")
        self.model = config.model
    def generate(self, prompt: str, **kwargs) -> str: ...
```

## Один интерфейс (Liskov)

```python
# rag_pao/core/llm_serving/clients/base.py
class LLMClient(Protocol):
    def generate(self, prompt: str, **kwargs) -> str: ...

# model_router.py выбирает по config.backend:
if config.backend == "ollama":
    return OllamaFiller(config)
elif config.backend == "vllm":
    return VLLMFiller(config)
```

## Установка vLLM на ROCm

```bash
# В prod (Ubuntu 10.10.4.105):
python -m venv venv-vllm
source venv-vllm/bin/activate
pip install vllm-rocm                          # special ROCm build
# или из исходников (если wheel не работает на gfx1201):
git clone https://github.com/vllm-project/vllm
cd vllm && ROCM_VERSION=7.2 pip install -e .
```

## Установка Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:14b-q4_K_M
ollama pull qwen3.6:35b-q4_K_M
```

## Switch backend в runtime

```bash
# Через env override:
export RAGCTL_STAGE=prod_ubuntu   # → grabbing stack.prod.json
```

`stack.dev.json` имеет `"backend": "ollama"`, `stack.prod.json` имеет `"backend": "vllm"`.

## Запреты

- НЕ запускать ollama и vLLM одновременно с одной моделью — конфликт VRAM
- НЕ использовать ollama для batch > 50 — будет медленно
- НЕ использовать vLLM для single-shot dev — overhead инициализации не оправдан
