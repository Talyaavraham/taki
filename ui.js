// Browser UI for TAKI: renders the game and drives the computer's turns.
(function () {
  'use strict';

  const { Game, COLOR_NAMES, HUMAN, CPU, describe, isNumber } = window.Taki;
  const CPU_DELAY = 900;

  const $ = (id) => document.getElementById(id);
  const els = {
    cpuHand: $('cpu-hand'), cpuCount: $('cpu-count'), cpuLast: $('cpu-last'),
    humanHand: $('human-hand'), drawPile: $('draw-pile'), drawLabel: $('draw-label'),
    discard: $('discard'), colorLabel: $('color-label'), banner: $('banner'), hint: $('hint'),
    lastCard: $('last-card'), closeTaki: $('close-taki'), log: $('log'),
    picker: $('color-picker'), gameOver: $('game-over'), gameOverTitle: $('game-over-title'),
  };

  const SYMBOLS = { stop: 'STOP', changeDir: '⇄', plus: '+', plus2: '+2', taki: 'TAKI', changeColor: '' };

  let game;
  let cpuTimer = null;
  let colorCard = null; // Change Color card waiting for the picker
  let message = '';

  function newGame() {
    clearTimeout(cpuTimer);
    game = new Game();
    colorCard = null;
    if (els.picker.open) els.picker.close();
    message = '';
    update();
  }

  // ----- Rendering -----

  function cardFace(card, tag = 'div') {
    const el = document.createElement(tag);
    const big = isNumber(card) ? card.value : SYMBOLS[card.value];
    el.className = `card ${card.color ? `c-${card.color}` : 'c-wild'}`;
    if (card.chosen) {
      el.classList.add('chosen');
      el.style.setProperty('--chosen', `var(--${card.chosen})`);
    }
    el.innerHTML = `
      <span class="corner tl">${big}</span>
      <span class="oval"><span class="big ${big.length > 2 ? 'word' : ''}">${big}</span></span>
      <span class="corner br">${big}</span>`;
    el.setAttribute('aria-label', describe(card));
    return el;
  }

  function render() {
    const humanTurn = !game.over && game.current === HUMAN;
    document.body.classList.toggle('turn-human', humanTurn);
    document.body.classList.toggle('turn-cpu', !game.over && game.current === CPU);

    // Computer
    const cpuCards = game.hands[CPU].length;
    els.cpuHand.replaceChildren(...game.hands[CPU].map(() => {
      const back = document.createElement('div');
      back.className = 'card card-back';
      return back;
    }));
    els.cpuCount.textContent = `${cpuCards} card${cpuCards === 1 ? '' : 's'}`;
    els.cpuLast.hidden = cpuCards !== 1;

    // Piles
    els.discard.replaceChildren(cardFace(game.top));
    els.colorLabel.innerHTML =
      `<span class="color-dot c-${game.activeColor}"></span>${COLOR_NAMES[game.activeColor]}`;
    const canDraw = humanTurn && !game.taki;
    els.drawPile.classList.toggle('can-draw', canDraw);
    els.drawPile.disabled = !canDraw;
    els.drawLabel.textContent = humanTurn && !game.taki
      ? `Draw ${game.pendingDraw || 1}` : `${game.deck.length} left`;

    // Human
    els.humanHand.replaceChildren(...game.hands[HUMAN].map((card) => {
      const el = cardFace(card, 'button');
      el.type = 'button';
      if (humanTurn && game.canPlay(card)) el.classList.add('playable');
      el.addEventListener('click', () => onCardClick(card));
      return el;
    }));
    els.closeTaki.hidden = !(humanTurn && game.taki);
    els.lastCard.disabled = !humanTurn;
    els.lastCard.classList.toggle('declared', humanTurn && game.declared);

    els.banner.textContent = bannerText();
    els.hint.textContent = message || hintText();

    els.log.replaceChildren(...game.log.slice(-40).reverse().map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }));
    els.log.start = game.log.length;
  }

  function bannerText() {
    if (game.over) return game.winner === HUMAN ? 'You win!' : 'The computer wins';
    if (game.current === CPU) return game.taki ? 'Computer is playing a TAKI…' : 'Computer’s turn…';
    if (game.pendingDraw) return `Your turn: Plus 2 ×${game.pendingDraw / 2}!`;
    if (game.taki) return `Your turn: TAKI open (${COLOR_NAMES[game.taki]})`;
    if (game.playAgain) return 'Your turn: Plus, play again';
    return 'Your turn';
  }

  function hintText() {
    if (game.over || game.current !== HUMAN) return '';
    if (game.pendingDraw) return `Answer with any Plus 2, or click the draw pile to take ${game.pendingDraw}.`;
    if (game.taki) return `Play your ${COLOR_NAMES[game.taki]} cards one by one, then close the TAKI.`;
    const top = game.top;
    const match = top.value === 'changeColor' ? '' : ` or another ${isNumber(top) ? top.value : describe(top).split(' ').slice(1).join(' ')}`;
    const prefix = game.playAgain ? 'You must play another card or draw. ' : '';
    return `${prefix}Play a ${COLOR_NAMES[game.activeColor]} card${match}, or click the draw pile.`;
  }

  // ----- Turn flow -----

  function update() {
    render();
    clearTimeout(cpuTimer);
    if (game.over) {
      els.gameOverTitle.textContent = game.winner === HUMAN ? 'You win! 🎉' : 'The computer wins';
      if (!els.gameOver.open) els.gameOver.showModal();
    } else if (game.current === CPU) {
      cpuTimer = setTimeout(() => {
        game.cpuMove();
        update();
      }, CPU_DELAY);
    }
  }

  function humanAct(action) {
    message = '';
    action();
    update();
  }

  function onCardClick(card) {
    if (game.over || game.current !== HUMAN || els.picker.open) return;
    if (!game.canPlay(card)) {
      message = game.whyNot(card);
      render();
      const shaking = els.humanHand.children[game.hands[HUMAN].indexOf(card)];
      shaking.classList.add('shake');
      setTimeout(() => shaking.classList.remove('shake'), 300);
      return;
    }
    if (card.value === 'changeColor') {
      colorCard = card;
      els.picker.returnValue = '';
      els.picker.showModal();
      return;
    }
    humanAct(() => game.play(HUMAN, card));
  }

  els.picker.addEventListener('close', () => {
    const card = colorCard;
    const color = els.picker.returnValue;
    colorCard = null;
    if (card && color && game.current === HUMAN && game.hands[HUMAN].includes(card) && game.canPlay(card)) {
      humanAct(() => game.play(HUMAN, card, color));
    }
  });

  els.drawPile.addEventListener('click', () => {
    if (game.over || game.current !== HUMAN || game.taki) return;
    humanAct(() => game.draw(HUMAN));
  });

  els.closeTaki.addEventListener('click', () => {
    if (game.current === HUMAN && game.taki) humanAct(() => game.closeTaki(HUMAN));
  });

  els.lastCard.addEventListener('click', () => {
    if (game.current === HUMAN && !game.declared) humanAct(() => game.declareLastCard());
  });

  $('new-game').addEventListener('click', newGame);
  els.gameOver.addEventListener('close', newGame);

  newGame();
})();
