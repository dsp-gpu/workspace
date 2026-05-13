#!/usr/bin/env python3
# ============================================================================
# embed_server.py — локальный FastAPI embedding-сервер на bge-m3 ONNX
#
# ЧТО:    HTTP-сервер, OpenAI-совместимый /v1/embeddings endpoint.
#         Использует bge-m3 ONNX модель из offline-pack для индексации
#         кодовой базы DSP-GPU через Continue VSCode extension.
#
# ЗАЧЕМ:  Заменить медленный встроенный transformers.js в Continue на быстрый
#         нативный onnxruntime — индексация @codebase в 10x быстрее.
#
# МОДЕЛЬ: bge-m3 (multilingual RU+EN, 1024-dim embeddings, 8K context)
#         Источник: /home/alex/offline-debian-pack/1_models/bge-m3/onnx/
#
# ИСПОЛЬЗОВАНИЕ:
#   # standalone:
#   python3 embed_server.py --port 8765
#
#   # через systemd:
#   systemctl --user start embed.service
#
#   # тест:
#   curl -s http://localhost:8765/health
#   curl -s -X POST http://localhost:8765/v1/embeddings \
#       -H 'content-type: application/json' \
#       -d '{"model":"bge-m3","input":["hello","привет"]}' | jq .data[0].embedding[:5]
#
# CONTINUE CONFIG (~/.continue/config.yaml):
#   models:
#     - name: bge-m3 (local)
#       provider: openai
#       model: bge-m3
#       apiBase: http://localhost:8765/v1
#       apiKey: dummy
#       roles: [embed]
# ============================================================================

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import List, Union

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import onnxruntime as ort
except ImportError:
    sys.exit("❌ onnxruntime not installed. pip install --no-index --find-links "
             "/home/alex/offline-debian-pack/3_python_wheels onnxruntime")

try:
    from tokenizers import Tokenizer
except ImportError:
    sys.exit("❌ tokenizers not installed. Должен быть в offline-pack/3_python_wheels/")

# ── Параметры ────────────────────────────────────────────────────────────────
MODEL_DIR = os.environ.get(
    "BGE_M3_MODEL_DIR",
    "/home/alex/offline-debian-pack/1_models/bge-m3"
)
MAX_LENGTH = 8192  # bge-m3 supports up to 8K tokens
BATCH_SIZE = 32

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("embed_server")


# ── Pydantic schemas ─────────────────────────────────────────────────────────
class EmbeddingRequest(BaseModel):
    """OpenAI-compatible request schema."""
    model: str = Field(default="bge-m3")
    input: Union[str, List[str]]
    encoding_format: str = Field(default="float")  # OpenAI param, ignored


class EmbeddingData(BaseModel):
    object: str = "embedding"
    index: int
    embedding: List[float]


class EmbeddingUsage(BaseModel):
    prompt_tokens: int
    total_tokens: int


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[EmbeddingData]
    model: str
    usage: EmbeddingUsage


# ── Engine ──────────────────────────────────────────────────────────────────
class BgeM3Engine:
    """ONNX runtime + tokenizer wrapper для bge-m3."""

    def __init__(self, model_dir: str):
        model_dir = Path(model_dir)
        log.info(f"Loading bge-m3 from {model_dir}")

        # ONNX model
        onnx_path = model_dir / "onnx" / "model.onnx"
        if not onnx_path.exists():
            raise FileNotFoundError(f"ONNX model not found: {onnx_path}")

        # CPU provider — стабильный. ROCm провайдер нестабилен на RDNA4 (gfx1201).
        # Для embeddings 32-batch CPU даёт ~50ms — приемлемо для индексации.
        providers = ["CPUExecutionProvider"]
        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = min(8, os.cpu_count() or 4)
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        t0 = time.time()
        self.session = ort.InferenceSession(
            str(onnx_path), sess_options=sess_opts, providers=providers
        )
        log.info(f"ONNX session loaded in {time.time() - t0:.1f}s")

        # Tokenizer
        tokenizer_path = model_dir / "tokenizer.json"
        if not tokenizer_path.exists():
            raise FileNotFoundError(f"Tokenizer not found: {tokenizer_path}")
        self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
        log.info("Tokenizer loaded")

        # Determine ONNX input names dynamically (bge-m3 has input_ids, attention_mask)
        self.input_names = [inp.name for inp in self.session.get_inputs()]
        log.info(f"ONNX inputs: {self.input_names}")

    def _tokenize(self, texts: List[str]) -> dict:
        """Tokenize batch + pad to longest in batch (up to MAX_LENGTH)."""
        encodings = self.tokenizer.encode_batch(texts)
        max_len = min(MAX_LENGTH, max(len(e.ids) for e in encodings))

        input_ids = np.zeros((len(texts), max_len), dtype=np.int64)
        attention_mask = np.zeros((len(texts), max_len), dtype=np.int64)

        for i, enc in enumerate(encodings):
            ids = enc.ids[:max_len]
            mask = enc.attention_mask[:max_len]
            input_ids[i, :len(ids)] = ids
            attention_mask[i, :len(mask)] = mask

        return {"input_ids": input_ids, "attention_mask": attention_mask}

    @staticmethod
    def _mean_pool(last_hidden: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
        """Mean pooling с маской (bge-m3 standard)."""
        mask = attention_mask[..., None].astype(np.float32)
        summed = (last_hidden * mask).sum(axis=1)
        counts = np.clip(mask.sum(axis=1), a_min=1e-9, a_max=None)
        return summed / counts

    @staticmethod
    def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        return vectors / np.clip(norms, a_min=1e-12, a_max=None)

    def embed(self, texts: List[str]) -> tuple[np.ndarray, int]:
        """Returns (embeddings [N, 1024], total_token_count)."""
        if not texts:
            return np.zeros((0, 1024), dtype=np.float32), 0

        all_embeds = []
        total_tokens = 0

        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            inputs = self._tokenize(batch)
            total_tokens += int(inputs["attention_mask"].sum())

            # ONNX inference — pass only inputs the model expects
            ort_inputs = {k: v for k, v in inputs.items() if k in self.input_names}
            outputs = self.session.run(None, ort_inputs)
            last_hidden = outputs[0]  # [B, T, 1024]

            pooled = self._mean_pool(last_hidden, inputs["attention_mask"])
            normalized = self._l2_normalize(pooled)
            all_embeds.append(normalized)

        return np.concatenate(all_embeds, axis=0), total_tokens


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="bge-m3 Embedding Server", version="1.0.0")
engine: BgeM3Engine | None = None


@app.on_event("startup")
def startup():
    global engine
    engine = BgeM3Engine(MODEL_DIR)
    log.info("Server ready")


@app.get("/health")
def health():
    return {
        "status": "ok" if engine is not None else "loading",
        "model": "bge-m3",
        "dim": 1024,
        "max_length": MAX_LENGTH,
    }


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
def embeddings(req: EmbeddingRequest):
    if engine is None:
        raise HTTPException(503, "Engine not loaded")

    texts = [req.input] if isinstance(req.input, str) else req.input
    if not texts:
        raise HTTPException(400, "Empty input")

    t0 = time.time()
    vectors, total_tokens = engine.embed(texts)
    elapsed = (time.time() - t0) * 1000
    log.info(f"Embedded {len(texts)} texts in {elapsed:.0f}ms ({total_tokens} tokens)")

    return EmbeddingResponse(
        data=[
            EmbeddingData(index=i, embedding=vectors[i].tolist())
            for i in range(len(texts))
        ],
        model=req.model,
        usage=EmbeddingUsage(prompt_tokens=total_tokens, total_tokens=total_tokens),
    )


# ── Entrypoint ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="bge-m3 local embedding server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model-dir", default=MODEL_DIR,
                        help="Directory with bge-m3 ONNX + tokenizer.json")
    args = parser.parse_args()

    MODEL_DIR = args.model_dir

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
