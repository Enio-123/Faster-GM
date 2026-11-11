# Faster GM

App de treino diário de xadrez para quem quer subir de nível com disciplina: mates longos, cálculo às cegas e partidas rápidas contra um bot de força ajustável. Feito para treinar sozinho, no computador ou no celular.

## Modos de treino

| Modo | O que treina | Como funciona |
| --- | --- | --- |
| Escada de mate | Visualização de mates longos | Mate em 3, 4, 5, 6, 7 e 8+. Cada degrau abre com 8 acertos nas últimas 10 tentativas do degrau anterior. A primeira tentativa de cada problema vale para o rating de problemas (Glicko-1, no máximo 120 pontos por problema). Lance diferente do gabarito vale se o Stockfish confirmar mate no mesmo número de lances. |
| Pressão de tempo | Decidir com o relógio correndo | 5, 10, 15, 20 ou 30 minutos de mates (até o degrau aberto na escada) ou de linhas táticas de 3 a 6+ lances, perto do seu rating. Errou, o app não mostra a solução e passa para o próximo. No fim, cada erro vem explicado. Os problemas errados vão para a revisão. |
| Às cegas | Visualização e cálculo sem ver as peças | Trilha de 5 etapas, explicada abaixo. |
| Cálculo às cegas | Cálculo de linhas inteiras | Etapa 3 da trilha às cegas. As peças ficam paradas. Você digita a linha toda, seus lances e as respostas do adversário, e só no fim confere. Táticas ou mates, de 3 a 6+ lances, com três dificuldades. |
| Sequência | Precisão sob pressão | Mates seguidos que ficam um lance mais longos a cada 3 acertos. Um erro encerra, e o erro vem explicado. |
| Relâmpago | Reconhecimento de padrão | 3 minutos de problemas curtos. Erro tira 10 segundos. No fim, os erros vêm explicados. |
| Revisão dos erros | Fixar o que você errou | Problemas errados e erros das suas partidas voltam em 1, 3, 7, 14, 30 e 60 dias. Errou, volta para o dia seguinte. |
| Jogar contra o Tempo | Bullet e blitz | 1+0, 2+1, 3+0, 3+2, 5+0 e 5+3, com pré-lance. No fim, a análise do Stockfish marca imprecisões, erros e erros graves; erros e erros graves viram cartões de revisão. |

## Às cegas

Uma trilha do mais simples ao mais difícil (tela Treinos, cartão Às cegas). Tudo conta no bloco "Cálculo e às cegas" da rotina.

1. Visão do tabuleiro: rodadas de 1 minuto. Ache a casa (tabuleiro vazio e sem coordenadas, brancas ou pretas embaixo), cor da casa, mesma diagonal e saltos do cavalo (sem tabuleiro na tela). Errou, a explicação aparece na hora: a soma coluna + fileira, a contagem de colunas e fileiras, um caminho mais curto do cavalo.
2. Memória da posição: uma posição real (problemas do Lichess) aparece por 5, 10 ou 20 segundos e some. Vêm 4 perguntas: onde está uma peça (só peças únicas) ou o que tem numa casa. Com 2 ou 4 lances anunciados, os lances da partida são falados e escritos por cima da posição escondida e as perguntas são sobre a posição depois deles. Rodadas de 5 posições, por faixa de peças.
3. Cálculo às cegas: o modo acima.
4. Problemas às cegas: mate em 1, mate em 2, táticas curtas, mate em 3 e linhas de 3, com filtro de peças (até 10, até 16, qualquer). Você olha a posição por 10 s, 30 s ou 1 min, ou só lê a lista das peças, como nos livros. Aí joga no tabuleiro vazio ou digitando; as respostas do adversário são escritas e faladas. Dá para espiar 3 segundos, e o app conta. Errou, vai para o próximo; no fim, os erros vêm explicados e vão para a revisão.
5. Partida às cegas contra o Tempo: 10+5, 15+10, 30+0 ou sem relógio. Três níveis de ajuda: tabuleiro vazio com a lista de lances, só o tabuleiro vazio, ou nada além dos lances anunciados. Espiadas contadas. O nível sugerido começa 300 abaixo do recomendado e a partida às cegas não mexe no desempenho contra o bot das partidas normais. A análise no fim é a mesma das partidas.

Lance digitado: aceita a notação em inglês (K Q R B N) e em português (R D T B C), com ou sem "x", minúsculas, casa de saída e de chegada (e2e4) e "roque". Letra maiúscula de peça é sempre peça (Cxd4 nunca vira o peão c). Quando o texto serve para dois lances (Rf1 pode ser torre ou rei; dxe5 minúsculo pode ser peão ou dama), o app pergunta qual. A voz usa a síntese de fala do navegador em português; sem voz no aparelho, fica só o texto.

## Erros explicados

No fim da Pressão de tempo, do Relâmpago, da Sequência e dos Problemas às cegas, cada erro aparece com o seu lance, o lance certo e o porquê, num tabuleiro onde dá para seguir a linha certa ou o seu lance com a resposta do adversário. Tudo o que o texto afirma vem de duas fontes conferíveis (`src/lib/explain.ts`):

- As regras, pelo chess.js: xeque, xeque duplo e descoberto, captura, sacrifício (o adversário toma a peça e você fica pelo menos 2 pontos atrás nessa troca), garfo (mesma regra do Lichess), única resposta, lance quieto que ameaça mate, material ganho na linha, mate do corredor e mate sufocado.
- O Stockfish, depois de cada rodada: a melhor resposta ao seu lance e a avaliação do seu lance e do lance certo. O veredito (erro grave, erro, imprecisão) usa a queda na chance de vitória, com os mesmos limites da análise das partidas.

Sem o motor, a explicação fica só com os fatos das regras e diz que o motor não respondeu.

## Rotina diária

A tela Hoje divide o tempo escolhido (1h, 1h30, 2h, 3h ou 4h) em blocos, nesta ordem: aquecimento relâmpago (10%), escada de mate (25%), cálculo e às cegas (20%), partidas (30%) e revisão (15%). O tempo conta sozinho enquanto você treina em cada tela e pausa depois de 90 segundos sem mexer. O dia conta para a sequência de dias quando o total chega à meta.

## Nível do bot

O bot se chama Tempo e é o cavalo coroado do ícone, o mesmo que aparece como treinador nas telas. A partir de 1320 ele usa a escala UCI_Elo do Stockfish; abaixo disso escolhe entre os 5 melhores lances com um sorteio que erra mais quanto menor o nível. O nível recomendado mistura o seu desempenho contra o bot com o rating de problemas menos 300 (depois de 10 problemas). A escala é aproximada e não equivale ao rating do chess.com nem da FIDE.

## Dados e motor

- Problemas: base de puzzles do Lichess (domínio público, CC0). Os pacotes em `public/puzzles` foram montados por `scripts/build-puzzles.mjs`, que refaz cada problema lance a lance com chess.js e confere que os pacotes de mate terminam em xeque-mate. Os testes repetem essa conferência. Os pacotes de mate em 1 e em 2 (problemas às cegas) separam cotas por número de peças, para o filtro de poucas peças ter problemas suficientes.
- Motor: Stockfish 18 lite (WASM, 1 thread) em `public/engine`, rodando num Web Worker.
- Visual: marrom do ícone (pau-rosa), tabuleiro de madeira por padrão (aço e torneio em Ajustes).
- Sons: lance, captura, xeque, mate (a batida do xeque duas vezes) e início de partida vêm de gravações em `src/assets/sons`.
- Progresso: salvo no aparelho (localStorage). Dentro do Claude também é salvo na conta, e em Ajustes há backup e restauração por texto.

## Rodar

```bash
npm install
npm run dev        # servidor local
npm test           # testes (lógica, pacotes de problemas, progresso)
npm run build      # gera dist/
npm run artifact   # gera dist/app.html, a versão publicada dentro do Claude
```

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` publica a cada push na `main`. Antes do primeiro deploy, em Settings > Pages, escolha Source: GitHub Actions. No GitHub Pages o app funciona offline depois da primeira visita (service worker) e pode ser instalado no celular.

Instalação: o app tem o próprio botão Instalar (aviso na tela Hoje e bloco em Ajustes), que usa o evento `beforeinstallprompt`. Ele existe porque o Chrome do Android, desde a versão 154, erra no menu "Instalar app": quando outro app do mesmo endereço (`enio-123.github.io`) já está instalado, o menu diz que este também está ([correção no Chromium](https://chromium-review.googlesource.com/c/chromium/src/+/8556881)). O caminho do `beforeinstallprompt` confere pelo escopo de cada app e não tem esse erro.

Atualização: a navegação sempre busca a página na rede, e o service worker do mesmo build assume na hora (a página manda o identificador do build e ele só aceita se for o dele). Manifesto e ícones vêm da rede primeiro, para o navegador ver o nome e o ícone atuais.

## Licenças

Veja [LICENSES.md](LICENSES.md).
