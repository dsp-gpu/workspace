# TASK_RAG_telemetry — popularity boost через TestRunner usage_stats

> **Этап:** CONTEXT-FUEL (C10) · **Приоритет:** 🟡 P2 · **Effort:** ~1 ч · **Зависимости:** TestRunner::OnTestComplete (после `TASK_validators_linalg_pilot_2026-05-04`)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Telemetry-driven boost в retrieval: живые классы (часто прогоняются через тесты) выходят впереди dead-кода.

**Принцип:**
```
score_final = score_rerank * (1 + 0.1*log1p(calls_total))
```

Без телеметрии RAG ранжирует одинаково и `FFTProcessorROCm` (вызывается 1000 раз) и `LegacyFFTV1` (никогда).

## 📋 Подэтапы

### 1. Schema (~15 мин)

`dsp_assistant/migrations/2026-05-08_usage_stats.sql`:

```sql
CREATE TABLE rag_dsp.usage_stats (
    symbol_id      BIGINT PRIMARY KEY REFERENCES rag_dsp.symbols(id) ON DELETE CASCADE,
    calls_total    BIGINT DEFAULT 0,
    last_called    TIMESTAMPTZ,
    avg_latency_ms DOUBLE PRECISION,
    error_rate     DOUBLE PRECISION DEFAULT 0
);

CREATE INDEX idx_usage_stats_calls ON rag_dsp.usage_stats (calls_total DESC);
```

### 2. Hook в `gpu_test_utils::TestRunner::OnTestComplete()` (~30 мин)

> **Зависимость:** TestRunner::OnTestComplete — это callback в `core/test_utils/test_runner.hpp`. Сейчас его нет (см. `TASK_validators_linalg_pilot_2026-05-04` — там `linalg/tests` без TestRunner). Этот TASK включается **после** того, как `OnTestComplete` появится в core.

В core/test_utils добавить (если нет):
```cpp
void TestRunner::OnTestComplete(const TestResult& r) {
    // POST на dsp-asst HTTP :7821/usage_stats
    // payload: {symbol_fqn, duration_ms, passed: bool}
}
```

В `dsp-asst HTTP server`:
```python
@app.post("/usage_stats")
async def update_usage(payload: dict):
    symbol_id = resolve_fqn(payload["symbol_fqn"])
    await db.execute("""
        INSERT INTO rag_dsp.usage_stats (symbol_id, calls_total, last_called, avg_latency_ms, error_rate)
        VALUES ($1, 1, now(), $2, $3)
        ON CONFLICT (symbol_id) DO UPDATE SET
            calls_total = usage_stats.calls_total + 1,
            last_called = now(),
            avg_latency_ms = (usage_stats.avg_latency_ms * usage_stats.calls_total + $2) / (usage_stats.calls_total + 1),
            error_rate = (usage_stats.error_rate * usage_stats.calls_total + $3) / (usage_stats.calls_total + 1)
    """, symbol_id, payload["duration_ms"], 0 if payload["passed"] else 1)
```

### 3. Popularity boost в retrieval (~15 мин)

`dsp_assistant/retrieval/rag_hybrid.py` — после rerank:

```python
def apply_popularity_boost(results: list[Hit]) -> list[Hit]:
    for hit in results:
        stats = db.fetch_one("SELECT calls_total FROM rag_dsp.usage_stats WHERE symbol_id = %s", hit.symbol_id)
        if stats:
            hit.score *= (1 + 0.1 * math.log1p(stats.calls_total))
    return sorted(results, key=lambda h: h.score, reverse=True)
```

Feature flag: `dsp_search(..., popularity_boost=True)` default `True`.

## ✅ DoD

- [ ] `rag_dsp.usage_stats` создана и индекс
- [ ] `TestRunner::OnTestComplete()` шлёт POST на `:7821/usage_stats`
- [ ] HTTP endpoint обновляет статистику (UPSERT)
- [ ] `popularity_boost=True` поднимает живые классы в top-5
- [ ] Smoke-eval: после прогона 50 тестов FFTProcessorROCm выходит выше LegacyFFTV1 (если оба в результатах)
- [ ] Запись в sessions

## ⚠️ Зависимость от validators-pilot

`TestRunner::OnTestComplete` callback должен быть добавлен **до** этого TASK. Это ~10-15 минут работы в `core/test_utils/test_runner.hpp` — может быть сделано как часть `TASK_validators_linalg_pilot_2026-05-04` (Phase B) или отдельно.

Если этого нет — TASK_RAG_telemetry **блокирован** на момент 12.05 → переносим в Phase B+.

## Артефакты

- `dsp_assistant/migrations/2026-05-08_usage_stats.sql`
- `dsp_assistant/server/api.py` — POST `/usage_stats`
- `dsp_assistant/retrieval/rag_hybrid.py` — popularity boost
- `core/test_utils/test_runner.hpp` — `OnTestComplete()` (опц., если ещё нет)

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Зависимость: `TASK_validators_linalg_pilot_2026-05-04.md` (TestRunner)
- Spec 13 §3.11 — Telemetry

*Maintained by: Кодо · 2026-05-08*
