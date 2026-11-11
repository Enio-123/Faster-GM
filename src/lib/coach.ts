// Falas do treinador. Curtas e diretas: ele cobra, não enfeita.
const LINES = {
  hello: [
    'Bora. A rotina de hoje já está montada.',
    'Disciplina primeiro. Começa pelo aquecimento.',
    'Quem treina todo dia não precisa de sorte.',
    'Hoje é dia de calcular fundo.',
  ],
  helloDone: ['Rotina de hoje cumprida. Amanhã tem mais.', 'Dia fechado. Constância é o que separa os fortes.'],
  helloLate: ['Ainda dá tempo de fechar a rotina de hoje.', 'Falta pouco. Termina o que começou.'],
  start: ['Calcula tudo antes de tocar na peça.', 'Procura os xeques primeiro.', 'Sem pressa no primeiro lance.', 'Olha as respostas do adversário.'],
  good: ['Isso.', 'Limpo.', 'Rápido e certo.', 'Bom cálculo.', 'É assim.'],
  goodFast: ['Muito rápido. Mantém o ritmo.', 'Visão de jogador forte.'],
  bad: [
    'Errou. Olha a solução e grava o padrão.',
    'Confere os xeques do adversário antes.',
    'Faltou calcular a defesa.',
    'Calma. O lance certo existe, olha de novo.',
  ],
  streakEnd: ['Sequência encerrada. Bate esse recorde amanhã.', 'Errou, acabou. É assim que se treina precisão.'],
  think: ['Deixa eu pensar.', 'Hum.'],
  gameStart: ['Valendo. Sem desistir antes da hora.', 'Joga o seu jogo. Eu vou testar você.'],
  youWin: ['Boa vitória. Agora revisa onde eu te dei chance.', 'Ganhou. Sobe o nível quando ganhar de novo.'],
  youLose: ['Perdeu. Vamos ver onde.', 'Derrota é material de estudo. Analisa a partida.'],
  draw: ['Empate. Dava pra mais?'],
  review: ['Esses são os seus erros. Eles voltam até você acertar sempre.'],
  calcIntro: ['Peças paradas. A linha toda é na cabeça.'],
}

export type CoachEvent = keyof typeof LINES

export function line(ev: CoachEvent, seed = Date.now()): string {
  const arr = LINES[ev]
  return arr[Math.abs(Math.floor(seed)) % arr.length]
}
