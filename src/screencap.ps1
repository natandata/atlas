# Captura a tela principal sob demanda: a cada linha recebida na entrada, devolve um JPEG (base64) em uma linha.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
try { Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class DpiAw { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'; [DpiAw]::SetProcessDPIAware() | Out-Null } catch {}
$jpg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]60)
while ($true) {
  $l = [Console]::In.ReadLine(); if ($null -eq $l) { break }
  $bmp = $null; $g = $null; $s = $null; $g2 = $null; $ms = $null
  try {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $w = 960; $h = [int]($b.Height * $w / $b.Width)
    $s = New-Object System.Drawing.Bitmap $w, $h
    $g2 = [System.Drawing.Graphics]::FromImage($s); $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear; $g2.DrawImage($bmp, 0, 0, $w, $h)
    $ms = New-Object System.IO.MemoryStream; $s.Save($ms, $jpg, $ep)
    [Console]::Out.WriteLine([Convert]::ToBase64String($ms.ToArray()))
  } catch { [Console]::Out.WriteLine('ERR') }
  finally { foreach ($o in @($g2, $s, $g, $bmp, $ms)) { if ($o) { $o.Dispose() } } }
  [Console]::Out.Flush()
}
