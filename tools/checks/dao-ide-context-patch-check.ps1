[CmdletBinding()]
param(
  [string]$ExtensionDir = "$env:USERPROFILE\.antigravity\extensions\dao-agi.dao-proxy-pro-9.9.338",
  [string]$ManifestPath = ""
)

$ErrorActionPreference = "Stop"
$expectedVersion = "9.9.338"
$required = @(
  "package.json",
  "ide-context.js",
  "vendor\ide-context-injector.js",
  "extension.js",
  "vendor\bundled-origin\source.js",
  "vendor\外接api\core\dao_router.js"
)
$errors = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $ExtensionDir -PathType Container)) {
  throw "扩展目录不存在: $ExtensionDir"
}

$packagePath = Join-Path $ExtensionDir "package.json"
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
if ($package.version -ne $expectedVersion) {
  $errors.Add("版本不匹配: expected=$expectedVersion actual=$($package.version)")
}

foreach ($relative in $required) {
  $file = Join-Path $ExtensionDir $relative
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    $errors.Add("缺少文件: $relative")
  }
}

$injector = Join-Path $ExtensionDir "vendor\ide-context-injector.js"
if ((Test-Path -LiteralPath $injector) -and
    -not ((Get-Content -Raw -LiteralPath $injector).Contains("<DAO_IDE_CONTEXT_V1>"))) {
  $errors.Add("缺少上下文边界标记")
}

if ($ManifestPath) {
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    $errors.Add("哈希清单不存在: $ManifestPath")
  } else {
    foreach ($line in Get-Content -LiteralPath $ManifestPath) {
      if ($line -notmatch "^([0-9a-fA-F]{64})\s+(.+)$") { continue }
      $expectedHash = $Matches[1].ToUpperInvariant()
      $relative = $Matches[2]
      $file = Join-Path $ExtensionDir $relative
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
      $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash
      if ($actualHash -ne $expectedHash) {
        $errors.Add("哈希不匹配: $relative")
      }
    }
  }
}

if ($errors.Count) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "DAO_IDE_CONTEXT_PATCH_OK version=$expectedVersion files=$($required.Count)"
