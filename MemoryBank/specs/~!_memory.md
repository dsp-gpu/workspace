/plugin install claude-mem
/plugin marketplace add thedotmack/claude-mem

tech-debt-skill — что это и как ставить
Назначение: Claude Code skill для глубокого аудита технического долга в кодовой базе с file:line цитатами на каждую находку.

Чем хорош
✅ Не чеклист, а реальный аудит — каждая находка с path/file.ext:LINE
✅ Секция "Looks bad but is actually fine" — то что выглядит плохо, но на самом деле норм (отделяет настоящий аудит от шаблонной воды)
✅ 3 фазы: Orient → Audit (9 dimensions) → Deliverable (TECH_DEBT_AUDIT.md)
✅ Scalable: для баз >50k LOC параллелит через subagents
✅ Living document: повторный запуск помечает RESOLVED / NEW / UPDATED
Идеально для GPUWorkLib — у тебя 50+k LOC, много модулей, есть @deprecated и legacy.

📦 Установка (выбирай один способ)
Вариант A — Самый чистый (вручную)
Скачай SKILL.md:
curl -L https://raw.githubusercontent.com/ksimback/tech-debt-skill/main/SKILL.md -o tech-debt.md
Положи в глобальные skills:
~/.claude/skills/tech-debt/SKILL.md
или в проектные:

E:/DSP-GPU/.claude/skills/tech-debt/SKILL.md
Перезапусти Claude Code → используй: «запусти tech-debt audit»
Вариант B — есть fastruby/tech-debt-skill (другой автор, по идеям OmbuLabs)
git clone https://github.com/fastruby/tech-debt-skill ~/.claude/skills/tech-debt
Вариант C — большой набор alirezarezvani/claude-skills
232+ skills включая tech-debt-tracker. Если хочешь сразу пачку.

⚠️ Какой выбрать
Skill	Подход	Когда брать
ksimback/tech-debt-skill	File-cited audit, 9 dimensions	✅ Для GPUWorkLib (большой проект)
fastruby/tech-debt-skill	По методологии OmbuLabs	Если нравится их подход
alirezarezvani/claude-skills	Tracker (отслеживание)	Если хочешь много skills сразу
Моя рекомендация: Вариант A с ksimback — выход TECH_DEBT_AUDIT.md идеально ляжет в твой MemoryBank/research/.

Хочешь — установлю прямо сейчас в E:/DSP-GPU/.claude/skills/? Тогда говори "ставь" 😊

Sources:
*************************************************
Ставлю в E:/DSP-GPU/.claude/skills/tech-debt/.


Ran a command, read a file
Готово! ✅

E:/DSP-GPU/.claude/skills/tech-debt/SKILL.md   (12.8 KB)
Как пользоваться
Skill называется tech-debt-audit, не auto-invoke (disable-model-invocation: true) — запускается только когда ты явно попросишь.

Запуск:
/tech-debt-audit
или просто скажи: «сделай tech debt аудит проекта»

Что получишь
Файл TECH_DEBT_AUDIT.md в корне репо с:

Executive summary
Mental model проекта
Findings table (file:line, severity, effort)
Top-5 priorities + Quick wins
"Looks bad but is actually fine" (важная секция — что НЕ надо трогать)
Open questions
⚠️ Перед запуском
Перезапусти Claude Code — иначе skill не подхватится
Аудит займёт время — у тебя ~50k+ LOC, будет работать долго (skill сам параллелит через subagents)
Результат предложу сохранить в MemoryBank/research/ чтобы не валялся в корне
Перезапустишь Claude Code — и можно сразу запускать /tech-debt-audit 🚀