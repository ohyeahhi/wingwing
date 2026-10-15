// 코드 진행으로 만드는 반주: 피아노 / 기타 / 오르골
// 코드 진행(박 단위)을 반주 음표 목록으로 바꾼 뒤, 재생할 때는 조금씩 앞당겨 스케줄한다.
(function (W) {
  'use strict';
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const mod12 = x => ((x % 12) + 12) % 12;

  // 기준음 근처에서 이 음이름(pc)에 해당하는 가장 가까운 음
  function near(pc, ref) {
    let m = ref - mod12(ref - pc);
    if (ref - m > 6) m += 12;
    return m;
  }

  // 코드 구성음을 lo 이상에서 촘촘히 쌓기
  function closeVoicing(info, lo, count) {
    const pcs = [info.root, info.third, info.fifth, info.seventh].filter(x => x != null);
    const out = [];
    let m = near(pcs[0], lo + 3);
    if (m < lo) m += 12;
    out.push(m);
    for (let i = 1; out.length < count; i++) {
      const pc = pcs[i % pcs.length];
      let x = near(pc, out[out.length - 1] + 3);
      while (x <= out[out.length - 1]) x += 12;
      out.push(x);
    }
    return out;
  }

  /**
   * 반주 음표 목록 만들기
   * @param chords [{b, bd, info}]  코드 진행
   * @param style  'piano' | 'guitar' | 'musicbox'
   * @param pulse  한 박의 길이 (4분음표=1, 6/8 이면 1.5)
   * @returns [{b, bd, midi, kind, vel}]
   */
  function plan(chords, style, pulse) {
    const out = [];
    const compound = Math.abs(pulse - 1.5) < 1e-6;
    const sub = compound ? 0.5 : 0.5;
    for (const c of chords) {
      const info = c.info;
      if (!info) continue;
      const bass = near(info.bass, 43);
      const chord = closeVoicing(info, 57, 3);
      const end = c.b + c.bd;
      let beatIdx = 0;
      for (let b = c.b; b < end - 1e-6; b += pulse, beatIdx++) {
        const span = Math.min(pulse, end - b);
        if (style === 'piano') {
          // 쿵-짝(-짝): 박 첫머리엔 베이스, 나머지 쪼갠 박엔 화음
          out.push({ b, bd: Math.min(span, compound ? 1.5 : 1) * 0.95, midi: beatIdx % 2 && info.fifth != null ? near(info.fifth, bass + 4) : bass, kind: 'piano', vel: 0.8 });
          for (let s = sub; s < span - 1e-6; s += sub) {
            for (const m of chord) out.push({ b: b + s, bd: sub * 0.9, midi: m, kind: 'piano', vel: 0.42 });
          }
          if (span <= sub + 1e-6) for (const m of chord) out.push({ b, bd: span * 0.9, midi: m, kind: 'piano', vel: 0.4 });
        } else if (style === 'guitar') {
          // 아래로·위로 번갈아 긁기
          const strings = [near(info.bass, 45)].concat(closeVoicing(info, 52, 4));
          const hits = (compound ? [0, 0.5, 1] : [0, 0.5]).filter(h => h < span - 1e-6);
          hits.forEach((h, k) => {
            const up = k % 2 === 1;
            const order = up ? strings.slice(1).reverse() : strings;
            order.forEach((m, j) => out.push({ b: b + h, bd: Math.max(0.3, span - h), midi: m, kind: 'guitar', vel: up ? 0.45 : 0.7, strum: j * 0.018 }));
          });
        } else if (style === 'musicbox') {
          // 높은 음으로 또르르 펼치기
          const arp = closeVoicing(info, 72, 4);
          const seq = [0, 1, 2, 3, 2, 1];
          for (let s = 0, k = 0; s < span - 1e-6; s += 0.5, k++) {
            out.push({ b: b + s, bd: 1.2, midi: arp[seq[(beatIdx * 3 + k) % seq.length]], kind: 'box', vel: 0.55 });
          }
        }
      }
    }
    return out;
  }

  // ---------- 소리 ----------
  function piano(ctx, dest, t, dur, f, vel) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = f; o2.frequency.value = f * 2.001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, f * 6); lp.Q.value = 0.3;
    const g = ctx.createGain(); const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const peak = 0.22 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(peak * 0.35, t + 0.01, 0.25);
    g.gain.setTargetAtTime(0, t + dur, 0.08);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
  }
  function guitar(ctx, dest, t, dur, f, vel) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(Math.min(6000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.35);
    const g = ctx.createGain();
    const peak = 0.12 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, Math.min(0.6, dur * 0.5 + 0.15));
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 1.2);
  }
  function musicbox(ctx, dest, t, dur, f, vel) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sine'; o2.type = 'sine';
    o1.frequency.value = f; o2.frequency.value = f * 3.01;
    const g = ctx.createGain(), g2 = ctx.createGain(); g2.gain.value = 0.18;
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.005, 0.35);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + 2); o2.stop(t + 2);
  }
  const VOICE = { piano, guitar, box: musicbox };

  /**
   * 반주 재생 시작
   * @returns {{stop()}}
   */
  function start(ctx, dest, opts) {
    const { chords, style, pulse, beatToSec, offset, when, speed, transpose, volume } = opts;
    const notes = plan(chords, style, pulse).map(n => ({ ...n, t: beatToSec(n.b), te: beatToSec(n.b + n.bd) }))
      .filter(n => n.t >= offset - 0.01).sort((a, b) => a.t - b.t);
    const bus = ctx.createGain();
    bus.gain.value = volume == null ? 0.8 : volume;
    bus.connect(dest);
    const at = x => when + (x - offset) / speed;
    let i = 0;
    const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    function pump() {
      const horizon = offline ? Infinity : ctx.currentTime + 1.2;
      while (i < notes.length && at(notes[i].t) < horizon) {
        const n = notes[i++];
        const t = at(n.t) + (n.strum || 0);
        if (t < ctx.currentTime - 0.02 && !offline) continue;
        VOICE[n.kind](ctx, bus, t, Math.max(0.05, (n.te - n.t) / speed), mtof(n.midi + transpose), n.vel);
      }
    }
    pump();
    const timer = offline ? null : setInterval(pump, 150);
    return {
      stop() {
        if (timer) clearInterval(timer);
        try {
          bus.gain.cancelScheduledValues(ctx.currentTime);
          bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
          bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        } catch (e) { /* 이미 멈춤 */ }
        setTimeout(() => { try { bus.disconnect(); } catch (e) { /* 무시 */ } }, 200);
      },
    };
  }

  W.Accomp = { plan, start };
})(window);
