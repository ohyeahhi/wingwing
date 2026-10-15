// 흘러가는 피아노 롤 (가수별 색깔) + 클릭해서 이동
(function (W) {
  'use strict';

  class PianoRoll {
    constructor(canvas, onSeek) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.parts = [];     // [{notes, color, name}]
      this.window = 8;     // 화면에 보이는 초
      this.pos = 0;
      canvas.addEventListener('click', e => {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const t = this.pos + (x - 0.25) * this.window;
        onSeek(Math.max(0, t));
      });
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
      this.resize();
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const r = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.dpr = dpr;
      this.draw(this.pos);
    }

    setParts(parts) {
      this.parts = parts;
      let lo = 127, hi = 0;
      for (const p of parts) for (const n of p.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
      if (lo > hi) { lo = 48; hi = 84; }
      this.lo = lo - 2; this.hi = hi + 2;
      this.draw(this.pos);
    }

    draw(pos) {
      this.pos = pos;
      const c = this.ctx, W_ = this.canvas.width, H = this.canvas.height, dpr = this.dpr || 1;
      const css = getComputedStyle(this.canvas);
      c.clearRect(0, 0, W_, H);
      c.fillStyle = css.getPropertyValue('--roll-bg').trim() || '#fffdf6';
      c.fillRect(0, 0, W_, H);
      const t0 = pos - this.window * 0.25, t1 = t0 + this.window;
      const span = Math.max(12, this.hi - this.lo);
      const rowH = H / span;
      const xOf = t => (t - t0) / this.window * W_;
      const yOf = m => H - (m - this.lo + 1) * rowH;

      // C 음 가로줄
      c.strokeStyle = css.getPropertyValue('--roll-grid').trim() || 'rgba(0,0,0,.06)';
      c.lineWidth = 1;
      for (let m = Math.ceil(this.lo); m <= this.hi; m++) {
        if (m % 12 !== 0) continue;
        const y = Math.round(yOf(m) + rowH) + 0.5;
        c.beginPath(); c.moveTo(0, y); c.lineTo(W_, y); c.stroke();
        c.fillStyle = css.getPropertyValue('--muted').trim() || '#999';
        c.font = `${10 * dpr}px system-ui, sans-serif`;
        c.fillText('C' + (m / 12 - 1), 4 * dpr, y - 3 * dpr);
      }

      c.font = `bold ${11 * dpr}px system-ui, sans-serif`;
      c.textBaseline = 'middle';
      for (const p of this.parts) {
        for (const n of p.notes) {
          if (n.t + n.d < t0 || n.t > t1) continue;
          const x = xOf(n.t), w = Math.max(2, n.d / this.window * W_ - 2 * dpr), y = yOf(n.midi);
          const h = Math.max(4 * dpr, rowH - 1);
          const active = pos >= n.t && pos < n.t + n.d;
          c.fillStyle = p.color;
          c.globalAlpha = p.dim ? 0.25 : active ? 1 : 0.72;
          const r = Math.min(h / 2, 6 * dpr);
          c.beginPath();
          c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
          c.fill();
          if (active) { c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2 * dpr; c.stroke(); }
          if (n.lyric && w > 14 * dpr && h > 9 * dpr) {
            c.globalAlpha = 1;
            c.fillStyle = 'rgba(40,30,20,.85)';
            c.fillText(n.lyric, x + 4 * dpr, y + h / 2);
          }
        }
      }
      c.globalAlpha = 1;
      const px = xOf(pos);
      c.strokeStyle = '#ff6b6b';
      c.lineWidth = 2 * dpr;
      c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke();
    }
  }

  W.PianoRoll = PianoRoll;
})(window);
