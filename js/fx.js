// 무대 효과: 배경에 따라 꽃잎·눈·별·반딧불이, 노래가 끝나면 꽃가루 + 박수 소리
(function (W) {
  'use strict';

  class StageFx {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scene = 'day';
      this.parts = [];
      this.confetti = [];
      this.reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.last = performance.now();
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
      this.resize();
    }

    resize() {
      const dpr = W.devicePixelRatio || 1;
      const r = this.canvas.getBoundingClientRect();
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seed();
    }

    setScene(scene) {
      if (scene === this.scene) return;
      this.scene = scene;
      this.seed();
    }

    // 배경마다 떠다니는 것들
    seed() {
      const w = this.w || 300, h = this.h || 300;
      const n = this.reduce ? 0.4 : 1;
      const R = Math.random;
      this.parts = [];
      if (this.scene === 'spring') {
        for (let i = 0; i < 26 * n; i++) this.parts.push({ k: 'petal', x: R() * w, y: R() * h, vx: 8 + R() * 14, vy: 14 + R() * 18, r: 3 + R() * 3, a: R() * 6, va: (R() - 0.5) * 3 });
      } else if (this.scene === 'winter') {
        for (let i = 0; i < 60 * n; i++) this.parts.push({ k: 'snow', x: R() * w, y: R() * h, vx: (R() - 0.5) * 8, vy: 12 + R() * 20, r: 1 + R() * 2.4, a: R() * 6 });
      } else if (this.scene === 'night') {
        for (let i = 0; i < 46; i++) this.parts.push({ k: 'star', x: R() * w, y: R() * h * 0.55, r: 0.6 + R() * 1.3, a: R() * 6, va: 1 + R() * 2 });
      } else if (this.scene === 'sunset') {
        for (let i = 0; i < 14 * n; i++) this.parts.push({ k: 'fly', x: R() * w, y: h * (0.35 + R() * 0.5), a: R() * 6, va: 0.6 + R(), r: 1.6 + R() * 1.2 });
      }
    }

    burst() {
      if (this.reduce) return;
      const w = this.w, colors = ['#3182f6', '#ff7aa2', '#ffc83a', '#5cc98a', '#a78bfa', '#ff8a4c'];
      for (let i = 0; i < 140; i++) {
        this.confetti.push({
          x: w / 2 + (Math.random() - 0.5) * w * 0.6, y: -10 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 120, vy: 40 + Math.random() * 80,
          w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 10,
          c: colors[i % colors.length], life: 4 + Math.random() * 2,
        });
      }
    }

    tick() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const c = this.ctx, w = this.w, h = this.h;
      c.clearRect(0, 0, w, h);
      for (const p of this.parts) {
        if (p.k === 'star') {
          p.a += p.va * dt;
          c.globalAlpha = 0.45 + 0.45 * Math.sin(p.a);
          c.fillStyle = '#fffbe8';
          c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
          continue;
        }
        if (p.k === 'fly') {
          p.a += p.va * dt;
          p.x += Math.cos(p.a * 0.7) * 10 * dt; p.y += Math.sin(p.a) * 6 * dt;
          c.globalAlpha = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(p.a * 2));
          c.fillStyle = '#fff3a0';
          c.shadowColor = '#ffe066'; c.shadowBlur = 8;
          c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
          c.shadowBlur = 0;
          continue;
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += (p.va || 1) * dt;
        if (p.y > h + 8) { p.y = -8; p.x = Math.random() * w; }
        if (p.x > w + 8) p.x = -8;
        if (p.x < -8) p.x = w + 8;
        c.globalAlpha = p.k === 'snow' ? 0.9 : 0.85;
        if (p.k === 'snow') {
          c.fillStyle = '#ffffff';
          c.beginPath(); c.arc(p.x + Math.sin(p.a) * 3, p.y, p.r, 0, Math.PI * 2); c.fill();
        } else {
          c.save(); c.translate(p.x, p.y); c.rotate(p.a);
          c.fillStyle = '#ffc1d6';
          c.beginPath(); c.ellipse(0, 0, p.r * 1.4, p.r * 0.8, 0, 0, Math.PI * 2); c.fill();
          c.restore();
        }
      }
      // 꽃가루
      for (const p of this.confetti) {
        p.vy += 60 * dt; p.vx *= 0.99;
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.life -= dt;
        c.globalAlpha = Math.max(0, Math.min(1, p.life));
        c.save(); c.translate(p.x, p.y); c.rotate(p.a);
        c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 1.7)) + 1);
        c.restore();
      }
      this.confetti = this.confetti.filter(p => p.life > 0 && p.y < h + 20);
      c.globalAlpha = 1;
    }
  }

  // 박수 소리: 짧은 잡음 "짝"을 무작위로 여러 번
  function applause(ctx, dest, seconds) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * (seconds + 0.5));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let t = 0;
      while (t < seconds) {
        const density = 18 + 22 * Math.sin(Math.PI * Math.min(1, t / seconds)); // 커졌다 잦아들기
        t += -Math.log(1 - Math.random()) / density;
        const start = Math.floor(t * sr);
        const clapLen = Math.floor(sr * (0.008 + Math.random() * 0.01));
        const amp = 0.25 + Math.random() * 0.35;
        for (let i = 0; i < clapLen * 4 && start + i < len; i++) d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / clapLen);
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.5;
    g.gain.setValueAtTime(0.5, ctx.currentTime + seconds - 0.6);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds + 0.4);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start();
  }

  W.StageFx = StageFx;
  W.Sfx = { applause };
})(window);
