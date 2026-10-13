// Browser UI for TAKI: renders the game and drives the computer's turns.
(function () {
  'use strict';

  const { Game, COLOR_NAMES, HAND_SIZE, HUMAN, CPU, describe, isNumber, nextStages } = window.Taki;
  const CPU_DELAY = 900;

  const $ = (id) => document.getElementById(id);
  const els = {
    cpuHand: $('cpu-hand'), cpuCount: $('cpu-count'), cpuLast: $('cpu-last'),
    stages: [$('human-stage'), $('cpu-stage')],
    humanHand: $('human-hand'), drawPile: $('draw-pile'), drawLabel: $('draw-label'),
    discard: $('discard'), colorLabel: $('color-label'), banner: $('banner'), hint: $('hint'),
    lastCard: $('last-card'), closeTaki: $('close-taki'), log: $('log'),
    picker: $('color-picker'), gameOver: $('game-over'), gameOverTitle: $('game-over-title'),
    gameOverFace: $('game-over-face'), gameOverDetail: $('game-over-detail'),
    gameOverButton: $('game-over-button'), humanCount: $('human-count'), confetti: $('confetti'),
  };

  const CORNERS = { stop: 'STOP', changeDir: '⇄', plus: '+', plus2: '+2', taki: 'TAKI', changeColor: '' };
  const LINE = 'stroke="#2b1d14" stroke-width="3" stroke-linejoin="round"';
  const ICONS = {
    stop: `<svg viewBox="0 0 40 40"><polygon points="13,3 27,3 37,13 37,27 27,37 13,37 3,27 3,13" fill="currentColor" ${LINE}/>`
      + `<rect x="10" y="17" width="20" height="6" rx="2" fill="#fff" ${LINE}/></svg>`,
    changeDir: `<svg viewBox="0 0 40 40"><polygon points="4,8 24,8 24,2 36,11 24,20 24,14 4,14" fill="currentColor" ${LINE}/>`
      + `<polygon points="36,26 16,26 16,20 4,29 16,38 16,32 36,32" fill="currentColor" ${LINE}/></svg>`,
    plus: `<svg viewBox="0 0 40 40"><polygon points="15,4 25,4 25,15 36,15 36,25 25,25 25,36 15,36 15,25 4,25 4,15 15,15" fill="currentColor" ${LINE}/></svg>`,
    changeColor: '<svg class="fill" viewBox="0 0 40 40">'
      + '<path d="M20 20V0A20 20 0 0 1 40 20Z" style="fill:var(--red)"/>'
      + '<path d="M20 20H40A20 20 0 0 1 20 40Z" style="fill:var(--blue)"/>'
      + '<path d="M20 20V40A20 20 0 0 1 0 20Z" style="fill:var(--yellow)"/>'
      + '<path d="M20 20H0A20 20 0 0 1 20 0Z" style="fill:var(--green)"/>'
      + `<path d="M20 0V40M0 20H40" ${LINE}/></svg>`,
  };

  let game;
  let cpuTimer = null;
  let colorCard = null; // Change Color card waiting for the picker
  let message = '';
  let lastTopId = null;
  let lastBanner = '';
  const shownStages = [null, null];

  // Stages carry over between rounds; each round is a fresh Game dealt from them.
  let stages = [HAND_SIZE, HAND_SIZE];
  let roundResult = null; // nextStages() result once a round ends

  function newMatch() {
    stages = [HAND_SIZE, HAND_SIZE];
    roundResult = null;
    if (els.gameOver.open) els.gameOver.close(); // its close handler starts the round
    else newRound();
  }

  function newRound() {
    clearTimeout(cpuTimer);
    roundResult = null;
    game = new Game(Math.random, stages);
    colorCard = null;
    if (els.picker.open) els.picker.close();
    message = '';
    update();
  }

  // ----- Rendering -----

  function cardFace(card, tag = 'div') {
    const el = document.createElement(tag);
    const corner = isNumber(card) ? card.value : CORNERS[card.value];
    const center = ICONS[card.value] || `<span class="big ${corner.length > 2 ? 'word' : ''}">${corner}</span>`;
    el.className = `card ${card.color ? `c-${card.color}` : 'c-wild'}`;
    if (card.chosen) {
      el.classList.add('chosen');
      el.style.setProperty('--chosen', `var(--${card.chosen})`);
    }
    el.innerHTML = `
      <span class="corner tl">${corner}</span>
      <span class="disc">${center}</span>
      <span class="corner br">${corner}</span>`;
    el.setAttribute('aria-label', describe(card));
    return el;
  }

  function render() {
    const humanTurn = !game.over && game.current === HUMAN;
    document.body.classList.toggle('turn-human', humanTurn);
    document.body.classList.toggle('turn-cpu', !game.over && game.current === CPU);

    // Stage labels; a changed stage flashes briefly.
    game.stages.forEach((stage, p) => {
      if (stage === shownStages[p]) return;
      const el = els.stages[p];
      el.textContent = `${game.names[p]} – Stage ${stage}`;
      if (shownStages[p] !== null) {
        el.classList.remove('flash');
        void el.offsetWidth; // restart the animation
        el.classList.add('flash');
      }
      shownStages[p] = stage;
    });

    const humanCards = game.hands[HUMAN].length;
    els.humanCount.textContent = `${humanCards} card${humanCards === 1 ? '' : 's'} in hand`;

    // Computer
    const cpuCards = game.hands[CPU].length;
    const spread = Math.min(5, 32 / cpuCards);
    els.cpuHand.replaceChildren(...game.hands[CPU].map((_, i) => {
      const back = document.createElement('div');
      back.className = 'card card-back';
      back.style.setProperty('--fan', `${(i - (cpuCards - 1) / 2) * spread}deg`);
      return back;
    }));
    els.cpuCount.textContent = `${cpuCards} card${cpuCards === 1 ? '' : 's'} in hand`;
    els.cpuLast.hidden = cpuCards !== 1;

    // Piles
    // Show the last few cards as a messy pile; the newest one lands with a bounce.
    els.discard.replaceChildren(...game.discard.slice(-3).map((card) => {
      const el = cardFace(card);
      el.style.setProperty('--tilt', `${((card.id * 47) % 25) - 12}deg`);
      return el;
    }));
    if (game.top.id !== lastTopId) {
      els.discard.lastElementChild.classList.add('pop');
      lastTopId = game.top.id;
    }
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

    const banner = bannerText();
    if (banner !== lastBanner) {
      els.banner.textContent = banner;
      els.banner.classList.remove('bump');
      void els.banner.offsetWidth; // restart the animation
      els.banner.classList.add('bump');
      lastBanner = banner;
    }
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

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = els.confetti;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = innerWidth);
    const h = (canvas.height = innerHeight);
    const colors = ['#ff4f4f', '#2fc46d', '#3b8cff', '#ffc83a', '#ffffff'];
    const bits = Array.from({ length: 160 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 18 - 6,
      size: 6 + Math.random() * 8,
      spin: Math.random() * Math.PI,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.45;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.spin += 0.15;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.fillStyle = b.color;
        ctx.strokeStyle = '#2b1d14';
        ctx.lineWidth = 2;
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.strokeRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.restore();
      }
      if (now - start < 3500) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    })(start);
  }

  // ----- Turn flow -----

  function update() {
    render();
    clearTimeout(cpuTimer);
    if (game.over) {
      const won = game.winner === HUMAN;
      roundResult = roundResult || nextStages(game.stages, game.winner);
      const matchOver = roundResult.matchWinner !== null;
      const [you, cpu] = roundResult.stages;
      els.gameOverTitle.textContent = `${won ? 'You win' : 'The computer wins'} the ${matchOver ? 'match' : 'round'}!`;
      els.gameOverDetail.textContent = matchOver
        ? `New match: everyone goes back to Stage ${HAND_SIZE}.`
        : `Next round: You – Stage ${you} · Computer – Stage ${cpu}`;
      els.gameOverButton.textContent = matchOver ? 'New match' : 'Next round';
      els.gameOverFace.textContent = won ? '🏆' : '🤖';
      if (!els.gameOver.open) {
        els.gameOver.showModal();
        if (won) confetti();
      }
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

  $('new-game').addEventListener('click', newMatch);
  // Closing the round-over dialog (button or Escape) moves on to the next round.
  els.gameOver.addEventListener('close', () => {
    if (roundResult) stages = roundResult.stages;
    newRound();
  });

  newRound();
})();
