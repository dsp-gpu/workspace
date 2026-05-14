# TASK — `SnrEstimationConfig::search_full_spectrum` — пересмотреть/deprecate

> **Создано**: 2026-05-14 (после V2 rollout миграции stats тестов + 7/7 SNR PASS)
> **Статус**: 📋 backlog (не блокер, никакой regress'ии нет)
> **Effort**: ~1-2 ч (документация + опц. deprecate API)
> **Платформа**: cross-platform (header-only change)

---

## Контекст

Поле `SnrEstimationConfig::search_full_spectrum`
(`stats/include/dsp/stats/statistics_types.hpp:190`) управляет диапазоном
CA-CFAR поиска пика:

| Значение | Что делает в kernel |
|----------|---------------------|
| `true` (default) | `nFFT` пробрасывается полностью → argmax в [0..nFFT) |
| `false` | передаётся `nFFT/2` → argmax в [0..nFFT/2) |

Реализация (kernel `peak_cfar`, caller `SnrEstimatorOp::ExecutePeakCfar`):
**работает корректно** — параметр прокидывается, kernel честно ищет в
заданном диапазоне. Это **не баг**.

## Зачем deprecate / пересмотр

Использование `search_full_spectrum=false` для radar — **редко осмысленно**:

1. **Знак Doppler неизвестен заранее** — цель может быть на любой стороне FFT.
2. **Aliasing после decimation** (`step_samples > 1`) — частоты ≥ fs/2
   переезжают в положительную половину спектра. Half-search их всё равно
   находит → ожидаемое "обрезание" не работает (см. бывший
   `test_03_negative_freq[half]`, удалён 2026-05-14 как anti-pattern).
3. **Скорости почти не даёт** — argmax — O(N), 2× ускорение на CFAR не
   стоит риска пропустить цель.

То есть параметр сохранён как **legacy backward-compat hook**, но в новом
коде использоваться не должен.

## Что предлагается (выбрать одно из)

### Опция A — Soft deprecate
- Расширить docstring (уже сделано 2026-05-14 — добавлено предупреждение).
- Оставить параметр работать как сейчас.
- Цена: 0 (доки уже улучшены).

### Опция B — Hard deprecate
- Пометить поле `[[deprecated("use default; half-search anti-pattern for radar")]]`.
- В реализации `SnrEstimatorOp::ExecutePeakCfar` логгировать warning через
  `Logger` если получили `false`.
- Цена: ~30 мин + проверка что нет других вызывающих сторон с `false`.

### Опция C — Удалить из API
- Убрать поле из `SnrEstimationConfig`.
- Удалить параметр из `SnrEstimatorOp::ExecutePeakCfar` (всегда полный nFFT).
- Цена: ~1 ч (поиск всех use-сайтов в pipeline, обновление Python bindings
  если параметр экспортирован, изменение API → bump minor version).
- Risk: ломает внешних потребителей если они уже используют `false`.

## Acceptance

- [ ] Решено: A / B / C.
- [ ] Если B/C — обновлён `stats/include/dsp/stats/statistics_types.hpp`.
- [ ] Если C — найти и обновить все use-сайты (включая Python `dsp_stats` если экспортирован).
- [ ] Обновлён `Doc/Full.md` модуля stats.

## Связанное

- Удалён anti-pattern блок `cfg_half` в `test_03_negative_freq` —
  2026-05-14 в той же миграции V2 stats.
- Docstring улучшен 2026-05-14 (предупреждение о aliasing и Doppler).
- Реализация kernel — `stats/include/dsp/stats/kernels/peak_cfar_kernel.hpp`.
- Caller — `stats/include/dsp/stats/operations/snr_estimator_op.hpp:322` (`ExecutePeakCfar`).

---

*Created by: Кодо. Не блокер — никакой regress'ии не вызывает.*
