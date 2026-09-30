# SpeakUp · 每日提醒：弹出 Windows 通知（由计划任务调用）
# -Final：晚间第二次提醒，只在开启同步且今天还没打卡时弹出
param([switch]$Final)
$ErrorActionPreference = 'Stop'
$AppId = 'EnglishCoach.DailyReminder'
$here  = $PSScriptRoot
$cfg   = [pscustomobject]@{}
$cfgPath = Join-Path $here 'config.json'
if (Test-Path $cfgPath) { $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json }
$url  = if ($cfg.url) { $cfg.url } else { ([System.Uri](Join-Path (Split-Path -Parent $here) 'index.html')).AbsoluteUri }
$icon = ([System.Uri](Join-Path $here 'icon.png')).AbsoluteUri

# 开启同步后：读取云端进度，今天已打卡就不打扰
$streak = -1
if ($cfg.gistId) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $g = Invoke-RestMethod -Uri "https://api.github.com/gists/$($cfg.gistId)" -Headers @{ 'User-Agent' = 'SpeakUp-Reminder'; 'Accept' = 'application/vnd.github+json' } -TimeoutSec 20
    $file = $g.files.'speakup-progress.json'
    if ($file) {
      $history = ($file.content | ConvertFrom-Json).history
      $today = Get-Date
      if ($history.($today.ToString('yyyy-MM-dd')).complete) { exit 0 }
      $streak = 0
      $d = $today.AddDays(-1)
      while ($history.($d.ToString('yyyy-MM-dd')).complete) { $streak++; $d = $d.AddDays(-1) }
    }
  } catch { $streak = -1 }   # 网络不通就照常提醒
}
if ($Final -and $streak -lt 0) { exit 0 }   # 不知道今天练没练时，晚上不重复催

$tips = @(
  '今天的语块在等你复习，别让遗忘曲线赢了。',
  '15 分钟：语块 → 说出来 → 听说 → AI 陪练。',
  '开口比完美更重要。今天也说几句吧！',
  'Practice makes perfect. 熟能生巧。',
  'Little by little, one travels far. 积跬步，至千里。',
  '下次和外国队友开黑，你会更敢说。',
  '外企面试那天，你会感谢今天的自己。'
)
if ($Final) {
  $title = '今天还没打卡 🔥'
  $body  = if ($streak -gt 0) { "已连续 $streak 天，睡前 15 分钟，别断在今天！" } else { '睡前 15 分钟，今天也开口说几句吧。' }
} else {
  $title = '该练英语啦 🗣️'
  $body  = if ($streak -gt 0) { "已连续 $streak 天。" + (Get-Random -InputObject $tips) } else { Get-Random -InputObject $tips }
}

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$sec = [System.Security.SecurityElement]
$xml = @"
<toast scenario="reminder" activationType="protocol" launch="$($sec::Escape($url))">
  <visual>
    <binding template="ToastGeneric">
      <text>$($sec::Escape($title))</text>
      <text>$($sec::Escape($body))</text>
      <image placement="appLogoOverride" src="$icon" hint-crop="circle"/>
    </binding>
  </visual>
  <actions>
    <input id="snooze" type="selection" defaultInput="30">
      <selection id="10" content="10 分钟后"/>
      <selection id="30" content="30 分钟后"/>
      <selection id="60" content="1 小时后"/>
    </input>
    <action content="开始练习" activationType="protocol" arguments="$($sec::Escape($url))"/>
    <action content="稍后提醒" activationType="system" arguments="snooze" hint-inputId="snooze"/>
  </actions>
  <audio src="ms-winsoundevent:Notification.Reminder"/>
</toast>
"@
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
