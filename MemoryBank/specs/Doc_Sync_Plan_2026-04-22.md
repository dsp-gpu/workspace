# Doc Sync Plan — {repo}/Doc ← DSP/Doc/Modules (2026-04-22)

## Маппинг репо → подмодули в DSP/Doc/Modules/

| Репо | Подмодули |
|------|-----------|
| core | (нет — инфраструктура без submodules) |
| spectrum | fft_func + filters + lch_farrow |
| stats | statistics |
| signal_generators | signal_generators |
| heterodyne | heterodyne |
| linalg | vector_algebra + capon |
| radar | range_angle + fm_correlator |
| strategies | strategies |

## Стиль: **префиксы** (consistency с spectrum)

В репо с **несколькими** подмодулями (spectrum, linalg, radar) используем префиксы:
- `spectrum/Doc/fft_func_API.md`, `spectrum/Doc/filters_Full.md`, etc.
- `linalg/Doc/vector_algebra_API.md`, `linalg/Doc/capon_Full.md`, etc.
- `radar/Doc/range_angle_API.md`, `radar/Doc/fm_correlator_Full.md`, etc.

В репо с **одним** подмодулем (stats, signal_generators, heterodyne, strategies) — прямые имена без префикса.

Общие overview (API.md / Full.md / Quick.md в корне `{repo}/Doc/`) **остаются** как "entry point" для всего репо.

## План действий (после этого отчёта)

1. **spectrum**: добавить 9 файлов (3×3 submodule × API/Full/Quick) + images subdirs.
2. **linalg**: добавить 6 файлов (2×3) + images.
3. **radar**: добавить 6 файлов (2×3) + images.
4. **stats / signal_generators / heterodyne / strategies**: проверить diff с DSP/Doc/Modules/ и дополнить.
5. **Commit и push каждого репо**.

## Что НЕ копируем (уже есть в репо — skip)

| Файл DSP/Doc/Modules/ | Уже в репо как |
|-----------------------|-----------------|
| filters/README.md | spectrum/Doc/filters_README.md |
| filters/gpu_filters_research.md | spectrum/Doc/filters_gpu_research.md |
| lch_farrow/README.md | spectrum/Doc/lch_farrow_README.md |
| lch_farrow/Распиши более подробнл МНК фазы beat.md | spectrum/Doc/lch_farrow_МНК_фазы_beat.md |
| range_angle/3fft_lfm_processing_simple.md | radar/Doc/range_angle_3fft_lfm_simple.md |
| range_angle/3fft_lfm_processing_technical.md | radar/Doc/range_angle_3fft_lfm_technical.md |
| fm_correlator/FM_Correlator_ROCm_Guide.docx | radar/Doc/fm_correlator_ROCm_Guide.docx |

*Created 2026-04-22 by Кодо*
