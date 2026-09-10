$ErrorActionPreference = 'Stop'
$appExe = Join-Path $PSScriptRoot '.runtime\electron\electron.exe'
if (Test-Path -LiteralPath $appExe) {
    Start-Process -FilePath $appExe -ArgumentList ('"' + $PSScriptRoot + '" --quit') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
}
