"""
TASK_RAG_02 — создание Qdrant коллекции `dsp_gpu_rag_v1`.

Запуск (PowerShell, из C:\\finetune-env с активным venv):
    python -m MemoryBank.specs.LLM_and_RAG.configs.qdrant_create_rag_collection

Или напрямую:
    python <path>/qdrant_create_rag_collection.py [--endpoint http://localhost:6333] [--recreate]
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance,
        HnswConfigDiff,
        PayloadSchemaType,
        VectorParams,
    )
except ImportError:
    print("ERROR: qdrant-client не установлен. Сделай: uv pip install qdrant-client")
    sys.exit(1)


COLLECTION_NAME = "dsp_gpu_rag_v1"
VECTOR_SIZE = 1024  # BGE-M3
DEFAULT_ENDPOINT = "http://localhost:6333"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    p.add_argument(
        "--recreate",
        action="store_true",
        help="Удалить коллекцию если уже есть и создать заново",
    )
    args = p.parse_args()

    qdrant = QdrantClient(url=args.endpoint, timeout=10)

    existing = {c.name for c in qdrant.get_collections().collections}
    if COLLECTION_NAME in existing:
        if args.recreate:
            print(f"[recreate] Удаляю существующую '{COLLECTION_NAME}'...")
            qdrant.delete_collection(COLLECTION_NAME)
        else:
            print(f"OK: коллекция '{COLLECTION_NAME}' уже существует. Используй --recreate чтобы пересоздать.")
            print_status(qdrant)
            return 0

    print(f"Создаю коллекцию '{COLLECTION_NAME}' на {args.endpoint}...")
    qdrant.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
    )

    print("Создаю payload-индексы...")
    qdrant.create_payload_index(COLLECTION_NAME, "target_table", PayloadSchemaType.KEYWORD)
    qdrant.create_payload_index(COLLECTION_NAME, "repo", PayloadSchemaType.KEYWORD)

    print(f"OK: коллекция '{COLLECTION_NAME}' создана с payload-индексами по target_table + repo.")
    print_status(qdrant)
    return 0


def print_status(qdrant: QdrantClient) -> None:
    info: Any = qdrant.get_collection(COLLECTION_NAME)
    print(f"  vectors_count: {info.vectors_count}")
    print(f"  points_count:  {info.points_count}")
    print(f"  config:        size={VECTOR_SIZE}, distance=Cosine, hnsw m=16 ef_construct=200")


if __name__ == "__main__":
    sys.exit(main())
