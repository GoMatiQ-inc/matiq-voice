$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if (-not $env:MATIQ_WINDOWS_PUBLISHER) { throw 'Provide the validated Windows publisher name before verification.' }
$artifact = "MatiQ-Voice-$version-windows-x64.exe"
$installer = Join-Path $root "dist/$artifact"
$app = Join-Path $root 'dist/win-unpacked'
if (-not (Test-Path (Join-Path $app 'MatiQ Voice.exe'))) { throw 'Packaged application is missing. Build the signed app before verification.' }
$files = @(Get-Item $installer) + @(Get-ChildItem $app -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll', '.node' })
foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature on $($file.Name): $($signature.Status)." }
  if ($signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne $env:MATIQ_WINDOWS_PUBLISHER) { throw "Unexpected publisher on $($file.Name). Use the validated company signing profile." }
  if (-not $signature.TimeStamperCertificate) { throw "Missing timestamp on $($file.Name). Timestamp every signed binary and installer." }
}
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
@{ platform='win32'; version=$version; artifact=$artifact; sha256=$hash; signed=$true; timestamped=$true; publisher=$env:MATIQ_WINDOWS_PUBLISHER; filesChecked=$files.Count } | ConvertTo-Json | Set-Content (Join-Path $root 'dist/windows-signature.json') -Encoding utf8NoBOM
Write-Output "Verified company Authenticode signatures and timestamps on $($files.Count) packaged files and installer."
