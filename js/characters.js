// 동글동글한 동물 주민 캐릭터 (SVG) + 노래하는 입 모양 애니메이션
(function (W) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  const SPECIES = {
    rabbit:   { name: '토끼',   fur: '#fff4ec', dark: '#f2c9c0', inner: '#ffb6c1', nose: '#ff8fa3' },
    cat:      { name: '고양이', fur: '#ffd29c', dark: '#f0a860', inner: '#ffb6a8', nose: '#e57373' },
    dog:      { name: '강아지', fur: '#e8c39e', dark: '#9c6b43', inner: '#c58d63', nose: '#4a3428' },
    bear:     { name: '곰',     fur: '#b07a4f', dark: '#7a5233', inner: '#e0b48a', nose: '#3b2a1e', muzzle: '#e8c9a4' },
    frog:     { name: '개구리', fur: '#9fdc7c', dark: '#6fb55a', inner: '#fff6c9', nose: null },
    penguin:  { name: '펭귄',   fur: '#4a5a78', dark: '#34405a', inner: '#ffffff', nose: '#ffb347', mask: '#ffffff' },
    squirrel: { name: '다람쥐', fur: '#e59a5b', dark: '#b8693a', inner: '#ffe0c2', nose: '#5a3a24' },
    sheep:    { name: '양',     fur: '#fffaf2', dark: '#d9cbb8', inner: '#ffcfc4', nose: '#c98a8a', face: '#f3d9c4' },
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function buildSVG(speciesKey, outfit) {
    const sp = SPECIES[speciesKey] || SPECIES.rabbit;
    const svg = el('svg', { viewBox: '0 0 200 250', class: 'critter-svg' });
    const root = el('g', { class: 'critter-root' }, svg);
    // 그림자
    el('ellipse', { cx: 100, cy: 242, rx: 52, ry: 7, fill: 'rgba(60,90,40,.25)', class: 'shadow' }, svg);
    svg.insertBefore(svg.lastChild, root);

    const bodyG = el('g', { class: 'body' }, root);
    // 꼬리
    if (speciesKey === 'squirrel') {
      el('path', { d: 'M140 225 C 205 215, 200 120, 165 120 C 150 120, 150 140, 165 145 C 185 150, 175 200, 135 205 Z', fill: sp.fur, stroke: sp.dark, 'stroke-width': 3 }, bodyG);
    }
    // 발
    el('ellipse', { cx: 80, cy: 236, rx: 16, ry: 9, fill: sp.dark }, bodyG);
    el('ellipse', { cx: 120, cy: 236, rx: 16, ry: 9, fill: sp.dark }, bodyG);
    // 몸통 (옷)
    el('path', { d: 'M62 232 C 58 190, 70 165, 100 165 C 130 165, 142 190, 138 232 Z', fill: outfit, stroke: 'rgba(0,0,0,.12)', 'stroke-width': 2, class: 'outfit' }, bodyG);
    el('path', { d: 'M86 168 L100 182 L114 168', fill: 'none', stroke: 'rgba(255,255,255,.7)', 'stroke-width': 4, 'stroke-linecap': 'round' }, bodyG);
    if (speciesKey === 'penguin') el('ellipse', { cx: 100, cy: 205, rx: 22, ry: 26, fill: sp.mask, opacity: .9 }, bodyG);
    // 팔
    const armL = el('ellipse', { cx: 62, cy: 192, rx: 10, ry: 18, fill: outfit, class: 'arm arm-l', transform: 'rotate(20 62 192)' }, bodyG);
    const armR = el('ellipse', { cx: 138, cy: 192, rx: 10, ry: 18, fill: outfit, class: 'arm arm-r', transform: 'rotate(-20 138 192)' }, bodyG);

    const head = el('g', { class: 'head' }, root);
    // 귀
    switch (speciesKey) {
      case 'rabbit':
        for (const x of [72, 128]) {
          el('ellipse', { cx: x, cy: 40, rx: 15, ry: 42, fill: sp.fur, stroke: sp.dark, 'stroke-width': 3, transform: `rotate(${x < 100 ? -10 : 10} ${x} 80)` }, head);
          el('ellipse', { cx: x, cy: 42, rx: 7, ry: 30, fill: sp.inner, transform: `rotate(${x < 100 ? -10 : 10} ${x} 80)` }, head);
        }
        break;
      case 'cat':
      case 'squirrel':
        for (const s of [-1, 1]) {
          const x = 100 + s * 40;
          el('path', { d: `M${x - 22} 75 L${x + s * 6} 28 L${x + 22} 75 Z`, fill: sp.fur, stroke: sp.dark, 'stroke-width': 3, 'stroke-linejoin': 'round' }, head);
          el('path', { d: `M${x - 11} 70 L${x + s * 4} 42 L${x + 11} 70 Z`, fill: sp.inner }, head);
        }
        break;
      case 'bear':
        for (const x of [52, 148]) {
          el('circle', { cx: x, cy: 58, r: 22, fill: sp.fur, stroke: sp.dark, 'stroke-width': 3 }, head);
          el('circle', { cx: x, cy: 58, r: 11, fill: sp.inner }, head);
        }
        break;
      case 'sheep':
        for (const [x, y, r] of [[60, 60, 22], [85, 45, 24], [115, 45, 24], [140, 60, 22], [100, 40, 22]]) el('circle', { cx: x, cy: y, r, fill: sp.fur, stroke: sp.dark, 'stroke-width': 2 }, head);
        break;
    }
    // 머리
    const headFill = speciesKey === 'sheep' ? sp.face : sp.fur;
    el('ellipse', { cx: 100, cy: 108, rx: 66, ry: 58, fill: headFill, stroke: sp.dark, 'stroke-width': 3 }, head);
    if (speciesKey === 'sheep') {
      for (const [x, y, r] of [[70, 62, 18], [100, 56, 20], [130, 62, 18]]) el('circle', { cx: x, cy: y, r, fill: sp.fur, stroke: sp.dark, 'stroke-width': 2 }, head);
      for (const x of [34, 166]) el('ellipse', { cx: x, cy: 104, rx: 16, ry: 9, fill: sp.dark, transform: `rotate(${x < 100 ? 25 : -25} ${x} 104)` }, head);
    }
    if (speciesKey === 'dog') {
      for (const s of [-1, 1]) el('ellipse', { cx: 100 + s * 62, cy: 100, rx: 17, ry: 36, fill: sp.dark, transform: `rotate(${s * -18} ${100 + s * 62} 80)` }, head);
    }
    if (speciesKey === 'penguin') {
      el('path', { d: 'M48 118 C 48 80, 75 76, 100 92 C 125 76, 152 80, 152 118 C 152 150, 130 162, 100 162 C 70 162, 48 150, 48 118 Z', fill: sp.mask }, head);
    }
    if (speciesKey === 'frog') {
      for (const x of [68, 132]) el('circle', { cx: x, cy: 62, r: 25, fill: sp.fur, stroke: sp.dark, 'stroke-width': 3 }, head);
      el('ellipse', { cx: 100, cy: 108, rx: 63, ry: 55, fill: sp.fur }, head);
    }
    if (sp.muzzle) el('ellipse', { cx: 100, cy: 132, rx: 26, ry: 20, fill: sp.muzzle }, head);
    if (speciesKey === 'cat') for (const s of [-1, 1]) for (const dy of [-4, 4]) el('line', { x1: 100 + s * 30, y1: 126 + dy, x2: 100 + s * 54, y2: 122 + dy * 2, stroke: sp.dark, 'stroke-width': 2, 'stroke-linecap': 'round' }, head);

    // 볼터치
    el('ellipse', { cx: 62, cy: 130, rx: 13, ry: 8, fill: '#ff8fa3', opacity: .45 }, head);
    el('ellipse', { cx: 138, cy: 130, rx: 13, ry: 8, fill: '#ff8fa3', opacity: .45 }, head);

    // 눈
    const eyeY = speciesKey === 'frog' ? 64 : 106;
    const eyeX = speciesKey === 'frog' ? [68, 132] : [76, 124];
    const eyes = eyeX.map(x => {
      const g = el('g', { class: 'eye' }, head);
      const open = el('g', {}, g);
      el('ellipse', { cx: x, cy: eyeY, rx: 7.5, ry: 9.5, fill: '#2b2320' }, open);
      el('circle', { cx: x + 2.5, cy: eyeY - 3.5, r: 3, fill: '#fff' }, open);
      const happy = el('path', { d: `M${x - 8} ${eyeY + 3} Q ${x} ${eyeY - 8} ${x + 8} ${eyeY + 3}`, fill: 'none', stroke: '#2b2320', 'stroke-width': 4, 'stroke-linecap': 'round', style: 'display:none' }, g);
      const blink = el('path', { d: `M${x - 8} ${eyeY} L ${x + 8} ${eyeY}`, fill: 'none', stroke: '#2b2320', 'stroke-width': 4, 'stroke-linecap': 'round', style: 'display:none' }, g);
      return { open, happy, blink };
    });

    // 코
    if (sp.nose) {
      if (speciesKey === 'penguin') el('path', { d: 'M88 120 L112 120 L100 132 Z', fill: sp.nose, stroke: '#d98a2b', 'stroke-width': 2, 'stroke-linejoin': 'round' }, head);
      else el('ellipse', { cx: 100, cy: 123, rx: speciesKey === 'bear' || speciesKey === 'dog' ? 8 : 5, ry: speciesKey === 'bear' || speciesKey === 'dog' ? 5.5 : 3.5, fill: sp.nose }, head);
    }

    // 입
    const mouthY = speciesKey === 'penguin' ? 140 : 136;
    const closed = el('path', { d: `M90 ${mouthY - 2} Q 95 ${mouthY + 4} 100 ${mouthY - 1} Q 105 ${mouthY + 4} 110 ${mouthY - 2}`, fill: 'none', stroke: '#5a2f2a', 'stroke-width': 3, 'stroke-linecap': 'round' }, head);
    const mouthOpen = el('g', { style: 'display:none' }, head);
    const mouth = el('ellipse', { cx: 100, cy: mouthY + 4, rx: 8, ry: 6, fill: '#7a2e35', stroke: '#5a2f2a', 'stroke-width': 2.5 }, mouthOpen);
    const tongue = el('ellipse', { cx: 100, cy: mouthY + 8, rx: 5, ry: 3, fill: '#ff8a9a' }, mouthOpen);

    return { svg, root, head, eyes, closed, mouthOpen, mouth, tongue, mouthY, armL, armR };
  }

  class Critter {
    constructor(container, species, outfit) {
      this.container = container;
      this.wrap = document.createElement('div');
      this.wrap.className = 'critter';
      this.bubble = document.createElement('div');
      this.bubble.className = 'bubble';
      this.wrap.appendChild(this.bubble);
      container.appendChild(this.wrap);
      this.species = species;
      this.outfit = outfit;
      this.render();
      this.nextBlink = performance.now() + 1000 + Math.random() * 3000;
      this.blinkUntil = 0;
      this.bounceT = -1;
      this.lastEventIdx = -1;
      this.bowT = -1;
      this.seed = Math.random() * 6;
    }

    render() {
      if (this.parts) this.parts.svg.remove();
      this.parts = buildSVG(this.species, this.outfit);
      this.wrap.appendChild(this.parts.svg);
    }

    setSpecies(sp) { this.species = sp; this.render(); }
    setOutfit(c) { this.outfit = c; this.render(); }
    setDimmed(on) { this.wrap.classList.toggle('dimmed', on); }

    setEyes(mode) {
      for (const e of this.parts.eyes) {
        e.open.style.display = mode === 'open' ? '' : 'none';
        e.happy.style.display = mode === 'happy' ? '' : 'none';
        e.blink.style.display = mode === 'blink' ? '' : 'none';
      }
    }

    setMouth(amount, round, wide) {
      const p = this.parts;
      if (amount < 0.05) { p.closed.style.display = ''; p.mouthOpen.style.display = 'none'; return; }
      p.closed.style.display = 'none'; p.mouthOpen.style.display = '';
      const rx = 5 + 9 * wide * (1 - round * 0.5) + 3 * amount;
      const ry = 2.5 + 11 * amount;
      p.mouth.setAttribute('rx', rx.toFixed(1));
      p.mouth.setAttribute('ry', ry.toFixed(1));
      p.mouth.setAttribute('cy', (p.mouthY + 2 + ry * 0.4).toFixed(1));
      p.tongue.setAttribute('cy', (p.mouthY + 2 + ry * 0.9).toFixed(1));
      p.tongue.setAttribute('rx', Math.max(2, rx * 0.6).toFixed(1));
      p.tongue.style.display = ry > 6 ? '' : 'none';
    }

    say(text) {
      if (text) {
        this.bubble.textContent = text;
        this.bubble.classList.add('show');
      } else this.bubble.classList.remove('show');
    }

    spawnNote() {
      const n = document.createElement('span');
      n.className = 'float-note';
      n.textContent = ['♪', '♫', '♩', '♬'][Math.floor(Math.random() * 4)];
      n.style.left = (35 + Math.random() * 30) + '%';
      n.style.setProperty('--dx', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
      this.wrap.appendChild(n);
      setTimeout(() => n.remove(), 1600);
    }

    /**
     * 매 프레임 호출. ev = 지금 부르는 음 (없으면 null), showBubble = 말풍선을 띄울지, beat = 노래의 박 위치(멈춰 있으면 null)
     */
    update(now, ev, evIdx, songT, audioT, showBubble = true, beat = null) {
      const p = this.parts;
      let mouth = 0, round = 0, wide = 0.5;
      if (ev) {
        const into = audioT - ev.s;
        const left = ev.e - audioT;
        const consonant = audioT < ev.vs;
        const env = consonant ? 0.15 : Math.min(1, (audioT - ev.vs) / 0.05) * Math.min(1, left / 0.05);
        mouth = Math.max(0, env) * (0.35 + 0.65 * ev.open);
        round = ev.round; wide = ev.wide;
        if (evIdx !== this.lastEventIdx) {
          this.lastEventIdx = evIdx;
          if (!ev.cont) { this.bounceT = now; this.spawnNote(); }
          // 다른 가수와 같은 가사면 무대 위 가사 줄에만 보이고 말풍선은 띄우지 않는다
          this.say(showBubble ? (ev.text || '').trim() : '');
        }
        this.setEyes(ev.long && into > 0.15 ? 'happy' : (now < this.blinkUntil ? 'blink' : 'open'));
      } else {
        this.setEyes(now < this.blinkUntil ? 'blink' : 'open');
      }
      if (now > this.nextBlink) { this.blinkUntil = now + 130; this.nextBlink = now + 2000 + Math.random() * 3500; }
      this.setMouth(mouth, round, wide);

      // ---------- 몸짓 ----------
      const lvl = this.dance == null ? 1 : this.dance;          // 0 얌전히, 1 보통, 2 신나게
      const md = this.mood || { amp: 1, tilt: 0, slow: 1, pump: 0 };
      let y = 0, sq = 1, sway, armBase = 0, headY = 0;
      // 음이 시작될 때 통통
      if (this.bounceT >= 0) {
        const k = (now - this.bounceT) / 260;
        if (k < 1) { y = -Math.sin(k * Math.PI) * [5, 9, 11][lvl] * md.amp; sq = 1 + Math.sin(k * Math.PI) * 0.03; }
      }
      if (beat != null) {
        // 박자에 맞춰 흔들기
        const ph = beat / md.slow;
        const swing = Math.sin(ph * Math.PI);
        sway = swing * [2, 4.5, 8][lvl] * md.amp;
        if (lvl === 2) {
          y -= Math.abs(swing) * 7 * md.amp;
          armBase = 22 * Math.abs(swing) * md.amp;
        }
        armBase += md.pump * 8 * Math.abs(swing);
      } else {
        // 기다리는 동안 숨쉬기
        sway = Math.sin(now / 900 + this.seed) * 1.5;
        sq *= 1 + Math.sin(now / 700 + this.seed) * 0.008;
      }
      sway += md.tilt;
      // 노래가 끝나면 꾸벅 인사
      if (this.bowT >= 0) {
        const k = (now - this.bowT) / 1500;
        if (k < 1) {
          const bw = Math.sin(Math.min(1, k * 1.25) * Math.PI);
          headY = 22 * bw; sq *= 1 - 0.06 * bw; sway *= 1 - bw; armBase -= 12 * bw;
          if (bw > 0.2) this.setEyes('happy');
        } else this.bowT = -1;
      }
      p.root.setAttribute('transform', `translate(0 ${y.toFixed(2)}) translate(100 240) scale(${(2 - sq).toFixed(3)} ${sq.toFixed(3)}) translate(-100 -240)`);
      p.head.setAttribute('transform', `translate(0 ${headY.toFixed(1)}) rotate(${sway.toFixed(2)} 100 160)`);
      const arm = (ev ? 10 + mouth * 25 : 0) + armBase;
      p.armL.setAttribute('transform', `rotate(${20 + arm} 62 178)`);
      p.armR.setAttribute('transform', `rotate(${-20 - arm} 138 178)`);
      this.wrap.classList.toggle('singing', !!ev);
    }

    bow() { this.bowT = performance.now(); this.say(''); }
    setScale(k) { this.wrap.style.setProperty('--scale', k.toFixed(3)); }

    idle() { this.say(''); this.lastEventIdx = -1; }
    destroy() { this.wrap.remove(); }
  }

  W.Critters = { SPECIES, Critter };
})(window);
