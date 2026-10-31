@echo off
set "OUT=%~dp0data\web\diagnostico.txt"
echo Rodando o diagnostico, aguarde...
powershell -NoProfile -Command "$o=@(); function T($n,[scriptblock]$b){ try { $r=& $b 2>&1 | Out-String; $o += ('### '+$n); $o += $r.Trim() } catch { $o += ('### '+$n); $o += ('ERRO: '+$_.Exception.Message) }; Set-Variable -Name o -Value $o -Scope 1 };" ^
 "T 'tailscale instalado' { (Get-Command tailscale -ErrorAction Stop).Source };" ^
 "T 'tailscale status' { tailscale status };" ^
 "T 'tailscale serve' { tailscale serve status };" ^
 "T 'porta 4400 escutando' { Get-NetTCPConnection -LocalPort 4400 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -AutoSize };" ^
 "T 'central local' { (Invoke-WebRequest -UseBasicParsing http://localhost:4400/manifest.webmanifest -TimeoutSec 5).StatusCode };" ^
 "T 'central via https do tailscale' { $h=(tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd('.'); 'host: '+$h; (Invoke-WebRequest -UseBasicParsing ('https://'+$h+':4400/manifest.webmanifest') -TimeoutSec 8).StatusCode };" ^
 "T 'firewall perfis' { Get-NetFirewallProfile | Select-Object Name,Enabled | Format-Table -AutoSize };" ^
 "$o | Set-Content -Encoding UTF8 '%OUT%'"
echo.
echo Pronto. Avise o Claude que o diagnostico foi gerado (ele nao contem a chave de acesso).
pause
