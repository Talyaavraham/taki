// Plays many random games and checks rule invariants. Run: node test/simulate.js
const assert = require('assert');
const { Game, COLORS, HUMAN, CPU } = require('../taki.js');

function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const GAMES = 5000;
const stats = { wins: [0, 0], stalled: 0, moves: 0, takis: 0, stacks: 0 };

for (let g = 0; g < GAMES; g++) {
  const rng = seeded(g + 1);
  const game = new Game(rng);
  assert.strictEqual(game.hands[0].length, 8);
  assert.strictEqual(game.hands[1].length, 8);
  let moves = 0;
  while (!game.over && moves < 2000) {
    if (game.current === CPU) {
      game.cpuMove();
    } else {
      const hand = game.hands[HUMAN];
      if (hand.length === 2 && rng() < 0.9) game.declareLastCard();
      const legal = hand.filter((c) => game.canPlay(c));
      if (game.taki && (!legal.length || rng() < 0.2)) game.closeTaki(HUMAN);
      else if (legal.length && rng() < 0.9) {
        const card = legal[Math.floor(rng() * legal.length)];
        game.play(HUMAN, card, COLORS[Math.floor(rng() * 4)]);
      } else if (!game.taki) game.draw(HUMAN);
    }
    if (game.taki) stats.takis++;
    if (game.pendingDraw > 2) stats.stacks++;
    const total = game.deck.length + game.discard.length + game.hands[0].length + game.hands[1].length;
    assert.strictEqual(total, 116, `card count ${total} in game ${g}`);
    assert.ok(COLORS.includes(game.activeColor));
    if (game.taki) assert.strictEqual(game.taki, game.activeColor);
    moves++;
  }
  stats.moves += moves;
  if (game.over) stats.wins[game.winner]++;
  else stats.stalled++;
}
console.log(`${GAMES} games: human(random) ${stats.wins[0]}, cpu ${stats.wins[1]}, stalled ${stats.stalled}, avg actions ${(stats.moves / GAMES).toFixed(1)}`);
console.log(`steps inside TAKI: ${stats.takis}, steps with stacked Plus 2: ${stats.stacks}`);
