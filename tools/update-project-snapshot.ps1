$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outPath = Join-Path $root "all-project.txt"

$files = @(
  "Broke Knight Notes.txt",
  "README.md",
  "index.html",
  "serve-broke-knight.ps1",
  "src/entities.js",
  "src/game.js",
  "src/input.js",
  "src/main.js",
  "src/save.js",
  "src/ui.js",
  "src/util.js",
  "src/world.js",
  "tools/check-broke-knight.ps1",
  "tools/update-project-snapshot.ps1"
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$builder = New-Object System.Text.StringBuilder

foreach ($rel in $files) {
  $path = Join-Path $root $rel
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) { continue }

  [void]$builder.AppendLine("===== ./$($rel -replace '\\','/') =====")
  [void]$builder.AppendLine([System.IO.File]::ReadAllText($path))
  [void]$builder.AppendLine()
}

$text = $builder.ToString().TrimEnd()
[System.IO.File]::WriteAllText($outPath, $text, $utf8NoBom)

Write-Host "Updated $outPath"
