// TAKI game rules. Pure logic, no DOM, so it can be tested outside the browser.
(function (root) {
  'use strict';

  const COLORS = ['red', 'green', 'blue', 'yellow'];
  const ACTIONS = ['stop', 'changeDir', 'plus', 'plus2', 'taki'];
  const HAND_SIZE = 8;
  const HUMAN = 0;
  const CPU = 1;

  const COLOR_NAMES = { red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow' };
  const VALUE_NAMES = {
    stop: 'Stop', changeDir: 'Change Direction', plus: 'Plus',
    plus2: 'Plus 2', taki: 'TAKI', changeColor: 'Change Color',
  };

  function isNumber(card) {
    return /^[1-9]$/.test(card.value);
  }

  function describe(card) {
    if (card.value === 'changeColor') {
      return card.chosen ? `Change Color (${COLOR_NAMES[card.chosen]})` : 'Change Color';
    }
    return `${COLOR_NAMES[card.color]} ${VALUE_NAMES[card.value] || card.value}`;
  }

  function shuffle(cards, rng) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  // Per color: two of each number 1-9 and two of each action card. Plus 4 Change Color cards.
  function buildDeck(rng) {
    const deck = [];
    let id = 1;
    for (const color of COLORS) {
      for (let n = 1; n <= 9; n++) {
        deck.push({ id: id++, color, value: String(n) }, { id: id++, color, value: String(n) });
      }
      for (const value of ACTIONS) {
        deck.push({ id: id++, color, value }, { id: id++, color, value });
      }
    }
    for (let i = 0; i < 4; i++) deck.push({ id: id++, color: null, value: 'changeColor' });
    return shuffle(deck, rng);
  }

  class Game {
    // stages[p] is how many cards player p starts the round with.
    constructor(rng = Math.random, stages = [HAND_SIZE, HAND_SIZE]) {
      this.rng = rng;
      this.deck = buildDeck(rng);
      this.discard = [];
      this.hands = [[], []];
      this.names = ['You', 'Computer'];
      this.stages = stages.slice();
      this.current = HUMAN;
      this.direction = 1;
      this.activeColor = null;
      this.pendingDraw = 0;  // cards stacked by Plus 2
      this.taki = null;      // color of the open TAKI sequence, or null
      this.playAgain = false; // set by Plus
      this.declared = false;  // human pressed "Last card" this turn
      this.winner = null;
      this.log = [];

      for (let i = 0; i < Math.max(...this.stages); i++) {
        this.hands.forEach((hand, p) => {
          if (i < this.stages[p]) hand.push(this.deck.pop());
        });
      }
      // The starting card is always a number card.
      let first = this.deck.pop();
      while (!isNumber(first)) {
        this.deck.unshift(first);
        first = this.deck.pop();
      }
      this.discard.push(first);
      this.activeColor = first.color;
      this.say(`Starting card: ${describe(first)}.`);
    }

    get top() {
      return this.discard[this.discard.length - 1];
    }

    get over() {
      return this.winner !== null;
    }

    say(text) {
      this.log.push(text);
    }

    other(p) {
      return this.nextPlayer(p, 1);
    }

    nextPlayer(p, steps) {
      const n = this.hands.length;
      return (((p + steps * this.direction) % n) + n) % n;
    }

    canPlay(card) {
      if (this.pendingDraw > 0) return card.value === 'plus2';
      if (this.taki) return card.color === this.taki;
      if (card.value === 'changeColor') return true;
      return card.color === this.activeColor || card.value === this.top.value;
    }

    // Why a card can't be played, for showing to the human.
    whyNot(card) {
      if (this.pendingDraw > 0) return `You must answer with a Plus 2 or draw ${this.pendingDraw}.`;
      if (this.taki) return `Only ${COLOR_NAMES[this.taki]} cards during the TAKI, or close it.`;
      return `That card doesn't match ${COLOR_NAMES[this.activeColor]} or ${describe(this.top)}.`;
    }

    drawCards(p, n) {
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        if (!this.deck.length) this.reshuffle();
        if (!this.deck.length) break;
        this.hands[p].push(this.deck.pop());
        drawn++;
      }
      return drawn;
    }

    reshuffle() {
      if (this.discard.length < 2) return;
      const top = this.discard.pop();
      const rest = this.discard;
      for (const card of rest) delete card.chosen;
      this.deck = shuffle(rest, this.rng);
      this.discard = [top];
      this.say('The discard pile was shuffled into a new draw pile.');
    }

    play(p, card, chosenColor) {
      if (this.over || p !== this.current) throw new Error('Not your turn');
      const hand = this.hands[p];
      const index = hand.indexOf(card);
      if (index < 0 || !this.canPlay(card)) throw new Error(`Illegal play: ${describe(card)}`);
      if (card.value === 'changeColor' && !COLORS.includes(chosenColor)) throw new Error('Pick a color');

      hand.splice(index, 1);
      if (card.value === 'changeColor') {
        card.chosen = chosenColor;
        this.activeColor = chosenColor;
      } else {
        this.activeColor = card.color;
      }
      this.discard.push(card);
      this.playAgain = false;
      this.say(`${this.names[p]} played ${describe(card)}.`);

      if (!hand.length) {
        this.taki = null;
        this.winner = p;
        this.say(p === HUMAN ? 'You win!' : 'The computer wins.');
        return;
      }
      if (p === CPU && hand.length === 1) this.say('Computer: "Last card!"');

      if (this.taki) {
        if (!hand.some((c) => c.color === this.taki)) this.closeTaki(p);
        return;
      }
      if (card.value === 'taki') {
        this.taki = card.color;
        this.say(`TAKI is open: ${this.names[p]} can play every ${COLOR_NAMES[card.color]} card.`);
        if (!hand.some((c) => c.color === card.color)) this.closeTaki(p);
        return;
      }
      this.applyEffect(p, card);
    }

    closeTaki(p) {
      this.taki = null;
      this.say(`${this.names[p]} closed the TAKI.`);
      // The last card laid down in the sequence takes effect.
      const last = this.top;
      if (last.value === 'taki') this.passTurn(p, 1);
      else this.applyEffect(p, last);
    }

    applyEffect(p, card) {
      switch (card.value) {
        case 'stop':
          this.say(`${this.names[this.other(p)]} lose${this.other(p) === HUMAN ? '' : 's'} a turn.`);
          this.passTurn(p, 2);
          break;
        case 'changeDir':
          this.direction *= -1;
          this.passTurn(p, 1);
          break;
        case 'plus':
          this.playAgain = true;
          this.passTurn(p, 0);
          break;
        case 'plus2':
          this.pendingDraw += 2;
          this.passTurn(p, 1);
          break;
        default:
          this.passTurn(p, 1);
      }
    }

    draw(p) {
      if (this.over || p !== this.current) throw new Error('Not your turn');
      if (this.taki) throw new Error('Close the TAKI first');
      const wanted = this.pendingDraw || 1;
      this.pendingDraw = 0;
      this.playAgain = false;
      const got = this.drawCards(p, wanted);
      const who = this.names[p];
      if (got === 0) this.say(`${who} could not draw: no cards left.`);
      else this.say(`${who} drew ${got} card${got === 1 ? '' : 's'}.`);
      this.passTurn(p, 1);
    }

    declareLastCard() {
      this.declared = true;
      this.say('You: "Last card!"');
    }

    passTurn(p, steps) {
      const next = this.nextPlayer(p, steps);
      if (p === HUMAN && next !== HUMAN && this.hands[HUMAN].length === 1 && !this.declared) {
        const got = this.drawCards(HUMAN, 2);
        this.say(`You didn't say "Last card": penalty, you draw ${got}.`);
      }
      if (next === HUMAN && p !== HUMAN) this.declared = false;
      this.current = next;
    }

    // ----- Computer opponent -----

    // Performs exactly one action for the computer: play a card, close a TAKI, or draw.
    cpuMove() {
      const p = CPU;
      const hand = this.hands[p];

      if (this.taki) {
        const same = hand.filter((c) => c.color === this.taki);
        // Numbers first, strongest action last so its effect applies when the TAKI closes.
        same.sort((a, b) => takiOrder(a) - takiOrder(b));
        if (same.length) this.play(p, same[0]);
        else this.closeTaki(p);
        return;
      }

      const legal = hand.filter((c) => this.canPlay(c));
      if (!legal.length) {
        this.draw(p);
        return;
      }
      const opponentCards = this.hands[this.other(p)].length;
      let best = null;
      let bestScore = -Infinity;
      for (const card of legal) {
        const score = this.cpuScore(card, hand, opponentCards) + this.rng();
        if (score > bestScore) {
          best = card;
          bestScore = score;
        }
      }
      const color = best.value === 'changeColor' ? this.cpuPickColor(best) : undefined;
      this.play(p, best, color);
    }

    cpuScore(card, hand, opponentCards) {
      const danger = opponentCards <= 2;
      const sameColor = hand.filter((c) => c !== card && c.color === card.color).length;
      switch (card.value) {
        case 'plus2': return danger ? 60 : 22;
        case 'stop': return danger ? 55 : 25;
        case 'taki': return sameColor >= 2 ? 40 + sameColor : 5;
        case 'plus': {
          // Only worth it if there's something to follow up with.
          const followUp = hand.some((c) => c !== card && (c.color === card.color || c.value === 'plus' || c.value === 'changeColor'));
          return followUp ? 28 : 2;
        }
        case 'changeDir': return 18;
        case 'changeColor': return 1;
        default: return 20 + sameColor; // keep playing the color we hold most of
      }
    }

    cpuPickColor(exclude) {
      const counts = { red: 0, green: 0, blue: 0, yellow: 0 };
      for (const c of this.hands[CPU]) if (c !== exclude && c.color) counts[c.color]++;
      return COLORS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
    }
  }

  // Between rounds: the round's winner starts the next round with one card fewer.
  // Winning a round at stage 1 wins the match, and both players go back to the first stage.
  function nextStages(stages, winner) {
    if (stages[winner] <= 1) return { stages: stages.map(() => HAND_SIZE), matchWinner: winner };
    const next = stages.slice();
    next[winner]--;
    return { stages: next, matchWinner: null };
  }

  function takiOrder(card) {
    if (isNumber(card)) return 0;
    return { taki: 1, changeDir: 2, plus: 3, stop: 4, plus2: 5 }[card.value] ?? 0;
  }

  const api = { Game, COLORS, COLOR_NAMES, VALUE_NAMES, HAND_SIZE, HUMAN, CPU, describe, isNumber, nextStages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Taki = api;
})(this);
