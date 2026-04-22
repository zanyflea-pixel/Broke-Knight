$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:BROKE_KNIGHT_PORT) { [int]$env:BROKE_KNIGHT_PORT } else { 8000 }
$ip = [System.Net.IPAddress]::Parse("127.0.0.1")
$listener = New-Object System.Net.Sockets.TcpListener($ip, $port)
$listener.Start()
Write-Host "Broke Knight server running at http://localhost:$port/"

function Get-ContentType([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8"; break }
    ".js" { "text/javascript; charset=utf-8"; break }
    ".css" { "text/css; charset=utf-8"; break }
    ".json" { "application/json; charset=utf-8"; break }
    ".png" { "image/png"; break }
    ".jpg" { "image/jpeg"; break }
    ".jpeg" { "image/jpeg"; break }
    ".svg" { "image/svg+xml"; break }
    default { "application/octet-stream" }
  }
}

function Send-Response($stream, [int]$status, [string]$statusText, [byte[]]$body, [string]$contentType) {
  $header = "HTTP/1.1 $status $statusText`r`nContent-Length: $($body.Length)`r`nContent-Type: $contentType`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($body.Length -gt 0) {
    $stream.Write($body, 0, $body.Length)
  }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = New-Object byte[] 8192
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        continue
      }

      $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
      $firstLine = ($request -split "`r?`n")[0]
      $parts = $firstLine -split " "
      if ($parts.Length -lt 2 -or $parts[0] -ne "GET") {
        Send-Response $stream 405 "Method Not Allowed" ([System.Text.Encoding]::UTF8.GetBytes("Method not allowed")) "text/plain; charset=utf-8"
        continue
      }

      $requestPath = [Uri]::UnescapeDataString(($parts[1] -split "\?")[0].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = "index.html"
      }

      $localPath = Join-Path $root $requestPath
      $resolvedRoot = [System.IO.Path]::GetFullPath($root)
      $resolvedPath = [System.IO.Path]::GetFullPath($localPath)

      if (!$resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        Send-Response $stream 404 "Not Found" ([System.Text.Encoding]::UTF8.GetBytes("Not found")) "text/plain; charset=utf-8"
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
      Send-Response $stream 200 "OK" $bytes (Get-ContentType $resolvedPath)
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
