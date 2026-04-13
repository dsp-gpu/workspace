# Hook: Stop — напоминание обновить MemoryBank в конце сессии

$Today = Get-Date -Format "yyyy-MM-dd"
$SessionFile = "MemoryBank/sessions/$Today.md"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "📝 [HOOK] Сессия завершена — $Today"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "   Если что-то важное сделали:"
Write-Host "   1. Создай/обнови: $SessionFile"
Write-Host "   2. Обнови: MemoryBank/MASTER_INDEX.md"
Write-Host "   3. Перенеси завершённые задачи в: MemoryBank/tasks/COMPLETED.md"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
