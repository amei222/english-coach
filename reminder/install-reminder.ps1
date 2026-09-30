# SpeakUp · 安装 / 修改每日提醒
# 例：install-reminder.ps1 -Time 20:00 -FinalTime 22:00 -Url https://xxx.github.io/english-coach/ -GistId abc123
# 没给的参数沿用 config.json 里的旧值。
param([string]$Time, [string]$FinalTime, [string]$Url, [string]$GistId)
$ErrorActionPreference = 'Stop'

$AppId = 'EnglishCoach.DailyReminder'
$here = $PSScriptRoot
$cfgPath = Join-Path $here 'config.json'
$cfg = [ordered]@{ time = '20:00'; finalTime = '22:00'; url = ''; gistId = '' }
if (Test-Path $cfgPath) {
  $old = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($k in @($cfg.Keys)) { if ($old.$k) { $cfg[$k] = $old.$k } }
}
if ($Time)      { $cfg.time = $Time.Trim() }
if ($FinalTime) { $cfg.finalTime = $FinalTime.Trim() }
if ($PSBoundParameters.ContainsKey('Url'))    { $cfg.url = $Url.Trim() }
if ($PSBoundParameters.ContainsKey('GistId')) { $cfg.gistId = $GistId.Trim() }

function Parse-Time([string]$t) {
  try { return [datetime]::ParseExact($t, 'H:mm', $null) }
  catch { Write-Host "时间格式不对：$t（应为 20:00 这种格式）" -ForegroundColor Red; exit 1 }
}
$at = Parse-Time $cfg.time
$finalAt = Parse-Time $cfg.finalTime
$cfg | ConvertTo-Json | Set-Content -Path $cfgPath -Encoding UTF8

# 通知来源名称和图标（通知里显示“SpeakUp 英语精进”而不是 PowerShell）
$key = "HKCU:\Software\Classes\AppUserModelId\$AppId"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name DisplayName -Value 'SpeakUp 英语精进'
Set-ItemProperty -Path $key -Name IconUri -Value (Join-Path $here 'icon.png')

# 计划任务（仅当前用户，无需管理员权限）
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$main  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$here\remind.vbs`""
$final = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$here\remind.vbs`" -Final"
Register-ScheduledTask -TaskName 'EnglishCoach-DailyReminder' -Action $main -Trigger (New-ScheduledTaskTrigger -Daily -At $at) -Settings $settings -Description 'SpeakUp：每日英语练习提醒' -Force | Out-Null
Register-ScheduledTask -TaskName 'EnglishCoach-FinalReminder' -Action $final -Trigger (New-ScheduledTaskTrigger -Daily -At $finalAt) -Settings $settings -Description 'SpeakUp：晚间补打卡提醒（开启同步后才会生效）' -Force | Out-Null

Write-Host ("已设置：每天 {0} 提醒练英语。" -f $at.ToString('HH:mm')) -ForegroundColor Green
if ($cfg.gistId) {
  Write-Host ("已联动云端进度：今天练完就不再提醒；没练完 {0} 会再催一次。" -f $finalAt.ToString('HH:mm')) -ForegroundColor Green
} else {
  Write-Host '提示：在网页「我的 → 多设备同步」开启同步后，把同步 ID 填到菜单第 5 项，就能做到“练完不提醒”。'
}
