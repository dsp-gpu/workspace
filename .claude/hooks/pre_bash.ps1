# Hook: PreToolUse(Bash) — защита от опасных команд
# Вызывается ПЕРЕД каждой Bash-командой
# exit 2 = заблокировать команду и показать сообщение

$Raw = [System.Console]::In.ReadToEnd()

try {
    $Data = $Raw | ConvertFrom-Json
    $Cmd = $Data.tool_input.command
} catch {
    exit 0  # Не можем прочитать — пропускаем
}

if (-not $Cmd) { exit 0 }

$Dangerous = @(
    'git reset --hard',
    'git clean -f',
    'git push --force',
    'git push -f ',
    'git push -f"',
    'git branch -D',
    'Remove-Item -Recurse -Force',
    'rd /s /q',
    'del /f /s /q'
)

foreach ($Pattern in $Dangerous) {
    if ($Cmd -like "*$Pattern*") {
        Write-Host ""
        Write-Host "⛔ [HOOK] ЗАБЛОКИРОВАНО: обнаружена опасная операция!"
        Write-Host "   Команда содержит: '$Pattern'"
        Write-Host "   Подтверди явно в чате, если уверен."
        exit 2
    }
}

exit 0
