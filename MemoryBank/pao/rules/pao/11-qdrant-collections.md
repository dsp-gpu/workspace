# 11 — Qdrant Collections (per-target)

## Collections

| Collection | Назначение | Vector size | Distance |
|------------|-----------|-------------|----------|
| `dsp_gpu_v1` | существующий (DSP-GPU) | 1024 | Cosine |
| `mentor_v1` | rag-mentor (методика + golden_sets) | 1024 | Cosine |
| `<target>_v1` per target | rag-pao | 1024 | Cosine |

## Vector source

**BGE-M3** (`BAAI/bge-m3`):
- dim = 1024
- multilingual (ru + en + zh)
- 8K context (для chunks)
- normalize: True

## Init

```python
# rag_pao/pao_db/qdrant_bootstrap.py
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance

client = QdrantClient(url=ENV.QDRANT_URL)

client.create_collection(
    collection_name=f"{target}_v1",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    optimizers_config={"default_segment_number": 2},
    hnsw_config={"m": 16, "ef_construct": 100}
)
```

## Payload schema

Каждая точка:
```json
{
  "id": "<UUIDv5>",
  "vector": [...1024 floats...],
  "payload": {
    "layer": "L0|L1|L2|L3|L3b|L4",
    "target": "pao_contrib",
    "class_fqn": "boost::filesystem::path",
    "method_signature": "path::is_absolute() const",
    "file_path": "contrib/boost/libs/filesystem/include/boost/filesystem/path.hpp",
    "license": "BSL-1.0",
    "nda_level": "open",
    "chunk_type": "doxygen|symbol|usecase|test_case",
    "source": "L2_libclang",
    "created": "2026-05-25T..."
  }
}
```

## UUIDv5 (стабильные ID)

```python
import uuid
def chunk_id(target, layer, fqn, chunk_type):
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"{target}|{layer}|{fqn}|{chunk_type}"
    )
```

→ один и тот же chunk при re-index имеет тот же ID (incremental update).

## Filters

```python
client.search(
    collection_name="pao_contrib_v1",
    query_vector=...,
    query_filter=Filter(must=[
        FieldCondition(key="layer", match=MatchValue(value="L3")),
        FieldCondition(key="license", match=MatchAny(any=["BSL-1.0", "MIT"])),
        FieldCondition(key="nda_level", match=MatchValue(value="open")),
    ]),
    limit=10
)
```

## Когда новая collection

- Новый target → `<new_target>_v1`
- Embedder сменили (BGE-M3 → другой dim) → `<target>_v2` (старая остаётся для compare)
- НЕ создавать новую при простой переиндексации

## Backup

```bash
# Snapshot:
curl -X POST http://localhost:6333/collections/pao_contrib_v1/snapshots
```

Каждую неделю + manual перед Phase 09 train.

## Запреты

- НЕ менять vector_size в существующей collection (это пересоздание)
- НЕ держать FP32 (используем FP16 internally для memory)
- НЕ удалять collection без snapshot
