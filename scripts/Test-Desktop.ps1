$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $appRoot '.runtime\electron\electron.exe'
if (-not (Test-Path -LiteralPath $electron)) {
    $runtimeZip = Join-Path $appRoot '.runtime\downloads\electron.zip'
    $expected = '26bf9a617d58d81772b3d68305d59ee48272969c15083c06db634a77358a8d9d'
    if ((Get-FileHash -LiteralPath $runtimeZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Electron checksum mismatch.' }
    Expand-Archive -LiteralPath $runtimeZip -DestinationPath (Join-Path $appRoot '.runtime\electron')
}
$runner = Join-Path $PSScriptRoot 'desktop-smoke.cjs'
foreach ($phase in @('full','restart','account')) {
    $arguments = '"' + $runner + '"'
    if ($phase -eq 'restart') { $arguments += ' --verify-restart' }
    if ($phase -eq 'account') { $arguments += ' --account-data' }
    $process = Start-Process -FilePath $electron -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(60000)) { $process.Kill(); throw "Desktop smoke test timed out: $phase" }
    if ($process.ExitCode -ne 0) { throw "Desktop smoke test failed: $phase" }
    $report = Get-Content -LiteralPath (Join-Path $appRoot ".runtime\locale-qa\$phase-report.json") -Raw | ConvertFrom-Json
    if (-not $report.success) { throw $report.error }
    $report.report | Write-Output
}
