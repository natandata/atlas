# Data House

Bot de Telegram que usa o **Claude Code** (sua assinatura) como cÃ©rebro. Sem API paga, sem dependÃªncias npm.

Como funciona: vocÃª manda mensagem no Telegram â†’ o bot chama `claude -p` no seu computador â†’ devolve a resposta.
A conversa continua entre mensagens (o bot guarda o ID da sessÃ£o). `/novo` comeÃ§a uma conversa do zero.

## SeguranÃ§a (jÃ¡ configurado)
- SÃ³ responde ao seu ID do Telegram (`ALLOWED_USER_ID`). Qualquer outra pessoa Ã© ignorada.
- O Claude sÃ³ pode **ler arquivos e usar a web** (`Read, Glob, Grep, WebSearch, WebFetch`). NÃ£o escreve, nÃ£o apaga e nÃ£o roda comandos.
- Roda em modo `dontAsk` (nega tudo que nÃ£o estÃ¡ liberado), bloqueia `Bash/Write/Edit` e ignora os seus servidores MCP.
- Nunca usa `--dangerously-skip-permissions`.
- O token vai sÃ³ no `.env` (jÃ¡ estÃ¡ no `.gitignore`).
- O bot sÃ³ funciona com o computador ligado e esta janela aberta.

## Primeira vez
1. **Claude Code**: instale e faÃ§a login uma vez.
   - `npm install -g @anthropic-ai/claude-code` (no PowerShell use `npm.cmd` e `claude.cmd` se der erro de scripts)
   - rode `claude` e entre com a conta da sua assinatura
2. **Bot no Telegram**: fale com @BotFather â†’ `/newbot` â†’ copie o token.
3. **`.env`**: copie `.env.example` para `.env` e cole o token em `TELEGRAM_BOT_TOKEN`.
4. **Seu ID**: rode `npm start`, mande "oi" ao bot e veja no terminal `Mensagem ignorada do ID 123456789`. Coloque esse nÃºmero em `ALLOWED_USER_ID`, salve e reinicie.
5. Pronto: mande uma mensagem ao bot.

## Dia a dia
- Ligar: `npm start` (dentro da pasta `grokbot`). Parar: `Ctrl+C`.
- Mudar o jeito dele falar: edite `workdir/CLAUDE.md`.
- Trocar o modelo: `CLAUDE_MODEL` no `.env` (`sonnet` Ã© o padrÃ£o; `haiku` gasta menos; `opus` gasta mais e pode nÃ£o estar no seu plano).
- Testar sem Telegram nem Claude: `npm test`.

## Ampliar permissÃµes (com cuidado)
`ALLOWED_TOOLS` no `.env` controla o que ele pode fazer. Cada ferramenta nova dÃ¡ mais poder a quem controlar o seu Telegram.
NÃ£o libere `Bash` nem `Write`/`Edit` sem entender o risco.

## Limites
- Usa o limite de uso da sua assinatura do Claude.
- Respostas longas sÃ£o divididas em vÃ¡rias mensagens.
- SÃ³ texto por enquanto (sem Ã¡udio, imagem ou arquivo).


---

# Central de Bots (interface estilo Telegram)

Uma pÃ¡gina web com vÃ¡rios bots, grupos e um coordenador. Roda no seu computador e usa o Claude Code (sua assinatura).

## Ligar
```
npm.cmd run web
```
O terminal mostra um link com token (`http://localhost:4400/login?t=...`). Abra no navegador. O link grava um cookie, entÃ£o depois basta abrir `http://localhost:4400`.
Rode `npm.cmd run web` na pasta `grokbot`. Pode rodar junto com o bot do Telegram.

## Como usar
- **+ Bot**: nome, para que serve, personalidade/regras, modelo e ferramentas. JÃ¡ vÃªm 4 prontos: Grokbot, Coordenador, Pesquisador e Escritor (na sua voz).
- **Coordenador**: marque "Ã© coordenador" no bot. Numa conversa com ele, ele decide se responde sozinho ou delega aos outros bots (atÃ© 4 tarefas), recebe os resultados e entrega uma resposta final.
- **+ Grupo**: junte bots. Use `@nome` para chamar um bot. Sem `@`, o coordenador do grupo cuida do pedido, delegando sÃ³ aos membros do grupo.
- **Pausar**: bloqueia todas as chamadas ao Claude na hora.
- **Limpar**: apaga a conversa e a memÃ³ria do bot naquela conversa.

## Abrir no celular (sem Tailscale)
1. No `.env`, adicione `WEB_HOST=0.0.0.0` e reinicie `npm.cmd run web`.
2. O terminal mostra o link para o celular (`http://192.168.x.x:4400/login?t=...`). Celular e computador precisam estar no mesmo Wi-Fi.
3. O Windows vai perguntar sobre o firewall: permita sÃ³ em **rede privada**.
4. AtenÃ§Ã£o: na rede, o link Ã© HTTP sem criptografia. Use em Wi-Fi de confianÃ§a. Quem tiver o token controla seus bots. Para acesso de fora de casa com seguranÃ§a, o caminho Ã© uma VPN privada como o Tailscale (nÃ£o configurado aqui).
5. Para trocar o token, apague `data/web/auth.json` e reinicie.

## Limites e seguranÃ§a
- `DAILY_CALL_CAP` (padrÃ£o 40): mÃ¡ximo de chamadas ao Claude por dia. Cada resposta de bot conta 1; um pedido ao coordenador com 2 delegaÃ§Ãµes custa 4. Aumente com cuidado: **tudo isso sai do limite da sua assinatura**.
- `MESSAGE_CALL_CAP` (padrÃ£o 8): mÃ¡ximo de chamadas por mensagem sua.
- `CLAUDE_CONCURRENCY` (padrÃ£o 2): chamadas ao mesmo tempo.
- Os bots sÃ³ tÃªm ferramentas de leitura e web, em modo `dontAsk`. NÃ£o escrevem, nÃ£o apagam, nÃ£o rodam comandos e ignoram seus servidores MCP.
- Resultados de um bot entram no coordenador marcados como dados, nÃ£o instruÃ§Ãµes.
- Dados ficam em `data/web` (bots, conversas, uso). EstÃ¡ no `.gitignore`. Se a pasta estiver no OneDrive, as conversas vÃ£o para a nuvem.
- Teste automÃ¡tico: `node test/web-e2e.mjs`.


## Abrir sem terminal e iniciar com o Windows
DÃª dois cliques nos arquivos da pasta `grokbot` (nÃ£o precisa de PowerShell):
- `instalar-autostart.bat`: liga a central agora e toda vez que o Windows iniciar, em segundo plano e sem janela. Depois abre o navegador jÃ¡ logado.
- `abrir-central.bat`: abre a central no navegador (Ãºtil se vocÃª fechou a aba).
- `parar-central.bat`: para a central.
- `remover-autostart.bat`: desfaz o inÃ­cio automÃ¡tico.
O log fica em `data/web/server.log` (ele contÃ©m o link com token, entÃ£o nÃ£o compartilhe esse arquivo).
Se vocÃª mudar `WEB_PORT`, o `abrir-central.bat` ainda abre a porta 4400: abra o endereÃ§o novo na mÃ£o.

## Instalar como app (Ã­cone prÃ³prio)
No computador (Chrome ou Edge), abra `http://localhost:4400` e use o Ã­cone de instalar na barra de endereÃ§o (ou menu, "Instalar Central de Bots").
No celular, o navegador sÃ³ instala como app em **HTTPS**. Pelo endereÃ§o `http://192.168...` vocÃª consegue sÃ³ um atalho. Com HTTPS (por exemplo via Tailscale) ele instala de verdade.


## Acesso de qualquer lugar com Tailscale (recomendado)
Com o Tailscale a central continua sÃ³ em `localhost` (nÃ£o use `WEB_HOST=0.0.0.0`) e o Tailscale entrega um endereÃ§o HTTPS privado, visÃ­vel apenas nos seus aparelhos. O app instala no celular e o token continua obrigatÃ³rio.
1. Instale o Tailscale no PC e no celular (tailscale.com/download) e entre na **mesma conta** nos dois.
2. DÃª dois cliques em `ligar-tailscale.bat`. Ele roda `tailscale serve --bg --https=4400 localhost:4400` e mostra o endereÃ§o `https://NOME-DO-PC.xxxx.ts.net:4400`.
   Se ele avisar que o HTTPS nÃ£o estÃ¡ habilitado, abra o link que ele mostra (ou o painel admin do Tailscale, em DNS) e habilite.
3. No celular, com o Tailscale ligado, abra `https://NOME-DO-PC.xxxx.ts.net:4400/login?t=SEU_TOKEN` (o token estÃ¡ em `data/web/auth.json`). Depois use "Instalar app" ou "Adicionar Ã  tela inicial".
4. `desligar-tailscale.bat` remove a publicaÃ§Ã£o.
O computador precisa estar ligado, com a central rodando e o Tailscale conectado.

## Painel de atividade e Rotinas

- **Painel Ã  direita ("Tela de <bot>")**: mostra ao vivo o que o bot estÃ¡ fazendo (pesquisando na web, abrindo uma pÃ¡gina, lendo um arquivo, delegando a outro bot, tempo de cada etapa). Em grupo e no Coordenador, aparecem tambÃ©m os bots que receberam tarefas. O histÃ³rico do painel fica sÃ³ na memÃ³ria (zera ao reiniciar a Central).
- **Rotinas**: tarefas agendadas por bot (ex.: "dias Ãºteis Ã s 08:15, resuma as notÃ­cias de IA"). Ficam em `data/web/routines.json`. Rodam sozinhas com a Central ligada; se o PC estava desligado na hora, rodam ao ligar, atÃ© 3 horas depois. Cada execuÃ§Ã£o gasta ao menos 1 chamada do limite diÃ¡rio e respeita a pausa. O resultado chega no chat do bot. MÃ¡ximo de 12 rotinas.
- A atividade usa o modo de streaming do Claude Code (`--output-format stream-json --verbose`). Se a sua versÃ£o nÃ£o aceitar, a Central cai sozinha para o modo antigo (as respostas continuam funcionando, sÃ³ some o detalhe do painel).
- Backups do visual e do servidor anteriores: `web/public/index.antigo.html` e `web/server.antigo.mjs`.

## Capacidades avanÃ§adas (tambÃ©m em: menu do perfil > Capacidades)

Tudo Ã© configurado em **Editar bot** (abas Geral, Conhecimento, Skills, Fluxo e controle). Depois de atualizar arquivos do servidor, reinicie a Central (`parar-central.bat` e `instalar-autostart.bat`) e use Ctrl+F5.

| Recurso | Como ativar | Como desativar |
| --- | --- | --- |
| Anexos (imagem, vÃ­deo, Ã¡udio, PDF, texto, planilha) | Clipe no chat, arrastar ou colar. MÃ¡x. 1 GB (`UPLOAD_MAX_MB` no `.env`) | Remover o anexo antes de enviar |
| Skills por bot | Aba Skills: enviar `.zip` (com `SKILL.md` na pasta principal) ou colar o `SKILL.md` | Remover na aba Skills |
| Biblioteca de skills | BotÃ£o "Biblioteca" na skill; no outro bot, "Usar da biblioteca" | Apagar da biblioteca |
| Modo avanÃ§ado | Aba Fluxo e controle: liga criaÃ§Ã£o de arquivos e programas liberados (padrÃ£o `ffmpeg`, `ffprobe`) | Desmarcar. `bash`, `curl`, `rm` e similares sÃ£o sempre bloqueados |
| Base de conhecimento | Aba Conhecimento: atÃ© 30 arquivos de 50 MB | Remover o arquivo |
| MemÃ³ria | No chat: `/lembrar texto` (apagar: `/esquecer`) | Limpar o campo |
| Exemplos e checklist | Aba Conhecimento | Deixar vazio |
| Idioma, tom e modelo automÃ¡tico | Aba Geral | Modelo fixo; idioma vazio |
| Fluxo e revisor | Aba Fluxo e controle (atÃ© 3 bots em sequÃªncia) | Desmarcar; "Sem revisor" |
| Pedir aprovaÃ§Ã£o | Aba Fluxo e controle (instruÃ§Ã£o ao bot, nÃ£o bloqueio tÃ©cnico) | Desmarcar |
| Composio por bot | Exige `COMPOSIO_MCP_URL` no `.env`; liga/desliga por bot | Desmarcar, ou apagar a URL do `.env` |
| Limite por bot | Aba Fluxo e controle (0 = sem limite) | Colocar 0 |
| Pasta vigiada | Caminho completo da pasta (checa a cada 10 s; `WATCH_TICK_MS` muda o intervalo) | Apagar o caminho |
| Duplicar, exportar, importar | Editar bot (Duplicar/Exportar); menu "+" > Importar bot | n/a |
| NotificaÃ§Ãµes | O navegador pede permissÃ£o ao enviar a primeira mensagem | Bloquear no navegador |

### Editor de VÃ­deo

1. `winget install ffmpeg`, feche e abra o PowerShell e confira com `ffmpeg -version`.
2. Reinicie a Central.
3. Novo bot > sugestÃ£o "Editor de VÃ­deo" > Criar. Na janela que reabre, aba Skills: envie o `.zip` da skill.
4. No chat do bot, anexe o vÃ­deo e peÃ§a a ediÃ§Ã£o. O resultado volta no chat.

### Cuidados

- Arquivos enviados e gerados ficam em `data/web/files`; prefira manter `data` fora do OneDrive.
- Os arquivos somem ao excluir a conversa, limpar o histÃ³rico ou excluir o bot (anexos nÃ£o enviados, em 24 h).
- Ligue o modo avanÃ§ado sÃ³ nos bots que precisam.
- Skills que dependem da nuvem (ex.: salvar no Google Drive) nÃ£o rodam sozinhas no bot local.
