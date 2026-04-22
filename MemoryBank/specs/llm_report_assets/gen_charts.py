"""Генератор PNG-графиков для отчёта по выбору GPU под локальный LLM.

Запуск:
    "F:/Program Files (x86)/Python312/python.exe" gen_charts.py

На выходе — PNG в images/ в едином корпоративном стиле (тёмный фон,
сине-зелёная палитра, читаемая типографика 14-16 pt).
"""
from __future__ import annotations

import os
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

# --- стиль --------------------------------------------------------------
OUT = Path(__file__).parent / "images"
OUT.mkdir(parents=True, exist_ok=True)

BG         = "#0d1b2a"
PANEL      = "#1e3a5f"
GRID       = "#2a4a6f"
TEXT       = "#e0f2fe"
ACCENT_BLUE   = "#64b5f6"
ACCENT_GREEN  = "#34d399"
ACCENT_AMBER  = "#fbbf24"
ACCENT_RED    = "#f87171"
ACCENT_VIOLET = "#a78bfa"
ACCENT_CYAN   = "#22d3ee"

plt.rcParams.update({
    "figure.facecolor": BG,
    "axes.facecolor":   PANEL,
    "axes.edgecolor":   GRID,
    "axes.labelcolor":  TEXT,
    "xtick.color":      TEXT,
    "ytick.color":      TEXT,
    "text.color":       TEXT,
    "axes.titlecolor":  TEXT,
    "font.family":      "sans-serif",
    "font.sans-serif":  ["Arial", "DejaVu Sans"],
    "font.size":        12,
    "axes.titlesize":   15,
    "axes.titleweight": "bold",
    "axes.grid":        True,
    "grid.color":       GRID,
    "grid.alpha":       0.5,
    "grid.linestyle":   "--",
    "axes.spines.top":    False,
    "axes.spines.right":  False,
    "figure.autolayout":  True,
})


def savefig(fig, name):
    p = OUT / name
    fig.savefig(p, dpi=170, facecolor=BG, bbox_inches="tight")
    plt.close(fig)
    print(f"  [ok] {name}  ({p.stat().st_size // 1024} KB)")


# =======================================================================
# 1. VRAM requirements per model (bar chart)
# =======================================================================
def chart_model_vram():
    models = [
        ("qwen2.5-coder\n14B (Q4)",               10,  "dense"),
        ("deepseek-r1:14b\ntool-call (Q4)",       11,  "dense"),
        ("gpt-oss-20b\nMoE (MXFP4)",              13,  "moe"),
        ("qwen3.6-35B-A3B\nMoE (Q4)",             21,  "moe"),
        ("glm-5.1 754B\nMoE (AWQ INT4)",          380, "xxl"),
    ]
    names = [m[0] for m in models]
    vrams = [m[1] for m in models]
    kinds = [m[2] for m in models]
    colors = {"dense": ACCENT_GREEN, "moe": ACCENT_BLUE, "xxl": ACCENT_RED}
    bar_colors = [colors[k] for k in kinds]

    fig, ax = plt.subplots(figsize=(11, 5.5))
    y = np.arange(len(names))
    bars = ax.barh(y, vrams, color=bar_colors, edgecolor=TEXT, linewidth=0.5)
    ax.set_yticks(y, names, fontsize=11)
    ax.set_xlabel("Требование видеопамяти, ГБ (для запуска модели)", fontsize=12)
    ax.set_title("Сколько видеопамяти нужно моделям после квантизации", fontsize=14, pad=14)
    ax.set_xscale("log")
    ax.set_xlim(1, 1000)
    ax.set_xticks([1, 3, 10, 30, 100, 300, 1000])
    ax.set_xticklabels(["1", "3", "10", "30", "100", "300", "1000"])
    for bar, v in zip(bars, vrams):
        ax.text(v * 1.05, bar.get_y() + bar.get_height() / 2,
                f"{v} ГБ", va="center", fontsize=11, color=TEXT, fontweight="bold")
    # reference lines for GPU capacities
    refs = [(16, "RTX 5060Ti/5080 — 16 ГБ", ACCENT_AMBER),
            (24, "RTX 4090 — 24 ГБ",        ACCENT_CYAN),
            (32, "RTX 5090 — 32 ГБ",        ACCENT_VIOLET),
            (192, "MI300X — 192 ГБ",        ACCENT_GREEN)]
    for vram, label, col in refs:
        ax.axvline(vram, color=col, linestyle=":", linewidth=1.5, alpha=0.9)
        ax.text(vram, len(names) - 0.3, label, rotation=90,
                va="top", ha="right", fontsize=9, color=col, fontweight="bold")

    # legend
    legend = [mpatches.Patch(color=ACCENT_GREEN, label="Dense (все параметры активны)"),
              mpatches.Patch(color=ACCENT_BLUE,  label="MoE (часть экспертов активна)"),
              mpatches.Patch(color=ACCENT_RED,   label="Не помещается в локальную станцию")]
    ax.legend(handles=legend, loc="lower right", fontsize=10, facecolor=PANEL, edgecolor=GRID)
    savefig(fig, "01_model_vram.png")


# =======================================================================
# 2. GPU VRAM capacity comparison
# =======================================================================
def chart_gpu_capacity():
    gpus = [
        ("RTX 5060 Ti", 16,  "consumer"),
        ("RTX 5080",    16,  "consumer"),
        ("RTX 4090",    24,  "consumer"),
        ("RTX 5090",    32,  "consumer"),
        ("MI210",       64,  "legacy"),
        ("MI250",       128, "legacy"),
        ("MI300X",      192, "server"),
        ("MI350",       288, "server"),
    ]
    names = [g[0] for g in gpus]
    caps = [g[1] for g in gpus]
    kinds = [g[2] for g in gpus]
    col = {"consumer": ACCENT_CYAN, "legacy": ACCENT_AMBER, "server": ACCENT_GREEN}
    colors = [col[k] for k in kinds]

    fig, ax = plt.subplots(figsize=(11, 5))
    x = np.arange(len(names))
    bars = ax.bar(x, caps, color=colors, edgecolor=TEXT, linewidth=0.5)
    ax.set_xticks(x, names, fontsize=11, rotation=15)
    ax.set_ylabel("Видеопамять одной карты, ГБ", fontsize=12)
    ax.set_title("Видеопамять карт из списка закупки (одиночная карта)", fontsize=14, pad=14)
    for bar, v in zip(bars, caps):
        ax.text(bar.get_x() + bar.get_width() / 2, v + 6,
                f"{v} ГБ", ha="center", fontsize=11, color=TEXT, fontweight="bold")
    ax.set_ylim(0, 330)
    legend = [mpatches.Patch(color=ACCENT_CYAN,  label="Потребительские NVIDIA"),
              mpatches.Patch(color=ACCENT_AMBER, label="AMD устаревшие (поддержка кончается)"),
              mpatches.Patch(color=ACCENT_GREEN, label="AMD Instinct актуальные")]
    ax.legend(handles=legend, loc="upper left", fontsize=10, facecolor=PANEL, edgecolor=GRID)
    savefig(fig, "02_gpu_capacity.png")


# =======================================================================
# 3. Matrix "GPU configurations x models": total VRAM across configs
# =======================================================================
def chart_config_capacity():
    configs = [
        ("1× RTX 5060Ti",    16),
        ("2× RTX 5060Ti",    32),
        ("4× RTX 5060Ti",    64),
        ("1× RTX 5080",      16),
        ("2× RTX 5080",      32),
        ("4× RTX 5080",      64),
        ("1× RTX 4090",      24),
        ("2× RTX 4090",      48),
        ("4× RTX 4090",      96),
        ("1× RTX 5090",      32),
        ("2× RTX 5090",      64),
        ("1× MI210",         64),
        ("2× MI210",         128),
        ("1× MI250",         128),
        ("2× MI250",         256),
        ("1× MI300X",        192),
        ("2× MI300X",        384),
        ("1× MI350",         288),
        ("2× MI350",         576),
    ]
    names = [c[0] for c in configs]
    vrams = [c[1] for c in configs]

    # color by suitability
    # < 20  — red
    # 20-40 — amber
    # 40-96 — cyan
    # > 96  — green
    colors = []
    for v in vrams:
        if v < 20:       colors.append(ACCENT_RED)
        elif v < 40:     colors.append(ACCENT_AMBER)
        elif v <= 96:    colors.append(ACCENT_CYAN)
        else:            colors.append(ACCENT_GREEN)

    fig, ax = plt.subplots(figsize=(13, 6.5))
    y = np.arange(len(names))
    bars = ax.barh(y, vrams, color=colors, edgecolor=TEXT, linewidth=0.5)
    ax.set_yticks(y, names, fontsize=10)
    ax.invert_yaxis()
    ax.set_xlabel("Суммарная видеопамять конфигурации, ГБ", fontsize=12)
    ax.set_title("Все варианты конфигураций: суммарная VRAM", fontsize=14, pad=14)
    ax.set_xscale("log")
    ax.set_xlim(10, 800)
    ax.set_xticks([10, 30, 100, 300, 600])
    ax.set_xticklabels(["10", "30", "100", "300", "600"])
    for bar, v in zip(bars, vrams):
        ax.text(v * 1.03, bar.get_y() + bar.get_height() / 2,
                f"{v} ГБ", va="center", fontsize=9, color=TEXT, fontweight="bold")
    # threshold lines
    for val, label, col in [(21, "qwen3.6-35B (21)", ACCENT_BLUE),
                             (48, "2 юзера+35B (48)", ACCENT_VIOLET),
                             (96, "LoRA 35B (~96)", ACCENT_CYAN)]:
        ax.axvline(val, color=col, linestyle=":", linewidth=1.3, alpha=0.8)
        ax.text(val, -0.5, label, rotation=0, ha="center", fontsize=9,
                color=col, fontweight="bold")

    legend = [mpatches.Patch(color=ACCENT_RED,   label="< 20 ГБ: недостаточно"),
              mpatches.Patch(color=ACCENT_AMBER, label="20–40 ГБ: базовый single-user"),
              mpatches.Patch(color=ACCENT_CYAN,  label="40–96 ГБ: 3+ пользователя"),
              mpatches.Patch(color=ACCENT_GREEN, label="> 96 ГБ: масштаб + LoRA")]
    ax.legend(handles=legend, loc="lower right", fontsize=10, facecolor=PANEL, edgecolor=GRID)
    savefig(fig, "03_all_configs_vram.png")


# =======================================================================
# 4. Ollama vs vLLM latency degradation (line chart)
# =======================================================================
def chart_latency_degradation():
    # данные — линейная аппроксимация из benchmark reports
    users = np.array([1, 2, 5, 10, 20, 30, 50])
    ollama_p99 = np.array([2.8, 5.0, 9.5, 15.0, 19.8, 22.4, 24.7])
    vllm_p99   = np.array([1.5, 1.7, 1.9, 2.1, 2.3, 2.6, 3.0])

    fig, ax = plt.subplots(figsize=(11, 5.5))
    ax.plot(users, ollama_p99, "o-", color=ACCENT_RED,  linewidth=2.6,
            label="Ollama (последовательная обработка)", markersize=9)
    ax.plot(users, vllm_p99, "s-", color=ACCENT_GREEN, linewidth=2.6,
            label="vLLM (continuous batching)",    markersize=9)
    ax.set_xlabel("Одновременных запросов от агентов", fontsize=12)
    ax.set_ylabel("Задержка p99, секунд\n(время ответа на 99% запросов)", fontsize=12)
    ax.set_title("Задержка отклика LLM при росте нагрузки", fontsize=14, pad=14)
    ax.legend(loc="upper left", fontsize=11, facecolor=PANEL, edgecolor=GRID)
    ax.set_xticks(users)

    # markers for labels
    for u, y in zip(users, ollama_p99):
        ax.annotate(f"{y:.1f} s", (u, y), textcoords="offset points",
                    xytext=(0, 10), ha="center", fontsize=9, color=ACCENT_RED)
    for u, y in zip(users, vllm_p99):
        ax.annotate(f"{y:.1f} s", (u, y), textcoords="offset points",
                    xytext=(0, -16), ha="center", fontsize=9, color=ACCENT_GREEN)

    ax.fill_between(users, ollama_p99, vllm_p99,
                    color=ACCENT_RED, alpha=0.08,
                    label="Зона неприемлемого ожидания")
    savefig(fig, "04_latency_ollama_vs_vllm.png")


# =======================================================================
# 5. LoRA vs QLoRA memory
# =======================================================================
def chart_lora_vs_qlora():
    models = ["7B модель", "14B модель", "35B MoE", "70B модель"]
    inference = [6, 12, 21, 42]
    lora     = [20, 45, 100, 210]
    qlora    = [8, 16, 32, 60]

    x = np.arange(len(models))
    w = 0.27

    fig, ax = plt.subplots(figsize=(11, 5.5))
    b1 = ax.bar(x - w, inference, w, color=ACCENT_CYAN,   label="Только инференс", edgecolor=TEXT, linewidth=0.5)
    b2 = ax.bar(x,     lora,      w, color=ACCENT_RED,    label="LoRA (классическая)", edgecolor=TEXT, linewidth=0.5)
    b3 = ax.bar(x + w, qlora,     w, color=ACCENT_GREEN,  label="QLoRA (с квантизацией)", edgecolor=TEXT, linewidth=0.5)

    ax.set_xticks(x, models, fontsize=11)
    ax.set_ylabel("Необходимая видеопамять, ГБ", fontsize=12)
    ax.set_title("Требования памяти: инференс vs LoRA vs QLoRA", fontsize=14, pad=14)
    ax.legend(loc="upper left", fontsize=11, facecolor=PANEL, edgecolor=GRID)

    for bars in [b1, b2, b3]:
        for bar in bars:
            h = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, h + 3,
                    f"{h:g}", ha="center", fontsize=9, color=TEXT)
    ax.set_ylim(0, 240)
    savefig(fig, "05_lora_vs_qlora.png")


# =======================================================================
# 6. Architecture: 3 users -> LLM server
# =======================================================================
def _draw_box(ax, x, y, w, h, text, color, edge=TEXT, fs=11, fw="bold"):
    rect = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08,rounding_size=0.15",
                          facecolor=color, edgecolor=edge, linewidth=1.6)
    ax.add_patch(rect)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            color=TEXT, fontsize=fs, fontweight=fw)


def _arrow(ax, x1, y1, x2, y2, color=ACCENT_BLUE, lw=1.8, style="-|>"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2),
                                 arrowstyle=style, mutation_scale=15,
                                 color=color, linewidth=lw))


def chart_architecture():
    fig, ax = plt.subplots(figsize=(12, 6.5))
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 7)
    ax.axis("off")
    ax.set_title("Топология: 3 пользователя × LLM-сервер", fontsize=14, pad=10)

    # users
    for i, name in enumerate(["Разработчик 1\n+ AI-агент",
                               "Разработчик 2\n+ AI-агент",
                               "Разработчик 3\n+ AI-агент"]):
        y = 5.5 - i * 2.0
        _draw_box(ax, 0.3, y, 2.4, 1.2, name, ACCENT_BLUE)
        _arrow(ax, 2.7, y + 0.6, 4.5, 3.5 + (1 - i) * 0.3, color=ACCENT_BLUE)

    # server block
    _draw_box(ax, 4.5, 2.7, 5.0, 2.4, "", PANEL, edge=ACCENT_GREEN)
    ax.text(7.0, 4.8, "LLM-сервер (Linux)", ha="center", fontsize=12, fontweight="bold", color=ACCENT_GREEN)
    _draw_box(ax, 4.7, 3.9, 2.2, 0.7, "vLLM / SGLang", ACCENT_VIOLET, fs=10)
    _draw_box(ax, 7.0, 3.9, 2.3, 0.7, "Continuous batching", ACCENT_CYAN, fs=10)
    _draw_box(ax, 4.7, 3.0, 2.2, 0.7, "PagedAttention", ACCENT_AMBER, fs=10)
    _draw_box(ax, 7.0, 3.0, 2.3, 0.7, "OpenAI API", ACCENT_GREEN, fs=10)

    # arrow to gpu
    _arrow(ax, 7.0, 2.7, 7.0, 1.8, color=ACCENT_GREEN, lw=2.2)

    # gpu
    _draw_box(ax, 4.7, 0.5, 4.8, 1.3,
              "GPU\n(модель в VRAM, KV-кеш на 3 контекста,\nparallel token generation)",
              ACCENT_GREEN, fs=11)

    # right: storage + disk
    _draw_box(ax, 10.0, 4.0, 1.8, 1.1, "Disk cache\nHSACO",  ACCENT_AMBER, fs=10)
    _draw_box(ax, 10.0, 2.3, 1.8, 1.1, "Модели\n(на SSD)",  ACCENT_AMBER, fs=10)
    _arrow(ax, 10.0, 4.5, 9.5, 4.3, color=ACCENT_AMBER)
    _arrow(ax, 10.0, 2.8, 9.5, 1.3, color=ACCENT_AMBER)

    savefig(fig, "06_architecture.png")


# =======================================================================
# 7. Batching scheme (sequential vs continuous)
# =======================================================================
def chart_batching_scheme():
    fig, (axA, axB) = plt.subplots(1, 2, figsize=(13, 5))

    # Ollama — sequential
    for ax in (axA, axB):
        ax.set_xlim(0, 16)
        ax.set_ylim(0, 6)
        ax.axis("off")

    axA.set_title("Ollama: последовательная обработка\n(5 запросов = 5× 3с = 15с)",
                  fontsize=12, color=ACCENT_RED, pad=8)
    for i in range(5):
        y = 5 - i
        ax = axA
        # waiting block (red)
        if i > 0:
            ax.add_patch(plt.Rectangle((0, y - 0.4), i * 3, 0.8,
                                        color=ACCENT_RED, alpha=0.35))
            ax.text(i * 1.5, y, "ожидание", ha="center", va="center",
                    fontsize=9, color=TEXT, style="italic")
        # execution block (green)
        ax.add_patch(plt.Rectangle((i * 3, y - 0.4), 3, 0.8,
                                    color=ACCENT_GREEN, alpha=0.9, ec=TEXT))
        ax.text(i * 3 + 1.5, y, f"Req {i+1}", ha="center", va="center",
                fontsize=10, color="#0d1b2a", fontweight="bold")
    axA.text(-0.2, 5.5, "Req 1", ha="right", fontsize=10, color=TEXT)
    axA.set_xlabel("Время →", color=TEXT)
    axA.text(15.5, -0.3, "15 с", fontsize=11, color=ACCENT_RED, fontweight="bold")

    # vLLM — continuous batching
    axB.set_title("vLLM: continuous batching\n(5 запросов параллельно = 3с общих)",
                  fontsize=12, color=ACCENT_GREEN, pad=8)
    for i in range(5):
        y = 5 - i
        axB.add_patch(plt.Rectangle((0, y - 0.4), 3, 0.8,
                                     color=ACCENT_GREEN, alpha=0.9, ec=TEXT))
        axB.text(1.5, y, f"Req {i+1}", ha="center", va="center",
                 fontsize=10, color="#0d1b2a", fontweight="bold")
    axB.set_xlabel("Время →", color=TEXT)
    axB.text(3.5, -0.3, "3 с", fontsize=11, color=ACCENT_GREEN, fontweight="bold")

    savefig(fig, "07_batching_scheme.png")


# =======================================================================
# 8. Multi-GPU parallelism types
# =======================================================================
def chart_parallelism_types():
    fig, axes = plt.subplots(1, 3, figsize=(14, 5))
    for ax in axes:
        ax.set_xlim(0, 6)
        ax.set_ylim(0, 5)
        ax.axis("off")

    # Tensor parallelism
    ax = axes[0]
    ax.set_title("Tensor Parallelism\n(матрица разбивается между GPU)",
                 fontsize=11, color=ACCENT_BLUE, pad=8)
    # single layer split across 4 GPUs
    for i in range(4):
        col = [ACCENT_BLUE, ACCENT_CYAN, ACCENT_VIOLET, ACCENT_GREEN][i]
        _draw_box(ax, 0.5 + i * 1.2, 1.5, 1.0, 1.8, f"GPU {i+1}\n¼ слоя", col, fs=10)
    # arrows up+down showing all-reduce
    for i in range(3):
        _arrow(ax, 1.0 + i * 1.2 + 0.5, 3.5, 1.0 + (i + 1) * 1.2 + 0.5, 3.5,
               color=ACCENT_AMBER, lw=1.2, style="<->")
    ax.text(3.0, 4.2, "all-reduce (синхронизация)",
            ha="center", fontsize=10, color=ACCENT_AMBER)
    ax.text(3.0, 0.6, "Нужен быстрый NVLink/InfinityFabric.\nНа PCIe — задержка 15-30%",
            ha="center", fontsize=9, color=TEXT, style="italic")

    # Pipeline parallelism
    ax = axes[1]
    ax.set_title("Pipeline Parallelism\n(разные слои на разных GPU)",
                 fontsize=11, color=ACCENT_GREEN, pad=8)
    for i in range(4):
        col = [ACCENT_BLUE, ACCENT_CYAN, ACCENT_VIOLET, ACCENT_GREEN][i]
        _draw_box(ax, 0.5 + i * 1.2, 1.5, 1.0, 1.8, f"GPU {i+1}\nслои {i*9+1}-{(i+1)*9}", col, fs=10)
        if i < 3:
            _arrow(ax, 1.5 + i * 1.2, 2.4, 0.5 + (i + 1) * 1.2, 2.4, color=ACCENT_AMBER, lw=1.5)
    ax.text(3.0, 4.2, "данные текут слева направо",
            ha="center", fontsize=10, color=ACCENT_AMBER)
    ax.text(3.0, 0.6, "Простая коммуникация, но первый GPU простаивает,\nпока работают остальные. Хорошо для больших batch.",
            ha="center", fontsize=9, color=TEXT, style="italic")

    # Expert parallelism (for MoE)
    ax = axes[2]
    ax.set_title("Expert Parallelism (для MoE)\n(разные эксперты на GPU)",
                 fontsize=11, color=ACCENT_VIOLET, pad=8)
    for i in range(4):
        col = [ACCENT_BLUE, ACCENT_CYAN, ACCENT_VIOLET, ACCENT_GREEN][i]
        _draw_box(ax, 0.5 + i * 1.2, 1.5, 1.0, 1.8,
                  f"GPU {i+1}\n{i*32+1}-{(i+1)*32}\nэкспертов", col, fs=9)
    ax.text(3.0, 4.2, "routing: какой эксперт нужен → туда",
            ha="center", fontsize=10, color=ACCENT_AMBER)
    ax.text(3.0, 0.6, "Отлично подходит для qwen3.6-35B-A3B, gpt-oss-20b,\nGLM-5.1 — моделей с MoE-архитектурой.",
            ha="center", fontsize=9, color=TEXT, style="italic")

    savefig(fig, "08_parallelism_types.png")


# =======================================================================
# 9. Concurrent users capacity by config (heatmap)
# =======================================================================
def chart_users_capacity_heatmap():
    configs = [
        "1× 5060Ti",  "2× 5060Ti", "4× 5060Ti",
        "1× 5080",    "2× 5080",   "4× 5080",
        "1× 4090",    "2× 4090",   "4× 4090",
        "1× 5090",    "2× 5090",
        "1× MI210",   "1× MI300X", "2× MI300X",
    ]
    models = [
        "qwen2.5-coder\n14B Q4",
        "deepseek-r1\n14B Q4",
        "gpt-oss-20b\nMXFP4",
        "qwen3.6-35B\nMoE Q4",
    ]
    # matrix rows = configs, cols = models
    # values = estimated concurrent users (0 = not enough VRAM)
    data = np.array([
        [2, 2, 1, 0],    # 1× 5060Ti 16 → barely fits 14B, not 35B
        [4, 4, 3, 0],    # 2× 5060Ti 32
        [10, 10, 8, 2],  # 4× 5060Ti 64 (via TP)
        [2, 2, 1, 0],    # 1× 5080
        [5, 5, 4, 0],
        [12, 12, 10, 3],
        [4, 4, 3, 0],    # 1× 4090 24
        [8, 8, 7, 2],    # 2× 4090 48
        [16, 16, 14, 5], # 4× 4090 96
        [6, 6, 5, 1],    # 1× 5090 32
        [14, 14, 12, 5], # 2× 5090 64
        [14, 14, 12, 5], # 1× MI210 64 (если бы был в стеке)
        [30, 30, 28, 15],# 1× MI300X 192
        [60, 60, 55, 30],# 2× MI300X 384
    ])

    fig, ax = plt.subplots(figsize=(10, 8))
    im = ax.imshow(data, cmap="viridis", aspect="auto")

    ax.set_xticks(np.arange(len(models)), models, fontsize=10)
    ax.set_yticks(np.arange(len(configs)), configs, fontsize=10)

    ax.set_title("Сколько пользователей держит конфигурация\n(комфортная параллельная работа через vLLM)",
                 fontsize=13, pad=14)

    for i in range(len(configs)):
        for j in range(len(models)):
            v = data[i, j]
            txt = "нет VRAM" if v == 0 else f"~{v}"
            color = ACCENT_RED if v == 0 else ("#0d1b2a" if v > 10 else TEXT)
            ax.text(j, i, txt, ha="center", va="center", fontsize=9,
                    color=color, fontweight="bold")

    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label("Одновременных пользователей", fontsize=10, color=TEXT)
    cbar.ax.yaxis.set_tick_params(color=TEXT)
    plt.setp(plt.getp(cbar.ax.axes, "yticklabels"), color=TEXT)

    savefig(fig, "09_users_capacity_heatmap.png")


# =======================================================================
# 10. Growth scenario (users over time × hardware)
# =======================================================================
def chart_growth_scenario():
    years = np.array([0, 6, 12, 18, 24])
    users = np.array([3, 5, 7, 10, 15])

    fig, ax = plt.subplots(figsize=(11, 5.5))
    ax.plot(years, users, "o-", color=ACCENT_CYAN, linewidth=2.5, markersize=10,
            label="Прогноз роста числа пользователей")
    ax.fill_between(years, users, 0, color=ACCENT_CYAN, alpha=0.12)

    # capacity bands
    ax.axhspan(0, 5, color=ACCENT_RED, alpha=0.08,
               label="1× RTX 4090 / 5090 — лимит ~5 польз.")
    ax.axhspan(5, 14, color=ACCENT_AMBER, alpha=0.08,
               label="2× RTX 5090 или 4× 4090 — до 14")
    ax.axhspan(14, 30, color=ACCENT_GREEN, alpha=0.1,
               label="1× MI300X — до 30")

    for x, y in zip(years, users):
        ax.annotate(f"{y} польз.", (x, y), textcoords="offset points",
                    xytext=(0, 12), ha="center", fontsize=10,
                    color=TEXT, fontweight="bold")

    ax.set_xticks(years, [f"{m} мес." if m > 0 else "старт" for m in years])
    ax.set_xlabel("Время от начала эксплуатации", fontsize=12)
    ax.set_ylabel("Одновременных активных пользователей", fontsize=12)
    ax.set_title("Сценарий роста нагрузки (2 года) и потолки конфигураций",
                 fontsize=14, pad=14)
    ax.legend(loc="upper left", fontsize=10, facecolor=PANEL, edgecolor=GRID)
    ax.set_ylim(0, 30)

    savefig(fig, "10_growth_scenario.png")


# =======================================================================
if __name__ == "__main__":
    print("Generating charts...")
    chart_model_vram()
    chart_gpu_capacity()
    chart_config_capacity()
    chart_latency_degradation()
    chart_lora_vs_qlora()
    chart_architecture()
    chart_batching_scheme()
    chart_parallelism_types()
    chart_users_capacity_heatmap()
    chart_growth_scenario()
    print("\nAll charts saved to:", OUT)
