$ErrorActionPreference = 'Stop'
$appExe = Join-Path $PSScriptRoot '.runtime\electron\electron.exe'
if (-not (Test-Path -LiteralPath $appExe)) { throw 'Skrivebordsdelen mangler. Kjor Install-Desktop.ps1 i prosjektmappen.' }
Start-Process -FilePath $appExe -ArgumentList ('"' + $PSScriptRoot + '"') -WorkingDirectory $PSScriptRoot
