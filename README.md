# Atlas — Central de Bots

Uma página web (instalável como app) com vários bots de IA, grupos, um coordenador, rotinas, clientes e entregas. Roda no **seu computador** e usa o **Claude Code** (a sua assinatura) como cérebro. Sem API paga e sem dependências npm.

> Versão atual: veja `CHANGELOG.md`. Este guia vale para a versão 0.2.0 ou mais nova.

## O que você precisa
| Item | Detalhe |
| --- | --- |
| **Node.js 20.6 ou superior** | Versões 20 mais antigas que 20.6 não funcionam. Confira com `node -v`. |
| **Git** | Para baixar e atualizar o projeto. |
| **Claude Code logado** | `npm install -g @anthropic-ai/claude-code`, depois rode `claude` e entre com a conta da assinatura. Tudo o que os bots fazem sai do limite dessa assinatura. |
| Windows, Mac ou Linux | Os arquivos `.bat` (autostart, reiniciar, Tailscale, Drive) são do **Windows**. No Mac/Linux use só `npm run web`. |

## Instalar e ligar (primeira vez)
```
git clone https://github.com/natandata/data-house
cd data-house
npm run web
```
No PowerShell, se aparecer erro de scripts, use `npm.cmd run web`.

1. O `.env` é criado sozinho a partir do `.env.example` na primeira vez. Os campos do Telegram podem ficar vazios.
2. O terminal mostra um link `http://localhost:4400/login?t=...`. Abra no navegador. O link grava um cookie e depois basta abrir `http://localhost:4400`.
3. Já vêm 4 bots prontos (Grokbot, Coordenador, Pesquisador e Escritor). Mande uma mensagem para confirmar que o Claude responde.

> **Segurança do link:** o `t=...` é a chave de acesso à sua Central. Não coloque em prints, vídeos de aula nem mensagens. Para trocar a chave, apague `data/web/auth.json` e reinicie.

## Ligar sem terminal (Windows)
Dê dois cliques na pasta do projeto:
- `instalar-autostart.bat`: liga a Central agora e toda vez que o Windows iniciar, em segundo plano. Abre o navegador já logado.
- `abrir-central.bat`: abre a Central no navegador.
- `reiniciar-central.bat`: reinicia a Central (o botão **Reiniciar a Central**, dentro da própria Central, aciona este arquivo).
- `parar-central.bat` e `remover-autostart.bat`: parar e desfazer o início automático.

O log fica em `data/web/server.log` e **contém o link com a chave**: não compartilhe esse arquivo.

## Como usar
- **Bots:** menu **+ > Novo bot** (nome, função, personalidade, modelo, ferramentas). O menu do bot tem abas Geral, Conhecimento, Skills e Fluxo e controle.
- **Coordenador:** marque "é coordenador". Ele decide se responde sozinho ou delega aos outros bots (até 4 tarefas) e entrega a resposta final.
- **Grupos:** junte bots e chame com `@nome`. Sem `@`, o coordenador do grupo cuida do pedido.
- **Ctrl+K:** busca em mensagens, arquivos, links, conversas e comandos, com filtros por bot, cliente e data. `?` mostra os atalhos.
- **Tarefas e aprovações:** o que está rodando, a fila, o que **espera você** (aprovar em um clique), cancelar, repetir e histórico.
- **Clientes:** cadastre regras, memória, pasta do Drive e link da pasta. Ligue uma conversa a um cliente e os bots recebem esse contexto.
- **Entregas:** grade ou lista dos arquivos que os bots geraram, com prévia, comparação de versões (v1 × v2), aprovação da versão final, envio em lote ao Drive e exportação CSV/JSON.
- **Rotinas:** tarefas agendadas por bot, com próxima execução, último resultado e aviso se falhar.
- **Custos e limites:** uso por dia e por bot e os medidores da assinatura, com aviso em 80% e 95%.
- **Memória:** o que cada bot e cada cliente lembra. Em uma mensagem, o menu "⋯" tem **Lembrar disso**.
- **Escritório:** painel ao vivo da equipe. **Pausar** bloqueia todas as chamadas ao Claude na hora.
- **Acessibilidade:** texto maior e alto contraste (menu principal).

## Sistema: backup, GitHub e atualizações
Menu principal > **Sistema**:
- **Backup:** copia bots, conversas e configurações para `data/backups` (guarda os 7 últimos). Pode ser automático de madrugada.
- **GitHub:** envia o código para o seu repositório, sem `.env`, `data` e logs. Precisa do `git` logado no GitHub neste computador. A Central bloqueia o envio se achar uma chave do `.env` dentro do código.
- **Atualizações:** avisa quando há versão nova no repositório configurado. Para atualizar uma instalação: `git pull` e reinicie a Central.

## Google Drive
Os bots **não** têm acesso ao seu Drive. Quem envia os arquivos é a Central, e só quando você pede (por exemplo "envie para o Drive") ou pelo botão Drive nas Entregas.

Dois modos, nesta ordem:
1. **Pasta do Google Drive para computador (recomendado):** com o aplicativo instalado e logado (ex.: `G:\Meu Drive`), a Central só copia o arquivo para lá e o Drive sincroniza. Não precisa de login extra. Se a pasta não for detectada, defina `DRIVE_LOCAL_DIR` no `.env`.
2. **rclone:** rode `conectar-drive.bat` uma vez. **Atenção:** ele cria a conexão com o escopo `drive`, que dá acesso **amplo** ao Drive daquela conta (ler, criar e apagar). Use uma conta apropriada e só se aceitar isso. Para forçar este modo: `DRIVE_MODE=rclone`.

No cadastro do cliente há dois campos: o **link da pasta** (serve para abrir a pasta com um clique) e o **nome/caminho da pasta** (é o que a Central usa para copiar os arquivos, ex.: `Cliente | Pasta`). No modo local, o "link" gerado pela Central é uma busca no Drive, não um link de compartilhamento direto.

## Abrir no celular
**Recomendado: Tailscale.** A Central continua só em `localhost` e o Tailscale entrega um endereço HTTPS privado, visível apenas nos seus aparelhos (e o app instala de verdade no celular).
1. Instale o Tailscale no computador e no celular e entre na **mesma conta**.
2. No painel de administração do Tailscale (tailscale.com/admin), em **DNS**, ative **MagicDNS** e **HTTPS Certificates**. Sem isso o passo seguinte avisa que o HTTPS não está habilitado.
3. Dê dois cliques em `ligar-tailscale.bat`. Ele publica o endereço `https://NOME-DO-PC.xxxx.ts.net:4400`.
4. No celular, com o Tailscale ligado, abra `https://NOME-DO-PC.xxxx.ts.net:4400/login?t=SUA_CHAVE` (a chave está em `data/web/auth.json`) e use "Adicionar à tela inicial" ou "Instalar app".
5. `desligar-tailscale.bat` remove a publicação. O computador precisa estar ligado, com a Central rodando e o Tailscale conectado.

**Sem Tailscale (só no mesmo Wi-Fi):** coloque `WEB_HOST=0.0.0.0` no `.env` e reinicie. O link fica HTTP sem criptografia e quem tiver a chave controla seus bots: use só em rede de confiança, e permita o firewall do Windows apenas na **rede privada**. Se o celular não conectar, rode `diagnostico-celular.bat`.

## Configuração (`.env`)
Todas são opcionais. O `.env` é criado a partir do `.env.example`.
| Variável | Para que serve | Padrão |
| --- | --- | --- |
| `WEB_PORT` / `WEB_HOST` | Porta e endereço da Central | `4400` / `127.0.0.1` |
| *(na interface)* | Limite diário de chamadas ao Claude: em **Custos e limites** / configurações de uso. Sem limite próprio, vale o da assinatura | sem limite próprio |
| `MESSAGE_CALL_CAP` | Máximo de chamadas por mensagem sua | 8 |
| `CLAUDE_CONCURRENCY` | Chamadas ao mesmo tempo | 2 |
| `CLAUDE_TIMEOUT_MS` | Tempo máximo por resposta | 180000 |
| `UPLOAD_MAX_MB` | Tamanho máximo de anexo | 1024 |
| `DRIVE_LOCAL_DIR`, `DRIVE_MODE`, `DRIVE_FOLDER`, `DRIVE_REMOTE`, `RCLONE_BIN` | Google Drive (ver acima) | automático |
| `GITHUB_REPO` | Repositório usado em Sistema (`dono/repositório`) | — |
| `UPDATE_CHECK=off` | Desliga a verificação de versão nova | ligado |
| `COMPOSIO_MCP_URL`, `COMPOSIO_API_KEY` | Apps conectados via Composio (a chave começa com `ck_`; nunca envie a ninguém) | — |
| `WEB_DATA_DIR` | Onde ficam os dados | `data/web` |

## Segurança e dados
- Os bots começam só com ferramentas de **leitura e web**, em modo `dontAsk`. Eles não escrevem, não apagam e não rodam comandos, a menos que você ligue o **modo avançado** de um bot (aba Fluxo e controle). Mesmo ligado, `bash`, `curl`, `rm` e similares seguem bloqueados.
- Resultados de um bot entram no coordenador como dados, não como instruções.
- **Tudo fica na sua máquina**, em `data/web` (bots, conversas, arquivos, uso, backups). Essa pasta está no `.gitignore` e não vai para o GitHub. Se o projeto estiver numa pasta do OneDrive, as conversas vão para a nuvem da Microsoft.
- Cada instalação começa limpa: bots, clientes e conversas não passam de uma máquina para outra. Use o backup para mover.
- Cada máquina usa o limite da assinatura do Claude de quem fez o login.

## Problemas comuns
- **`.env: not found`:** use `npm run web` (ele cria o `.env`). Se rodar o `node` direto, copie `.env.example` para `.env`.
- **O botão Reiniciar não voltou:** rode `reiniciar-central.bat` na pasta do projeto e dê Ctrl+F5 no navegador.
- **Tela antiga depois de atualizar:** Ctrl+F5.
- **Bot não responde:** rode `claude` no terminal e confira se está logado; veja `data/web/server.log`.
- **Limite da assinatura esgotado:** a Central avisa e volta a responder quando o limite renova. O painel Custos mostra quando.

## Testes
```
node test/web-e2e.mjs      # Central
node test/extra-e2e.mjs    # recursos da versão 0.2.0
```
Usam um Claude de mentira e uma pasta temporária: não gastam assinatura nem mexem nos seus dados.

---

## Apêndice: bot de Telegram (opcional, antigo)
O projeto também inclui um bot de Telegram simples que usa o mesmo Claude Code. A Central **não depende dele**.
1. Crie o bot com @BotFather (`/newbot`) e copie o token para `TELEGRAM_BOT_TOKEN` no `.env`.
2. Rode `npm start`, mande "oi" ao bot e veja no terminal `Mensagem ignorada do ID 123456789`. Coloque esse número em `ALLOWED_USER_ID` e reinicie.
3. Ele só responde ao seu ID e só tem ferramentas de leitura e web (`ALLOWED_TOOLS`). Não libere `Bash`, `Write` ou `Edit` sem entender o risco. O jeito dele falar fica em `workdir/CLAUDE.md`.
