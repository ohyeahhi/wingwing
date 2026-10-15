// 동물 마을 주민 같은 "동물어" 노래 목소리 합성기 (Web Audio)
//
// 한 명의 가수 = 성대 역할 발진기 1개 + 포먼트 필터 3개 + 숨소리/자음용 잡음.
// 음표마다 주파수/포먼트/음량을 자동화(automation)해서 노래하게 한다.
//
// 귀여움은
//   - 높은 포먼트(작은 동물의 짧은 성도)와 살짝 웃는 입(F2를 올림),
//   - 부드러운 음색(높은 배음을 줄이고 숨소리를 조금 섞음),
//   - 프레이즈 첫 음의 "짹" 하고 내려앉는 음높이와 음절마다 살짝 통통 튀는 음높이
// 로 만든다.
//
// 부드럽게 이어 부르기(레가토):
//   - 바로 이어지는 음에서는 소리를 끄지 않고 자음 부분만 살짝 낮췄다 올린다,
//   - 음높이는 앞 음에서 미끄러지듯 넘어가고(포르타멘토),
//   - 입 모양(포먼트)도 앞 모음에서 다음 모음으로 이어서 바뀌며,
//   - 비브라토는 음마다 끊지 않고 이어진다.
(function (W) {
  'use strict';
  const { VOWELS, parseSyllable } = W.Phonetics;

  const NOISE_CACHE = new WeakMap();
  function noiseBuffer(ctx) {
    if (NOISE_CACHE.has(ctx)) return NOISE_CACHE.get(ctx);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    NOISE_CACHE.set(ctx, buf);
    return buf;
  }

  // 성대 파형: 밝기가 낮을수록 높은 배음이 빨리 줄어 둥글고 부드러운 소리
  function glottalWave(ctx, brightness) {
    const N = 40;
    const re = new Float32Array(N), im = new Float32Array(N);
    const tilt = 1.6 - brightness * 0.55;
    for (let n = 1; n < N; n++) im[n] = Math.pow(n, -tilt) * (n % 2 === 0 ? 0.8 : 1);
    return ctx.createPeriodicWave(re, im);
  }

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const semis = x => Math.pow(2, x / 12);

  // 자음 정보 → 길이·잡음 설정 (귀엽게: 잡음은 작고 짧게)
  function consonantSpec(on) {
    if (!on) return null;
    const placeFreq = { labial: 1100, dental: 5000, alveolar: 4300, palatal: 3400, velar: 2200, glottal: 1500 };
    switch (on.type) {
      case 'stop': {
        const burst = on.asp ? 0.016 : on.tense ? 0.007 : 0.01;
        const vot = on.asp ? 0.04 : on.tense ? 0.005 : 0.016;
        return { voiceless: burst + vot, burst, asp: on.asp, nf: placeFreq[on.place], nq: 1.4, amp: on.tense ? 0.42 : 0.3, dip: 0.1 };
      }
      case 'fric': {
        if (on.place === 'glottal') return { voiceless: 0.04, burst: 0.04, nf: null, nq: 1.2, amp: 0.1, breathy: true, dip: 0.45 };
        const t = on.tense ? 0.075 : 0.055;
        const nf = on.place === 'labial' ? 6500 : on.place === 'palatal' ? 3800 : on.place === 'dental' ? 5500 : 6500;
        return { voiceless: t, burst: t, nf, nq: 2, amp: on.c === 'z' ? 0.08 : 0.14, dip: 0.2 };
      }
      case 'affr': {
        const t = on.asp ? 0.06 : on.tense ? 0.035 : 0.045;
        return { voiceless: t, burst: t, nf: 3600, nq: 1.8, amp: 0.17, dip: 0.14 };
      }
      case 'nasal': return { voiced: 0.05, nasal: on.place };
      case 'liquid': return { voiced: 0.03, liquid: true };
    }
    return null;
  }

  // 자음 위치에 따른 포먼트 전이 출발점
  function locus(place, vf) {
    switch (place) {
      case 'labial': return [vf[0] * 0.6, vf[1] * 0.75, vf[2] * 0.9];
      case 'alveolar': case 'dental': return [vf[0] * 0.6, (vf[1] + 1750) / 2, vf[2] * 1.02];
      case 'palatal': return [vf[0] * 0.55, Math.max(vf[1], 2100), Math.max(vf[2], 2900)];
      case 'velar': return [vf[0] * 0.6, Math.max(vf[1], 1800), Math.max(vf[1] * 1.1, 2200)];
    }
    return vf;
  }

  const NASAL_F = { labial: [260, 1000, 2300], alveolar: [260, 1600, 2500], velar: [270, 1250, 2300] };

  const FORMANT_Q = [4.5, 8, 11];
  const FORMANT_G = [1.0, 0.7, 0.32];

  // 이 음높이·입 모양에서 소리가 얼마나 크게 나는지 대략 계산 (음마다 크기를 고르게 맞추려고)
  function loudness(f0, vf, tilt, nyq) {
    const bp = (f, fc, q) => 1 / Math.sqrt(1 + q * q * Math.pow(f / fc - fc / f, 2));
    let sum = 0;
    for (let k = 1; k <= 24; k++) {
      const f = f0 * k;
      if (f > nyq * 0.9) break;
      const a = Math.pow(k, -tilt) * (k % 2 === 0 ? 0.8 : 1);
      let h = 0.22 / Math.sqrt(1 + Math.pow(f / 1100, 4));
      for (let i = 0; i < 3; i++) h += FORMANT_G[i] * bp(f, vf[i], FORMANT_Q[i]);
      sum += (a * h) * (a * h);
    }
    return Math.sqrt(sum);
  }

  /**
   * 한 가수 라인을 ctx 위에 스케줄한다.
   * @param ctx   AudioContext | OfflineAudioContext
   * @param dest  연결할 노드
   * @param line  {notes, hasLyrics}
   * @param v     목소리 설정 {octave, formant, chirp, brightness, vibrato, breath, volume, syllables, transpose}
   * @param offset 곡의 몇 초부터 부를지
   * @param when  ctx 시각 (이 시각이 곡의 offset 지점)
   * @param speed 빠르기 배율
   * @returns {{events, stop()}}
   */
  function singLine(ctx, dest, line, v, offset, when, speed) {
    const nyq = ctx.sampleRate / 2;
    const fScale = v.formant;
    const breath = v.breath == null ? 0.35 : v.breath;
    const clampF = f => Math.min(f, nyq * 0.85);

    // ----- 그래프 -----
    const out = ctx.createGain();
    out.gain.value = v.volume;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
    const sparkle = ctx.createBiquadFilter(); sparkle.type = 'peaking'; sparkle.frequency.value = 3600; sparkle.gain.value = 3; sparkle.Q.value = 0.9;
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = Math.min(8000, nyq * 0.9); soft.Q.value = 0.5;
    out.connect(hp); hp.connect(sparkle); sparkle.connect(soft); soft.connect(dest);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(glottalWave(ctx, v.brightness));
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.8 + Math.random() * 0.7;
    const vib = ctx.createGain(); vib.gain.value = 0;
    lfo.connect(vib); vib.connect(osc.detune);

    // 숨소리: 포먼트 필터를 통과해서 속삭이는 듯한 공기감을 더한다
    const breathSrc = ctx.createBufferSource(); breathSrc.buffer = noiseBuffer(ctx); breathSrc.loop = true;
    const breathG = ctx.createGain(); breathG.gain.value = 0.18 * breath;
    breathSrc.connect(breathG);

    const env = ctx.createGain(); env.gain.value = 0;
    const formants = [0, 1, 2].map(i => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = FORMANT_Q[i];
      const g = ctx.createGain(); g.gain.value = FORMANT_G[i];
      osc.connect(f); breathG.connect(f); f.connect(g); g.connect(env);
      return f;
    });
    const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 1100;
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.22;
    osc.connect(body); body.connect(bodyG); bodyG.connect(env);
    env.connect(out);

    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx); noise.loop = true;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 4000; nbp.Q.value = 1.5;
    const ng = ctx.createGain(); ng.gain.value = 0;
    noise.connect(nbp); nbp.connect(ng); ng.connect(out);

    // ----- 스케줄 -----
    const events = [];
    const P = {}; // 파라미터별 마지막 자동화 시각 (시간 역행 방지)
    const at = (name, param, method, value, t) => {
      const last = P[name] || 0;
      if (t < last) t = last;
      P[name] = t + 1e-5;
      param[method](value, t);
    };
    let fFloor = [0, 0, 0]; // 지금 음의 기본음보다 포먼트가 내려가면 소리가 튀므로 바닥을 둔다
    const setF = (fs, t, method) => fs.forEach((f, i) => at('f' + i, formants[i].frequency, method, clampF(Math.max(f, fFloor[i])), t));

    const sylls = (v.syllables && v.syllables.length ? v.syllables : ['라']).map(parseSyllable);
    let sylIdx = 0;
    let prev = null; // 직전 음 정보
    const notes = line.notes;
    const t0 = when;
    const startAt = Math.max(0, ctx.currentTime);
    const LINK = 0.045; // 이 정도 틈이면 이어 부른다
    const vibDepth = v.vibrato * 32; // cents
    const tilt = 1.6 - v.brightness * 0.55;
    const refLoud = loudness(440, VOWELS.a.f.map(f => f * fScale), tilt, nyq);

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const nEndSong = n.t + n.d;
      if (nEndSong <= offset + 0.01) continue;
      let s = t0 + (n.t - offset) / speed;
      const e = t0 + (nEndSong - offset) / speed;
      const clipped = s < t0;
      if (clipped) s = t0;
      if (e - s < 0.02) continue;
      const dur = e - s;
      const next = notes[i + 1];
      const nextS = next ? t0 + (next.t - offset) / speed : Infinity;
      const linkedNext = !!next && nextS - e < LINK;
      const linkedPrev = !!prev && !clipped && s - prev.e < LINK;

      // 발음 정하기
      let syl, cont = false;
      if (n.lyric) syl = parseSyllable(n.lyric);
      else if (line.hasLyrics) {
        syl = prev ? { onset: null, glide: null, vowel: prev.syl.vowel, coda: prev.syl.coda, text: '' } : parseSyllable('아');
        cont = linkedPrev;
      } else { syl = sylls[sylIdx % sylls.length]; sylIdx++; }
      if (!syl) syl = parseSyllable('아');
      if (clipped) syl = { ...syl, onset: null, glide: null };

      const midi = n.midi + v.transpose + 12 * v.octave;
      const f0 = mtof(midi);
      const vw = VOWELS[syl.vowel] || VOWELS.a;
      // 살짝 웃는 입(F2↑) + 높은 음에서는 F1을 기본음 위로 올린다
      const vf = vw.f.map((f, k) => {
        let x = f * fScale * (k === 1 ? 1.05 : 1);
        if (k === 0 && x < f0 * 1.1) x = f0 * 1.1;
        if (k === 1 && x < f0 * 1.9) x = f0 * 1.9;
        return x;
      });
      // 자음·받침으로 입 모양이 바뀌는 동안에도 첫 포먼트가 기본음 근처로 내려가지 않게
      fFloor = [Math.min(vf[0], f0 * 1.25), Math.min(vf[1], f0 * 2), 0];

      const cs = cont ? null : consonantSpec(syl.onset);
      const maxCons = dur * 0.4;
      const voiceless = cs && cs.voiceless ? Math.min(cs.voiceless, maxCons) : 0;
      const voicedCons = cs && cs.voiced ? Math.min(cs.voiced, maxCons) : 0;
      const vs = s + voiceless;              // 성대 울림 시작
      const vowelStart = vs + voicedCons;    // 모음 시작

      const comp = Math.min(1.4, Math.max(0.5, Math.pow(refLoud / loudness(f0, vf, tilt, nyq), 0.85)));
      const peak = 0.9 * comp;
      const sus = peak * 0.84;
      const atk = linkedPrev ? 0.03 : 0.04;

      // 받침
      let codaStart = e;
      if (syl.coda) codaStart = Math.max(vowelStart + (e - vowelStart) * 0.6, e - 0.12);
      const codaLevel = !syl.coda ? sus : syl.coda.type === 'nasal' ? sus * 0.6 : syl.coda.type === 'liquid' ? sus * 0.75 : sus * 0.3;

      const relLen = Math.min(0.1, dur * 0.3);
      let relStart = e - relLen;
      if (syl.coda && syl.coda.type === 'stop' && !linkedNext) relStart = Math.min(relStart, codaStart + 0.04);
      relStart = Math.max(relStart, vowelStart + atk + 0.01);

      // --- 음량 ---
      if (linkedPrev) {
        at('env', env.gain, 'setValueAtTime', prev.level, s);
        if (cont) {
          at('env', env.gain, 'linearRampToValueAtTime', sus, s + 0.05);
        } else if (cs && cs.voiceless) {
          // 소리를 끄지 않고 자음 자리만 살짝 낮춘다
          const dip = sus * cs.dip;
          at('env', env.gain, 'linearRampToValueAtTime', dip, s + Math.min(0.025, voiceless * 0.5 + 0.006));
          at('env', env.gain, 'setValueAtTime', dip, vs);
          at('env', env.gain, 'linearRampToValueAtTime', peak, vs + atk);
        } else if (voicedCons) {
          const lv = sus * (cs.liquid ? 0.72 : 0.5);
          at('env', env.gain, 'linearRampToValueAtTime', lv, s + 0.025);
          at('env', env.gain, 'setValueAtTime', lv, vowelStart);
          at('env', env.gain, 'linearRampToValueAtTime', peak, vowelStart + atk);
        } else {
          // 모음으로 시작하는 음절: 살짝 숨 고르듯
          at('env', env.gain, 'linearRampToValueAtTime', sus * 0.7, s + 0.025);
          at('env', env.gain, 'linearRampToValueAtTime', peak, s + 0.025 + atk);
        }
      } else {
        at('env', env.gain, 'setValueAtTime', 0, s);
        if (voicedCons) {
          const lv = sus * (cs.liquid ? 0.55 : 0.4);
          at('env', env.gain, 'linearRampToValueAtTime', lv, s + 0.03);
          at('env', env.gain, 'setValueAtTime', lv, vowelStart);
        } else at('env', env.gain, 'setValueAtTime', 0, vs);
        at('env', env.gain, 'linearRampToValueAtTime', peak, vowelStart + atk);
      }
      if (!cont) at('env', env.gain, 'linearRampToValueAtTime', sus, Math.min(vowelStart + atk + 0.15, relStart));
      if (syl.coda) {
        at('env', env.gain, 'setValueAtTime', sus, codaStart);
        at('env', env.gain, 'linearRampToValueAtTime', codaLevel, Math.min(codaStart + 0.05, e));
      }
      let endLevel;
      if (linkedNext) endLevel = codaLevel;  // 다음 음이 이어받는다
      else {
        at('env', env.gain, 'setValueAtTime', codaLevel, relStart);
        at('env', env.gain, 'linearRampToValueAtTime', 0, Math.max(relStart + 0.02, e));
        endLevel = 0;
      }

      // --- 음높이 ---
      if (linkedPrev) {
        // 앞 음에서 미끄러지듯 넘어가고, 새 음절이면 살짝 통통 튄다
        const glide = Math.min(cont ? 0.1 : 0.07, dur * 0.35);
        at('freq', osc.frequency, 'setValueAtTime', prev.f0, s);
        if (!cont && v.chirp > 0) {
          at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0 * semis(v.chirp * 0.8), Math.max(vs, s + glide * 0.7));
          at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0, Math.max(vs, s + glide * 0.7) + 0.06);
        } else at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0, s + glide);
      } else {
        // 프레이즈 첫 음: 위에서 "짹" 하고 내려앉기
        const fStart = f0 * semis(v.chirp * 2.2);
        at('freq', osc.frequency, 'setValueAtTime', fStart, s);
        at('freq', osc.frequency, 'setValueAtTime', fStart, vs);
        at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0, vowelStart + 0.05 + 0.04 * v.chirp);
      }
      if (!linkedNext && dur > 0.2) {
        // 프레이즈 끝에서 살짝 내려가며 마무리
        at('freq', osc.frequency, 'setValueAtTime', f0, relStart);
        at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0 * semis(-v.chirp * 0.8), Math.max(relStart + 0.02, e));
      }

      // --- 비브라토 (이어지는 음에서는 끊지 않는다) ---
      at('vib', vib.gain, 'setValueAtTime', linkedPrev ? prev.vib : 0, s);
      let vibEnd = 0;
      if (dur > 0.35 && vibDepth > 0) {
        at('vib', vib.gain, 'linearRampToValueAtTime', vibDepth * 0.2, s + 0.15);
        at('vib', vib.gain, 'linearRampToValueAtTime', vibDepth, Math.min(s + 0.55, e - 0.02));
        vibEnd = vibDepth;
      } else at('vib', vib.gain, 'linearRampToValueAtTime', 0, Math.min(s + 0.1, e));
      if (!linkedNext && vibEnd) { at('vib', vib.gain, 'linearRampToValueAtTime', 0, e); vibEnd = 0; }

      // --- 포먼트 (입 모양을 이어서 바꾼다) ---
      let target0;
      if (syl.glide) {
        const gv = VOWELS[syl.glide === 'y' ? 'i' : syl.glide === 'w' ? 'u' : syl.glide];
        target0 = gv.f.map(f => f * fScale);
      } else if (!cont && syl.onset && syl.onset.place) target0 = locus(syl.onset.place, vf);
      else target0 = vf;
      setF(linkedPrev ? prev.vfEnd : target0, s, 'setValueAtTime');
      if (cs && cs.nasal) {
        setF(NASAL_F[cs.nasal].map(f => f * fScale), s + 0.025, 'linearRampToValueAtTime');
        setF(NASAL_F[cs.nasal].map(f => f * fScale), vowelStart, 'setValueAtTime');
      } else if (cs && cs.liquid) {
        const lf = [vf[0] * 0.75, 1450 * fScale, 2300 * fScale];
        setF(lf, s + 0.025, 'linearRampToValueAtTime');
        setF(lf, vowelStart, 'setValueAtTime');
      } else if (linkedPrev) setF(target0, Math.max(vs, s + 0.02), 'linearRampToValueAtTime');
      if (syl.glide) setF(target0, vowelStart, 'setValueAtTime');
      const glideT = syl.glide ? 0.09 : cont ? 0.08 : 0.06;
      setF(vf, Math.min(vowelStart + glideT, relStart), 'linearRampToValueAtTime');
      let vfEnd = vf;
      if (syl.coda) {
        setF(vf, codaStart, 'setValueAtTime');
        const cf = syl.coda.type === 'nasal' ? NASAL_F[syl.coda.place]
          : syl.coda.type === 'liquid' ? [vf[0] / fScale * 0.8, 1300, 2300]
            : [vf[0] / fScale * 0.6, vf[1] / fScale, vf[2] / fScale];
        vfEnd = cf.map(f => f * fScale);
        setF(vfEnd, Math.min(codaStart + 0.06, e), 'linearRampToValueAtTime');
      }

      // --- 자음 잡음 ---
      if (cs && cs.voiceless) {
        const nf = cs.breathy ? vf[1] : cs.nf * Math.sqrt(fScale);
        at('nf', nbp.frequency, 'setValueAtTime', clampF(nf), s);
        at('nq', nbp.Q, 'setValueAtTime', cs.nq, s);
        at('ng', ng.gain, 'setValueAtTime', 0, s);
        const burstEnd = s + Math.min(cs.burst, voiceless);
        at('ng', ng.gain, 'linearRampToValueAtTime', cs.amp, s + Math.min(0.012, voiceless * 0.4));
        at('ng', ng.gain, 'setValueAtTime', cs.amp * (cs.burst > 0.03 ? 0.85 : 0.5), Math.max(s + 0.013, burstEnd - 0.004));
        if (cs.asp && vs > burstEnd + 0.005) {
          at('ng', ng.gain, 'linearRampToValueAtTime', 0.12, burstEnd);
          at('nf', nbp.frequency, 'setValueAtTime', clampF(nf), burstEnd);
          at('nf', nbp.frequency, 'linearRampToValueAtTime', clampF(vf[1]), vs);
        }
        at('ng', ng.gain, 'linearRampToValueAtTime', 0, vs + 0.012);
      }

      events.push({
        s, e: linkedNext ? e : Math.max(relStart + 0.02, e), vs, text: n.lyric || (line.hasLyrics ? '' : syl.text), vowel: syl.vowel,
        open: vw.open, round: vw.round, wide: vw.wide, midi, cont, long: dur > 0.6, linked: linkedPrev,
      });
      prev = { syl, f0, vfEnd, e, level: endLevel, vib: vibEnd };
    }

    osc.start(startAt); lfo.start(startAt); noise.start(startAt); breathSrc.start(startAt, Math.random());
    const lastEnd = events.length ? events[events.length - 1].e + 0.2 : startAt + 0.1;
    osc.stop(lastEnd); lfo.stop(lastEnd); noise.stop(lastEnd); breathSrc.stop(lastEnd);

    return {
      events,
      end: lastEnd,
      out,
      stop() {
        const now = ctx.currentTime;
        try {
          out.gain.cancelScheduledValues(now);
          out.gain.setValueAtTime(out.gain.value, now);
          out.gain.linearRampToValueAtTime(0, now + 0.04);
          osc.stop(now + 0.06); lfo.stop(now + 0.06); noise.stop(now + 0.06); breathSrc.stop(now + 0.06);
        } catch (err) { /* 이미 멈춤 */ }
        setTimeout(() => { try { soft.disconnect(); } catch (err) { /* 무시 */ } }, 150);
      },
      setVolume(vol) { out.gain.setTargetAtTime(vol, ctx.currentTime, 0.02); },
    };
  }

  W.Voice = { singLine, mtof };
})(window);
