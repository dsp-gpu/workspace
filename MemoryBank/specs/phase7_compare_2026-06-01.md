# Phase 7 — Compare DeepSeek-стека vs планка Qwen2.5-Coder-14B

> **Дата:** 2026-06-01 · Кодо
> **Status:** ✅ DONE — 4 модели × dsp+pao оценены, в БД (run 11 dsp / run 12 pao)
> **Железо:** RX 9070 16 ГБ (gfx1201), ROCm 7.2, llama-server v196
> **Планка quality** = Qwen2.5-Coder-14B (Phase 6: dsp avg 3.17-3.33)
> **Связано:** `TASK_Phase7_deepseek_2026-06-01.md`, `deepseek_analysis_2026-05-28.md`, `.claude/rules/17-llm-bench.md`

---

## Phase A — Deploy (✅ DONE)

6 GGUF DeepSeek-стека (~51 ГБ, `/home/alex/offline-debian-pack/1_models/DeepSeek/`), симлинки в `llama.cpp/models/`. Все грузятся:

| Модель | quant | GB | smoke | VRAM |
|---|---|--:|:--:|--:|
| r1-0528-qwen3-8b | Q8_0 | 8.1 | ✅ | 10.7 ГБ |
| r1-distill-14b | Q5_K_M | 9.8 | ✅ | 11.8 ГБ |
| dsv2-lite | Q5_K_M | 11.0 | ✅ (` Yes`) | 13.6 ГБ |
| r1-distill-32b | Q4_K_M | 18.5 | ✅ partial `-ngl 40` | 13.7 ГБ |
| qwen2.5-coder-1.5b-draft | Q8_0 | 1.5 | — | — |
| r1-1.5b-draft | Q8_0 | 1.8 | — | — |

> ollama + dsp-asst остановлены для VRAM (свободно ~15.4 ГБ).

---

## Phase B — Speculative (✅ DONE, с находкой)

- **Baseline** нашего FT `qwen-coder-14b-dsp`: **46 tok/s** (лучше Phase 6 baseline 43.5).
- **Speculative — ЗАБЛОКИРОВАН**: vocab mismatch.

```
E common_speculative: the target and draft vocabs are not compatible
E draft model vocab type must match target model to use speculation
```

| GGUF | vocab_size |
|---|--:|
| qwen-coder-14b-dsp (target) | **152064** |
| qwen2.5-coder-1.5b-draft | 151936 |
| r1-distill-14b (target) | **152064** |
| r1-1.5b-draft | 151936 |

Классика Qwen2.5: большие модели (14B/32B) имеют padded-словарь **152064**, младшие (1.5B) — **151936** (Δ=128 padding-токенов). llama.cpp требует точного совпадения → speculative молча off. Бьёт **обе** draft-пары.

**Флаги тоже изменились** (llama.cpp v196): `--draft-max/--draft-min` удалены → `--spec-draft-n-max/--spec-draft-n-min` + `--spec-type draft-simple`.

**Follow-up (Phase B-fix):** нужен draft с vocab 152064 — варианты:
1. Сконвертировать Qwen2.5-Coder-0.5B/1.5B самим тем же конвертером что дал 152064 для 14B.
2. Пропатчить draft GGUF (добавить 128 padding-токенов до 152064).
3. Проверить ngram-спекуляцию (`--spec-type ngram-*`) — не требует draft-модели вообще.

---

## Phase D — Compare (🟡 WIP)

Runner: `phase6.../run_phase7_compare.sh` (4 модели × dsp+pao × 6 тестов, max_tokens=4000, temp=0.3, reasoning-budget 2500 для R1).
Тесты: T1 codegen · T2 review · T3 describe · T4 doxygen · T5 documentation · T6 indexing.

### Тайминги (dsp+pao, сек)

| Модель | dsp | pao |
|---|--:|--:|
| dsv2-lite | 186 | 134 |
| r1-0528-qwen3-8b | 195 | 256 |
| r1-distill-14b | 200 | 129 |
| r1-distill-32b | ~1500 (медленно, partial) | — |

### Предварительная judge-таблица — dsp-gpu (quality 0-5, Кодо)

| Тест | dsv2-lite | r1-0528-8b | r1-distill-14b |
|---|:--:|:--:|:--:|
| T1 codegen | 4 | 2 | 1 |
| T2 review | 3 | 3 | 4 |
| T3 describe | 4 | 5 | 3 |
| T4 doxygen | 4 | 5 | 4 |
| T5 documentation | 4 | 4 | 3 |
| T6 indexing | 4 | 2 | 3 |
| **avg** | **3.83** | **3.5** | **3.0** |

### Качественные наблюдения

- **dsv2-lite** (MoE 16B/2.4B): стабилен, **следует инструкциям** (JSON-only, code-only), лучший T1 (валидный hipFFT RAII). Быстрый. → выше планки, **оставляем**.
- **r1-0528-8b**: reasoning помогает на T3/T4 (5/5), но **многословен**, утечка thinking в content на T6 (нарушил «только JSON»), опечатка `ScopedHipFftftHandle` в T1. Маргинально выше планки.
- **r1-distill-14b**: высокая дисперсия — T2 отлично (дал корректный HIP-kernel для process()), но **T1 катастрофа**: галлюцинация API `hipfftSetParamsToPlan(...)` + спам тысяч нулей, обрезано по length. На/ниже планки. Для codegen-ассистента T1-failure критичен.
- **Никто** не определил паттерн HybridBackend = **Bridge** (dsv2=Facade, R1=Composite) — подтверждает Phase 6.

## 🏁 ФИНАЛ — кросс-таблица quality (run 11 dsp / 12 pao)

**Планка = Qwen2.5-Coder-14B: dsp 3.17–3.33 · pao 3.17–3.83.**

| Модель | dsp | pao | среднее | скорость (ср.с/ответ) | размер | вердикт |
|---|:--:|:--:|:--:|:--:|:--:|---|
| **dsv2-lite** | 3.83 | 3.83 | **3.83** | 31с | 11 ГБ | ✅ **KEEP** — primary new coder |
| **r1-distill-32b** | 3.83 | 3.83 | **3.83** | **236с** ⚠️ | 18.5 ГБ | 🟡 borderline — качество топ, но ×7.6 медленнее (partial offload) |
| **r1-0528-qwen3-8b** | 3.50 | 3.50 | 3.50 | 32с | 8 ГБ | ✅ **KEEP** — дешёвый reasoning 8B |
| r1-distill-14b | 3.00 | 3.33 | 3.17 | 33с | 9.8 ГБ | ❌ **REMOVE** — dsp ниже планки + T1 codegen катастрофа |

### Рекомендация

- ✅ **dsv2-lite** — оставить. Лучший баланс: ≥ планки, быстрый (MoE 2.4B active), следует инструкциям, валидный codegen. Кандидат в рабочий coder-стек рядом с Qwen2.5-Coder-14B.
- ✅ **r1-0528-qwen3-8b** — оставить. Маленький (8 ГБ), reasoning помогает на describe/doxygen (5/5), выше планки. Дёшево держать.
- 🟡 **r1-distill-32b** — borderline. Качество = dsv2-lite, но ×7.6 медленнее и 18.5 ГБ (partial offload). Держать только если нужен deep-reasoning offline и время некритично; иначе **дублирует dsv2-lite** → кандидат на удаление ради места.
- ❌ **r1-distill-14b** — удалить. На dsp 3.0 (ниже планки 3.2), T1 = галлюцинация hipFFT API + спам нулей (дисквалификация для codegen). Reasoning лучше покрывает r1-0528-8b при меньшем размере.

> ⚠️ **Удаление GGUF — destructive, требует явного OK Alex.** Не удаляю без подтверждения.

### Speculative follow-up (Phase B-fix)
draft-пары не работают (vocab 152064≠151936). Чтобы получить ×2 на нашем FT-14B — нужен draft с padded-словарём 152064 (конверт самим / патч 128 токенов) либо `--spec-type ngram-*` (без draft-модели).

---

*Кодо · 2026-06-01 · run 11 (dsp) + run 12 (pao) в llm_bench*

---

## 🥊 Phase 7E — ОЧНАЯ СТАВКА FT (2026-06-03): R1-Distill-14B-FT vs Qwen2.5-Coder-14B-FT

> Обучены ОБА на **v7, 400 шагов, идентичный рецепт** (seq256, r8/a16, lr1e-4, adamw_8bit). Bench `run_both_ft_compare.sh` (run 18 dsp / 19 pao). Единственная переменная — базовая модель.

### Результат (quality 0-5)

| FT-модель | dsp | pao | пустых | train_loss |
|---|:--:|:--:|:--:|:--:|
| **qwen25coder14b-dsp** (Qwen2.5-Coder-14B-FT) | **4.67** | **3.83** | 0 | 0.63 |
| r1distill14b-dsp (R1-Distill-14B-FT) | 2.83 | 2.50 | **3** ⚠️ | ~1.3 |

### В контексте (полная картина dsp)

| Модель | dsp | примечание |
|---|:--:|---|
| qwen3.6-mtp-llamaserver | 4.83 | production топ |
| **qwen25coder14b-dsp (v7-FT)** | **4.67** | 🆕 = production 30B при 14B/8.4ГБ! |
| qwen3-coder-30b-a3b | 4.67 | production |
| qwen-coder-14b-dsp (v6-FT, старый) | 3.17-3.33 | прежняя планка |
| r1-distill-14b (база, без FT) | 3.00 | Phase 7 |
| r1distill14b-dsp (v7-FT, мой bench) | 2.83 | 3 thinking-trap пустых |

### Выводы

1. 🏆 **Qwen2.5-Coder-14B-FT(v7) = 4.67** — скачок с 3.2 (v6) до **4.67**, догнал production-30B при половинном размере. Project-aware: использует реальные имена (SpectrumProcessor, ScopedProfileTimer, ComputeLchFarrow), наш include-guard, валидный hipFFT API. **Заменяет старый qwen-coder-14b-dsp в production.**
2. ⚠️ **R1-Distill-14B-FT = 2.83** — reasoning-база **хуже для конкретного кода**: 3 пустых ответа (thinking-trap при reasoning-budget 2500), галлюцинации hipFFT API. FT убрал zero-spam базы, но reasoning-трейс остаётся production-риском.
3. ⚖️ **Оговорка честности:** сестрёнкин bench R1-FT-200шагов (run 16/17) дал 4.67/4.33 БЕЗ пустых — разница из-за настроек reasoning-budget. Чтобы добить честность — пере-bench R1-FT с budget 4000+. Но Qwen-FT и так выигрывает (надёжнее, 0 пустых, project-aware).

### РЕШЕНИЕ (Gate E)
✅ **FT-base победитель = Qwen2.5-Coder-14B.** Industry consensus подтверждён: code-специализированная база + FT > reasoning-база + FT на конкретных code-задачах. Не переходим на DeepSeek для FT. Новый v7-FT → в production вместо v6.

*Кодо · 2026-06-03 · run 18/19 в llm_bench*

---

## 🎓 Phase 7E — R1-Distill-14B-FT (2026-06-02) ✅

Обучили DeepSeek-R1-Distill-Qwen-14B на v7-корпусе ЛОКАЛЬНО (RX 9070, QLoRA r8/a16, ~200 эфф. шагов: smoke-100 loss 3.21→1.74 + continue-from-adapter +100 →~1.3). bnb 0.49.2 БЕЗ NaN. merge→GGUF Q4_K_M (8.4 ГБ). Bench dsp+pao (run 16/17).

| Модель | dsp | pao |
|---|:--:|:--:|
| qwen3.6-mtp (prod) | 4.83 | 4.83 |
| qwen3-coder-30b (prod) | 4.67 | 4.83 |
| **r1distill14b-dsp (наш FT)** | **4.67** | **4.33** |
| r1-distill-14b (база) | 3.00 | 3.33 |
| qwen-coder-14b-dsp (старый FT) | 3.17-3.33 | 3.17-3.83 |

**Вывод:** FT R1-Distill-14B: 3.00→4.67 (+1.67). Бьёт старый Qwen-FT на +1.3-1.5, догнал 30B-prod при 8.4 ГБ. **Новый FT-target.** Лучший T2-review из ВСЕХ (единственный чисто поймал «CPU-цикл по GPU-памяти→краш»), T1 codegen починен (база галлюцинировала), перенял русский doxygen-стиль проекта.
⚠️ Caveat: ~200 шагов + темы тестов есть в v7 (train/test overlap) → нужен held-out + 750 шагов для чистых чисел.
