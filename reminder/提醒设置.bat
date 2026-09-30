@echo off
title SpeakUp · 提醒设置
cd /d "%~dp0"
:menu
echo.
echo   ==== SpeakUp 英语精进 · 每日提醒设置 ====
echo.
echo   1. 设置 / 修改每天的提醒时间
echo   2. 立即弹一条测试提醒
echo   3. 关闭每日提醒
echo   4. 查看当前提醒状态
echo   5. 联动云端进度（今天练完就不提醒）
echo   0. 退出
echo.
set "c="
set /p c=请选择 [0-5]: 
if "%c%"=="1" goto set
if "%c%"=="2" goto test
if "%c%"=="3" goto off
if "%c%"=="4" goto status
if "%c%"=="5" goto link
if "%c%"=="0" exit /b
goto menu
:set
set "t="
set /p t=输入每天提醒时间（24 小时制，例如 20:00）: 
if "%t%"=="" goto menu
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-reminder.ps1" -Time "%t%"
goto menu
:test
wscript "%~dp0remind.vbs"
echo   已发送测试提醒，看看屏幕右下角。
goto menu
:off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-reminder.ps1"
goto menu
:status
powershell -NoProfile -Command "foreach ($n in 'EnglishCoach-DailyReminder','EnglishCoach-FinalReminder') { $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue; if ($t) { '  ' + $n + '：每天 ' + ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm') + '，下次 ' + ($t | Get-ScheduledTaskInfo).NextRunTime } else { '  ' + $n + '：未开启' } }; if (Test-Path '%~dp0config.json') { '  配置：' + (Get-Content '%~dp0config.json' -Raw -Encoding UTF8) }"
goto menu
:link
echo   在网页「我的 → 多设备同步」里点“复制同步 ID”，粘贴到这里（直接回车 = 取消联动）。
set "g="
set /p g=同步 ID: 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-reminder.ps1" -GistId "%g%"
goto menu
