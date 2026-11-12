# T20 — Ficha Mobile

Módulo para Foundry VTT com o sistema **Tormenta20**, pensado para **jogos presenciais**: a TV mostra o mapa, o mestre controla tudo pelo notebook e cada jogador usa o **celular ou tablet só para a própria ficha e o chat**.

## O que acontece no celular/tablet (modo jogador)

Nada do Foundry fica ativo além da ficha e do chat, para poupar bateria e processamento:

- **Sem mapa:** o canvas não é carregado neste aparelho (`core.noCanvas`), então nada de cena, tokens, luzes ou WebGL. Isso é o que mais pesa num celular. Dados 3D (Dice So Nice) também não aparecem no celular; eles continuam na TV.
- **Sem som:** música, ambiente e sons de interface ficam zerados no aparelho (o som sai da TV). Os volumes voltam ao sair do modo.
- **Sem interface:** barra lateral, hotbar, controles de cena, navegação, lista de jogadores e câmeras ficam escondidos.
- **Sem janelas extras:** diários, cenas, tabelas, macros e imagens mostradas pelo mestre não abrem no celular.
- **Barra no rodapé** com **Ficha**, **Chat** e **Mais** (trocar personagem, tela cheia, recarregar, sair do modo).
- **Aviso de novidade no chat:** quando chega uma mensagem nova ou uma mensagem é atualizada, um aviso sobe do rodapé por alguns segundos, com o autor e o começo do texto (ou o total da rolagem). Só aparece um aviso por vez: um novo substitui o anterior. Tocar nele abre o chat. Um ponto vermelho no botão Chat fica marcado até o chat ser aberto.
- **Ficha em tela cheia e em uma coluna.** Itens abertos a partir dela também ficam em tela cheia. Os diálogos de rolagem aparecem por cima e cabem na tela.
- **Toque longo = clique direito no iPhone/iPad**, para os menus dos itens (editar, excluir, equipar). No Android isso já é nativo.
- Tenta **manter a tela ligada** (precisa de HTTPS).

O notebook do mestre e a TV não são afetados: o modo automático só liga em celulares e tablets e nunca para o mestre.

## A ficha em coluna única

A ficha de personagem aparece nesta ordem:

1. **Identificação**: retrato, nome, nível/XP, raça, origem, classe e divindade
2. **Atributos**, com **PV, PM e Defesa** (e recursos extras, se houver)
3. **Perícias**
4. **Armas e equipamentos**: armas, equipamentos e inventário geral, com dinheiro e carga
5. **Poderes e magias**
6. **Características e proficiências**

No topo da coluna há atalhos para cada seção. Diário e Efeitos continuam em abas próprias.

A ficha continua sendo a **"Ficha de Personagem" do Tormenta20**: o módulo só troca o modelo (template) que monta a tela, e esse modelo reaproveita as partes da ficha original. Por isso rolagens, edição de valores, menus de itens, equipar, descanso, treinamento de perícias e o modo de edição funcionam como na ficha normal. Nada é gravado no ator. Vale tanto para a "Ficha de Personagem" quanto para a "Ficha de Personagem - Abas".

## Como usar

1. Instale e ative o módulo no mundo.
2. Para cada jogador, o mestre atribui o personagem ao usuário (Configurar Jogadores → Personagem) ou dá permissão de **Dono** sobre o ator.
3. O jogador entra no Foundry pelo navegador do celular (mesmo endereço da TV) e faz login com o próprio usuário.
4. A ficha abre sozinha. Se o jogador tiver mais de um personagem, aparece uma lista para escolher.

### Forçar ou desligar o modo

- Configurações do módulo (por aparelho): **Automático / Sempre ativo / Desativado**.
- Pela URL, depois de logado: `http://SEU-ENDERECO/game?t20fm=1` (liga), `?t20fm=0` (desliga), `?t20fm=auto`.
- No celular: **Mais → Sair do modo jogador**.

Se a TV for uma smart TV ou um tablet e o modo ligar por engano, abra `/game?t20fm=0` nela.

### Fonte Tormenta 20

Na tela de escolha de personagem e na tela com o retrato, o título e o nome do personagem usam a fonte **Tormenta 20**, se ela estiver disponível. Senão, usam a **Modesto Condensed**, que vem com o Foundry.

O sistema Tormenta20 não traz o arquivo da fonte. Para usá-la, o mestre cadastra o arquivo em **Configurações → Configurar Fontes Adicionais** com o nome `Tormenta20`.

## Configurações (por aparelho)

| Configuração | Padrão | Para que serve |
|---|---|---|
| Modo jogador | Automático | Liga ou desliga o modo neste aparelho |
| Zoom da ficha e do chat (%) | 100 | Aumenta ou diminui o conteúdo |
| Aviso de novidade no chat (segundos) | 4 | Quanto tempo o aviso fica na tela. 0 desliga o aviso |
| Manter a tela ligada | Sim | Usa a Wake Lock API (só em HTTPS) |

## Junto com o Mobile Sheet Only

Não é preciso usar os dois. Se o [Mobile Sheet Only](https://github.com/prmlimajr/mobile-sheet-only) também estiver ativo, ele cuida do aparelho (canvas, interface, menu) e este módulo só monta a ficha em coluna.

## Limitações

- Feito com base no Tormenta20 **1.6.7**. Se uma versão futura mudar as partes da ficha, a coluna pode mostrar algo fora do lugar. Nesse caso, desative o modo até o módulo ser atualizado.
- Só a ficha de **personagem** é montada em coluna. Outras fichas (NPC, Bases) abrem em tela cheia como no sistema.
- Se o mundo usar áudio e vídeo (câmeras), a conexão de A/V continua sendo feita pelo Foundry no celular. As câmeras ficam escondidas, mas, para economizar de verdade, recuse a permissão de câmera e microfone no navegador do celular.
- **Manter a tela ligada** só funciona com HTTPS. Em rede local via `http://`, desative o bloqueio automático de tela do celular durante a sessão.
- Arrastar e soltar itens não funciona por toque no navegador. Isso é uma limitação do HTML5 em celulares.
