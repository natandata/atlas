@echo off
tailscale serve --https=4400 127.0.0.1:4400 off
tailscale serve status
echo Central removida do Tailscale.
pause
