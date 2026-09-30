# SpeakUp · 关闭每日提醒
foreach ($t in 'EnglishCoach-DailyReminder', 'EnglishCoach-FinalReminder') {
  Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
}
Remove-Item -Path 'HKCU:\Software\Classes\AppUserModelId\EnglishCoach.DailyReminder' -Recurse -ErrorAction SilentlyContinue
Write-Host '已关闭每日提醒。想重新开启，运行 提醒设置.bat 选 1。' -ForegroundColor Yellow
