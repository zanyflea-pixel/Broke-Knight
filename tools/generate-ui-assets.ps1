Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "assets\ui"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Graphics($bitmap) {
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return $g
}

function Save-HeroPortrait {
  $path = Join-Path $outDir "hero-portrait-knight.png"
  $bmp = New-Object System.Drawing.Bitmap 320, 400
  $g = New-Graphics $bmp
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgRect = New-Object System.Drawing.Rectangle 0,0,320,400
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 33, 24, 58),
    [System.Drawing.Color]::FromArgb(255, 9, 12, 22),
    90
  )
  $g.FillRectangle($bg, $bgRect)

  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse(26, 18, 268, 268)
  $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
  $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(176, 129, 103, 213)
  $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 129, 103, 213))
  $g.FillPath($glowBrush, $glow)

  $capeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 76, 29, 59))
  $g.FillPolygon($capeBrush, @(
      [System.Drawing.PointF]::new(60, 372),
      [System.Drawing.PointF]::new(118, 210),
      [System.Drawing.PointF]::new(158, 242),
      [System.Drawing.PointF]::new(202, 210),
      [System.Drawing.PointF]::new(260, 372)
    ))

  $armorBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Point]::new(70, 180),
    [System.Drawing.Point]::new(250, 372),
    [System.Drawing.Color]::FromArgb(255, 155, 170, 187),
    [System.Drawing.Color]::FromArgb(255, 66, 76, 94)
  )
  $g.FillPolygon($armorBrush, @(
      [System.Drawing.PointF]::new(88, 360),
      [System.Drawing.PointF]::new(108, 216),
      [System.Drawing.PointF]::new(160, 188),
      [System.Drawing.PointF]::new(212, 216),
      [System.Drawing.PointF]::new(232, 360)
    ))

  $trimPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 214, 224, 239), 5)
  $g.DrawLine($trimPen, 160, 194, 160, 354)
  $g.DrawArc($trimPen, 118, 202, 84, 44, 195, 150)

  $neckBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 228, 188, 160))
  $g.FillRectangle($neckBrush, 146, 152, 28, 26)

  $faceBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 231, 191, 164))
  $g.FillEllipse($faceBrush, 118, 72, 86, 104)

  $hairPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $hairPath.AddClosedCurve(@(
      [System.Drawing.PointF]::new(116, 110),
      [System.Drawing.PointF]::new(124, 78),
      [System.Drawing.PointF]::new(160, 60),
      [System.Drawing.PointF]::new(198, 80),
      [System.Drawing.PointF]::new(204, 116),
      [System.Drawing.PointF]::new(188, 144),
      [System.Drawing.PointF]::new(176, 112),
      [System.Drawing.PointF]::new(140, 118),
      [System.Drawing.PointF]::new(128, 144)
    ))
  $hairBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Point]::new(118, 70),
    [System.Drawing.Point]::new(198, 148),
    [System.Drawing.Color]::FromArgb(255, 88, 54, 28),
    [System.Drawing.Color]::FromArgb(255, 34, 23, 16)
  )
  $g.FillPath($hairBrush, $hairPath)

  $hoodPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 93, 48, 124), 9)
  $g.DrawArc($hoodPen, 103, 58, 116, 132, 202, 136)

  $eyePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 38, 29, 28), 2.4)
  $g.DrawArc($eyePen, 136, 114, 16, 8, 200, 140)
  $g.DrawArc($eyePen, 168, 114, 16, 8, 200, 140)
  $g.FillEllipse([System.Drawing.Brushes]::Black, 142, 118, 4, 4)
  $g.FillEllipse([System.Drawing.Brushes]::Black, 174, 118, 4, 4)

  $browPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 81, 50, 31), 3)
  $g.DrawLine($browPen, 134, 108, 150, 104)
  $g.DrawLine($browPen, 170, 104, 186, 108)

  $nosePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 133, 86, 60), 1.5)
  $g.DrawCurve($nosePen, @(
      [System.Drawing.PointF]::new(161, 120),
      [System.Drawing.PointF]::new(156, 134),
      [System.Drawing.PointF]::new(160, 146),
      [System.Drawing.PointF]::new(164, 150)
    ))

  $mouthPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 136, 74, 64), 2)
  $g.DrawArc($mouthPen, 146, 152, 26, 10, 15, 150)

  $beardPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $beardPath.AddClosedCurve(@(
      [System.Drawing.PointF]::new(128, 146),
      [System.Drawing.PointF]::new(136, 176),
      [System.Drawing.PointF]::new(160, 190),
      [System.Drawing.PointF]::new(184, 176),
      [System.Drawing.PointF]::new(192, 146),
      [System.Drawing.PointF]::new(160, 166)
    ))
  $beard = New-Object System.Drawing.Drawing2D.PathGradientBrush $beardPath
  $beard.CenterColor = [System.Drawing.Color]::FromArgb(220, 107, 69, 39)
  $beard.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 56, 33, 21))
  $g.FillPath($beard, $beardPath)

  $shoulderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 197, 209, 226), 4)
  $g.DrawArc($shoulderPen, 82, 214, 72, 80, 206, 110)
  $g.DrawArc($shoulderPen, 166, 214, 72, 80, 224, 110)
  $g.FillEllipse([System.Drawing.Brushes]::White, 148, 216, 24, 24)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 136, 152, 173))), 151, 219, 18, 18)

  $swordPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 218, 234, 246), 7)
  $g.DrawLine($swordPen, 254, 126, 218, 310)
  $shinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 255, 255, 255), 2)
  $g.DrawLine($shinePen, 250, 124, 214, 306)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 176, 128, 74))), 210, 292, 22, 10)

  $framePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 208, 178, 255), 4)
  $g.DrawRectangle($framePen, 10, 10, 300, 380)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $framePen.Dispose()
  $shinePen.Dispose()
  $swordPen.Dispose()
  $shoulderPen.Dispose()
  $beard.Dispose()
  $beardPath.Dispose()
  $mouthPen.Dispose()
  $nosePen.Dispose()
  $browPen.Dispose()
  $eyePen.Dispose()
  $hoodPen.Dispose()
  $hairBrush.Dispose()
  $hairPath.Dispose()
  $faceBrush.Dispose()
  $neckBrush.Dispose()
  $trimPen.Dispose()
  $armorBrush.Dispose()
  $capeBrush.Dispose()
  $glowBrush.Dispose()
  $glow.Dispose()
  $bg.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function Save-SpellIcons {
  $path = Join-Path $outDir "spell-icons.png"
  $bmp = New-Object System.Drawing.Bitmap 256, 64
  $g = New-Graphics $bmp
  $g.Clear([System.Drawing.Color]::Transparent)

  for ($i = 0; $i -lt 4; $i++) {
    $x = $i * 64
    $circle = New-Object System.Drawing.Rectangle ($x + 8), 8, 48, 48
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $circle,
      [System.Drawing.Color]::FromArgb(255, 40, 28, 68),
      [System.Drawing.Color]::FromArgb(255, 15, 17, 28),
      90
    )
    $g.FillEllipse($brush, $circle)
    $g.DrawEllipse((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 214, 184, 255), 2.2)), $circle)
    $brush.Dispose()
  }

  $sparkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 221, 112))
  $sparkPts = @(
    [System.Drawing.PointF]::new(30, 14),
    [System.Drawing.PointF]::new(39, 28),
    [System.Drawing.PointF]::new(34, 28),
    [System.Drawing.PointF]::new(42, 46),
    [System.Drawing.PointF]::new(22, 32),
    [System.Drawing.PointF]::new(28, 32)
  )
  $g.FillPolygon($sparkBrush, $sparkPts)

  $novaPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 205, 248, 255), 3)
  $centerNova = [System.Drawing.PointF]::new(96, 32)
  for ($i = 0; $i -lt 8; $i++) {
    $a = [Math]::PI * 2 * $i / 8
    $x1 = $centerNova.X + [Math]::Cos($a) * 8
    $y1 = $centerNova.Y + [Math]::Sin($a) * 8
    $x2 = $centerNova.X + [Math]::Cos($a) * 16
    $y2 = $centerNova.Y + [Math]::Sin($a) * 16
    $g.DrawLine($novaPen, [single]$x1, [single]$y1, [single]$x2, [single]$y2)
  }
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 231, 251, 255))), 90, 26, 12, 12)

  $blinkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 205, 112))
  $blinkPts = @(
    [System.Drawing.PointF]::new(132, 32),
    [System.Drawing.PointF]::new(149, 20),
    [System.Drawing.PointF]::new(151, 26),
    [System.Drawing.PointF]::new(166, 26),
    [System.Drawing.PointF]::new(166, 38),
    [System.Drawing.PointF]::new(151, 38),
    [System.Drawing.PointF]::new(149, 44)
  )
  $g.FillPolygon($blinkBrush, $blinkPts)
  $blinkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 242, 196), 2.4)
  $g.DrawLine($blinkPen, 124, 22, 137, 27)
  $g.DrawLine($blinkPen, 122, 32, 136, 32)
  $g.DrawLine($blinkPen, 124, 42, 137, 37)

  $orbRect = New-Object System.Drawing.Rectangle 201, 17, 22, 22
  $orb = New-Object System.Drawing.Drawing2D.GraphicsPath
  $orb.AddEllipse($orbRect)
  $orbBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $orb
  $orbBrush.CenterColor = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
  $orbBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 175, 116, 246))
  $g.FillPath($orbBrush, $orb)
  $orbPenA = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 246, 229, 255), 2)
  $orbPenB = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 126, 71, 220), 2)
  $g.DrawArc($orbPenA, 196, 12, 32, 32, 28, 200)
  $g.DrawArc($orbPenB, 192, 10, 40, 38, 218, 116)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $orbBrush.Dispose()
  $orb.Dispose()
  $orbPenA.Dispose()
  $orbPenB.Dispose()
  $blinkPen.Dispose()
  $blinkBrush.Dispose()
  $novaPen.Dispose()
  $sparkBrush.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function Save-MapParchment {
  $path = Join-Path $outDir "map-parchment.png"
  $bmp = New-Object System.Drawing.Bitmap 512, 512
  $g = New-Graphics $bmp
  $g.Clear([System.Drawing.Color]::FromArgb(255, 238, 223, 194))

  $baseRect = New-Object System.Drawing.Rectangle 0,0,512,512
  $base = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $baseRect,
    [System.Drawing.Color]::FromArgb(255, 244, 233, 207),
    [System.Drawing.Color]::FromArgb(255, 201, 174, 136),
    90
  )
  $g.FillRectangle($base, $baseRect)

  $rand = [System.Random]::new(44)
  for ($i = 0; $i -lt 240; $i++) {
    $alpha = $rand.Next(10, 42)
    $warm = [System.Drawing.Color]::FromArgb($alpha, 120 + $rand.Next(0, 60), 88 + $rand.Next(0, 55), 40 + $rand.Next(0, 35))
    $brush = New-Object System.Drawing.SolidBrush $warm
    $w = $rand.Next(8, 42)
    $h = $rand.Next(8, 30)
    $x = $rand.Next(-10, 512)
    $y = $rand.Next(-10, 512)
    $g.FillEllipse($brush, $x, $y, $w, $h)
    $brush.Dispose()
  }

  $creasePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(42, 105, 79, 49), 3)
  $g.DrawArc($creasePen, 36, 94, 436, 226, 6, 168)
  $g.DrawArc($creasePen, 72, 260, 382, 168, 190, 146)
  $g.DrawLine($creasePen, 110, 70, 108, 442)
  $g.DrawLine($creasePen, 386, 88, 400, 458)

  for ($i = 0; $i -lt 6; $i++) {
    $size = 42 + $i * 18
    $alpha = 18 + $i * 4
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($alpha, 57, 35, 19), 12)
    $g.DrawRectangle($pen, $size / 2, $size / 2, 512 - $size, 512 - $size)
    $pen.Dispose()
  }

  $speckPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(28, 255, 255, 255), 1)
  for ($i = 0; $i -lt 160; $i++) {
    $x1 = $rand.Next(0, 512)
    $y1 = $rand.Next(0, 512)
    $g.DrawLine($speckPen, $x1, $y1, $x1 + $rand.Next(-5, 5), $y1 + $rand.Next(-5, 5))
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $speckPen.Dispose()
  $creasePen.Dispose()
  $base.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function Save-TreeSprite {
  $path = Join-Path $outDir "tree-sprite.png"
  $bmp = New-Object System.Drawing.Bitmap 128, 160
  $g = New-Graphics $bmp
  $g.Clear([System.Drawing.Color]::Transparent)

  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(64, 16, 24, 13))
  $g.FillEllipse($shadow, 22, 132, 84, 18)

  $trunkBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.Rectangle]::new(54, 74, 20, 60),
    [System.Drawing.Color]::FromArgb(255, 91, 57, 32),
    [System.Drawing.Color]::FromArgb(255, 58, 35, 20),
    90
  )
  $g.FillRectangle($trunkBrush, 55, 76, 18, 56)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 72, 43, 24))), 49, 110, 10, 28)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 72, 43, 24))), 71, 106, 10, 30)

  $canopyDark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 42, 98, 46))
  $canopyMid = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 57, 132, 58))
  $canopyLight = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 97, 174, 85))

  $g.FillEllipse($canopyDark, 22, 52, 42, 44)
  $g.FillEllipse($canopyDark, 62, 48, 44, 48)
  $g.FillEllipse($canopyDark, 38, 26, 50, 52)
  $g.FillEllipse($canopyMid, 18, 70, 52, 38)
  $g.FillEllipse($canopyMid, 58, 66, 54, 40)
  $g.FillEllipse($canopyMid, 28, 42, 68, 44)
  $g.FillEllipse($canopyLight, 34, 34, 30, 22)
  $g.FillEllipse($canopyLight, 62, 34, 28, 20)
  $g.FillEllipse($canopyLight, 48, 56, 22, 16)

  $edgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(190, 20, 56, 24), 2.2)
  $g.DrawEllipse($edgePen, 22, 52, 42, 44)
  $g.DrawEllipse($edgePen, 62, 48, 44, 48)
  $g.DrawEllipse($edgePen, 38, 26, 50, 52)
  $g.DrawEllipse($edgePen, 18, 70, 52, 38)
  $g.DrawEllipse($edgePen, 58, 66, 54, 40)
  $g.DrawEllipse($edgePen, 28, 42, 68, 44)

  $shinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(92, 245, 255, 238), 2)
  $g.DrawArc($shinePen, 28, 38, 30, 18, 220, 120)
  $g.DrawArc($shinePen, 60, 44, 28, 16, 220, 120)
  $g.DrawArc($shinePen, 42, 60, 26, 14, 220, 120)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $shinePen.Dispose()
  $edgePen.Dispose()
  $canopyLight.Dispose()
  $canopyMid.Dispose()
  $canopyDark.Dispose()
  $trunkBrush.Dispose()
  $shadow.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function Save-MountainTexture {
  $path = Join-Path $outDir "mountain-texture.png"
  $bmp = New-Object System.Drawing.Bitmap 128, 128
  $g = New-Graphics $bmp
  $g.Clear([System.Drawing.Color]::FromArgb(255, 98, 106, 116))

  $baseRect = [System.Drawing.Rectangle]::new(0, 0, 128, 128)
  $base = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $baseRect,
    [System.Drawing.Color]::FromArgb(255, 120, 130, 142),
    [System.Drawing.Color]::FromArgb(255, 74, 80, 90),
    90
  )
  $g.FillRectangle($base, $baseRect)

  $rand = [System.Random]::new(71)
  for ($i = 0; $i -lt 110; $i++) {
    $alpha = $rand.Next(24, 72)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, 58 + $rand.Next(0, 42), 64 + $rand.Next(0, 42), 74 + $rand.Next(0, 42)))
    $x = $rand.Next(-8, 128)
    $y = $rand.Next(-8, 128)
    $w = $rand.Next(8, 28)
    $h = $rand.Next(4, 18)
    $g.FillEllipse($brush, $x, $y, $w, $h)
    $brush.Dispose()
  }

  $ridgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(82, 232, 238, 245), 3)
  for ($i = 0; $i -lt 8; $i++) {
    $x = 8 + $i * 14
    $g.DrawLine($ridgePen, $x, 0, $x - 12, 128)
  }
  $shadowPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(56, 18, 22, 28), 4)
  for ($i = 0; $i -lt 7; $i++) {
    $x = 20 + $i * 16
    $g.DrawLine($shadowPen, $x, 0, $x + 10, 128)
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $shadowPen.Dispose()
  $ridgePen.Dispose()
  $base.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

Save-HeroPortrait
Save-SpellIcons
Save-MapParchment
Save-TreeSprite
Save-MountainTexture

Write-Output "Generated UI assets in $outDir"
