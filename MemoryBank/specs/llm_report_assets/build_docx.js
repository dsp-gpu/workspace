/* Build 3 .docx reports on LLM hardware selection.
 * Usage:  node build_docx.js
 *
 * Inputs : images/01..10_*.png
 * Outputs: 3 files in ../:
 *   LLM_Hardware_Brief_2026-04-22.docx
 *   LLM_Hardware_Executive_Summary_2026-04-22.docx
 *   LLM_Hardware_Technical_Deep_Dive_2026-04-22.docx
 */

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageBreak, PageOrientation, TableOfContents, Footer,
  PageNumber, Header,
} = require("docx");

// ─── paths ───────────────────────────────────────────────────────────────
const IMG_DIR = path.join(__dirname, "images");
const OUT_DIR = path.join(__dirname, "..");

function img(name) { return fs.readFileSync(path.join(IMG_DIR, name)); }

// ─── common colors ───────────────────────────────────────────────────────
const C = {
  accent:  "1F4E79",
  accent2: "2E75B6",
  text:    "1A1A1A",
  muted:   "555555",
  ok:      "2E7D32",
  warn:    "E65100",
  bad:     "C62828",
  tableHead: "D5E8F0",
  tableAlt:  "F2F7FB",
  border:    "CCCCCC",
};

// ─── reusable helpers ────────────────────────────────────────────────────
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function h1(text, bookmark = null) {
  const runs = [new TextRun({ text, bold: true, size: 36, color: C.accent })];
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 180 },
    children: runs,
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: C.accent2 })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, color: C.text })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: 22, color: C.text, ...opts })],
  });
}
function bulletP(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, color: C.text })],
  });
}
function bulletPrich(runs) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: runs,
  });
}
function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 140 },
    children: [new TextRun({ text, italic: true, size: 20, color: C.muted })],
  });
}

// ─── image helper ───────────────────────────────────────────────────────
function image(filename, captionText, maxWidth = 560) {
  // assume source png is 1871x(variable), fit maxWidth
  // use width/height in px (docx-js uses transformation)
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      children: [new ImageRun({
        type: "png",
        data: img(filename),
        transformation: { width: maxWidth, height: Math.round(maxWidth * 0.55) },
        altText: { title: captionText, description: captionText, name: filename },
      })],
    }),
    caption(captionText),
  ];
}

// ─── table helper ───────────────────────────────────────────────────────
function table({ columns, rows, headerBg = C.tableHead }) {
  // columns: [{text, width}] widthSum must equal tableWidth
  const totalWidth = columns.reduce((a, c) => a + c.width, 0);

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(col => new TableCell({
      borders: cellBorders,
      width: { size: col.width, type: WidthType.DXA },
      shading: { fill: headerBg, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        alignment: col.align || AlignmentType.LEFT,
        children: [new TextRun({ text: col.text, bold: true, size: 20, color: C.text })],
      })],
    })),
  });

  const bodyRows = rows.map((row, rowIdx) => new TableRow({
    children: row.map((cellData, colIdx) => {
      const align = columns[colIdx].align || AlignmentType.LEFT;
      const cellText = typeof cellData === "string" ? cellData : cellData.text;
      const color = (cellData.color !== undefined) ? cellData.color : C.text;
      const bold  = !!cellData.bold;
      const bg    = (rowIdx % 2 === 1) ? C.tableAlt : "FFFFFF";
      return new TableCell({
        borders: cellBorders,
        width: { size: columns[colIdx].width, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: align,
          children: [new TextRun({ text: cellText, size: 20, color, bold })],
        })],
      });
    }),
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: columns.map(c => c.width),
    rows: [headerRow, ...bodyRows],
  });
}

// ─── styles & document defaults ─────────────────────────────────────────
function baseStyles() {
  return {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: C.accent },
        paragraph: { spacing: { before: 320, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: C.accent2 },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: C.text },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ],
  };
}
function baseNumbering() {
  return {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  };
}
function baseSection(children) {
  return {
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Страница ", size: 18, color: C.muted }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: C.muted }),
            new TextRun({ text: " из ", size: 18, color: C.muted }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: C.muted }),
          ],
        })],
      }),
    },
    children,
  };
}

// ─── title block helper ─────────────────────────────────────────────────
function titleBlock(title, subtitle, meta) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 48, color: C.accent })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: subtitle, size: 28, color: C.accent2, italic: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: meta.date, size: 22, color: C.muted })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: `Автор: ${meta.author}`, size: 22, color: C.muted })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: `Аудитория: ${meta.audience}`, size: 22, color: C.muted })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: `Версия ${meta.version}`, size: 22, color: C.muted })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ═════════════════════════════════════════════════════════════════════════
// 1. BRIEF (короткая справка)
// ═════════════════════════════════════════════════════════════════════════
function buildBrief() {
  // helper — таблица компонентов для одной сборки
  const buildTable = (rows) => table({
    columns: [
      { text: "Компонент",     width: 2800, align: AlignmentType.LEFT },
      { text: "Характеристика", width: 6560, align: AlignmentType.LEFT },
    ],
    rows,
  });

  const children = [
    ...titleBlock(
      "Выбор оборудования для локального LLM-сервера",
      "Краткая справка",
      { date: "22 апреля 2026 г.", author: "Отдел НИОКР",
        audience: "руководство, IT-директор, специалисты", version: "1.1" }
    ),

    h1("Постановка задачи"),
    p("Локальный сервер LLM для трёх программистов, работающих одновременно через AI-агентов, с возможностью периодического дообучения моделей 7–14 B методом QLoRA. Тестируемые модели: qwen3.6-35B-A3B, gpt-oss-20b, glm-5.1, deepseek-r1:14b-qwen-distill-q4_K_M, qwen2.5-coder:14b."),

    h1("Выводы"),
    bulletP("GLM-5.1 (754 B параметров) непригодна для локальной станции. Требует 8 × H200 либо 4–8 × MI300X. Рекомендуется исключить из тестирования в рамках этого проекта."),
    bulletP("Серверная программа обязательна vLLM либо SGLang, а не Ollama. При трёх пользователях Ollama даёт задержку 24.7 с (p99), vLLM — меньше 3 с на том же железе."),
    bulletP("Операционная система — Ubuntu 24.04 LTS. Windows не годится для серверной части."),
    bulletP("Существует несколько рабочих сборок, покрывающих задачу в разной степени. Выбор зависит от доступности карт и ожидаемой траектории роста нагрузки."),

    h1("Сводная таблица конфигураций"),
    table({
      columns: [
        { text: "Конфигурация",    width: 2400, align: AlignmentType.LEFT  },
        { text: "VRAM, ГБ",        width: 1000, align: AlignmentType.CENTER },
        { text: "Польз.",          width: 900,  align: AlignmentType.CENTER },
        { text: "LoRA 14B",        width: 1100, align: AlignmentType.CENTER },
        { text: "LoRA 35B",        width: 1100, align: AlignmentType.CENTER },
        { text: "Комментарий",     width: 2860, align: AlignmentType.LEFT  },
      ],
      rows: [
        ["1× RTX 5060 Ti 16",          "16",  "1–2",   "нет",      "нет",       "Недостаточно для сервера"],
        ["4× RTX 5060 Ti",              "64",  "8–10",  "QLoRA 7B", "нет",       "Multi-GPU без NVLink — 25–40 % потерь"],
        ["4× RTX 5080",                 "64",  "10–12", "1 карта",  "нет",       "Та же VRAM, но быстрее память"],
        ["2× RTX 4090 24",              "48",  "6–8",   "да",       "нет",       "Переходный вариант"],
        ["4× RTX 4090 24",              "96",  "14–16", "да",       "QLoRA",     "Классическая AI-workstation"],
        ["2× RTX 5090 32",              "64",  "12–14", "да",       "QLoRA",     "Лучший потребительский вариант"],
        ["1× AMD MI210 64",             "64",  "12",    "да",       "одна карта","Не рек. — исключён из новых vLLM стеков"],
        ["1× AMD MI250",                "128", "16",    "да",       "да",        "То же — устаревшая поддержка"],
        ["1× AMD MI300X 192",           "192", "25–30", "да",       "да",        "Идеал при доступе через OEM"],
        ["2× AMD MI300X",               "384", "50–60", "да",       "да (70B)",  "С запасом на GLM-5.1 в INT4"],
        ["1× AMD MI350",                "288", "40",    "да",       "да",        "Избыточно для заявленной задачи"],
      ],
    }),

    h1("Видеопамять карт из списка закупки"),
    ...image("02_gpu_capacity.png", "Видеопамять одной карты каждого типа"),

    h1("Требования видеопамяти по моделям"),
    ...image("01_model_vram.png", "Требование VRAM по моделям и сравнение с доступными картами"),

    h1("Констатации"),
    bulletP("Видеопамять — определяющий параметр. Недостаток VRAM делает карту бесполезной независимо от её вычислительной мощности."),
    bulletP("Потребительские карты без NVLink теряют 15–30 % производительности в multi-GPU режиме. Четыре RTX 4090 не равны одной карте с 96 ГБ."),
    bulletP("Серверные AMD Instinct MI300X имеют прямую поддержку ROCm 7.0, vLLM, SGLang в виде официальных Docker-контейнеров."),
    bulletP("Серверные AMD MI210 и MI250 (архитектура CDNA 2, 2021 года) исключены из свежих prebuilt решений. Срок активной поддержки — 12–18 месяцев."),
    bulletP("3 пользователя × 20–50 обращений агента в минуту = 60–150 запросов/мин. Серверная программа-балансировщик (vLLM/SGLang с continuous batching) обеспечивает предсказуемую задержку."),
    bulletP("QLoRA-дообучение 7–14 B моделей требует 8–16 ГБ VRAM; все рекомендуемые конфигурации это покрывают."),
    bulletP("Ubuntu 24.04 LTS + Docker + vLLM (или его ROCm-версия) = стандартный production-стек."),

    h1("Риски"),
    bulletP("Закупка MI210/MI250: через 12–18 месяцев прекратятся обновления prebuilt-контейнеров AMD."),
    bulletP("Закупка ≥ 4 потребительских карт: требует специализированного корпуса, двух блоков питания, сертифицированной платформы Threadripper Pro. Рекомендуется готовая сборка."),
    bulletP("Серверные карты AMD Instinct (MI300X, MI350) требуют OEM-платформу (Dell / Supermicro / HPE). Не устанавливаются в обычные workstation-корпуса."),
    bulletP("Производство RTX 4090 завершено в 2025 году. При заказе 4 одинаковых карт возможны задержки поставки."),
    bulletP("Включение GLM-5.1 в программу тестирования потребует кластерной инфраструктуры вне рамок одной рабочей станции."),

    h1("Рабочие сборки по уровням"),
    p("Ниже — пять реалистичных сборок, покрывающих задачу в разной степени. Выбор определяется: доступностью конкретных GPU на рынке в момент закупки, форматом инфраструктуры (рабочая станция под столом vs серверный рэк), горизонтом планирования (6 месяцев vs 3+ года), бюджетом (не обсуждается в этом документе)."),

    h2("Сборка A. Бюджетная мульти-GPU workstation"),
    p({ text: "GPU: 4 × NVIDIA RTX 5060 Ti 16 ГБ (суммарно 64 ГБ).", bold: true }),
    buildTable([
      ["Процессор",        "AMD Threadripper Pro 7965WX (24 ядра, 128 PCIe 5.0 lanes)"],
      ["ОЗУ",              "128–256 ГБ DDR5 ECC"],
      ["Материнская плата","WRX90 с 4 × PCIe 5.0 x16"],
      ["Системный диск",   "2 × 2 ТБ NVMe (RAID 1)"],
      ["Диск для моделей", "2 × 4 ТБ NVMe (RAID 1)"],
      ["Блок питания",     "2 × 1500 Вт Titanium"],
      ["Корпус",           "Full-tower (Fractal Design Define 7 XL) или готовая сборка"],
      ["Охлаждение",       "Воздушное, 8+ вентиляторов"],
      ["ОС",               "Ubuntu 24.04 LTS"],
      ["Программный стек", "vLLM 0.9+ в Docker"],
    ]),
    p({ text: "Что покрывает:", bold: true }),
    bulletP("Инференс моделей до 20 B для 8–10 одновременных пользователей."),
    bulletP("Инференс qwen3.6-35B-A3B через expert parallelism с ограничением контекста до 16К токенов."),
    bulletP("QLoRA-дообучение 7 B моделей на одной из карт."),
    p({ text: "Что не покрывает:", bold: true }),
    bulletP("LoRA / QLoRA моделей 14 B и крупнее."),
    bulletP("Инференс 70 B моделей без существенной потери производительности."),
    bulletP("GLM-5.1 ни в какой квантизации."),
    p({ text: "Особенности:", bold: true }),
    bulletP("Нет NVLink — tensor parallelism через PCIe теряет 25–40 %."),
    bulletP("Предпочтительные режимы: pipeline parallel для dense, expert parallel для MoE."),
    bulletP("Подходит как первая серверная установка с возможностью заменить карты на более мощные позже."),

    h2("Сборка B. Средняя мульти-GPU workstation"),
    p({ text: "GPU: 4 × NVIDIA RTX 5080 16 ГБ (суммарно 64 ГБ).", bold: true }),
    buildTable([
      ["Процессор",        "AMD Threadripper Pro 7965WX (24 ядра, 128 PCIe 5.0 lanes)"],
      ["ОЗУ",              "256 ГБ DDR5 ECC"],
      ["Материнская плата","WRX90 с 4 × PCIe 5.0 x16"],
      ["Системный диск",   "2 × 2 ТБ NVMe (RAID 1)"],
      ["Диск для моделей", "4 × 4 ТБ NVMe (RAID 10)"],
      ["Блок питания",     "2 × 1600 Вт Titanium"],
      ["Корпус",           "Full-tower"],
      ["Охлаждение",       "Воздушное усиленное"],
      ["ОС",               "Ubuntu 24.04 LTS"],
    ]),
    p({ text: "Что покрывает:", bold: true }),
    bulletP("Та же функциональность, что сборка A."),
    bulletP("Плюс 30 % производительности за счёт более быстрой памяти (960 ГБ/с против 448 у 5060 Ti)."),
    bulletP("До 10–12 одновременных пользователей на 14 B моделях через vLLM."),
    p({ text: "Что не покрывает:", bold: true }),
    bulletP("То же, что в сборке A — ограничения потолка 16 ГБ на карту остаются."),
    p({ text: "Особенности:", bold: true }),
    bulletP("Разумный выбор, если RTX 5060 Ti дешевле незначительно, а прирост 30 % критичен."),
    bulletP("Те же требования к платформе и охлаждению, что сборка A."),

    h2("Сборка C. Workstation среднего класса (актуальные карты 24 ГБ)"),
    p({ text: "GPU: 4 × NVIDIA RTX 4090 24 ГБ (суммарно 96 ГБ).", bold: true }),
    buildTable([
      ["Процессор",        "AMD Threadripper Pro 7965WX (24 ядра)"],
      ["ОЗУ",              "256 ГБ DDR5 ECC RDIMM"],
      ["Материнская плата","ASUS WRX90 (7 × PCIe 5.0 x16)"],
      ["Системный диск",   "2 × 2 ТБ Samsung 990 Pro (RAID 1)"],
      ["Диск для моделей", "4 × 4 ТБ WD Black SN850X (RAID 10, 8 ТБ полезно)"],
      ["Сеть",             "Intel X550 10 GbE"],
      ["Блок питания",     "2 × Corsair AX1600i (суммарно 3200 Вт)"],
      ["Корпус",           "Fractal Define 7 XL или готовая сборка Bizon / Exxact"],
      ["Охлаждение",       "Воздушное, 8+ вентиляторов, отдельные шахты для GPU"],
      ["ОС",               "Ubuntu 24.04 LTS"],
      ["Программный стек", "vLLM 0.9+, NVIDIA 560.xx + CUDA 12.6"],
    ]),
    p({ text: "Что покрывает:", bold: true }),
    bulletP("Инференс всех заявленных моделей кроме GLM-5.1 для 14–16 одновременных пользователей."),
    bulletP("LoRA-дообучение моделей 14 B на одной карте."),
    bulletP("QLoRA над моделями до 35 B."),
    bulletP("Инференс 70 B моделей в Q4 через tensor parallelism."),
    p({ text: "Что не покрывает:", bold: true }),
    bulletP("GLM-5.1 ни в какой квантизации (требует 380 ГБ)."),
    p({ text: "Особенности:", bold: true }),
    bulletP("RTX 4090 снята с производства в 2025 году — возможны задержки поставки."),
    bulletP("Как и все потребительские варианты — нет NVLink, коммуникации через PCIe."),
    bulletP("Классическая AI-workstation, хорошо документирована (Bizon-Tech, Exxact, Lambda Labs)."),

    h2("Сборка D. Потребительский оптимум на новейшем поколении"),
    p({ text: "GPU: 2 × NVIDIA RTX 5090 32 ГБ (суммарно 64 ГБ).", bold: true }),
    buildTable([
      ["Процессор",        "AMD Threadripper 7970X (32 ядра) или Threadripper Pro 7955WX"],
      ["ОЗУ",              "128–256 ГБ DDR5"],
      ["Материнская плата","TRX50 / WRX90 с 2 × PCIe 5.0 x16"],
      ["Системный диск",   "2 × 2 ТБ NVMe Gen5 (RAID 1)"],
      ["Диск для моделей", "2 × 8 ТБ NVMe Gen5 (RAID 1)"],
      ["Сеть",             "10 GbE"],
      ["Блок питания",     "1 × 1500 Вт Titanium"],
      ["Корпус",           "Big-tower или mid-tower с хорошей продувкой"],
      ["Охлаждение",       "Воздушное, 6 вентиляторов"],
      ["ОС",               "Ubuntu 24.04 LTS"],
    ]),
    p({ text: "Что покрывает:", bold: true }),
    bulletP("Инференс всех моделей кроме GLM-5.1 для 12–14 пользователей."),
    bulletP("LoRA и QLoRA моделей до 14 B на одной карте."),
    bulletP("QLoRA моделей до 35 B через распределение между двумя картами."),
    bulletP("Инференс 70 B моделей в Q4 через tensor parallelism."),
    p({ text: "Что не покрывает:", bold: true }),
    bulletP("GLM-5.1 ни в какой квантизации."),
    bulletP("Масштаб до 20+ одновременных пользователей."),
    p({ text: "Особенности:", bold: true }),
    bulletP("Вдвое меньше карт чем в сборке C, при сопоставимой суммарной VRAM (64 vs 96 ГБ)."),
    bulletP("Проще сборка: один блок питания 1500 Вт, стандартный Threadripper."),
    bulletP("Свежая архитектура Blackwell — нативный FP8, GDDR7 1792 ГБ/с на карту."),
    bulletP("По скорости инференса на одну карту — лучше 4 × RTX 4090 без TP overhead."),
    bulletP("Рекомендуется как основной потребительский вариант, если инфраструктура не допускает серверный рэк."),

    h2("Сборка E. Серверное решение AMD Instinct (если доступно)"),
    p({ text: "GPU: 1 × AMD Instinct MI300X 192 ГБ HBM3 (опционально расширение до 2 карт).", bold: true }),
    buildTable([
      ["Платформа",        "Dell PowerEdge XE9680 / Supermicro AS-8125GS-TNMR2 / HPE Cray XD675"],
      ["Процессор",        "2 × AMD EPYC 9354 (64 ядра суммарно)"],
      ["ОЗУ",              "512 ГБ DDR5 ECC RDIMM"],
      ["Системный диск",   "2 × 3.84 ТБ Samsung PM9A3 NVMe (RAID 1)"],
      ["Диск для моделей", "4 × 7.68 ТБ Samsung PM9A3 NVMe (RAID 10, 15.36 ТБ полезно)"],
      ["Сеть",             "2 × Mellanox ConnectX-6 25 GbE"],
      ["Блок питания",     "4 × 2000 Вт 80+ Platinum (N+N)"],
      ["Корпус",           "4U rack-mount"],
      ["Охлаждение",       "Серверное стоечное, холодный коридор ≤ 22 °C"],
      ["ОС",               "Ubuntu 24.04 LTS"],
      ["Программный стек", "ROCm 7.0 + vLLM 0.9+ (AMD контейнер rocm/vllm:rocm7.0_vllm_mi300x)"],
    ]),
    p({ text: "Что покрывает:", bold: true }),
    bulletP("Инференс всех заявленных моделей кроме GLM-5.1 для 25–30 одновременных пользователей."),
    bulletP("LoRA / QLoRA моделей до 70 B на одной карте."),
    bulletP("При расширении до 2 × MI300X (384 ГБ) — GLM-5.1 в квантизации INT4 становится доступна."),
    bulletP("Параллельное выполнение инференса и дообучения в одной машине."),
    p({ text: "Что не покрывает:", bold: true }),
    bulletP("Не вписывается в обычный офис / open-space — требует серверного помещения."),
    bulletP("Одна карта MI300X — не распределяется по сценариям tensor parallelism."),
    p({ text: "Особенности:", bold: true }),
    bulletP("192 ГБ HBM3 в одной карте — рекордная плотность видеопамяти."),
    bulletP("Bandwidth памяти 5.3 ТБ/с — втрое выше RTX 5090."),
    bulletP("Активная поддержка AMD до 2028–2029 гг."),
    bulletP("Требует OEM-платформу — закупка через корпоративные каналы. На потребительском рынке недоступно."),
    bulletP("Оправдано при наличии серверного помещения с кондиционированием, горизонта 3+ года, перспективы 20+ пользователей."),

    h1("Сопоставление сборок"),
    table({
      columns: [
        { text: "Критерий",              width: 2400, align: AlignmentType.LEFT },
        { text: "A (4×5060Ti)",          width: 1392, align: AlignmentType.CENTER },
        { text: "B (4×5080)",            width: 1392, align: AlignmentType.CENTER },
        { text: "C (4×4090)",            width: 1392, align: AlignmentType.CENTER },
        { text: "D (2×5090)",            width: 1392, align: AlignmentType.CENTER },
        { text: "E (1×MI300X)",          width: 1392, align: AlignmentType.CENTER },
      ],
      rows: [
        ["VRAM, ГБ",          "64", "64", "96", "64", "192"],
        ["Польз. одновр.",     "8–10", "10–12", "14–16", "12–14", "25–30"],
        ["LoRA 14 B",         "нет", "1 карта", "да", "да", "да"],
        ["LoRA 35 B (QLoRA)", "нет", "нет", "да", "да", "да"],
        ["LoRA 70 B",         "нет", "нет", "нет", "нет", "да"],
        ["GLM-5.1",           "нет", "нет", "нет", "нет", "только 2 карты"],
        ["Форм-фактор",       "Workstation", "Workstation", "Workstation", "Workstation", "Серверный рэк"],
        ["NVLink",            "нет", "нет", "нет", "нет", "HBM3 единая"],
        ["Доступность GPU",   "Высокая", "Высокая", "Остатки", "Высокая", "Через OEM"],
        ["Срок поддержки",    "3–4 года", "3–4 года", "3–4 года", "4–5 лет", "4–5 лет"],
      ],
    }),

    h1("Рекомендация"),
    p({ text: "Если инфраструктура допускает серверный рэк ", bold: true }),
    p("и доступна закупка через OEM — предпочтителен вариант E (1 × MI300X). Одна карта покрывает все задачи с запасом на рост до 3+ лет."),
    p({ text: "Если серверный рэк не вписывается в офис ", bold: true }),
    p("или карты AMD Instinct недоступны по каналам снабжения — предпочтителен вариант D (2 × RTX 5090). Самый компактный потребительский вариант, покрывающий задачу на 1.5–2 года."),
    p({ text: "Варианты A и B (4 × RTX 5060 Ti / 5080) ", bold: true }),
    p("пригодны как первая серверная установка с ограниченным бюджетом и пониманием что через 12–18 месяцев потребуется апгрейд."),
    p({ text: "Вариант C (4 × RTX 4090) ", bold: true }),
    p("— классическая проверенная конфигурация, но RTX 4090 сняты с производства; закупка возможна только из остатков складов."),
    p({ text: "Варианты MI210 / MI250 / MI350 ", bold: true }),
    p("— не рекомендуются: первые два теряют программную поддержку, третий избыточен для заявленной задачи."),
  ];

  return new Document({
    creator: "DSP-GPU R&D",
    title: "LLM Hardware Brief — 2026-04-22",
    styles: baseStyles(),
    numbering: baseNumbering(),
    sections: [baseSection(children)],
  });
}

// ═════════════════════════════════════════════════════════════════════════
// 2. EXECUTIVE SUMMARY
// ═════════════════════════════════════════════════════════════════════════
function buildExec() {
  const children = [
    ...titleBlock(
      "Выбор оборудования для локального LLM-сервера",
      "Исполнительное резюме",
      { date: "22 апреля 2026 г.", author: "Отдел НИОКР",
        audience: "руководство, финансовый блок, IT-директор", version: "2.0" }
    ),

    // 1. Цель
    h1("1. Цель документа"),
    p("Обосновать выбор серверной конфигурации для размещения локальных больших языковых моделей, обеспечивающих работу не менее трёх разработчиков одновременно с программными агентами, с возможностью периодического дообучения моделей 7–14 B."),
    p("Документ не обсуждает стоимость. Он отвечает на вопрос: какая минимальная и какая оптимальная конфигурация даёт плавную работу трёх специалистов с локальной моделью, не уступающей по скорости облачным сервисам?"),

    // 2. Вывод
    h1("2. Краткий вывод"),
    table({
      columns: [
        { text: "№", width: 400, align: AlignmentType.CENTER },
        { text: "Сценарий", width: 2400, align: AlignmentType.LEFT },
        { text: "Рекомендуемая конфигурация", width: 3200, align: AlignmentType.LEFT },
        { text: "Обоснование", width: 3840, align: AlignmentType.LEFT },
      ],
      rows: [
        ["1", "Минимально-достаточно (1–3 разработчика, редкие пики)",
         "2 × RTX 5090 (32 ГБ)",
         "64 ГБ суммарной VRAM, все модели кроме GLM-5.1. Сопоставима с 1 × H100 по пропускной способности."],
        ["2", { text: "Рекомендуемо (3 разработчика + QLoRA 7–14 B)", bold: true },
         { text: "1 × AMD Instinct MI300X (192 ГБ)", bold: true },
         { text: "Серверный класс, 192 ГБ HBM3, нативная поддержка vLLM/ROCm 7. Одна карта, одна машина.", bold: true }],
        ["3", "С запасом (рост до 5–10 польз., регулярное дообучение)",
         "1–2 × MI300X или 4 × RTX 4090",
         "Две MI300X = 384 ГБ, поднимает GLM-5.1 в INT4. Альтернатива — четыре RTX 4090."],
      ],
    }),
    p(""),
    p("Не рекомендуется к закупке:"),
    bulletP("AMD MI210 и MI250 — сняты с основного пути поддержки AMD."),
    bulletP("RTX 5060 Ti и RTX 5080 (16 ГБ) — недостаточно памяти для надёжной работы трёх пользователей."),
    bulletP("AMD MI350 — избыточная мощность для заявленной задачи."),

    // 3. Ключевые ограничения
    h1("3. Ключевые ограничения"),
    h2("3.1. Видеопамять — главный параметр GPU"),
    p("Модель LLM — это файл с весовыми коэффициентами. Чтобы модель работала, весь этот файл должен быть загружен в видеопамять карты. Если памяти не хватает, часть модели хранится в оперативной памяти компьютера, что замедляет работу в десятки раз."),
    ...image("01_model_vram.png", "Сколько видеопамяти нужно моделям после квантизации"),
    p("Модель glm-5.1 — публичная, но очень требовательная. В обычном виде занимает около 1.5 ТБ, после сжатия AWQ INT4 — 380 ГБ. Физически не помещается ни в одну из заявленных карт."),

    h2("3.2. Видеопамять разных карт"),
    ...image("02_gpu_capacity.png", "Видеопамять одной карты каждого типа"),

    h2("3.3. Почему при работе трёх пользователей возникает торможение"),
    p("Типичный запрос разработчика — «напиши функцию», «покажи ошибку», «найди все места использования» — порождает десятки подзапросов, которые агент отправляет модели. Три пользователя порождают шторм из 30–150 параллельных запросов."),
    p("Программы-серверы LLM делятся на два типа:"),
    bulletP("Простые (Ollama, LM Studio) обрабатывают запросы по очереди. Первый получает ответ, остальные ждут. Пользователи видят это как «программа зависла»."),
    bulletP("Серверные (vLLM, SGLang) используют «непрерывную пакетную обработку» — обрабатывают десятки запросов одновременно в одном GPU-проходе."),
    ...image("04_latency_ollama_vs_vllm.png", "Задержка отклика LLM при росте нагрузки"),
    p("Измерения 2026 года: при 50 одновременных запросах Ollama даёт задержку 99-й перцентили 24.7 секунды, vLLM на том же железе — менее 3 секунд при шестикратно большей пропускной способности."),
    p("Выбор серверной программы столь же важен, как выбор карты."),

    h2("3.4. Дообучение (LoRA, QLoRA)"),
    bulletP("LoRA добавляет к модели «адаптер» (1–5 % от размера). Требует памяти примерно на 30 % больше обычного использования."),
    bulletP("QLoRA — то же, но модель хранится в сжатом виде. Требование к памяти снижается до уровня обычного использования."),
    ...image("05_lora_vs_qlora.png", "Требования памяти: инференс vs LoRA vs QLoRA"),
    p("Для заявленной задачи (периодическое QLoRA над моделями 7–14 B) достаточно любой конфигурации с 16 ГБ+ на одной карте."),

    // 4. Все варианты
    h1("4. Все варианты конфигураций"),
    ...image("03_all_configs_vram.png", "Суммарная VRAM для всех возможных конфигураций из списка закупки"),
    p("Цветовая кодировка:"),
    bulletP("Красное: менее 20 ГБ — недостаточно для 3 пользователей даже на моделях 14 B."),
    bulletP("Оранжевое: 20–40 ГБ — работает с одним пользователем или минимальным контекстом."),
    bulletP("Голубое: 40–96 ГБ — комфортная работа 3–10 пользователей."),
    bulletP("Зелёное: более 96 ГБ — масштаб плюс дообучение больших моделей."),

    // 5. Сколько пользователей
    h1("5. Сколько пользователей держит каждая конфигурация"),
    ...image("09_users_capacity_heatmap.png", "Оценочная ёмкость по одновременным пользователям на модель"),
    p("Значения — при использовании vLLM с continuous batching, контекст 16К токенов, нагрузка от агентов. «нет VRAM» означает что модель физически не помещается в суммарную память конфигурации."),

    // 6. Разбор по группам
    h1("6. Разбор предложенных GPU по группам"),

    h2("6.1. Слабые потребительские 16 ГБ — RTX 5060 Ti и RTX 5080"),
    table({
      columns: [
        { text: "Кол-во карт", width: 1200, align: AlignmentType.CENTER },
        { text: "VRAM",        width: 900,  align: AlignmentType.CENTER },
        { text: "14B dense",   width: 1200, align: AlignmentType.CENTER },
        { text: "20B MoE",     width: 1200, align: AlignmentType.CENTER },
        { text: "35B MoE",     width: 1200, align: AlignmentType.CENTER },
        { text: "3 польз.",    width: 1100, align: AlignmentType.CENTER },
        { text: "LoRA 14B",    width: 1100, align: AlignmentType.CENTER },
        { text: "Итог",        width: 1940, align: AlignmentType.LEFT },
      ],
      rows: [
        ["1", "16", "Впритык", "Впритык", "Нет", "Нет", "Нет", "Single-user экспериментарий"],
        ["2", "32", "Да", "Да", "Нет", "2–3", "Нет", "Минимально серверная, до 20B"],
        ["4", "64", "Да", "Да", "Через TP", "8–12", "1 карта", "Работает с оговорками"],
      ],
    }),
    p(""),
    p("Оба варианта (5060 Ti и 5080) имеют одну проблему — 16 ГБ не хватает. RTX 5080 быстрее за счёт памяти (960 ГБ/с против 448), но потолок тот же. Для серверной работы с тремя пользователями эти карты не подходят в одиночной конфигурации."),
    p("Сценарий «4 × RTX 5060 Ti или 4 × RTX 5080» подробно разобран в техническом документе — суммарных 64 ГБ хватает, но без NVLink появляются существенные ограничения."),

    h2("6.2. Средние потребительские — RTX 4090 и RTX 5090"),
    table({
      columns: [
        { text: "Конфигурация", width: 1600, align: AlignmentType.LEFT   },
        { text: "VRAM",         width: 900,  align: AlignmentType.CENTER },
        { text: "3 польз.",     width: 1200, align: AlignmentType.CENTER },
        { text: "35B MoE",      width: 1000, align: AlignmentType.CENTER },
        { text: "70B",          width: 1000, align: AlignmentType.CENTER },
        { text: "LoRA 14B",     width: 1100, align: AlignmentType.CENTER },
        { text: "LoRA 35B",     width: 1100, align: AlignmentType.CENTER },
        { text: "Итог",         width: 940,  align: AlignmentType.LEFT },
      ],
      rows: [
        ["1× RTX 4090", "24", "До 4", "Да", "Нет", "Да", "Нет", "Минимум"],
        ["2× RTX 4090", "48", "До 8", "Да", "TP Q4", "Да", "Нет", "Малая команда"],
        ["3× RTX 4090", "72", "До 12", "Да", "Да Q4", "Да", "Да", "Спец-сборка"],
        [{ text: "4× RTX 4090", bold: true },
         { text: "96", bold: true }, "До 16", "Да", "Да Q4", "Да",
         { text: "Да (QLoRA)", bold: true }, { text: "Workstation", bold: true, color: C.ok }],
        ["1× RTX 5090", "32", "До 6", "Да", "Нет", "Да", "Нет", "Одиночная"],
        [{ text: "2× RTX 5090", bold: true },
         { text: "64", bold: true }, "До 14", "Да", "Q4", "Да",
         "Ограниченно", { text: "Оптимум", bold: true, color: C.ok }],
      ],
    }),

    h2("6.3. Устаревшие серверные — MI210 и MI250"),
    table({
      columns: [
        { text: "Конфигурация", width: 1800, align: AlignmentType.LEFT   },
        { text: "VRAM",         width: 1200, align: AlignmentType.CENTER },
        { text: "Поддержка",    width: 2400, align: AlignmentType.LEFT },
        { text: "Prebuilt vLLM", width: 1800, align: AlignmentType.CENTER },
        { text: "Итог",         width: 1660, align: AlignmentType.LEFT   },
      ],
      rows: [
        ["1× MI210",  "64",        "Завершается (CDNA 2, 2021)", "Нет (ручная сборка)",
         { text: "Не рекомендуется", color: C.bad }],
        ["2× MI210",  "128",       "То же + баги multi-GPU",    "Нет",
         { text: "Не рекомендуется", color: C.bad }],
        ["1× MI250",  "128 (2×64)", "То же",                     "Нет",
         { text: "Не рекомендуется", color: C.bad }],
        ["2× MI250",  "256",       "То же",                      "Нет",
         { text: "Не рекомендуется", color: C.bad }],
      ],
    }),
    p(""),
    p("Prebuilt Docker-образы AMD для vLLM (rocm/vllm) исключают MI210/MI250 из списка поддержки начиная с ROCm 7.0. Требуется самостоятельная сборка. Риск потери актуальной поддержки — 12–18 месяцев. MI250 также двухчиповая — требует спец. настройки inter-chip коммуникации."),
    p("Единственный сценарий покупки: если организация уже владеет такой картой и имеет собственную экспертизу ROCm. Новая закупка в 2026 году не оправдана."),

    h2("6.4. Современные серверные — MI300X"),
    table({
      columns: [
        { text: "Конфигурация", width: 1600, align: AlignmentType.LEFT   },
        { text: "VRAM",         width: 1000, align: AlignmentType.CENTER },
        { text: "3 польз.",     width: 1400, align: AlignmentType.CENTER },
        { text: "35B MoE",      width: 1200, align: AlignmentType.CENTER },
        { text: "GLM-5.1",      width: 1200, align: AlignmentType.CENTER },
        { text: "Масштаб",      width: 1400, align: AlignmentType.CENTER },
        { text: "Итог",         width: 1060, align: AlignmentType.LEFT },
      ],
      rows: [
        [{ text: "1× MI300X", bold: true },
         { text: "192", bold: true }, "Да, с запасом", "Да", "Нет",
         "25–30 польз.", { text: "Оптимум", bold: true, color: C.ok }],
        ["2× MI300X", "384", "Да, огромный запас", "Да", "Да (INT4)",
         "50–60 польз.", { text: "С запасом", color: C.ok }],
      ],
    }),
    p(""),
    bulletP("192 ГБ в одной карте — помещает модель плюс KV-кеши 20+ одновременных пользователей."),
    bulletP("Полная поддержка ROCm 7.0 + vLLM (официальный prebuilt Docker от AMD)."),
    bulletP("Оптимизации ROCM_AITER_FA дают 2.8–4.6x TPOT speedup против предыдущих поколений."),
    bulletP("Активная поддержка производителем до 2028–2029 гг."),

    h2("6.5. Флагманские серверные — MI350"),
    p("Архитектура CDNA 4, ~288 ГБ HBM3e. Преимущества: нативный MXFP4 / FP4, +80 % FP8 против MI300X."),
    p("Для заявленной задачи (3 разработчика, модели до 35 B, QLoRA 7–14 B) флагман избыточен. Оправдан при планах на 50+ пользователей или работе с моделями 100 B+."),

    // 7. OS
    h1("7. Операционная система"),
    p("Сервер должен работать под Linux. Ни одна из программ промышленного уровня (vLLM, SGLang, TensorRT-LLM, свежие версии ROCm) не имеет полноценной серверной поддержки Windows."),
    table({
      columns: [
        { text: "Оборудование",   width: 4000, align: AlignmentType.LEFT },
        { text: "Рекомендация",   width: 5360, align: AlignmentType.LEFT },
      ],
      rows: [
        ["NVIDIA RTX серии 40/50",         "Ubuntu 24.04 LTS (первичный) или Ubuntu 22.04 LTS"],
        ["AMD MI210 / MI250",              "Ubuntu 22.04 LTS или RHEL 9"],
        ["AMD MI300X / MI350",             "Ubuntu 24.04 LTS или RHEL 9"],
      ],
    }),
    p(""),
    p("Windows рассматривается только как среда для разработки клиентской части (IDE разработчика, инструменты). Сам сервер LLM — Linux."),

    // 8. Server params
    h1("8. Параметры серверного компьютера"),
    table({
      columns: [
        { text: "Компонент",  width: 2000, align: AlignmentType.LEFT },
        { text: "Вариант A (4× RTX 4090 / 2× RTX 5090)", width: 3680, align: AlignmentType.LEFT },
        { text: "Вариант B (1× MI300X)",                  width: 3680, align: AlignmentType.LEFT },
      ],
      rows: [
        ["Процессор",        "Threadripper Pro 7965WX (24 ядра)",        "2 × EPYC 9354 (64 ядра суммарно)"],
        ["ОЗУ",              "256 ГБ DDR5 ECC",                          "512 ГБ DDR5 ECC"],
        ["Материнская плата","WRX90, 7 × PCIe 5.0 x16",                  "Dell XE9680 / Supermicro AS-8125GS-TNMR2"],
        ["Системный диск",   "2 × 2 ТБ NVMe Gen5 (RAID 1)",              "2 × 3.84 ТБ NVMe (RAID 1)"],
        ["Диск моделей",     "4 × 4 ТБ NVMe Gen5 (RAID 10)",             "4 × 7.68 ТБ NVMe (RAID 10)"],
        ["Сеть",             "10 GbE",                                   "2 × 25 GbE"],
        ["Блок питания",     "2 × 1600 Вт Titanium",                     "4 × 2000 Вт Platinum (N+N)"],
        ["Корпус",           "Full-tower рабочая станция",               "4U rack-mount"],
        ["Охлаждение",       "Воздушное, 8+ вентиляторов",               "Серверное, стойка ≤ 22 °C"],
        ["ОС",               "Ubuntu 24.04 LTS",                         "Ubuntu 24.04 LTS"],
      ],
    }),

    // 9. Growth
    h1("9. Сценарий роста нагрузки"),
    ...image("10_growth_scenario.png", "Прогноз роста числа пользователей и потолки конфигураций"),
    p("Прогноз за два года:"),
    bulletP("Старт: 3 разработчика."),
    bulletP("6 месяцев: 5 (подключение тестировщиков)."),
    bulletP("12 месяцев: 7 (расширение команды)."),
    bulletP("18 месяцев: 10 (фоновые процессы, review-агенты, тесты)."),
    bulletP("24 месяца: 15 (интеграция с корпоративными инструментами)."),
    p("Потолки конфигураций:"),
    bulletP("1 × RTX 4090 / RTX 5090: до 5–6 пользователей (хватит на 3–6 месяцев)."),
    bulletP("4 × RTX 4090 или 2 × RTX 5090: до 12–14 пользователей (хватит на 18–24 месяца)."),
    bulletP("1 × MI300X: до 25–30 пользователей (хватит на 3+ года)."),

    // 10. Final recommendation
    h1("10. Финальная рекомендация"),
    p("Оптимальный выбор — AMD Instinct MI300X в серверном исполнении. Это решение:"),
    bulletP("не накладывает компромиссов по видеопамяти (192 ГБ в одной карте),"),
    bulletP("официально поддерживается производителем на 3–5 лет вперёд,"),
    bulletP("работает со всеми заявленными моделями кроме GLM-5.1,"),
    bulletP("масштабируется добавлением второй карты до 384 ГБ — тогда GLM-5.1 становится доступна в квантизации INT4,"),
    bulletP("обеспечивает плавную работу трёх разработчиков с запасом на рост до 15 человек,"),
    bulletP("поддерживает весь стек vLLM / SGLang через официальные контейнеры AMD."),
    p(""),
    p("Если формат серверного рэка не подходит по инфраструктурным причинам — замена на 4 × NVIDIA RTX 4090 в рабочей станции Threadripper Pro покрывает 80 % задач при форм-факторе «большой компьютер под столом»."),
    p("Технические обоснования, бенчмарки, подробные конфигурации, разбор гибридных сценариев и сценарий многокарточной работы на 4 × RTX 5060 Ti приведены в документе-спутнике «Техническое обоснование»."),
  ];

  return new Document({
    creator: "DSP-GPU R&D",
    title: "LLM Hardware Executive Summary — 2026-04-22",
    styles: baseStyles(),
    numbering: baseNumbering(),
    sections: [baseSection(children)],
  });
}

// ═════════════════════════════════════════════════════════════════════════
// 3. TECHNICAL DEEP DIVE
// ═════════════════════════════════════════════════════════════════════════
function buildTechnical() {
  const children = [
    ...titleBlock(
      "Выбор оборудования для локального LLM-сервера",
      "Техническое обоснование",
      { date: "22 апреля 2026 г.", author: "Отдел НИОКР",
        audience: "руководство, IT-администраторы, архитекторы", version: "2.0" }
    ),

    // 1.
    h1("1. Задача и ограничения"),
    h2("1.1. Постановка"),
    p("Подобрать аппаратную конфигурацию сервера, способного:"),
    bulletP("размещать в памяти GPU модели qwen3.6-35B-A3B, gpt-oss-20b, glm-5.1, deepseek-r1:14b-qwen-distill, qwen2.5-coder:14b;"),
    bulletP("обеспечивать параллельную работу не менее трёх пользователей через программных агентов;"),
    bulletP("предоставлять ресурсы для периодического дообучения моделей 7–14 B методом LoRA или QLoRA."),

    h2("1.2. Ограничения окружения"),
    bulletP("Рабочая среда — Linux. Серверные реализации vLLM, SGLang, TensorRT-LLM работают преимущественно под Linux."),
    bulletP("Сервер размещается в корпоративной серверной или в виде рабочей станции."),
    bulletP("Рост нагрузки в течение 1–2 лет — до 5–10 пользователей."),

    h2("1.3. Что не рассматривается"),
    bulletP("Стоимость оборудования."),
    bulletP("Обучение моделей с нуля."),
    bulletP("Полное дообучение моделей свыше 14 B."),

    // 2. Модели
    h1("2. Модели, заявленные к тестированию"),
    ...image("01_model_vram.png", "Требования видеопамяти по моделям"),

    h2("2.1. Сводная таблица"),
    table({
      columns: [
        { text: "Модель",       width: 2400, align: AlignmentType.LEFT },
        { text: "Архитектура",  width: 2200, align: AlignmentType.LEFT },
        { text: "Всего, B",     width: 900,  align: AlignmentType.CENTER },
        { text: "Активн., B",   width: 900,  align: AlignmentType.CENTER },
        { text: "Файл (Q4)",    width: 1200, align: AlignmentType.CENTER },
        { text: "VRAM, ГБ",     width: 1760, align: AlignmentType.CENTER },
      ],
      rows: [
        ["qwen2.5-coder:14b",        "Dense Transformer",          "14",   "14",    "~8.9 ГБ",  "10–12"],
        ["deepseek-r1:14b-qwen",     "Dense (дистилляция R1)",     "14",   "14",    "~9 ГБ",    "12–14"],
        ["gpt-oss-20b",              "MoE",                        "21",   "3.6",   "~13 ГБ",   "15–16"],
        [{ text: "qwen3.6-35B-A3B", bold: true },
         "MoE (Gated Delta Net)",   "35",   "3",     "~21 ГБ",   "23–26"],
        [{ text: "glm-5.1", color: C.bad },
         "MoE (Z.ai)",   "754",  "40",
         { text: "~380 ГБ INT4", color: C.bad },
         { text: "требует 8× H100", color: C.bad }],
      ],
    }),

    h2("2.2. Комментарии по моделям"),
    p({ text: "Qwen3.6-35B-A3B. ", bold: true }),
    p("Выпущена 16 апреля 2026 г. Apache 2.0. Скорость инференса сопоставима с плотными моделями 7 B за счёт MoE-архитектуры (активны только 3 B параметров). Требует ~21 ГБ VRAM в Q4-квантизации."),
    p({ text: "GPT-OSS-20B. ", bold: true }),
    p("OpenAI, август 2025. Нативная MXFP4-квантизация (4.25 бита на параметр) — заложена разработчиком, а не применена пост-фактум. Помещается в 16 ГБ VRAM потребительских карт."),
    p({ text: "GLM-5.1. ", bold: true }),
    p("Z.ai (бывш. Zhipu), открытая версия от 7 апреля 2026 г. Сопоставима с GPT-5.4 и Claude по кодингу. Однако 754 B параметров делают её непригодной для локальной рабочей станции. Требует кластер серверного класса (8 × H200 либо 4–8 × MI300X)."),
    p({ text: "DeepSeek-R1-14B-Qwen-Distill. ", bold: true }),
    p("Дистиллированная версия большой DeepSeek-R1 (671 B) через Qwen2.5-14B. Поддерживает tool calling. Работает как обычная 14 B модель, но генерирует «цепочку рассуждений» — то есть выдаёт вдвое-втрое больше токенов на запрос."),
    p({ text: "Qwen2.5-Coder-14B. ", bold: true }),
    p("Классическая плотная модель, специализированная под кодогенерацию."),

    // 3. Torможение
    h1("3. Почему при нагрузке от нескольких пользователей возникает торможение"),
    h2("3.1. Как работает LLM при одиночном запросе"),
    p("Один запрос — это цикл «прочитать текст, сгенерировать следующий токен, прочитать снова, сгенерировать ещё». Для 500-токенного ответа GPU выполняет 500 проходов через миллиарды весов модели."),
    p("Ключевые понятия:"),
    bulletP("Prefill (загрузка). Первая фаза — модель читает весь присланный текст. Время пропорционально длине запроса."),
    bulletP("Decode (декодирование). Последовательная генерация токенов. Время ограничено пропускной способностью памяти GPU. Поэтому важна скорость памяти (HBM3 у серверных карт, GDDR7 у потребительских)."),
    bulletP("KV-cache. Промежуточная память внимания. Растёт линейно с длиной контекста. Для контекста 32 000 токенов на модели 14 B — около 1–2 ГБ на один запрос."),

    h2("3.2. Агентская нагрузка"),
    p("Три пользователя через AI-агента порождают не три запроса, а шторм из 30–150. Одна команда «найди и исправь ошибку» = 20–50 обращений к модели."),

    h2("3.3. Простые серверы (Ollama) — очередь"),
    p("Классические простые серверы обрабатывают запросы последовательно. Настройка OLLAMA_NUM_PARALLEL позволяет некоторую параллельность, но: модель копируется в VRAM N раз; на одном GPU конкурируют несколько экземпляров за память; начиная с 4–5 параллельных запросов появляется эффект «head-of-line blocking» — медленный запрос блокирует всю партию."),

    h2("3.4. Правильный подход: continuous batching"),
    p("Серверные реализации (vLLM, SGLang, TensorRT-LLM) объединяют разные запросы в одну общую матрицу и одновременно генерируют для них следующий токен."),
    ...image("07_batching_scheme.png", "Ollama (последовательная обработка) против vLLM (continuous batching)"),
    p("Технологии, обеспечивающие continuous batching:"),
    bulletP("PagedAttention — KV-кеш разбит на страницы, память не фрагментируется."),
    bulletP("Continuous batching — запросы вливаются в партию не дожидаясь окончания предыдущей."),
    bulletP("Chunked prefill — длинные prefill-фазы нарезаются, чтобы не блокировать decode коротких запросов."),

    h2("3.5. Численные различия"),
    ...image("04_latency_ollama_vs_vllm.png", "Задержка p99 под нагрузкой: Ollama vs vLLM"),
    p("На GPT-OSS-120B, 2 × H100: vLLM при 100 одновременных запросах даёт 4741 токенов/сек, лучший TTFT на всех уровнях концуррентности."),
    p("На среднем стенде (1 × RTX 4090), 14 B модель:"),
    bulletP("Ollama, 1 пользователь: 70–90 токенов/сек."),
    bulletP("Ollama, 10 параллельных запросов: среднее 8–15 токенов/сек на пользователя, p99 > 20 с."),
    bulletP("vLLM, 10 параллельных запросов: 60–80 токенов/сек на пользователя, p99 1–3 с."),
    p("Вывод. При переходе от одного пользователя к трём с агентами нельзя оставаться на Ollama. Серверная программа (vLLM) не просто ускоряет — она делает нагрузку принципиально переносимой."),

    // 4. Платформы
    h1("4. Программные платформы-серверы LLM"),
    h2("4.1. Сравнительная таблица"),
    table({
      columns: [
        { text: "Платформа",              width: 1800, align: AlignmentType.LEFT },
        { text: "Continuous batching",    width: 2000, align: AlignmentType.CENTER },
        { text: "AMD ROCm",               width: 1500, align: AlignmentType.CENTER },
        { text: "≥ 10 польз.",            width: 1400, align: AlignmentType.CENTER },
        { text: "Сложность установки",    width: 2660, align: AlignmentType.CENTER },
      ],
      rows: [
        ["Ollama",          "Ограниченно", "Да", "Нет", "Очень низкая"],
        ["LM Studio",       "Нет",         "Да", "Нет", "Очень низкая (GUI)"],
        ["llama.cpp",       "Частично",    "Да", "Ограниченно", "Средняя"],
        [{ text: "vLLM", bold: true },
         { text: "Да", bold: true }, { text: "Да (ROCm 7)", bold: true },
         { text: "Да (100+)", bold: true }, { text: "Средняя", bold: true }],
        ["SGLang",          "Да",          "Да (ROCm 7)", "Да (100+)", "Средняя"],
        ["TensorRT-LLM",    "Да",          "Нет", "Да", "Высокая"],
      ],
    }),

    h2("4.2. Рекомендация: vLLM"),
    bulletP("Полноценный continuous batching."),
    bulletP("Нативная поддержка ROCm 7 (официальные Docker-образы AMD для MI300X, MI325X, MI350, MI355X)."),
    bulletP("Поддерживает MXFP4-квантизацию gpt-oss-20b, AWQ, GPTQ, FP8."),
    bulletP("OpenAI-совместимый API — агенты не требуют специальной адаптации."),
    bulletP("Активное сообщество, ежемесячные релизы."),

    // 5. Топология
    h1("5. Топология серверной части"),
    ...image("06_architecture.png", "Топология: 3 пользователя через AI-агентов, LLM-сервер, GPU"),
    p("Компоненты:"),
    bulletP("Пользователи с AI-агентами — клиенты (IDE-плагины, CLI, web)."),
    bulletP("vLLM / SGLang — серверная программа, принимает HTTP-запросы по OpenAI-совместимому API."),
    bulletP("Continuous batching — объединяет запросы в батчи на лету."),
    bulletP("PagedAttention — эффективно использует VRAM, разбивая KV-кеш на страницы."),
    bulletP("GPU — модель в VRAM, KV-кеши для всех активных пользователей."),
    bulletP("Disk cache HSACO — скомпилированные GPU-ядра (через KernelCacheService v2)."),
    bulletP("Модели — NVMe-диск с исходными файлами в формате Hugging Face."),

    // 6. Расчёт VRAM
    h1("6. Расчёт видеопамяти под рабочую нагрузку"),
    h2("6.1. Формула"),
    p({ text: "VRAM_total = VRAM_weights + VRAM_kv_cache × N_users + VRAM_activation + VRAM_overhead",
        font: "Consolas" }),
    bulletP("VRAM_weights — размер весов после квантизации."),
    bulletP("VRAM_kv_cache — память на один активный контекст."),
    bulletP("N_users — число одновременных контекстов."),
    bulletP("VRAM_activation — временные буферы (~1–2 ГБ для 14–35 B)."),
    bulletP("VRAM_overhead — память драйвера, CUDA context, vLLM structures (~1–3 ГБ)."),

    h2("6.2. KV-cache по моделям"),
    table({
      columns: [
        { text: "Модель",      width: 2400, align: AlignmentType.LEFT },
        { text: "Слоёв",       width: 1400, align: AlignmentType.CENTER },
        { text: "Hidden dim",  width: 1800, align: AlignmentType.CENTER },
        { text: "KV на 1 токен", width: 1800, align: AlignmentType.CENTER },
        { text: "KV на 32К",    width: 1960, align: AlignmentType.CENTER },
      ],
      rows: [
        ["qwen2.5-coder:14b",    "48", "5120", "~200 КБ", "~6.5 ГБ"],
        ["deepseek-r1:14b",      "48", "5120", "~200 КБ", "~6.5 ГБ"],
        ["gpt-oss-20b",          "32", "2880", "~40 КБ",  "~1.3 ГБ"],
        ["qwen3.6-35B-A3B",      "62", "4096", "~180 КБ", "~5.8 ГБ"],
      ],
    }),
    p(""),
    p("С FP8/INT8 KV-кешем (vLLM поддерживает) память сокращается вдвое-вчетверо."),

    h2("6.3. Практические сценарии"),
    p("Сценарий «3 пользователя, 32К контекста, qwen3.6-35B-A3B, Q4»:"),
    table({
      columns: [
        { text: "Компонент",   width: 5000, align: AlignmentType.LEFT },
        { text: "Размер",      width: 4360, align: AlignmentType.CENTER },
      ],
      rows: [
        ["Веса модели (Q4_K_M)",                     "21 ГБ"],
        ["KV-кеш × 3 × 32К (FP8)",                  "~9 ГБ"],
        ["Буферы активации",                         "2 ГБ"],
        ["Overhead vLLM + CUDA/ROCm",               "3 ГБ"],
        [{ text: "Итого", bold: true }, { text: "~35 ГБ", bold: true }],
      ],
    }),
    p(""),
    bulletP("RTX 4090 (24 ГБ) — не хватает."),
    bulletP("RTX 5090 (32 ГБ) — впритык, работает при сокращении контекста или FP8 KV."),
    bulletP("2 × RTX 5090 (64 ГБ) — с комфортным запасом."),
    bulletP("MI300X (192 ГБ) — запас в 5 раз."),

    // 7. GPU по группам
    h1("7. Анализ предложенных GPU по группам"),
    h2("7.1. Все варианты конфигураций"),
    ...image("03_all_configs_vram.png", "Все возможные конфигурации: суммарная VRAM"),

    h2("7.2. RTX 5060 Ti (16 ГБ) — слабые потребительские"),
    p("Архитектура: Blackwell GB206, GDDR7, 448 ГБ/с. Бюджетная карта текущего поколения."),
    p({ text: "Одиночная карта. ", bold: true }),
    p("Минимальная для single-user экспериментов. После модели 14 B (12 ГБ) остаётся 4 ГБ на KV-кеши. 3 одновременных контекста по 16К токенов требуют по 1.5–2 ГБ — память кончается."),
    p({ text: "Две карты (32 ГБ). ", bold: true }),
    p("Работают с 14 B моделями через tensor parallelism, но копирование одного слоя на две карты стоит ~30 % без NVLink. 20 B впритык, 35 B — нет."),
    p({ text: "Четыре карты (64 ГБ). ", bold: true }),
    p("Теоретически хватает на qwen3.6-35B-A3B и серверную нагрузку. Ограничения: на consumer-материнских платах нет 4 × PCIe 5.0 x16 одновременно (делится как x8/x8/x8/x8); TP на 4 картах без NVLink — падение 25–40 % против одиночной 64 ГБ карты; требует Threadripper Pro, двойной БП, спец. корпус."),
    p({ text: "Вердикт. ", bold: true }),
    p("Для серверной нагрузки не рекомендуется. Подходит как бюджетный вариант для персональной dev-станции с 1 пользователем."),

    h2("7.3. RTX 5080 (16 ГБ) — слабые потребительские"),
    p("Архитектура: Blackwell GB203, GDDR7, 960 ГБ/с (вдвое быстрее 5060 Ti)."),
    p("Профиль по количеству карт идентичен 5060 Ti — те же 16 ГБ на карту. Более высокая пропускная способность памяти даёт ~30 % прирост на одном пользователе, но потолок «16 ГБ на одну модель» остаётся."),
    p({ text: "Вердикт. ", bold: true }),
    p("Те же ограничения, что у 5060 Ti. Не рекомендуется для серверной нагрузки."),

    h2("7.4. Глубокий разбор: 4 × RTX 5060 Ti или 4 × RTX 5080 (64 ГБ суммарно)"),
    p("Этот сценарий заслуживает отдельного разбора, так как выглядит привлекательно — четыре небольшие карты дают 64 ГБ суммарной видеопамяти."),
    p({ text: "Что работает:", bold: true }),
    bulletP("Инференс 14 B моделей (qwen2.5-coder, deepseek-r1:14b) — комфортно. Модель помещается на одну карту, остальные 3 держат KV-кеши через pipeline parallelism."),
    bulletP("Инференс gpt-oss-20b (MoE, MXFP4) — модель на одну карту, остальные на expert parallelism. Отлично ложится на MoE."),
    bulletP("Инференс qwen3.6-35B-A3B — модель занимает две карты через tensor parallelism (по 10.5 ГБ на каждой), остальные две — KV-кеши. Работает при ограничении контекста 16К."),
    bulletP("QLoRA над 7 B моделью — одна карта, 8 ГБ, без проблем."),
    p({ text: "Что не работает или с оговорками:", bold: true }),
    bulletP("Инференс 70 B — нужно минимум 48 ГБ на веса, 64 ГБ впритык; TP на 4 картах без NVLink режет производительность."),
    bulletP("Инференс GLM-5.1 — физически невозможно (нужно 380 ГБ)."),
    bulletP("LoRA над 14 B — нужно 45 ГБ; не помещается на одну карту, 4-карт tensor parallel для обучения добавляет 2x overhead."),
    bulletP("QLoRA над 35 B — нужно 32 ГБ; одна карта мала, распределение между двумя возможно но сложно."),
    bulletP("Full fine-tuning — невозможно ни в каком варианте."),
    p({ text: "Проблемы связности:", bold: true }),
    bulletP("У этих карт нет NVLink. Для tensor parallelism используется PCIe — на порядок медленнее."),
    bulletP("Пропускная способность PCIe 5.0 x16 = 64 ГБ/с. NVLink 4.0 = 900 ГБ/с."),
    bulletP("TP «в лоб» на PCIe теряет 15–30 % при двух картах, 25–40 % при четырёх."),
    p({ text: "Инфраструктурные сложности:", bold: true }),
    bulletP("Материнская плата с четырьмя PCIe 5.0 x16: только WRX90 / TRX50 на Threadripper Pro."),
    bulletP("БП: 4 × 300 Вт (5060 Ti) + 350 Вт CPU + обвязка = 1600–1800 Вт. Для 5080 — 4 × 360 Вт = 2000 Вт. Нужны два БП."),
    bulletP("Корпус: full-tower (Fractal Define 7 XL) или готовая сборка (Bizon, Exxact)."),
    bulletP("Охлаждение: 8+ вентиляторов с учётом четырёх выдувающих потоков."),
    p({ text: "Сравнение с альтернативами на ту же суммарную VRAM:", bold: true }),
    table({
      columns: [
        { text: "Конфигурация",   width: 2400, align: AlignmentType.LEFT },
        { text: "VRAM",           width: 900,  align: AlignmentType.CENTER },
        { text: "Реальная прод.", width: 2200, align: AlignmentType.CENTER },
        { text: "Сложность",      width: 1800, align: AlignmentType.CENTER },
        { text: "Итог",           width: 2060, align: AlignmentType.LEFT },
      ],
      rows: [
        ["4 × RTX 5060 Ti", "64", "Базовая (PCIe bottleneck)", "Высокая",
         "Бюджетный серверный"],
        ["4 × RTX 5080",    "64", "На 30 % выше",            "Высокая",
         "Средний серверный"],
        [{ text: "2 × RTX 5090", bold: true },
         { text: "64", bold: true }, { text: "На 80 % выше", bold: true },
         "Средняя", { text: "Лучший потребительский", bold: true, color: C.ok }],
        ["1 × AMD MI210",   "64", "На 20 % выше",            "Средняя",
         { text: "Не рек. (поддержка)", color: C.bad }],
      ],
    }),
    p(""),
    p("Двух RTX 5090 (32 × 2 = 64 ГБ) достаточно для того же результата при вдвое меньшем количестве карт, без проблем с PCIe-связностью и в более простой сборке."),

    h2("7.5. RTX 4090 (24 ГБ) — средние потребительские"),
    p("Архитектура: Ada Lovelace AD102, GDDR6X, 1008 ГБ/с. Выпуск 2022, производство завершено в 2025."),
    bulletP("Одиночная карта — 24 ГБ хватает на все модели до 35 B в Q4. Для 3 пользователей впритык, комфортно для 1–2."),
    bulletP("Две карты (48 ГБ) — 2–3 пользователя на 35 B, 3–5 на 14 B. 70 B требует TP и Q4."),
    bulletP("Три карты (72 ГБ) — редкая конфигурация. Многие материнские платы не дают трёх полноценных x16 слотов."),
    bulletP("Четыре карты (96 ГБ) — классическая «AI-workstation»: 3–5 пользователей, все модели кроме GLM-5.1."),
    p("PCIe-ограничения: RTX 4090 не имеет NVLink (убран в 40-й серии). Все коммуникации через PCIe 5.0."),
    p("Закупка: RTX 4090 снята с производства. В 2026 г. — остатки на складах. При заказе 4 одинаковых карт возможны задержки поставки."),

    h2("7.6. RTX 5090 (32 ГБ) — средние потребительские"),
    p("Архитектура: Blackwell GB202, GDDR7, 1792 ГБ/с. Флагман потребительской серии 2025 года."),
    bulletP("Одиночная карта — 32 ГБ на все модели до 35 B с запасом. 3–5 пользователей на 14 B, 2–3 на 35 B."),
    bulletP("Две карты (64 ГБ) — лучший потребительский вариант. Суммарно меньше 4 × RTX 4090 (64 vs 96), но меньше карт даёт меньше PCIe-коммуникаций, проще сборку (один БП 1500 Вт), свежий Blackwell с FP8."),
    p("Бенчмарки: 2 × RTX 5090 на Llama 70B в Q4 — ~27 токенов/сек, сопоставимо с 1 × H100."),

    h2("7.7. AMD MI210 (64 ГБ) — устаревшие серверные"),
    p("Архитектура: CDNA 2, HBM2e, 1638 ГБ/с. Выпущена 2021."),
    p("Ключевая проблема: prebuilt Docker-контейнеры AMD в серии ROCm 7.0 исключают MI210. Основной поток поддержки — MI300/MI325/MI350/MI355."),
    p({ text: "Вердикт: ", bold: true, color: C.bad }),
    p("Не рекомендуется. Риск остаться без актуального программного стека через 12–18 месяцев."),

    h2("7.8. AMD MI250 — устаревшие серверные"),
    p("Архитектура: CDNA 2, 128 ГБ HBM2e (2 × 64 ГБ в одной карте OAM), 3276 ГБ/с на чип."),
    p("Особенность: двухчиповая архитектура. Для ПО это «два GPU в одной карте». Требует спец. настройки inter-chip коммуникации (xGMI). Современные prebuilt решения AMD оптимизированы под MI300."),
    p({ text: "Вердикт: ", bold: true, color: C.bad }),
    p("Не рекомендуется. Те же факторы, что у MI210."),

    h2("7.9. AMD MI300X (192 ГБ HBM3) — актуальные серверные"),
    p("Архитектура: CDNA 3, 192 ГБ HBM3, 5.3 ТБ/с. Массово доступна с 2024."),
    table({
      columns: [
        { text: "Параметр",          width: 3800, align: AlignmentType.LEFT   },
        { text: "Значение",           width: 5560, align: AlignmentType.LEFT },
      ],
      rows: [
        ["Память",                   "192 ГБ HBM3"],
        ["Bandwidth памяти",         "5.3 ТБ/с"],
        ["FP16 производительность",  "1307 TFLOPS"],
        ["BF16 производительность",  "1307 TFLOPS"],
        ["FP8 производительность",   "2614 TFLOPS"],
        ["TDP",                      "750 Вт"],
      ],
    }),
    p(""),
    bulletP("1 × MI300X — 3 пользователя с огромным запасом, до 25–30 пользователей."),
    bulletP("2 × MI300X (в OAM-шасси) — 384 ГБ суммарно, поднимает GLM-5.1 в AWQ INT4 и 70 B в FP16."),

    h2("7.10. AMD MI350 — флагманские"),
    p("Архитектура: CDNA 4, HBM3e, до 288 ГБ. Выпуск середина 2025."),
    p("Преимущества: нативный MXFP4 / FP4; +80 % FP8 производительности против MI300X."),
    p({ text: "Вердикт: ", bold: true }),
    p("Избыточно для задачи «3 пользователя, модели до 35 B». Оправдано при планах на 50+ пользователей или работе с моделями 100 B+."),

    // 8. Parallelism
    h1("8. Multi-GPU: три типа параллелизма"),
    ...image("08_parallelism_types.png", "Tensor vs Pipeline vs Expert parallelism"),
    p("При использовании нескольких GPU существует три способа разделения работы."),

    h2("8.1. Tensor Parallelism (TP)"),
    p("Каждый слой модели разбивается на несколько частей. Все GPU одновременно обрабатывают один запрос, выполняя свою часть вычислений, затем синхронизируются через операцию all-reduce."),
    bulletP("Плюсы: самый быстрый при достаточной пропускной способности связи."),
    bulletP("Минусы: требует быстрой связи (NVLink, InfinityFabric). На PCIe — потери 15–30 %."),
    bulletP("Когда: серверные карты с NVLink. Не применять на 4 × RTX 4090 без NVLink."),

    h2("8.2. Pipeline Parallelism (PP)"),
    p("Модель делится по слоям: первые N слоёв на GPU 1, следующие N — на GPU 2 и т.д. Данные текут через GPU как через конвейер."),
    bulletP("Плюсы: простая коммуникация (только между соседними GPU). Хорошо работает на PCIe."),
    bulletP("Минусы: пока работает GPU 2, GPU 1 простаивает. Нужен большой batch, чтобы все были нагружены."),
    bulletP("Когда: потребительские карты на PCIe, большой batch size."),

    h2("8.3. Expert Parallelism (EP) — для MoE"),
    p("Подходит только для MoE-моделей (gpt-oss, qwen3.6, glm-5.1). Разные «эксперты» размещаются на разных GPU. Router направляет запрос к нужному эксперту."),
    bulletP("Плюсы: хорошо масштабируется, не требует all-reduce."),
    bulletP("Минусы: балансировка нагрузки зависит от распределения запросов."),
    bulletP("Когда: для MoE-моделей как замена tensor parallelism."),

    h2("8.4. Выбор по железу"),
    table({
      columns: [
        { text: "Железо",                           width: 4400, align: AlignmentType.LEFT },
        { text: "Рекомендуемый parallelism",        width: 4960, align: AlignmentType.LEFT },
      ],
      rows: [
        ["1 GPU",                                           "Не применяется"],
        ["2–4 × RTX (PCIe, нет NVLink)",                    "Pipeline (dense) / Expert (MoE)"],
        ["2–8 × MI300X (InfinityFabric)",                   "Tensor Parallelism"],
        ["2 × RTX 5090 с NVLink (если есть)",               "Tensor Parallelism"],
      ],
    }),

    // 9. ОС
    h1("9. Операционная система"),
    h2("9.1. Совместимость"),
    table({
      columns: [
        { text: "ОС",                   width: 2400, align: AlignmentType.LEFT },
        { text: "NVIDIA",               width: 1200, align: AlignmentType.CENTER },
        { text: "ROCm",                 width: 1400, align: AlignmentType.CENTER },
        { text: "Серверная зрелость",   width: 1800, align: AlignmentType.CENTER },
        { text: "Рекомендация",         width: 2560, align: AlignmentType.LEFT },
      ],
      rows: [
        [{ text: "Ubuntu 24.04 LTS", bold: true },
         "Полная", "Полная (7.0)", "Высокая", { text: "Основной выбор", bold: true, color: C.ok }],
        ["Ubuntu 22.04 LTS", "Полная", "Полная (7.0)", "Высокая", "Резервный"],
        ["RHEL 9",           "Полная", "Полная (7.0)", "Очень высокая", "При стандарт. на Red Hat"],
        ["Debian 12",        "Полная", "Частичная",    "Средняя", "Только для опытных админов"],
        ["Windows 11",       "CUDA",   "Нет серверной","Низкая",  { text: "Не рекомендуется", color: C.bad }],
      ],
    }),

    h2("9.2. Требования к ядру и пакетам"),
    p({ text: "NVIDIA RTX 50-й серии: ", bold: true }),
    p("CUDA Toolkit ≥ 12.6, драйвер ≥ 560, ядро Linux ≥ 6.6."),
    p({ text: "AMD MI300X / MI350: ", bold: true }),
    p("Ядро Linux ≥ 6.8 (MI350 ≥ 6.10), amdgpu-dkms ≥ 6.10.5, glibc ≥ 2.35."),
    p("Ubuntu 24.04 удовлетворяет из коробки. Ubuntu 22.04 требует HWE-ядра."),

    h2("9.3. Контейнеризация"),
    bulletP("AMD: официальный образ rocm/vllm:rocm7.0_vllm_mi300x."),
    bulletP("NVIDIA: nvcr.io/nvidia/pytorch:25.01-py3 + vllm."),
    bulletP("Контейнер изолирует версии CUDA/ROCm от системы."),
    bulletP("Обновление vLLM = подмена тега контейнера."),

    // 10. LoRA/QLoRA
    h1("10. Дообучение: LoRA и QLoRA"),
    ...image("05_lora_vs_qlora.png", "Требования памяти: инференс vs LoRA vs QLoRA"),
    h2("10.1. Суть технологий"),
    p({ text: "LoRA (Low-Rank Adaptation). ", bold: true }),
    p("Добавляет к модели «адаптер» (0.1–5 % от размера). Исходная модель остаётся в памяти в полной точности; адаптер обучается."),
    p({ text: "QLoRA. ", bold: true }),
    p("То же самое, но базовая модель хранится в квантизованном виде (4-бит). Экономит 2–4 раза памяти."),

    h2("10.2. Практические требования"),
    p("Для заявленной задачи (периодическое QLoRA над 7–14 B моделями) достаточно:"),
    bulletP("RTX 4090 (24 ГБ) — покрывает с запасом."),
    bulletP("RTX 5090 (32 ГБ) — ещё комфортнее."),
    bulletP("MI300X (192 ГБ) — огромный запас, возможно QLoRA на 35–70 B."),

    h2("10.3. Фреймворки"),
    bulletP("Unsloth — самый быстрый (2–5x против стандартного), поддержка AMD ROCm."),
    bulletP("Axolotl — классический YAML-конфигурируемый."),
    bulletP("TRL (Hugging Face) — базовый, работает везде."),
    bulletP("PEFT (Hugging Face) — низкоуровневая библиотека-обёртка."),

    // 11. Рост
    h1("11. Сценарий роста нагрузки"),
    ...image("10_growth_scenario.png", "Прогноз роста пользователей за 2 года"),
    table({
      columns: [
        { text: "Время",         width: 1800, align: AlignmentType.CENTER },
        { text: "Пользователей", width: 2200, align: AlignmentType.CENTER },
        { text: "Причина роста", width: 5360, align: AlignmentType.LEFT },
      ],
      rows: [
        ["Старт",    "3",  "Начальная команда"],
        ["6 мес.",   "5",  "Подключение тестировщиков"],
        ["12 мес.",  "7",  "Расширение команды"],
        ["18 мес.",  "10", "Фоновые процессы: review-агенты, тесты"],
        ["24 мес.",  "15", "Интеграция с корпоративными инструментами"],
      ],
    }),
    p(""),
    p("Потолки конфигураций:"),
    bulletP("1 × RTX 4090 / 5090: до 5–6 пользователей (хватит на 3–6 месяцев)."),
    bulletP("4 × RTX 4090 / 2 × RTX 5090: до 12–14 (хватит на 18–24 месяца)."),
    bulletP("1 × MI300X: до 25–30 (хватит на 3+ года)."),

    // 12. Конфиги
    h1("12. Рекомендуемые конфигурации серверов"),
    h2("12.1. Heatmap: пользователи на конфигурацию"),
    ...image("09_users_capacity_heatmap.png", "Сколько пользователей держит каждая конфигурация"),

    h2("12.2. Вариант A: рабочая станция NVIDIA (4× RTX 4090 или 2× RTX 5090)"),
    table({
      columns: [
        { text: "Компонент",     width: 3000, align: AlignmentType.LEFT },
        { text: "Характеристика", width: 6360, align: AlignmentType.LEFT },
      ],
      rows: [
        ["Процессор",        "AMD Threadripper Pro 7965WX (24 ядра, 128 PCIe 5.0 lanes)"],
        ["ОЗУ",              "256 ГБ DDR5 ECC RDIMM"],
        ["Материнская плата","ASUS WRX90 (7 × PCIe 5.0 x16)"],
        ["Системный диск",   "2 × 2 ТБ Samsung 990 Pro (RAID 1)"],
        ["Диск моделей",     "4 × 4 ТБ WD Black SN850X (RAID 10, 8 ТБ полезно)"],
        ["Сеть",             "10 GbE"],
        ["Блок питания",     "2 × Corsair AX1600i (суммарно 3200 Вт)"],
        ["Корпус",           "Fractal Design Define 7 XL или готовая сборка Bizon / Exxact"],
        ["Охлаждение",       "Воздушное, 8+ вентиляторов"],
        ["ОС",               "Ubuntu 24.04 LTS"],
        ["Драйвер/CUDA",     "NVIDIA 560.xx + CUDA 12.6"],
        ["Контейнер",        "nvcr.io/nvidia/pytorch:25.01-py3 + vLLM 0.9+"],
      ],
    }),

    h2("12.3. Вариант B: серверное решение AMD Instinct (1× MI300X)"),
    table({
      columns: [
        { text: "Компонент",    width: 3000, align: AlignmentType.LEFT },
        { text: "Характеристика", width: 6360, align: AlignmentType.LEFT },
      ],
      rows: [
        ["Платформа",        "Dell PowerEdge XE9680 / Supermicro AS-8125GS-TNMR2 / HPE Cray XD675"],
        ["Процессор",        "2 × AMD EPYC 9354 (32 ядра × 2)"],
        ["ОЗУ",              "512 ГБ DDR5 ECC RDIMM"],
        ["Системный диск",   "2 × 3.84 ТБ Samsung PM9A3 (RAID 1)"],
        ["Диск моделей",     "4 × 7.68 ТБ Samsung PM9A3 (RAID 10, 15.36 ТБ полезно)"],
        ["Сеть",             "2 × Mellanox ConnectX-6 25 GbE"],
        ["Блок питания",     "4 × 2000 Вт 80+ Platinum (N+N)"],
        ["Корпус",           "4U rack-mount"],
        ["Охлаждение",       "Серверное стоечное, холодный коридор ≤ 22 °C"],
        ["ОС",               "Ubuntu 24.04 LTS"],
        ["Драйвер/ROCm",     "amdgpu-dkms + ROCm 7.0"],
        ["Контейнер",        "rocm/vllm:rocm7.0_vllm_0.9.x_mi300x"],
      ],
    }),

    h2("12.4. Сводное сравнение вариантов A и B"),
    table({
      columns: [
        { text: "Параметр",                   width: 2800, align: AlignmentType.LEFT },
        { text: "Вариант A (4× RTX 4090)",    width: 3280, align: AlignmentType.LEFT },
        { text: "Вариант B (1× MI300X)",      width: 3280, align: AlignmentType.LEFT },
      ],
      rows: [
        ["Суммарная VRAM",              "96 ГБ GDDR6X",          "192 ГБ HBM3"],
        ["Bandwidth памяти",            "4032 ГБ/с (суммарно)",  "5300 ГБ/с"],
        ["Модели до 35B (MoE)",         "Да, с запасом",         "Да, с большим запасом"],
        ["Модели 70B в Q4",             "Да, TP",                "Да, одна карта"],
        ["GLM-5.1",                     "Невозможно",            "Только при 2 картах, INT4"],
        ["3 пользователя",              "Комфортно",             "Очень комфортно"],
        ["10 пользователей",            "Ограниченно",           "Комфортно"],
        ["Форм-фактор",                 "Рабочая станция",       "Серверный рэк"],
        ["Срок поддержки",              "3–4 года",              "4–5 лет"],
        ["Расширение",                  "Замена карт",           "Добавление 2-й MI300X"],
      ],
    }),

    // 13. Гибриды
    h1("13. Гибридные сценарии"),
    h2("13.1. Inference-сервер + dev-станция"),
    bulletP("Серверный узел: 1 × MI300X для production-инференса."),
    bulletP("Dev-станция: 1 × RTX 5090 для экспериментов, debugging, QLoRA."),
    p("Плюсы: разделение production/research. Минусы: две машины, две ОС-конфигурации."),

    h2("13.2. Разделение по задачам на 4 × RTX 4090"),
    bulletP("Карты 1–2: vLLM + qwen3.6-35B-A3B для 3 пользователей (48 ГБ)."),
    bulletP("Карты 3–4: отдельный vLLM с qwen2.5-coder:14b или QLoRA-обучение (24 ГБ)."),
    p("Плюсы: одновременная работа с двумя моделями, дообучение без остановки production. Минусы: сложнее оркестрация, нужен L7-балансировщик."),

    h2("13.3. Inference + QLoRA одновременно на MI300X"),
    p("192 ГБ MI300X позволяют:"),
    bulletP("vLLM с qwen3.6-35B-A3B (~45 ГБ с 5 контекстами)."),
    bulletP("QLoRA над deepseek-r1:14b (~16 ГБ)."),
    bulletP("Резерв ~130 ГБ для роста или второго вида работы."),

    // 14. Glossary
    h1("14. Глоссарий"),
    bulletP("BF16 / bfloat16 — 16-битный формат с плавающей точкой для нейросетей."),
    bulletP("Continuous batching — технология группировки запросов в один GPU-проход."),
    bulletP("CUDA — программная платформа NVIDIA для вычислений на GPU."),
    bulletP("FP8 — 8-битный формат с плавающей точкой, даёт 2× ускорение против FP16."),
    bulletP("GDDR7 — память потребительских видеокарт поколения 2024–2026."),
    bulletP("HBM3 / HBM3e — память серверных GPU, в 4–5 раз быстрее GDDR."),
    bulletP("KV-cache — промежуточный кеш внимания трансформера."),
    bulletP("LoRA — Low-Rank Adaptation, дообучение через малые матрицы-адаптеры."),
    bulletP("MoE — Mixture of Experts, архитектура с активной подмножеством."),
    bulletP("MXFP4 — 4.25-битный формат OpenAI для нативной квантизации."),
    bulletP("NVLink — быстрое межкарточное соединение NVIDIA (H100/B200). Отсутствует на RTX."),
    bulletP("PagedAttention — разбиение KV-кеша на страницы."),
    bulletP("Prefill — фаза обработки исходного контекста."),
    bulletP("QLoRA — Quantized LoRA, дообучение с квантизованной базой."),
    bulletP("Q4_K_M — 4-битная квантизация GGUF/llama.cpp."),
    bulletP("ROCm — программная платформа AMD для вычислений на GPU."),
    bulletP("SGLang — альтернативный vLLM сервер от команды Беркли."),
    bulletP("Tensor parallelism — разбиение модели между GPU вдоль тензорной оси."),
    bulletP("Pipeline parallelism — разбиение модели по слоям между GPU."),
    bulletP("Expert parallelism — разбиение MoE-экспертов между GPU."),
    bulletP("TPOT — Time Per Output Token."),
    bulletP("TTFT — Time To First Token."),
    bulletP("vLLM — серверная программа для LLM-инференса с continuous batching."),
    bulletP("xGMI — межчиповое соединение AMD."),

    // 15. Sources
    h1("15. Список источников"),
    h2("Спецификации моделей"),
    bulletP("Qwen3.6-35B-A3B: https://huggingface.co/Qwen/Qwen3.6-35B-A3B"),
    bulletP("Qwen 3.6 VRAM: https://willitrunai.com/blog/qwen-3-6-vram-requirements"),
    bulletP("Qwen3.6 GitHub: https://github.com/QwenLM/Qwen3.6"),
    bulletP("gpt-oss-20b: https://huggingface.co/openai/gpt-oss-20b"),
    bulletP("GPT-OSS 20B VRAM: https://apxml.com/models/gpt-oss-20b"),
    bulletP("GLM-5.1 Specifications: https://apxml.com/models/glm-51"),
    bulletP("Deploy GLM-5.1: https://www.spheron.network/blog/deploy-glm-5-1-gpu-cloud/"),
    bulletP("deepseek-r1-tool-calling: https://ollama.com/MFDoom/deepseek-r1-tool-calling:14b-qwen-distill-q4_K_M"),
    bulletP("qwen2.5-coder:14b: https://ollama.com/library/qwen2.5-coder:14b"),

    h2("Программные платформы"),
    bulletP("vLLM: https://vllm.ai/"),
    bulletP("vLLM Benchmarks 2026: https://www.morphllm.com/vllm-benchmarks"),
    bulletP("Ollama vs vLLM 2026: https://www.sitepoint.com/ollama-vs-vllm-performance-benchmark-2026/"),
    bulletP("Ollama Parallel: https://www.glukhov.org/llm-performance/ollama/how-ollama-handles-parallel-requests/"),
    bulletP("vLLM vs SGLang 2026: https://leetllm.com/blog/llm-inference-engine-comparison-2026"),

    h2("AMD ROCm"),
    bulletP("AMD ROCm 7.0: https://www.amd.com/en/developer/resources/technical-articles/2025/amd-rocm-7-built-for-developers-ready-for-enterprises.html"),
    bulletP("vLLM on ROCm: https://rocm.docs.amd.com/en/latest/how-to/rocm-for-ai/inference/benchmark-docker/vllm.html"),
    bulletP("vLLM on AMD blog: https://blog.vllm.ai/2026/02/27/rocm-attention-backend.html"),
    bulletP("MI300X validation: https://rocm.docs.amd.com/en/latest/how-to/performance-validation/mi300x/vllm-benchmark.html"),

    h2("NVIDIA бенчмарки"),
    bulletP("RTX 5090 Benchmarks: https://www.runpod.io/blog/rtx-5090-llm-benchmarks"),
    bulletP("RTX 5090 results: https://www.hardware-corner.net/rtx-5090-llm-benchmarks/"),
    bulletP("RTX comparison: https://www.cloudrift.ai/blog/benchmarking-rtx-gpus-for-llm-inference"),

    h2("Multi-GPU конфигурации"),
    bulletP("4x 4090 workstation: https://sabareesh.com/posts/llm-rig/"),
    bulletP("Multi-GPU 2026: https://www.compute-market.com/blog/multi-gpu-local-llm-setup-guide-2026"),
    bulletP("BIZON X5500: https://bizon-tech.com/bizon-x5500.html"),
  ];

  return new Document({
    creator: "DSP-GPU R&D",
    title: "LLM Hardware Technical Deep Dive — 2026-04-22",
    styles: baseStyles(),
    numbering: baseNumbering(),
    sections: [baseSection(children)],
  });
}

// ═════════════════════════════════════════════════════════════════════════
// BUILD ALL
// ═════════════════════════════════════════════════════════════════════════
async function build(doc, filename) {
  const buf = await Packer.toBuffer(doc);
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, buf);
  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`  [ok] ${filename}  (${sizeKB} KB)`);
}

(async () => {
  console.log("Building .docx files...");
  await build(buildBrief(),    "LLM_Hardware_Brief_2026-04-22.docx");
  await build(buildExec(),     "LLM_Hardware_Executive_Summary_2026-04-22.docx");
  await build(buildTechnical(),"LLM_Hardware_Technical_Deep_Dive_2026-04-22.docx");
  console.log("\nAll .docx files saved to:", OUT_DIR);
})();
