# Atlas

Bot de Telegram que usa o **Claude Code** (sua assinatura) como cérebro. Sem API paga, sem dependências npm.

Como funciona: você manda mensagem no Telegram → o bot chama `claude -p` no seu computador → devolve a resposta.
A conversa continua entre mensagens (o bot guarda o ID da sessão). `/novo` começa uma conversa do zero.

## Segurança (já configurado)
- Só responde ao seu ID do Telegram (`ALLOWED_USER_ID`). Qualquer outra pessoa é ignorada.
- O Claude só pode **ler arquivos e usar a web** (`Read, Glob, Grep, WebSearch, WebFetch`). Não escreve, não apaga e não roda comandos.
- Roda em modo `dontAsk` (nega tudo que não está liberado), bloqueia `Bash/Write/Edit` e ignora os seus servidores MCP.
- Nunca usa `--dangerously-skip-permissions`.
- O token vai só no `.env` (já está no `.gitignore`).
- O bot só funciona com o computador ligado e esta janela aberta.

## Primeira vez
1. **Claude Code**: instale e faça login uma vez.
   - `npm install -g @anthropic-ai/claude-code` (no PowerShell use `npm.cmd` e `claude.cmd` se der erro de scripts)
   - rode `claude` e entre com a conta da sua assinatura
2. **Bot no Telegram**: fale com @BotFather → `/newbot` → copie o token.
3. **`.env`**: copie `.env.example` para `.env` e cole o token em `TELEGRAM_BOT_TOKEN`.
4. **Seu ID**: rode `npm start`, mande "oi" ao bot e veja no terminal `Mensagem ignorada do ID 123456789`. Coloque esse número em `ALLOWED_USER_ID`, salve e reinicie.
5. Pronto: mande uma mensagem ao bot.

## Dia a dia
- Ligar: `npm start` (dentro da pasta `grokbot`). Parar: `Ctrl+C`.
- Mudar o jeito dele falar: edite `workdir/CLAUDE.md`.
- Trocar o modelo: `CLAUDE_MODEL` no `.env` (`sonnet` é o padrão; `haiku` gasta menos; `opus` gasta mais e pode não estar no seu plano).
- Testar sem Telegram nem Claude: `npm test`.

## Ampliar permissões (com cuidado)
`ALLOWED_TOOLS` no `.env` controla o que ele pode fazer. Cada ferramenta nova dá mais poder a quem controlar o seu Telegram.
Não libere `Bash` nem `Write`/`Edit` sem entender o risco.

## Limites
- Usa o limite de uso da sua assinatura do Claude.
- Respostas longas são divididas em várias mensagens.
- Só texto por enquanto (sem áudio, imagem ou arquivo).


---

# Central de Bots (interface estilo Telegram)

Uma página web com vários bots, grupos e um coordenador. Roda no seu computador e usa o Claude Code (sua assinatura).

## Ligar
```
npm.cmd run web
```
O terminal mostra um link com token (`http://localhost:4400/login?t=...`). Abra no navegador. O link grava um cookie, então depois basta abrir `http://localhost:4400`.
Rode `npm.cmd run web` na pasta `grokbot`. Pode rodar junto com o bot do Telegram.

## Como usar
- **+ Bot**: nome, para que serve, personalidade/regras, modelo e ferramentas. Já vêm 4 prontos: Grokbot, Coordenador, Pesquisador e Escritor (na sua voz).
- **Coordenador**: marque "é coordenador" no bot. Numa conversa com ele, ele decide se responde sozinho ou delega aos outros bots (até 4 tarefas), recebe os resultados e entrega uma resposta final.
- **+ Grupo**: junte bots. Use `@nome` para chamar um bot. Sem `@`, o coordenador do grupo cuida do pedido, delegando só aos membros do grupo.
- **Pausar**: bloqueia todas as chamadas ao Claude na hora.
- **Limpar**: apaga a conversa e a memória do bot naquela conversa.

## Abrir no celular (sem Tailscale)
1. No `.env`, adicione `WEB_HOST=0.0.0.0` e reinicie `npm.cmd run web`.
2. O terminal mostra o link para o celular (`http://192.168.x.x:4400/login?t=...`). Celular e computador precisam estar no mesmo Wi-Fi.
3. O Windows vai perguntar sobre o firewall: permita só em **rede privada**.
4. Atenção: na rede, o link é HTTP sem criptografia. Use em Wi-Fi de confiança. Quem tiver o token controla seus bots. Para acesso de fora de casa com segurança, o caminho é uma VPN privada como o Tailscale (não configurado aqui).
5. Para trocar o token, apague `data/web/auth.json` e reinicie.

## Limites e segurança
- `DAILY_CALL_CAP` (padrão 40): máximo de chamadas ao Claude por dia. Cada resposta de bot conta 1; um pedido ao coordenador com 2 delegações custa 4. Aumente com cuidado: **tudo isso sai do limite da sua assinatura**.
- `MESSAGE_CALL_CAP` (padrão 8): máximo de chamadas por mensagem sua.
- `CLAUDE_CONCURRENCY` (padrão 2): chamadas ao mesmo tempo.
- Os bots só têm ferramentas de leitura e web, em modo `dontAsk`. Não escrevem, não apagam, não rodam comandos e ignoram seus servidores MCP.
- Resultados de um bot entram no coordenador marcados como dados, não instruções.
- Dados ficam em `data/web` (bots, conversas, uso). Está no `.gitignore`. Se a pasta estiver no OneDrive, as conversas vão para a nuvem.
- Teste automático: `node test/web-e2e.mjs`.


## Abrir sem terminal e iniciar com o Windows
Dê dois cliques nos arquivos da pasta `grokbot` (não precisa de PowerShell):
- `instalar-autostart.bat`: liga a central agora e toda vez que o Windows iniciar, em segundo plano e sem janela. Depois abre o navegador já logado.
- `abrir-central.bat`: abre a central no navegador (útil se você fechou a aba).
- `parar-central.bat`: para a central.
- `remover-autostart.bat`: desfaz o início automático.
O log fica em `data/web/server.log` (ele contém o link com token, então não compartilhe esse arquivo).
Se você mudar `WEB_PORT`, o `abrir-central.bat` ainda abre a porta 4400: abra o endereço novo na mão.

## Instalar como app (ícone próprio)
No computador (Chrome ou Edge), abra `http://localhost:4400` e use o ícone de instalar na barra de endereço (ou menu, "Instalar Central de Bots").
No celular, o navegador só instala como app em **HTTPS**. Pelo endereço `http://192.168...` você consegue só um atalho. Com HTTPS (por exemplo via Tailscale) ele instala de verdade.


## Acesso de qualquer lugar com Tailscale (recomendado)
Com o Tailscale a central continua só em `localhost` (não use `WEB_HOST=0.0.0.0`) e o Tailscale entrega um endereço HTTPS privado, visível apenas nos seus aparelhos. O app instala no celular e o token continua obrigatório.
1. Instale o Tailscale no PC e no celular (tailscale.com/download) e entre na **mesma conta** nos dois.
2. Dê dois cliques em `ligar-tailscale.bat`. Ele roda `tailscale serve --bg --https=4400 localhost:4400` e mostra o endereço `https://NOME-DO-PC.xxxx.ts.net:4400`.
   Se ele avisar que o HTTPS não está habilitado, abra o link que ele mostra (ou o painel admin do Tailscale, em DNS) e habilite.
3. No celular, com o Tailscale ligado, abra `https://NOME-DO-PC.xxxx.ts.net:4400/login?t=SEU_TOKEN` (o token está em `data/web/auth.json`). Depois use "Instalar app" ou "Adicionar à tela inicial".
4. `desligar-tailscale.bat` remove a publicação.
O computador precisa estar ligado, com a central rodando e o Tailscale conectado.

## Painel de atividade e Rotinas

- **Painel à direita ("Tela de <bot>")**: mostra ao vivo o que o bot está fazendo (pesquisando na web, abrindo uma página, lendo um arquivo, delegando a outro bot, tempo de cada etapa). Em grupo e no Coordenador, aparecem também os bots que receberam tarefas. O histórico do painel fica só na memória (zera ao reiniciar a Central).
- **Rotinas**: tarefas agendadas por bot (ex.: "dias úteis às 08:15, resuma as notícias de IA"). Ficam em `data/web/routines.json`. Rodam sozinhas com a Central ligada; se o PC estava desligado na hora, rodam ao ligar, até 3 horas depois. Cada execução gasta ao menos 1 chamada do limite diário e respeita a pausa. O resultado chega no chat do bot. Máximo de 12 rotinas.
- A atividade usa o modo de streaming do Claude Code (`--output-format stream-json --verbose`). Se a sua versão não aceitar, a Central cai sozinha para o modo antigo (as respostas continuam funcionando, só some o detalhe do painel).
- Backups do visual e do servidor anteriores: `web/public/index.antigo.html` e `web/server.antigo.mjs`.

## Capacidades avançadas (também em: menu do perfil > Capacidades)

Tudo é configurado em **Editar bot** (abas Geral, Conhecimento, Skills, Fluxo e controle). Depois de atualizar arquivos do servidor, reinicie a Central (`parar-central.bat` e `instalar-autostart.bat`) e use Ctrl+F5.

| Recurso | Como ativar | Como desativar |
| --- | --- | --- |
| Anexos (imagem, vídeo, áudio, PDF, texto, planilha) | Clipe no chat, arrastar ou colar. Máx. 1 GB (`UPLOAD_MAX_MB` no `.env`) | Remover o anexo antes de enviar |
| Skills por bot | Aba Skills: enviar `.zip` (com `SKILL.md` na pasta principal) ou colar o `SKILL.md` | Remover na aba Skills |
| Biblioteca de skills | Botão "Biblioteca" na skill; no outro bot, "Usar da biblioteca" | Apagar da biblioteca |
| Modo avançado | Aba Fluxo e controle: liga criação de arquivos e programas liberados (padrão `ffmpeg`, `ffprobe`) | Desmarcar. `bash`, `curl`, `rm` e similares são sempre bloqueados |
| Base de conhecimento | Aba Conhecimento: até 30 arquivos de 50 MB | Remover o arquivo |
| Memória | No chat: `/lembrar texto` (apagar: `/esquecer`) | Limpar o campo |
| Exemplos e checklist | Aba Conhecimento | Deixar vazio |
| Idioma, tom e modelo automático | Aba Geral | Modelo fixo; idioma vazio |
| Fluxo e revisor | Aba Fluxo e controle (até 3 bots em sequência) | Desmarcar; "Sem revisor" |
| Pedir aprovação | Aba Fluxo e controle (instrução ao bot, não bloqueio técnico) | Desmarcar |
| Composio por bot | Exige `COMPOSIO_MCP_URL` no `.env`; liga/desliga por bot | Desmarcar, ou apagar a URL do `.env` |
| Limite por bot | Aba Fluxo e controle (0 = sem limite) | Colocar 0 |
| Pasta vigiada | Caminho completo da pasta (checa a cada 10 s; `WATCH_TICK_MS` muda o intervalo) | Apagar o caminho |
| Duplicar, exportar, importar | Editar bot (Duplicar/Exportar); menu "+" > Importar bot | n/a |
| Notificações | O navegador pede permissão ao enviar a primeira mensagem | Bloquear no navegador |

### Editor de Vídeo

1. `winget install ffmpeg`, feche e abra o PowerShell e confira com `ffmpeg -version`.
2. Reinicie a Central.
3. Novo bot > sugestão "Editor de Vídeo" > Criar. Na janela que reabre, aba Skills: envie o `.zip` da skill.
4. No chat do bot, anexe o vídeo e peça a edição. O resultado volta no chat.

### Cuidados

- Arquivos enviados e gerados ficam em `data/web/files`; prefira manter `data` fora do OneDrive.
- Os arquivos somem ao excluir a conversa, limpar o histórico ou excluir o bot (anexos não enviados, em 24 h).
- Ligue o modo avançado só nos bots que precisam.
- Skills que dependem da nuvem (ex.: salvar no Google Drive) não rodam sozinhas no bot local.
