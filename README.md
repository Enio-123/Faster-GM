# Faster GM

App de treino diário de xadrez para quem quer subir de nível com disciplina: mates longos, cálculo às cegas e partidas rápidas contra um bot de força ajustável. Feito para treinar sozinho, no computador ou no celular.

## Modos de treino

| Modo | O que treina | Como funciona |
| --- | --- | --- |
| Escada de mate | Visualização de mates longos | Mate em 3, 4, 5, 6, 7 e 8+. Cada degrau abre com 8 acertos nas últimas 10 tentativas do degrau anterior. A primeira tentativa de cada problema vale para o rating de problemas (Glicko-1, no máximo 120 pontos por problema). Lance diferente do gabarito vale se o Stockfish confirmar mate no mesmo número de lances. |
| Cálculo às cegas | Cálculo de linhas inteiras | As peças ficam paradas. Você digita a linha toda, seus lances e as respostas do adversário, e só no fim confere. Táticas ou mates, de 3 a 6+ lances, com três dificuldades. |
| Sequência | Precisão sob pressão | Mates seguidos que ficam um lance mais longos a cada 3 acertos. Um erro encerra. |
| Relâmpago | Reconhecimento de padrão | 3 minutos de problemas curtos. Erro tira 10 segundos. |
| Revisão dos erros | Fixar o que você errou | Problemas errados e erros das suas partidas voltam em 1, 3, 7, 14, 30 e 60 dias. Errou, volta para o dia seguinte. |
| Jogar contra o Tempo | Bullet e blitz | 1+0, 2+1, 3+0, 3+2, 5+0 e 5+3, com pré-lance. No fim, a análise do Stockfish marca imprecisões, erros e erros graves; erros e erros graves viram cartões de revisão. |

## Rotina diária

A tela Hoje divide o tempo escolhido (1h, 1h30, 2h, 3h ou 4h) em blocos, nesta ordem: aquecimento relâmpago (10%), escada de mate (25%), cálculo às cegas (20%), partidas (30%) e revisão (15%). O tempo conta sozinho enquanto você treina em cada tela e pausa depois de 90 segundos sem mexer. O dia conta para a sequência de dias quando o total chega à meta.

## Nível do bot

O bot se chama Tempo e é o cavalo coroado do ícone, o mesmo que aparece como treinador nas telas. A partir de 1320 ele usa a escala UCI_Elo do Stockfish; abaixo disso escolhe entre os 5 melhores lances com um sorteio que erra mais quanto menor o nível. O nível recomendado mistura o seu desempenho contra o bot com o rating de problemas menos 300 (depois de 10 problemas). A escala é aproximada e não equivale ao rating do chess.com nem da FIDE.

## Dados e motor

- Problemas: base de puzzles do Lichess (domínio público, CC0). Os pacotes em `public/puzzles` foram montados por `scripts/build-puzzles.mjs`, que refaz cada problema lance a lance com chess.js e confere que os pacotes de mate terminam em xeque-mate. Os testes repetem essa conferência.
- Motor: Stockfish 18 lite (WASM, 1 thread) em `public/engine`, rodando num Web Worker.
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

## Licenças

Veja [LICENSES.md](LICENSES.md).
