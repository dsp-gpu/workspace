# Offline Pack — полный список для скачивания (Windows → SSD → Debian в тайге)

> **Сценарий:** Alex едет на 5000 км в тайгу, **интернета нет**. Нужно скачать на Windows ВСЁ что нужно для запуска LLM/RAG стека на Debian + RX 9070 без сети.
> **Подготовка:** скачивать на Windows, складывать на SSD (минимум 256 GB), везти.
> **HF token:** `hf_***REVOKED_2026-05-11***` — старый токен ревокать на https://huggingface.co/settings/tokens, новый класть в `.env.local` (gitignored), в spec'е не светить.

---

## 📦 Структура SSD (рекомендуется)

```
D:\offline-debian-pack\
├── 1_models\                  # HuggingFace модели (~150 GB)
├── 2_software\                # .deb пакеты + бинарники для Debian (~3 GB)
├── 3_python_wheels\           # Python колёса для offline pip install (~10 GB)
├── 4_git_bundles\             # git bundle всех 11 репо (~1 GB)
├── 5_apt_offline\             # системные .deb (build-tools, postgresql-dev) (~500 MB)
├── 6_docker_images\           # docker save для Qdrant + опционально ollama (~500 MB)
└── INSTALL_DEBIAN.md          # пошаговый install на Debian (отдельно положу)
```

**Итого:** ~165 GB (с большими моделями), ~30 GB (минимум — только Qwen3-8B + BGE).

---

## ⚙️ Шаг 0 — подготовка Windows (5 мин)

```powershell
# Создать структуру на SSD
mkdir D:\offline-debian-pack\1_models
mkdir D:\offline-debian-pack\2_software
mkdir D:\offline-debian-pack\3_python_wheels
mkdir D:\offline-debian-pack\4_git_bundles
mkdir D:\offline-debian-pack\5_apt_offline
mkdir D:\offline-debian-pack\6_docker_images

# HF token в env (на сессию) — взять НОВЫЙ из .env.local после revoke старого
$env:HF_TOKEN = (Get-Content .env.local | Select-String "^HF_TOKEN=" | ForEach-Object { ($_ -split "=", 2)[1] })

# Проверка HF CLI (новое имя — `hf`, старое `huggingface-cli` deprecated с huggingface_hub 1.x)
pip install -U huggingface_hub
hf auth whoami   # должен показать твой логин
# если "Not logged in":
#   hf auth login   # интерактивно вставить токен из .env.local

# Проверка свободного места (минимум 200 GB)
Get-PSDrive D | Select-Object Used,Free,@{N='FreeGB';E={[int]($_.Free/1GB)}}
```

---

## 🧠 1. HuggingFace модели (~150 GB)

### 1A. ОБЯЗАТЕЛЬНО — для базового стека (~28 GB)

```powershell
# === Qwen3-8B (основная LLM, fine-tune + inference) ===
hf download Qwen/Qwen3-8B `
  --local-dir D:\offline-debian-pack\1_models\qwen3-8b
# Размер: ~16 GB

# === BGE-M3 (embeddings 1024-dim для RAG) ===
hf download BAAI/bge-m3 `
  --local-dir D:\offline-debian-pack\1_models\bge-m3
# Размер: ~4.6 GB

# === BGE-reranker-v2-m3 (rerank top-K в RAG) ===
hf download BAAI/bge-reranker-v2-m3 `
  --local-dir D:\offline-debian-pack\1_models\bge-reranker-v2-m3
# Размер: ~2.2 GB
```

### 1B. РЕКОМЕНДУЕТСЯ — для inference variants (~45 GB)

```powershell
# === Qwen2.5-Coder-7B (code-specific inference) ===
hf download Qwen/Qwen2.5-Coder-7B-Instruct `
  --local-dir D:\offline-debian-pack\1_models\qwen2.5-coder-7b-instruct
# Размер: ~15 GB

# === Qwen3-14B (более точные ответы, если RAM 64+ GB) ===
hf download Qwen/Qwen3-14B `
  --local-dir D:\offline-debian-pack\1_models\qwen3-14b
# Размер: ~30 GB
```

### 1C. ОПЦИОНАЛЬНО — для максимальной точности (~65 GB)

```powershell
# === Qwen3-32B (только если RAM 128+ GB или offload готов) ===
hf download Qwen/Qwen3-32B `
  --local-dir D:\offline-debian-pack\1_models\qwen3-32b
# Размер: ~65 GB
```

### 1D. Verify (после скачки всех моделей)

```powershell
Get-ChildItem D:\offline-debian-pack\1_models -Directory | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
    "{0,-30} {1,8:N1} GB" -f $_.Name, $size
}
```

---

## 💾 2. Software for Debian (~3 GB)

### 2A. Qdrant (vector DB) — binary release

```powershell
# Latest stable v1.12.4 (Linux x86_64)
$url = "https://github.com/qdrant/qdrant/releases/download/v1.12.4/qdrant-x86_64-unknown-linux-gnu.tar.gz"
Invoke-WebRequest -Uri $url -OutFile "D:\offline-debian-pack\2_software\qdrant-1.12.4-linux-x86_64.tar.gz"
# Размер: ~30 MB
```

### 2B. Ollama (LLM runtime) — Linux tarball

```powershell
# Ollama latest (на момент 10.05 — v0.4.5)
$url = "https://github.com/ollama/ollama/releases/download/v0.4.5/ollama-linux-amd64.tgz"
Invoke-WebRequest -Uri $url -OutFile "D:\offline-debian-pack\2_software\ollama-0.4.5-linux-amd64.tgz"
# Размер: ~1.5 GB
```

### 2C. PostgreSQL 16 (если нет на Debian)

```powershell
# Debian 12 (Bookworm) — берём с PGDG
$pgUrls = @(
    "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-16/postgresql-16_16.4-1.pgdg120+2_amd64.deb",
    "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-16/postgresql-server-dev-16_16.4-1.pgdg120+2_amd64.deb",
    "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-16/postgresql-client-16_16.4-1.pgdg120+2_amd64.deb",
    "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-common/postgresql-common_257.pgdg120+1_all.deb",
    "https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-common/postgresql-client-common_257.pgdg120+1_all.deb"
)
foreach ($url in $pgUrls) {
    $name = Split-Path $url -Leaf
    Invoke-WebRequest -Uri $url -OutFile "D:\offline-debian-pack\2_software\$name"
}
# Размер: ~50 MB
```

### 2D. pgvector (расширение для PG)

```powershell
# Tarball исходников — компилируется на Debian (нужен postgresql-server-dev-16 + gcc)
$url = "https://github.com/pgvector/pgvector/archive/refs/tags/v0.8.0.tar.gz"
Invoke-WebRequest -Uri $url -OutFile "D:\offline-debian-pack\2_software\pgvector-0.8.0.tar.gz"
# Размер: ~500 KB
```

### 2E. Docker (если не установлен) — Debian 12 пакеты

```powershell
$dockerUrls = @(
    "https://download.docker.com/linux/debian/dists/bookworm/pool/stable/amd64/containerd.io_1.7.22-1_amd64.deb",
    "https://download.docker.com/linux/debian/dists/bookworm/pool/stable/amd64/docker-ce_27.3.1-1~debian.12~bookworm_amd64.deb",
    "https://download.docker.com/linux/debian/dists/bookworm/pool/stable/amd64/docker-ce-cli_27.3.1-1~debian.12~bookworm_amd64.deb",
    "https://download.docker.com/linux/debian/dists/bookworm/pool/stable/amd64/docker-buildx-plugin_0.17.1-1~debian.12~bookworm_amd64.deb",
    "https://download.docker.com/linux/debian/dists/bookworm/pool/stable/amd64/docker-compose-plugin_2.29.7-1~debian.12~bookworm_amd64.deb"
)
foreach ($url in $dockerUrls) {
    $name = Split-Path $url -Leaf
    Invoke-WebRequest -Uri $url -OutFile "D:\offline-debian-pack\2_software\$name"
}
# Размер: ~150 MB
```

### 2F. ROCm 7.2+ (опционально — если уже не установлен)

```powershell
# Debian 12 (Bookworm) — большой архив через amdgpu-install
# Установщик скрипт:
$url = "https://repo.radeon.com/amdgpu-install/7.2/ubuntu/jammy/amdgpu-install_7.2.60200-1_all.deb"
Invoke-WebRequest -Uri $url -OutFile "D:\offline-debian-pack\2_software\amdgpu-install_7.2.deb"

# ВАЖНО: полный ROCm = ~3-5 GB .deb пакетов. Скачать через apt-get download на отдельной машине с интернетом:
# apt-get download rocm-hip-libraries hip-runtime-amd hipfft rocprim rocblas rocsolver rocrand miopen-hip
# (это нужно делать НА Debian-машине с интернетом, не на Windows!)
```

> **⚠️ ROCm offline сложно** — лучше попросить у админа в тайге уже установленный ROCm. Если нет — везти полный набор `.deb` пакетов (~5 GB), собранных на Linux машине с интернетом.

---

## 🐍 3. Python wheels (~10 GB)

### 3A. Подготовка `requirements.txt`

```powershell
# Создать requirements.txt с фиксированными версиями
@"
# === RAG/DB ===
psycopg[binary]>=3.1
pgvector>=0.3
qdrant-client>=1.12
# === Embeddings + reranker ===
FlagEmbedding>=1.2
sentence-transformers>=3.0
# === Indexer (tree-sitter) ===
tree-sitter>=0.21
tree-sitter-cpp>=0.22
tree-sitter-python>=0.21
blake3>=0.4
# === LLM training ===
torch>=2.4
transformers>=4.45
peft>=0.13
accelerate>=1.0
bitsandbytes>=0.44
datasets>=3.0
trl>=0.11
# === Inference ===
huggingface-hub>=0.25
ollama>=0.3
# === MCP / FastAPI ===
fastapi>=0.110
uvicorn>=0.30
mcp>=1.0
httpx>=0.27
pydantic>=2.7
# === CLI / utils ===
click>=8.1
rich>=13.7
PyYAML>=6.0
# === Analysis / dedup ===
scikit-learn>=1.5
numpy>=1.26
pandas>=2.2
matplotlib>=3.8
# === Plot / DSP test infrastructure ===
scipy>=1.13
"@ | Out-File -Encoding utf8 D:\offline-debian-pack\3_python_wheels\requirements.txt
```

### 3B. Скачать колёса (Linux x86_64, Python 3.12)

```powershell
cd D:\offline-debian-pack\3_python_wheels

# Базовые wheels
pip download -r requirements.txt `
  --dest . `
  --platform manylinux2014_x86_64 `
  --python-version 3.12 `
  --implementation cp `
  --only-binary=:all: `
  --no-deps

# Затем с deps (для transitive)
pip download -r requirements.txt `
  --dest . `
  --platform manylinux2014_x86_64 `
  --python-version 3.12 `
  --implementation cp `
  --only-binary=:all:
```

### 3C. ⚠️ TORCH с ROCm — отдельный канал

```powershell
# Стандартный torch — CUDA-only. Для AMD ROCm 6.x нужна спец-версия
pip download torch torchvision torchaudio `
  --index-url https://download.pytorch.org/whl/rocm6.2 `
  --dest D:\offline-debian-pack\3_python_wheels\torch-rocm `
  --platform manylinux2014_x86_64 `
  --python-version 3.12 `
  --implementation cp `
  --only-binary=:all:
# Размер: ~3 GB
```

### 3D. dsp-asst пакет (наш собственный)

```powershell
# Уже в git finetune-env, но можно отдельно собрать wheel
cd E:\finetune-env
pip wheel . --wheel-dir D:\offline-debian-pack\3_python_wheels\dsp-asst
```

---

## 📂 4. Git bundles (~1 GB)

### 4A. 10 репо DSP-GPU + finetune-env

```powershell
# Скрипт-однострочник
$repos = @{
    'workspace'         = 'e:\DSP-GPU'
    'core'              = 'e:\DSP-GPU\core'
    'spectrum'          = 'e:\DSP-GPU\spectrum'
    'stats'             = 'e:\DSP-GPU\stats'
    'signal_generators' = 'e:\DSP-GPU\signal_generators'
    'heterodyne'        = 'e:\DSP-GPU\heterodyne'
    'linalg'            = 'e:\DSP-GPU\linalg'
    'radar'             = 'e:\DSP-GPU\radar'
    'strategies'        = 'e:\DSP-GPU\strategies'
    'DSP'               = 'e:\DSP-GPU\DSP'
    'finetune-env'      = 'E:\finetune-env'
}
foreach ($name in $repos.Keys) {
    $path = $repos[$name]
    Push-Location $path
    git bundle create "D:\offline-debian-pack\4_git_bundles\$name.bundle" --all
    Pop-Location
}
```

### 4B. Verify bundles

```powershell
foreach ($f in Get-ChildItem D:\offline-debian-pack\4_git_bundles\*.bundle) {
    git bundle verify $f.FullName
}
```

---

## 🔧 5. APT offline пакеты (~500 MB)

> **Это сложно делать на Windows напрямую**. Лучший способ — на любой Debian-машине с интернетом запустить:

```bash
# Запустить НА Debian-машине с интернетом (виртуалке, например):
mkdir -p ~/apt-offline-pack
cd ~/apt-offline-pack

# Скачать пакеты + все зависимости
apt-get download $(apt-cache depends --recurse --no-recommends --no-suggests \
    --no-conflicts --no-breaks --no-replaces --no-enhances \
    build-essential gcc g++ make cmake \
    libssl-dev libpq-dev \
    git python3.12 python3.12-venv python3-pip \
    curl wget \
    | grep "^\w" | sort -u)

# Скопировать на SSD (через сеть или флешку)
```

Или **на Windows через WSL Ubuntu** (если есть):

```powershell
wsl -d Ubuntu -- bash -c "cd /mnt/d/offline-debian-pack/5_apt_offline && apt-get download build-essential gcc g++ make cmake libssl-dev libpq-dev git python3.12 python3.12-venv python3-pip curl wget"
```

**Минимальный набор пакетов** (если не хочется собирать всё):
- `build-essential` (gcc/g++/make)
- `cmake` (уже есть на Debian обычно)
- `libssl-dev` (для compile pgvector)
- `postgresql-server-dev-16` (для compile pgvector)
- `libpq-dev` (для psycopg)
- `python3.12 python3.12-venv python3-pip`

---

## 🐳 6. Docker images (опционально, ~500 MB)

```powershell
# Если на Debian нет интернета и Docker уже установлен — нужно заранее save image
# Это делать на машине с Docker (Windows подойдёт, если есть Docker Desktop):

docker pull qdrant/qdrant:v1.12.4
docker save qdrant/qdrant:v1.12.4 -o D:\offline-debian-pack\6_docker_images\qdrant-v1.12.4.tar
# Размер: ~150 MB

# Опционально: ollama в docker (если не хотим ставить .tgz нативно)
docker pull ollama/ollama:0.4.5
docker save ollama/ollama:0.4.5 -o D:\offline-debian-pack\6_docker_images\ollama-0.4.5.tar
# Размер: ~300 MB

# Загрузка на Debian:
# docker load -i qdrant-v1.12.4.tar
# docker load -i ollama-0.4.5.tar
```

---

## 📊 ИТОГОВЫЕ РАЗМЕРЫ

| Категория | Минимум | Полный набор |
|-----------|--------:|-------------:|
| 1. HuggingFace модели | 23 GB (1A) | 158 GB (1A+B+C) |
| 2. Software (Qdrant + Ollama + PG + Docker + ROCm) | 3 GB | 8 GB |
| 3. Python wheels (с torch ROCm) | 10 GB | 10 GB |
| 4. Git bundles (11 репо) | 1 GB | 1 GB |
| 5. APT offline | 0 (если установлено) | 500 MB |
| 6. Docker images | 0 (если есть .tgz) | 500 MB |
| **Σ** | **~37 GB** | **~178 GB** |

**Рекомендуемый размер SSD:** **256 GB** (с запасом).

---

## ✅ FINAL CHECKLIST перед выездом

- [ ] **Disk space:** проверил `D:\` — свободно > 200 GB
- [ ] **HF login:** `hf auth whoami` показывает логин
- [ ] **1_models/:** скачаны минимум qwen3-8b, bge-m3, bge-reranker-v2-m3
  - [ ] Опционально: qwen2.5-coder-7b, qwen3-14b/32b
- [ ] **2_software/:** Qdrant + Ollama + PG .deb + pgvector tarball + Docker .deb
  - [ ] (опц) ROCm `.deb` пакеты
- [ ] **3_python_wheels/:** requirements.txt + торч ROCm + dsp-asst wheel
- [ ] **4_git_bundles/:** 11 .bundle файлов (10 DSP-GPU + finetune-env)
- [ ] **5_apt_offline/:** build-essential / postgresql-server-dev-16 / libpq-dev (если нужны)
- [ ] **6_docker_images/:** qdrant.tar (если нужен)
- [ ] **INSTALL_DEBIAN.md:** скопирован в корень SSD (создаётся отдельно)
- [ ] **MemoryBank/:** в `4_git_bundles\workspace.bundle` уже включён (через `git bundle --all`)
- [ ] **HF_TOKEN:** **НЕ КОММИТИТЬ** в git! Только в env переменной.
- [ ] **SSD проверен:** ChkDsk + verify случайных файлов после копирования

---

## 🚨 Что МОЖЕТ пойти не так

1. **`hf download` обрывается** на больших моделях → resume включён по умолчанию. При повторном запуске продолжит с того же места.
2. **`pip download --platform`** не находит wheel для пакета → может быть source-only пакет (нет .whl). Тогда нужны build-tools на Debian (`build-essential`).
3. **torch ROCm wheel не качается** → попробовать `https://download.pytorch.org/whl/rocm6.0` (старая версия) или собрать из source на Debian (1+ час).
4. **Git bundle большой** (>500 MB на репо) → нормально, всё ОК.
5. **HF token истёк/revoked** → перегенерить на huggingface.co/settings/tokens (нужен READ scope).

---

## 📝 Следующий файл (создам тоже)

`INSTALL_DEBIAN.md` — пошаговая установка из этих файлов на Debian без интернета (соответствует `migration_plan_2026-05-10.md`, но с offline-spec командами).

Сказать когда начать писать INSTALL?

---

*Created: 2026-05-10 поздняя ночь · Кодо main #1 · для Alex'a в тайгу*
