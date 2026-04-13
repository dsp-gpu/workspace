# Hook: PostToolUse(Write) — напоминание при изменении .cl файлов
# Вызывается ПОСЛЕ каждого Write (создание/изменение файла)

$Raw = [System.Console]::In.ReadToEnd()

try {
    $Data = $Raw | ConvertFrom-Json
    $FilePath = $Data.tool_input.file_path
} catch {
    exit 0
}

if (-not $FilePath) { exit 0 }

# Проверяем .cl kernel файлы
if ($FilePath -match '\.cl$') {
    Write-Host ""
    Write-Host "🔔 [HOOK] Изменён OpenCL kernel: $FilePath"
    Write-Host "   Проверь manifest.json в папке kernels/ этого модуля!"
    Write-Host "   Путь: $(Split-Path $FilePath)\manifest.json"
}

# Проверяем изменения CLAUDE.md — напомнить обновить MEMORY.md
if ($FilePath -match 'CLAUDE\.md$') {
    Write-Host ""
    Write-Host "📝 [HOOK] CLAUDE.md изменён — не забудь обновить MEMORY.md"
}

exit 0
