Add-Type -AssemblyName System.Drawing
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
    $bmp = New-Object Drawing.Bitmap($size, $size)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([Drawing.Color]::Transparent)
    $p = New-Object Drawing.Drawing2D.GraphicsPath
    $d = $size * 0.44
    $p.AddArc(0,0,$d,$d,180,90)
    $p.AddArc($size-$d-1,0,$d,$d,270,90)
    $p.AddArc($size-$d-1,$size-$d-1,$d,$d,0,90)
    $p.AddArc(0,$size-$d-1,$d,$d,90,90)
    $p.CloseFigure()
    $background = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#204c40'))
    $foreground = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#d5f19c'))
    $g.FillPath($background,$p)
    $font = New-Object Drawing.Font('Segoe UI',($size*0.58),[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
    $format = New-Object Drawing.StringFormat
    $format.Alignment = [Drawing.StringAlignment]::Center
    $format.LineAlignment = [Drawing.StringAlignment]::Center
    $rect = New-Object Drawing.RectangleF(0,(-$size*0.025),$size,$size)
    $g.DrawString('ti',$font,$foreground,$rect,$format)
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms,[Drawing.Imaging.ImageFormat]::Png)
    $images += ,$ms.ToArray()
    if ($size -eq 256) { $bmp.Save((Join-Path $PSScriptRoot 'token-info.png'),[Drawing.Imaging.ImageFormat]::Png) }
    $ms.Dispose(); $g.Dispose(); $bmp.Dispose(); $p.Dispose(); $font.Dispose(); $format.Dispose(); $background.Dispose(); $foreground.Dispose()
}
$stream = [IO.File]::Create((Join-Path $PSScriptRoot 'token-info.ico'))
$writer = New-Object IO.BinaryWriter($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16*$sizes.Count
for ($i=0; $i -lt $sizes.Count; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
$writer.Dispose(); $stream.Dispose()
