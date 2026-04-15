# 📨 Prompt: Continue core+spectrum follow-ups on real GPU

> **Дата создания**: 2026-04-15
> **Для использования в сессии**: 2026-04-16 (или позже — когда будет Linux+GPU)
> **Сгенерирован из**: [TEMPLATE_continue_review.md](TEMPLATE_continue_review.md)

---

## 🎯 Что осталось

| ID | Задача | Зачем нужен GPU |
|----|--------|-----------------|
| **T0** | Baseline build на текущем HEAD | убедиться что core+spectrum собираются ДО проверки правок |
| **T5** | Final build + ctest + smoke-leak-test | проверить что правки не сломали регрессии + убедиться что утечек hipEvent_t больше нет |
| **3 коммита** | Атомарные коммиты T1 / T2+T3 / T4 | git-операции, готовые тексты в changelog |
| **git push** | — | ⚠️ **только после OK Alex** |

---

## 📨 Промпт для копипаста

```
Кодо, привет! Продолжаем с того места, где закончили 2026-04-15.

Контекст:
- В прошлой сессии я применил ScopedHipEvent в 4 файлах spectrum
  (закрыл ~38 утечек hipEvent_t — включая критический leak в
  spectrum_processor_rocm.cpp где hipEventDestroy не было вообще).
- Также: обновил Doxygen у SpectrumProcessorFactory, удалил shim
  fft_processor_types.hpp, добавил @note в complex_to_mag_phase_rocm.hpp.
- Детали и готовые коммит-сообщения в:
  MemoryBank/changelog/2026-04-15_core_spectrum_followups.md
- Детальный план в:
  MemoryBank/tasks/TASK_Core_Spectrum_Review_2026-04-15.md
- Железо теперь доступно: Linux + AMD Radeon 9070 (gfx1201) + ROCm 7.2.

Задача сегодня: закрыть T0 (baseline build) и T5 (final build + tests +
commits). На реальном GPU.

Прочитай сначала:
1. MemoryBank/MASTER_INDEX.md
2. MemoryBank/tasks/IN_PROGRESS.md
3. MemoryBank/changelog/2026-04-15_core_spectrum_followups.md  ← главное
4. MemoryBank/tasks/TASK_Core_Spectrum_Review_2026-04-15.md    ← план

Потом последовательно:
1. T0 baseline: перед тем как применить правки, зафиксируй что core+spectrum
   СЕЙЧАС (HEAD) собираются. Логи в /tmp/*_baseline_*.log.
2. T5 финал: сборка после правок, diff baseline vs final логов (ожидаем
   0 новых warnings/errors), ctest --preset debian-local-dev, smoke-тест
   утечек через rocm-smi или hip_tracker (HIP_LAUNCH_BLOCKING=1).
3. 3 атомарных коммита по готовым сообщениям из changelog (T1 / T2+T3 / T4).

⚠️ git push и git tag — только после моего явного OK.
⚠️ CMake не правь без спроса (если потребуется — через DIFF-preview).
⚠️ Windows не поддерживается на main-ветке (ROCm/Linux only).

Поехали! 🚀
```

---

## 📍 Что Кодо должна прочитать сама (уже в промпте)

1. `MemoryBank/MASTER_INDEX.md` — навигация
2. `MemoryBank/tasks/IN_PROGRESS.md` — текущее состояние проекта
3. `MemoryBank/changelog/2026-04-15_core_spectrum_followups.md` ← **главный документ**
4. `MemoryBank/tasks/TASK_Core_Spectrum_Review_2026-04-15.md` — детальный план T0-T5

## 🎯 Критерии готовности (Definition of Done)

- [ ] `core` + `spectrum` собираются на Linux+ROCm чисто
- [ ] ctest: все ранее проходящие тесты проходят (без регрессий)
- [ ] rocm-smi подтверждает: hipEvent_t не накапливаются после 10000 прогонов ProcessBatch
- [ ] 3 локальных коммита созданы
- [ ] Alex дал OK → `git push`

---

*Created: 2026-04-15 | Кодо (AI Assistant)*
