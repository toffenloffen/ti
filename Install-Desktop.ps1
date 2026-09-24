$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$version = '44.3.0'
$runtimeDir = Join-Path $appRoot '.runtime'
$appExe = Join-Path $runtimeDir 'electron\electron.exe'
if (-not (Test-Path -LiteralPath $appExe)) {
    $downloads = Join-Path $runtimeDir 'downloads'
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
    $zipName = "electron-v$version-win32-x64.zip"
    $zipPath = Join-Path $downloads 'electron.zip'
    Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$version/$zipName" -OutFile $zipPath
    $sums = (Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$version/SHASUMS256.txt").Content
    $expected = (($sums -split "`n" | Where-Object { $_.TrimEnd().EndsWith("*$zipName") }) -split '\s+')[0]
    if (-not $expected -or (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'Electron checksum mismatch.' }
    Expand-Archive -LiteralPath $zipPath -DestinationPath (Join-Path $runtimeDir 'electron') -Force
}
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Token info.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $appExe
$shortcut.Arguments = '"' + $appRoot + '"'
$shortcut.WorkingDirectory = $appRoot
$shortcut.Description = 'Your automatic Codex usage overview'
$shortcut.IconLocation = (Join-Path $appRoot 'assets\token-info.ico') + ',0'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Output "Desktop app ready: $shortcutPath"
