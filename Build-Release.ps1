$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version in package.json.' }
$electronVersion = '44.3.0'
$expectedHash = '26bf9a617d58d81772b3d68305d59ee48272969c15083c06db634a77358a8d9d'
$downloads = Join-Path $appRoot '.runtime\downloads'
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
$runtimeZip = Join-Path $downloads 'electron.zip'
if (-not (Test-Path -LiteralPath $runtimeZip)) {
    Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$electronVersion/electron-v$electronVersion-win32-x64.zip" -OutFile $runtimeZip
}
if ((Get-FileHash -LiteralPath $runtimeZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Electron checksum mismatch.' }
$dist = Join-Path $appRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$buildRoot = Join-Path $dist ('build-' + [guid]::NewGuid().ToString('N'))
$folderName = "Token-info-$version-win-x64"
$bundle = Join-Path $buildRoot $folderName
Expand-Archive -LiteralPath $runtimeZip -DestinationPath $bundle
Rename-Item -LiteralPath (Join-Path $bundle 'electron.exe') -NewName 'Token info.exe'
$appDir = Join-Path $bundle 'resources\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
# Copy only application files; never package local Codex data, logs or QA fixtures.
foreach ($name in @('package.json','desktop.cjs','preload.cjs','custom-projects.mjs','language-settings.mjs','server.mjs','account.mjs','usage.mjs','details.mjs','public','assets','README.md')) {
    Copy-Item -LiteralPath (Join-Path $appRoot $name) -Destination $appDir -Recurse
}
Copy-Item -LiteralPath (Join-Path $appRoot 'release\READ-ME.txt') -Destination $bundle
Copy-Item -LiteralPath (Join-Path $appRoot 'release\Create desktop shortcut.vbs') -Destination $bundle
$zipPath = Join-Path $dist "$folderName.zip"
Compress-Archive -LiteralPath $bundle -DestinationPath $zipPath -CompressionLevel Optimal -Force
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $dist 'SHA256SUMS.txt') -Value "$hash  $folderName.zip" -Encoding ascii
Write-Output "Release ready: $zipPath"
Write-Output "Unpacked app: $bundle"
