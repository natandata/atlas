$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'data\web\diagnostico.txt'
$lines = New-Object System.Collections.Generic.List[string]
function Passo($nome, [scriptblock]$bloco) {
  $lines.Add("### $nome")
  try { $r = (& $bloco 2>&1 | Out-String).Trim(); $lines.Add($r) } catch { $lines.Add("ERRO: " + $_.Exception.Message) }
  $lines.Add('')
}
Passo 'tailscale instalado' { (Get-Command tailscale -ErrorAction Stop).Source }
Passo 'tailscale status' { tailscale status }
Passo 'ping para o iPhone' { tailscale ping --c 4 --timeout 4s iphone173 }
Passo 'tailscale serve status' { tailscale serve status }
Passo 'porta 4400 escutando' { Get-NetTCPConnection -LocalPort 4400 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize }
Passo 'central local (http)' { (Invoke-WebRequest -UseBasicParsing 'http://localhost:4400/manifest.webmanifest' -TimeoutSec 5).StatusCode }
Passo 'central via https do tailscale' { $h = (tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd('.'); "host: $h"; (Invoke-WebRequest -UseBasicParsing ("https://$h" + ":4400/manifest.webmanifest") -TimeoutSec 8).StatusCode }
Passo 'regras de firewall (Tailscale ou porta 4400)' { Get-NetFirewallRule -Enabled True -Direction Inbound | Where-Object { $_.DisplayName -match 'tailscale|4400|atlas|data house' } | Select-Object DisplayName, Action, Profile | Format-Table -AutoSize }
Passo 'tailscale netcheck' { tailscale netcheck }
Passo 'firewall perfis' { Get-NetFirewallProfile | Select-Object Name, Enabled | Format-Table -AutoSize }
Passo 'processos node' { Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | ForEach-Object { ($_.CommandLine -replace '--env-file=\S+','--env-file=…') } }
$lines | Set-Content -Encoding UTF8 $out
Write-Host "Diagnostico salvo."
