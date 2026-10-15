// 동물 마을 주민 같은 "동물어" 노래 목소리 합성기 (Web Audio)
//
// 한 명의 가수 = 성대 역할 발진기 1개 + 포먼트 필터 3개 + 자음용 잡음.
// 음표마다 주파수/포먼트/음량을 자동화(automation)해서 노래하게 한다.
// 동물어 특유의 맛은
//   - 높은 포먼트(작은 동물의 짧은 성도),
//   - 음 시작의 "짹" 하고 떨어지는 음높이(chirp),
//   - 또각또각 끊어지는 발음
// 으로 만든다.
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

  function glottalWave(ctx, brightness) {
    const N = 48;
    const re = new Float32Array(N), im = new Float32Array(N);
    const tilt = 1.35 - brightness * 0.6;
    for (let n = 1; n < N; n++) im[n] = Math.pow(n, -tilt) * (n % 2 === 0 ? 0.85 : 1);
    return ctx.createPeriodicWave(re, im);
  }

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // 자음 정보 → 길이·잡음 설정
  function consonantSpec(on) {
    if (!on) return null;
    const placeFreq = { labial: 1000, dental: 5000, alveolar: 4200, palatal: 3300, velar: 2100, glottal: 1500 };
    switch (on.type) {
      case 'stop': {
        const burst = on.asp ? 0.02 : on.tense ? 0.008 : 0.012;
        const vot = on.asp ? 0.05 : on.tense ? 0.006 : 0.022;
        return { voiceless: burst + vot, burst, asp: on.asp, nf: placeFreq[on.place], nq: 1.4, amp: on.tense ? 0.7 : 0.5 };
      }
      case 'fric': {
        if (on.place === 'glottal') return { voiceless: 0.05, burst: 0.05, nf: null, nq: 1.2, amp: 0.16, breathy: true };
        const t = on.tense ? 0.09 : 0.065;
        const nf = on.place === 'labial' ? 6500 : on.place === 'palatal' ? 3600 : on.place === 'dental' ? 5500 : 6200;
        return { voiceless: t, burst: t, nf, nq: 1.8, amp: on.c === 'z' ? 0.12 : 0.22, voicedFric: on.c === 'z' };
      }
      case 'affr': {
        const t = on.asp ? 0.075 : on.tense ? 0.04 : 0.055;
        return { voiceless: t, burst: t, nf: 3400, nq: 1.6, amp: 0.26 };
      }
      case 'nasal': return { voiced: 0.055, nasal: on.place };
      case 'liquid': return { voiced: 0.03, liquid: true };
    }
    return null;
  }

  // 자음 위치에 따른 포먼트 시작점(전이 출발점)
  function locus(place, vf) {
    switch (place) {
      case 'labial': return [vf[0] * 0.6, vf[1] * 0.75, vf[2] * 0.9];
      case 'alveolar': case 'dental': return [vf[0] * 0.6, 1750, vf[2] * 1.02];
      case 'palatal': return [vf[0] * 0.55, 2200, 2900];
      case 'velar': return [vf[0] * 0.6, Math.max(vf[1], 1900), Math.max(vf[1] * 1.1, 2200)];
    }
    return vf;
  }

  const NASAL_F = { labial: [260, 1000, 2300], alveolar: [260, 1600, 2500], velar: [270, 1250, 2300] };

  /**
   * 한 가수 라인을 ctx 위에 스케줄한다.
   * @param ctx   AudioContext | OfflineAudioContext
   * @param dest  연결할 노드
   * @param line  {notes, hasLyrics}
   * @param v     목소리 설정 {octave, formant, chirp, brightness, vibrato, volume, syllables, transpose}
   * @param offset 곡의 몇 초부터 부를지
   * @param when  ctx 시각 (이 시각이 곡의 offset 지점)
   * @param speed 빠르기 배율
   * @returns {{events, stop()}}
   */
  function singLine(ctx, dest, line, v, offset, when, speed) {
    const nyq = ctx.sampleRate / 2;
    const fScale = v.formant;
    const clampF = f => Math.min(f, nyq * 0.85);

    // ----- 그래프 -----
    const out = ctx.createGain();
    out.gain.value = v.volume;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.gain.value = 4; presence.Q.value = 0.8;
    out.connect(hp); hp.connect(presence); presence.connect(dest);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(glottalWave(ctx, v.brightness));
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2 + Math.random() * 0.8;
    const vib = ctx.createGain(); vib.gain.value = 0;
    lfo.connect(vib); vib.connect(osc.detune);

    const env = ctx.createGain(); env.gain.value = 0;
    const formants = [0, 1, 2].map(i => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = [5, 9, 12][i];
      const g = ctx.createGain(); g.gain.value = [1.0, 0.75, 0.4][i];
      osc.connect(f); f.connect(g); g.connect(env);
      return f;
    });
    const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 900;
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.18;
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
    const setF = (fs, t, method) => fs.forEach((f, i) => at('f' + i, formants[i].frequency, method, clampF(f), t));

    const sylls = (v.syllables && v.syllables.length ? v.syllables : ['라']).map(parseSyllable);
    let sylIdx = 0;
    let prev = null; // 직전 음 정보
    const notes = line.notes;
    const t0 = when;
    const startAt = Math.max(0, ctx.currentTime);

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const nEndSong = n.t + n.d;
      if (nEndSong <= offset + 0.01) continue;
      let s = t0 + (n.t - offset) / speed;
      const e = t0 + (nEndSong - offset) / speed;
      const clipped = s < t0;
      if (clipped) s = t0;
      if (e - s < 0.02) continue;
      const next = notes[i + 1];
      const nextS = next ? t0 + (next.t - offset) / speed : Infinity;
      const legatoNext = next && nextS - e < 0.03;

      // 발음 정하기
      let syl, cont = false;
      if (n.lyric) syl = parseSyllable(n.lyric);
      else if (line.hasLyrics) {
        syl = prev ? { onset: null, glide: null, vowel: prev.syl.vowel, coda: prev.syl.coda, text: '' } : parseSyllable('아');
        cont = !!prev && !clipped && s - prev.e < 0.04;
      } else { syl = sylls[sylIdx % sylls.length]; sylIdx++; }
      if (!syl) syl = parseSyllable('아');
      if (clipped) syl = { ...syl, onset: null, glide: null };

      const midi = n.midi + v.transpose + 12 * v.octave;
      const f0 = mtof(midi);
      const dur = e - s;
      const vw = VOWELS[syl.vowel] || VOWELS.a;
      // 높은 음에서는 F1을 기본음 위로 올린다(소프라노처럼)
      const vf = vw.f.map((f, k) => {
        let x = f * fScale;
        if (k === 0 && x < f0 * 1.08) x = f0 * 1.08;
        if (k === 1 && x < f0 * 1.9) x = f0 * 1.9;
        return x;
      });

      const cs = cont ? null : consonantSpec(syl.onset);
      const maxCons = dur * 0.35;
      let voiceless = cs && cs.voiceless ? Math.min(cs.voiceless, maxCons) : 0;
      const voicedCons = cs && cs.voiced ? Math.min(cs.voiced, maxCons) : 0;
      const vs = s + voiceless;                 // 성대 울림 시작
      const vowelStart = vs + voicedCons;       // 모음 시작

      // 받침
      let codaStart = e;
      if (syl.coda) codaStart = Math.max(vowelStart + (e - vowelStart) * 0.55, e - 0.14);
      const relLen = legatoNext && !cont ? Math.min(0.025, dur * 0.15) : Math.min(0.06, dur * 0.25);
      let relStart = e - relLen;
      if (syl.coda && syl.coda.type === 'stop') relStart = Math.min(relStart, codaStart + 0.03);
      relStart = Math.max(relStart, vowelStart + 0.01);
      const relEnd = Math.min(e, relStart + relLen);

      const peak = 0.9;
      const sus = peak * (0.78 + 0.12 * (1 - v.chirp));

      // --- 음량 ---
      if (cont && prev) {
        at('env', env.gain, 'setValueAtTime', prev.sus, s);
        at('env', env.gain, 'linearRampToValueAtTime', sus, s + 0.03);
      } else {
        at('env', env.gain, 'setValueAtTime', 0, s);
        if (voicedCons) {
          at('env', env.gain, 'linearRampToValueAtTime', cs.liquid ? sus * 0.7 : sus * 0.45, s + 0.012);
          at('env', env.gain, 'setValueAtTime', cs.liquid ? sus * 0.5 : sus * 0.45, vowelStart);
        } else at('env', env.gain, 'setValueAtTime', 0, vs);
        at('env', env.gain, 'linearRampToValueAtTime', peak, vowelStart + 0.012);
        const decayEnd = Math.min(vowelStart + 0.14, relStart);
        at('env', env.gain, 'linearRampToValueAtTime', sus, decayEnd);
      }
      if (syl.coda && syl.coda.type !== 'stop') {
        at('env', env.gain, 'setValueAtTime', sus, codaStart);
        at('env', env.gain, 'linearRampToValueAtTime', sus * (syl.coda.type === 'nasal' ? 0.55 : 0.7), Math.min(codaStart + 0.05, relStart));
      }
      const relFrom = syl.coda && syl.coda.type !== 'stop' ? sus * (syl.coda.type === 'nasal' ? 0.55 : 0.7) : sus;
      if (legatoNext && next && !next.lyric && line.hasLyrics) {
        // 다음 음이 늘임(멜리스마)이면 끊지 않는다
      } else {
        at('env', env.gain, 'setValueAtTime', relFrom, relStart);
        at('env', env.gain, 'linearRampToValueAtTime', 0, relEnd);
      }
      const sustainForNext = relFrom;

      // --- 음높이 ---
      const chirpUp = v.chirp * 3.5; // 반음
      if (cont && prev) {
        at('freq', osc.frequency, 'setValueAtTime', prev.f0, s);
        at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0, s + Math.min(0.06, dur * 0.3));
      } else {
        const fStart = f0 * Math.pow(2, chirpUp / 12);
        at('freq', osc.frequency, 'setValueAtTime', fStart, s);
        at('freq', osc.frequency, 'setValueAtTime', fStart, vs);
        at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0, vowelStart + 0.03 + 0.04 * v.chirp);
      }
      // 끝에서 살짝 떨어지는 음높이 (동물어 말투)
      if (!legatoNext && dur > 0.18) {
        at('freq', osc.frequency, 'setValueAtTime', f0, relStart);
        at('freq', osc.frequency, 'exponentialRampToValueAtTime', f0 * Math.pow(2, -v.chirp * 1.2 / 12), relEnd);
      }

      // --- 비브라토 ---
      at('vib', vib.gain, 'setValueAtTime', 0, s);
      if (dur > 0.4 && v.vibrato > 0) {
        const vibStart = s + 0.22, vibFull = Math.min(relStart, s + 0.6);
        if (vibFull > vibStart) {
          at('vib', vib.gain, 'setValueAtTime', 0, vibStart);
          at('vib', vib.gain, 'linearRampToValueAtTime', v.vibrato * 45, vibFull);
          at('vib', vib.gain, 'setValueAtTime', v.vibrato * 45, relStart);
          at('vib', vib.gain, 'linearRampToValueAtTime', 0, e);
        }
      }

      // --- 포먼트 ---
      let fStart;
      if (cont && prev) fStart = prev.vf;
      else if (syl.glide) {
        const gv = VOWELS[syl.glide === 'y' ? 'i' : syl.glide === 'w' ? 'u' : syl.glide];
        fStart = gv.f.map(f => f * fScale);
      } else if (syl.onset && syl.onset.place) fStart = locus(syl.onset.place, vf);
      else fStart = vf;
      if (cs && cs.nasal) setF(NASAL_F[cs.nasal].map(f => f * fScale), s, 'setValueAtTime');
      else if (cs && cs.liquid) setF([vf[0] * 0.7, 1400 * fScale, 2200 * fScale], s, 'setValueAtTime');
      else setF(fStart, s, 'setValueAtTime');
      setF(fStart, vowelStart, 'setValueAtTime');
      const glideT = syl.glide ? 0.09 : cont ? 0.05 : 0.045;
      setF(vf, Math.min(vowelStart + glideT, relStart), 'linearRampToValueAtTime');
      if (syl.coda) {
        setF(vf, codaStart, 'setValueAtTime');
        const cf = syl.coda.type === 'nasal' ? NASAL_F[syl.coda.place] : syl.coda.type === 'liquid' ? [vf[0] / fScale * 0.8, 1300, 2300] : [vf[0] / fScale * 0.6, vf[1] / fScale, vf[2] / fScale];
        setF(cf.map(f => f * fScale), Math.min(codaStart + 0.06, relEnd), 'linearRampToValueAtTime');
      }

      // --- 자음 잡음 ---
      if (cs && cs.voiceless) {
        const nScale = Math.sqrt(fScale);
        const nf = cs.breathy ? vf[1] : cs.nf * nScale;
        at('nf', nbp.frequency, 'setValueAtTime', clampF(nf), s);
        at('nq', nbp.Q, 'setValueAtTime', cs.nq, s);
        at('ng', ng.gain, 'setValueAtTime', 0, s);
        const burstEnd = s + Math.min(cs.burst, voiceless);
        at('ng', ng.gain, 'linearRampToValueAtTime', cs.amp, s + 0.004);
        at('ng', ng.gain, 'setValueAtTime', cs.amp * (cs.burst > 0.03 ? 0.9 : 0.6), Math.max(s + 0.005, burstEnd - 0.005));
        if (cs.asp && vs > burstEnd + 0.005) {
          at('ng', ng.gain, 'linearRampToValueAtTime', 0.2, burstEnd);
          at('nf', nbp.frequency, 'setValueAtTime', clampF(nf), burstEnd);
          at('nf', nbp.frequency, 'linearRampToValueAtTime', clampF(vf[1]), vs);
        }
        at('ng', ng.gain, 'linearRampToValueAtTime', 0, vs + 0.01);
      }

      events.push({
        s, e: relEnd, vs, text: n.lyric || (line.hasLyrics ? '' : syl.text), vowel: syl.vowel,
        open: vw.open, round: vw.round, wide: vw.wide, midi, cont, long: dur > 0.6,
      });
      prev = { syl, f0, vf, e: relEnd, sus: sustainForNext };
    }

    osc.start(startAt); lfo.start(startAt); noise.start(startAt);
    const lastEnd = events.length ? events[events.length - 1].e + 0.2 : startAt + 0.1;
    osc.stop(lastEnd); lfo.stop(lastEnd); noise.stop(lastEnd);

    return {
      events,
      end: lastEnd,
      out,
      stop() {
        const now = ctx.currentTime;
        try {
          out.gain.cancelScheduledValues(now);
          out.gain.setValueAtTime(out.gain.value, now);
          out.gain.linearRampToValueAtTime(0, now + 0.03);
          osc.stop(now + 0.05); lfo.stop(now + 0.05); noise.stop(now + 0.05);
        } catch (err) { /* 이미 멈춤 */ }
        setTimeout(() => { try { presence.disconnect(); } catch (err) { /* 무시 */ } }, 120);
      },
      setVolume(vol) { out.gain.setTargetAtTime(vol, ctx.currentTime, 0.02); },
    };
  }

  W.Voice = { singLine, mtof };
})(window);
