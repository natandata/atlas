# Novidades do Atlas

## 0.3.0

- Idioma: botão com as bandeiras (🇧🇷/🇺🇸, no canto superior direito) alterna o Atlas inteiro entre português e inglês. A escolha fica salva e os bots também passam a responder em inglês enquanto o inglês estiver ativo.
- Áudio: botão de microfone grava e envia; áudios anexados são transcritos pela Central (Groq, plano gratuito; sem chave nada é transcrito nem cobrado) e o texto vai para o bot. Menu do Natan > "Transcrição de áudio".
- Calendário de entregas (card dentro de cada projeto): prazo no seu horário e no do cliente (fuso do cliente configurável), quando foi solicitada e quando foi entregue; importe o chat exportado do WhatsApp (.txt ou .zip) e o Atlas lê tudo, sugere as entregas e você confirma.
- Fala informal: liga/desliga no menu do Natan (ou Ctrl+K); os bots passam a conversar como num WhatsApp com amigo, sem tom corporativo.
- Navegador: contas conectadas ficam salvas no perfil do bot (cookies de sessão viram duráveis por 90 dias; encerrar e ociosidade fecham o Chrome de forma graciosa).
- Navegador: o painel acompanha o bot quando ele troca de aba; seletor de arquivo do site (enviar do computador) e downloads com link no painel (pastas browser-downloads e browser-uploads do bot).
- Seletor de modelo na barra de mensagem (por conversa: padrão, Automático, Haiku, Sonnet, Opus, Gratuito).
- Modelo gratuito (Ollama): novo modelo "Gratuito (Ollama)" por bot (só conversa, sem ferramentas, não gasta o limite do Claude). Menu do Natan > "Modelo gratuito (Ollama)" configura endereço e modelo e testa a conexão.
- Navegador do bot (etapa 2): quando um bot com "Navegador do bot" ligado trabalha, o painel abre sozinho e você vê ele clicar e digitar ao vivo no mesmo navegador (as contas logadas por você valem para ele). Botão "Assumir controle" para o bot e libera o navegador para você. O bot não consegue fechar o navegador.
- Navegador dentro da conversa: botão do globo no cabeçalho abre um navegador próprio do bot (perfil salvo em data/bots/<bot>/browser-profile), transmitido ao vivo no Atlas. Você clica, rola e digita, e entra nas contas por ali. Fecha sozinho após 10 min sem uso. Usa o Chrome (ou Edge) já instalado.
- Conversa individual com um bot dentro de um projeto agora é separada da conversa dele em Agentes.
- Botão direito num agente: nova opção "Apagar bot" (com confirmação), que remove o bot, a memória, as rotinas e tira ele de grupos e projetos.
- Projetos: imagem de perfil do projeto (escolha um PNG/JPG no card; vira quadrado e aparece na lista e no painel).
- Painel do projeto: botão direito num bot da Equipe (ou botão "+ Bot") abre Adicionar bot, Trocar bot e Remover bot.
- Projetos: seção Skills no card do projeto, com busca; lista as skills que já existem no seu Claude (pasta .claude/skills, plugins e biblioteca do Atlas) e copia as escolhidas para todos os bots do projeto.
- Projetos de verdade: a aba Projetos agora tem lista de projetos, botão "Novo projeto" (também no menu +) com 16 modelos (Edição de Vídeo, Design de Marca, Estratégia de Conteúdo, Análise de Dados e mais), cada um com regras, bots sugeridos que podem ser criados na hora, ícone e cor.
- Painel do projeto: aguardando você, equipe com status, uso e orçamento mensal (pausa ao atingir o limite, aviso aos 80%), tarefas recentes, conversas, entregas, rotinas por projeto e regras/memória.
- "Virar projeto" nos clientes existentes (manual), arquivar projeto, cliente como campo opcional, um bot pode estar em vários projetos.
- Escritório: filtro por projeto (agentes, Equipe agora e Tarefas feitas).
- Escritório: movimentação dos agentes mais calma (olham para onde andam, passada ligada à distância, aceleração suave, menos gente fora da mesa ao mesmo tempo), versão sentado ao trabalhar, painel "Tarefas feitas" (7 dias) com busca e painéis recolhíveis.
- Botão direito nas conversas: fixar, marcar como lida/não lida, renomear, associar a cliente, cor e etiqueta, ir até o bot no escritório, duplicar bot, ver entregas, exportar (Markdown/JSON) e excluir (conversa direta: apaga o histórico).
- Agentes agora têm foto: biblioteca com 60 retratos em pixel art (`web/public/avatars`), escolhida no editor do bot e atribuída automaticamente (sem repetir) aos bots sem foto.
- Escritório virtual: cada agente aparece de corpo inteiro, com a cabeça do retrato e as cores da roupa.
- Três retratos novos em pixel art (posições 1, 2 e 3 do seletor), feitos a partir de fotos reais, com o corpo correspondente no escritório.
- Escritório: agentes agora têm corpo inteiro em pixel art com proporção natural (60 corpos), combinando com a roupa de cada busto; os 3 retratos novos ganharam corpo próprio.
- Editar bot: rodapé de botões redesenhado (ícones, Excluir/Duplicar/Exportar discretos à esquerda, Cancelar e Salvar à direita, barra fixa ao rolar).
- Abas no topo (Agentes, Conversas, Projetos): renomear, ordenar (arrastar ou menu), criar e fechar; filtram a lista lateral e ficam salvas.
- Botão do cliente: abre a pasta do Drive e aceita o link; escrever "Autorizo o acesso à pasta [link do Drive]" no chat preenche o botão sozinho.
- Reiniciar a Central agora roda em segundo plano (sem janela de terminal) e mostra uma cutscene de carregamento: os agentes vão de ônibus para casa, anoitece, amanhece e eles voltam ao escritório, com barra de progresso estimada.

## 0.2.0 — 2026-10-30
- Botão "Reiniciar" em destaque no topo da Central.
- Busca global (Ctrl+K) em mensagens, arquivos, links e comandos.
- Painel de tarefas com fila, status, cancelar e repetir; área "Aguardando você" com aprovação em um clique.
- Clientes (projetos): regras, memória e pasta do Drive por cliente.
- Entregas em grade, com miniaturas, filtros por bot e cliente, e comparação de versões (v1 × v2).
- Prévia de arquivos em janela, com zoom, vídeo e avanço entre arquivos.
- Escritório ao vivo: o que cada bot faz agora, há quanto tempo e a fila.
- Custos e limites: uso por dia e por bot, avisos aos 80% e 95% do limite do Claude.
- Memória: "Lembrar disso" nas mensagens e tela para ver e editar o que cada bot e cliente sabem.
- Rotinas com próxima execução, último resultado e aviso quando falham.
- Responder a uma mensagem, fixar mensagens e exportar conversa ou entregas.
- Drive: envio de vários arquivos com barra de progresso, pasta padrão por cliente, aprovar versão e mandar revisões para a pasta "revisoes".
- Backup automático diário e envio do código ao GitHub pela própria Central.
- Acessibilidade: tamanho da fonte, alto contraste e atalhos de teclado; carregamento com esqueletos.

## 0.1.0 — 2026-10-28
- Primeira versão da Central de bots (Atlas).
