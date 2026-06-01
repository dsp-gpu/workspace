# TASK: Настройка хуков Claude Code на Debian

**Статус**: ⏳ WAITING — выполнить в понедельник на Debian  
**Создана**: 2026-04-18  
**Приоритет**: HIGH — без хуков on_stop/pre_bash/post_write не работают автосохранение и проверки

---

## Что нужно сделать

1. **Скопировать содержимое хуков** из GPUWorkLib в DSP-GPU:
   ```bash
   cp ~/C++/GPUWorkLib/.claude/hooks/on_stop.sh    ~/DSP-GPU/.claude/hooks/on_stop.sh
   cp ~/C++/GPUWorkLib/.claude/hooks/pre_bash.sh   ~/DSP-GPU/.claude/hooks/pre_bash.sh
   cp ~/C++/GPUWorkLib/.claude/hooks/post_write.sh ~/DSP-GPU/.claude/hooks/post_write.sh
   ```

2. **Проверить что хуки не зашивают пути** на GPUWorkLib внутри скриптов:
   ```bash
   grep -n "GPUWorkLib\|/home/alex" ~/DSP-GPU/.claude/hooks/*.sh
   ```
   Если есть — поправить на `~/DSP-GPU/` или относительные.

3. **Сделать исполняемыми**:
   ```bash
   chmod +x ~/DSP-GPU/.claude/hooks/*.sh
   ```

4. **Протестировать** — открыть Claude Code в DSP-GPU, сделать Write/Bash, проверить что хуки срабатывают без ошибок.

5. **Закоммитить** в git:
   ```bash
   cd ~/DSP-GPU
   git add .claude/hooks/
   git commit -m "hooks: add claude code hooks (migrated from GPUWorkLib)"
   ```

6. **Пушнуть** в github.com/dsp-gpu/workspace (после явного OK от Alex).

---

## Контекст

- Хуки в `settings.local.json` уже обновлены: `"bash .claude/hooks/on_stop.sh"` (относительный путь)
- Плейсхолдеры созданы в `.claude/hooks/` — заменить реальным содержимым
- Старые абсолютные пути `/home/alex/C++/GPUWorkLib/.claude/hooks/*` удалены из settings.local.json
