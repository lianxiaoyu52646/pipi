$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
function Git([string[]]$ArgsList) {
  & git @ArgsList
  if ($LASTEXITCODE -ne 0) { throw "Git 命令失败：git $($ArgsList -join ' ')。已停止，没有强制推送。" }
}
if (-not (Test-Path '.git')) { throw '当前文件夹不是 Git 仓库。请将补丁解压到 pipi 项目根目录。' }
$branch = (& git branch --show-current).Trim()
if ($branch -ne 'main') { throw "当前分支是 $branch，不是 main。请先核对分支。" }
$paths = @(
 'app/build.gradle', 'app/src/main/assets/app-version.js', 'app/src/main/assets/voice-cache.html',
 'app/src/main/java/com/sprint7/offline/MainActivity.java',
 'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt',
 'app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt',
 'app/src/main/java/com/sprint7/offline/VoiceCacheRecovery.kt',
 'app/src/main/java/com/sprint7/offline/NarrationAudioCache.kt',
 'tests/test_v51219_cache_resume_ui.js', 'tests/native/TestV51219PcmRecovery.kt',
 'tests/test_v51218_review_phonetics.js', 'tests/test_v5123_cache_ui.js',
 'README_V5.12.19_语音缓存断点续接修复.md', 'TEST_REPORT_V5.12.19.md'
)
$staged = @(& git diff --cached --name-only)
$unexpected = @($staged | Where-Object { $_ -notin $paths })
if ($unexpected.Count -gt 0) { throw "Git 暂存区有其他文件：$($unexpected -join ', ')；为了不误提交你的其他工作，已停止。" }
Git (@('add','--') + $paths)
$staged = @(& git diff --cached --name-only)
if ($staged.Count -eq 0) { Write-Host '没有新的待提交文件。'; exit 0 }
Write-Host '准备提交以下文件：'; $staged | ForEach-Object { Write-Host " - $_" }
$answer = Read-Host '确认提交并推送 GitHub main？输入 YES'
if ($answer -cne 'YES') { Write-Host '已取消，文件仍在本地。'; exit 0 }
Git @('commit','-m','fix: preserve cache voice profile and recover existing PCM checkpoints')
Git @('fetch','origin','main')
Git @('rebase','origin/main')
Git @('push','origin','main')
Write-Host 'GitHub main 推送成功。'
