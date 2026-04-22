---
paths:
  - "**/*.hip"
  - "**/kernels/**"
  - "**/*.cl"
  - "**/*.cl.h"
---

# 13 — Оптимизация HIP/ROCm и дополнительная документация

## 📖 Гайды по оптимизации (источник истины)

| Файл | Что внутри | Когда читать |
|------|-----------|-------------|
| `@MemoryBank/.claude/specs/ROCm_HIP_Optimization_Guide.md` | Главный гайд: теория + паттерны + чеклист | Перед оптимизацией любого нового kernel |
| `@MemoryBank/.claude/specs/ROCm_Optimization_Cheatsheet.md` | Шпаргалка: wavefront, LDS, coalescing, occupancy | Во время kernel-тюнинга |
| `@MemoryBank/.claude/specs/GPU_Profiling_Mechanism.md` | Как устроен профайлер: events, collect, export | Перед интеграцией профилирования |
| `@MemoryBank/.claude/specs/AMD_GPU_OpenCL_ROCm_ZeroCopy_2026-02-06.md` | ZeroCopy паттерны под AMD | При оптимизации memory transfers |

## 🎨 Диаграммы

| Файл | Что внутри |
|------|-----------|
| `@MemoryBank/.claude/specs/Mermaid_DarkTheme_Guide.md` | Шаблоны Mermaid для VS Code Dark Theme (C4, flowchart, classDiagram, sequenceDiagram) + палитра |

## 🏗️ Архитектура

| Файл | Что внутри |
|------|-----------|
| `@MemoryBank/.claude/specs/Ref03_Unified_Architecture.md` | Полное описание Ref03 (6 слоёв GPU-операций) |
| `@MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md` | C4-диаграммы системы |
| `@MemoryBank/.architecture/DSP-GPU_Architecture_Analysis.md` | Анализ архитектуры |

## 💡 Примеры

| Файл | Описание |
|------|---------|
| `DSP/Examples/GPUProfiler_SetGPUInfo.md` | Передача GPU/driver info в отчёт профилирования |
| `DSP/Examples/GetGPU_and_Mellanox/` | Детект GPU + Mellanox |
| `DSP/Examples/*` | Прочие паттерны для AI-ассистентов |

## 📚 Doxygen

- Doxygen source: `DSP/Doc/Doxygen/`
- HTML (не в git): `DSP/Doc/Doxygen/html/`
- Python API доки: `DSP/Doc/Python/{module}_api.md`

## 🗂️ Где что лежит

| Место | Назначение |
|-------|-----------|
| `MemoryBank/` | Черновики, планы, таски, сессии, ревью **до** стабилизации |
| `MemoryBank/.claude/specs/` | База знаний для Кодо (Ref03, оптимизация, ZeroCopy, Mermaid) |
| `MemoryBank/.architecture/` | Архитектурные документы (C4, analysis, CMake-GIT pipeline) |
| `MemoryBank/.agent/` | Материалы для 5 помощников-синьоров |
| `{repo}/Doc/` | Финальная документация репо |
| `DSP/Doc/` | Мета-документация проекта (Python API, гайды, Doxygen) |
| `DSP/Examples/` | Примеры кода для разработчиков и AI |

## Чеклист для нового kernel

1. **Теория прочитана** → `ROCm_HIP_Optimization_Guide.md`.
2. **Coalesced access**: соседние потоки читают соседние адреса (float4 / float2 / __half2).
3. **LDS (shared memory)** вместо повторного чтения из global.
4. **Bank conflicts** устранены (stride +1 при необходимости).
5. **Occupancy**: регистры через `rocminfo` + `--offload-arch`.
6. **Async**: kernel в своём stream, синхронизация по явным event.
7. **Профилирование** → `ProfilingFacade` + `GpuBenchmarkBase`.
8. **Сравнение с CPU** эталоном — корректность ДО оптимизации.

## Внешние ресурсы (через WebFetch / Context7)

| Ресурс | URL |
|--------|-----|
| ROCm Documentation | https://rocm.docs.amd.com/ |
| HIP Programming Guide | https://rocm.docs.amd.com/projects/HIP/en/latest/ |
| hipFFT | https://rocm.docs.amd.com/projects/hipFFT/en/latest/ |
| rocPRIM | https://rocm.docs.amd.com/projects/rocPRIM/en/latest/ |
| rocBLAS | https://rocm.docs.amd.com/projects/rocBLAS/en/latest/ |
| pybind11 | https://pybind11.readthedocs.io/ |
