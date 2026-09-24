$ErrorActionPreference = 'Stop'
$appExe = Join-Path $PSScriptRoot '.runtime\electron\electron.exe'
if (-not (Test-Path -LiteralPath $appExe)) { throw 'Desktop runtime is missing. Run Install-Desktop.ps1 in the project folder.' }
Start-Process -FilePath $appExe -ArgumentList ('"' + $PSScriptRoot + '"') -WorkingDirectory $PSScriptRoot
