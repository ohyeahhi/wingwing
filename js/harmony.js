// 선율 하나로 4성부 화음(알토·테너·베이스)을 자동으로 만든다.
(function (W) {
  'use strict';

  const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function corr(a, b) {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return num / Math.sqrt(da * db || 1);
  }

  function estimateKey(notes, keyHint) {
    if (keyHint && Number.isFinite(keyHint.fifths)) {
      const minor = /minor/i.test(keyHint.mode || '');
      const majorTonic = ((keyHint.fifths * 7) % 12 + 12) % 12;
      return { tonic: minor ? (majorTonic + 9) % 12 : majorTonic, minor };
    }
    const hist = new Array(12).fill(0);
    for (const n of notes) hist[n.midi % 12] += n.bd;
    // 노래는 대개 으뜸음으로 끝난다
    const lastPc = notes.length ? notes[notes.length - 1].midi % 12 : -1;
    let best = { tonic: 0, minor: false, r: -2 };
    for (let t = 0; t < 12; t++) {
      const h = hist.map((_, i) => hist[(i + t) % 12]);
      const bonus = lastPc === t ? 0.25 : lastPc === (t + 7) % 12 ? 0.05 : 0;
      const rMaj = corr(h, KS_MAJOR) + bonus + (lastPc === (t + 4) % 12 ? 0.05 : 0);
      const rMin = corr(h, KS_MINOR) + bonus + (lastPc === (t + 3) % 12 ? 0.05 : 0) - 0.03;
      if (rMaj > best.r) best = { tonic: t, minor: false, r: rMaj };
      if (rMin > best.r) best = { tonic: t, minor: true, r: rMin };
    }
    return best;
  }

  // 화음 목록: 근음(으뜸음 기준 반음), 구성음, 가중치
  function chordSet(minor) {
    const C = (name, root, tones, w) => ({ name, root, tones, w });
    if (!minor) return [
      C('I', 0, [0, 4, 7], 3), C('ii', 2, [2, 5, 9], 1.3), C('iii', 4, [4, 7, 11], 0.7),
      C('IV', 5, [5, 9, 0], 2.4), C('V', 7, [7, 11, 2], 2.6), C('V7', 7, [7, 11, 2, 5], 1.6), C('vi', 9, [9, 0, 4], 1.5),
    ];
    return [
      C('i', 0, [0, 3, 7], 3), C('iio', 2, [2, 5, 8], 0.8), C('III', 3, [3, 7, 10], 1.0),
      C('iv', 5, [5, 8, 0], 2.4), C('V', 7, [7, 11, 2], 2.6), C('V7', 7, [7, 11, 2, 5], 1.5), C('VI', 8, [8, 0, 3], 1.5),
      C('VII', 10, [10, 2, 5], 0.8),
    ];
  }

  const GOOD_MOVES = {
    'V>I': 1.2, 'V7>I': 1.4, 'V>i': 1.2, 'V7>i': 1.4, 'IV>V': 0.6, 'ii>V': 0.8, 'ii>V7': 0.8, 'I>IV': 0.3, 'I>V': 0.2,
    'vi>ii': 0.4, 'vi>IV': 0.4, 'iv>V': 0.6, 'i>iv': 0.3, 'VI>iv': 0.3, 'iio>V': 0.6,
    'V>IV': -0.6, 'V7>IV': -0.8, 'V7>vi': 0.1, 'V>vi': 0.3, 'iii>I': -0.3,
  };

  function beatStrength(b) {
    const f2 = ((b % 2) + 2) % 2, f1 = ((b % 1) + 1) % 1;
    if (f2 < 1e-3) return 1;
    if (f1 < 1e-3) return 0.75;
    return 0.35;
  }

  function chooseChords(notes, key) {
    const chords = chordSet(key.minor);
    const N = notes.length, K = chords.length;
    const score = [], back = [];
    for (let i = 0; i < N; i++) {
      const n = notes[i];
      const pc = ((n.midi - key.tonic) % 12 + 12) % 12;
      const s = beatStrength(n.b);
      const weak = s < 0.5 || n.bd < 0.75;
      score.push(new Array(K)); back.push(new Array(K));
      for (let c = 0; c < K; c++) {
        const ch = chords[c];
        let em;
        if (ch.tones.includes(pc)) em = ch.w * (0.4 + s);
        else em = weak ? -1.2 : -8;
        if (ch.tones.length > 3 && ch.tones[3] !== pc) em -= 0.5; // 7화음은 선율이 7음일 때 위주로
        if (i === 0 && ch.root === 0) em += 2;
        if (i === N - 1) em += ch.root === 0 ? 4 : -2;
        if (i === 0) { score[i][c] = em; back[i][c] = -1; continue; }
        let best = -Infinity, arg = 0;
        for (let p = 0; p < K; p++) {
          const prev = chords[p];
          let tr = 0;
          if (p === c) tr += weak ? 0.8 : -0.2;
          else {
            tr += GOOD_MOVES[prev.name + '>' + ch.name] || 0;
            if (weak) tr -= 0.7;
          }
          const v = score[i - 1][p] + tr;
          if (v > best) { best = v; arg = p; }
        }
        score[i][c] = best + em;
        back[i][c] = arg;
      }
    }
    let c = 0;
    for (let k = 1; k < K; k++) if (score[N - 1][k] > score[N - 1][c]) c = k;
    const res = new Array(N);
    for (let i = N - 1; i >= 0; i--) { res[i] = chords[c]; c = back[i][c]; }
    return res;
  }

  function pick(candidates, prev, extraCost) {
    let best = null, bestCost = Infinity;
    for (const m of candidates) {
      const cost = Math.abs(m - prev) + (extraCost ? extraCost(m) : 0);
      if (cost < bestCost) { bestCost = cost; best = m; }
    }
    return best;
  }

  function chordTonesIn(lo, hi, pcs) {
    const out = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
    return out;
  }

  // ---------- 코드 기호 ----------
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function notePc(s) {
    let pc = PC[s[0].toUpperCase()];
    for (const c of s.slice(1)) pc += c === '#' || c === '♯' ? 1 : c === 'b' || c === '♭' ? -1 : 0;
    return ((pc % 12) + 12) % 12;
  }

  /** "Ebmaj7", "Bbm7", "Ab(add2)", "Bmaj7/Db", "D#m7(b5)" ... → {root, bass, pcs} */
  function parseChord(sym) {
    const m = String(sym).trim().match(/^([A-Ga-g])([#b♯♭]?)(.*?)(?:\/([A-Ga-g][#b♯♭]?))?$/);
    if (!m) return null;
    const root = notePc(m[1] + m[2]);
    const q = m[3].replace(/[()\s]/g, '').toLowerCase();
    let iv;
    if (/^(maj7|ma7|m7\+|δ|Δ)/i.test(m[3]) || q.startsWith('maj')) iv = [0, 4, 7, 11];
    else if (/^(m7b5|min7b5|ø)/.test(q)) iv = [0, 3, 6, 10];
    else if (/^(dim7|o7)/.test(q)) iv = [0, 3, 6, 9];
    else if (/^(dim|o)/.test(q)) iv = [0, 3, 6];
    else if (/^(m7|min7|-7)/.test(q)) iv = [0, 3, 7, 10];
    else if (/^(m6|min6)/.test(q)) iv = [0, 3, 7, 9];
    else if (/^(m|min|-)/.test(q) && !q.startsWith('maj')) iv = [0, 3, 7];
    else if (/^(aug|\+)/.test(q)) iv = [0, 4, 8];
    else if (/^sus2/.test(q)) iv = [0, 2, 7];
    else if (/^(7sus|sus)/.test(q)) iv = q.startsWith('7') ? [0, 5, 7, 10] : [0, 5, 7];
    else if (/^(7|9|11|13)/.test(q)) iv = [0, 4, 7, 10];
    else if (/^6/.test(q)) iv = [0, 4, 7, 9];
    else iv = [0, 4, 7];
    if (/add2|add9/.test(q) && !iv.includes(2)) iv = iv.concat(2);
    const pcs = iv.map(x => (x + root) % 12);
    return { sym, root, bass: m[4] ? notePc(m[4]) : root, third: pcs[1], pcs };
  }

  function chordAt(chords, b) {
    let lo = 0, hi = chords.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (chords[mid].b <= b + 1e-6) { ans = chords[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  /**
   * @param melody   선율 라인
   * @param count    만들 성부 수 (1~3)
   * @param keyHint  MusicXML 조표 정보
   * @param opts     {chords: [{b, bd, sym}], beatToSec: fn}  코드 진행이 있으면 그대로 따른다
   */
  function harmonize(melody, count, keyHint, opts) {
    const notes = melody.notes;
    if (!notes.length || count < 1) return [];
    opts = opts || {};
    const given = (opts.chords || []).map(c => ({ ...c, info: parseChord(c.sym) })).filter(c => c.info).sort((a, b) => a.b - b.b);
    let perNote;
    if (given.length) {
      perNote = notes.map(n => (chordAt(given, n.b) || given[0]).info);
    } else {
      const key = estimateKey(notes, keyHint);
      perNote = chooseChords(notes, key).map(ch => {
        const pcs = ch.tones.map(t => (t + key.tonic) % 12);
        return { pcs, root: (ch.root + key.tonic) % 12, bass: (ch.root + key.tonic) % 12, third: pcs[1] };
      });
    }
    const roles = count === 1 ? ['alto'] : count === 2 ? ['alto', 'bass'] : ['alto', 'tenor', 'bass'];
    const out = { alto: [], tenor: [], bass: [] };
    const st = { a: notes[0].midi - 5, t: notes[0].midi - 12, b: notes[0].midi - 19 };

    // 화음 하나 쌓기 (m = 선율 음, 없으면 허밍)
    function voice(ch, m) {
      const pcs = ch.pcs, third = ch.third;
      const ref = m != null ? m : Math.max(st.a + 3, 60);
      const melPc = m != null ? m % 12 : -1;
      // 알토: 선율 아래 3~9반음 (F3 이상). 선율이 너무 낮으면 위로.
      let cand = chordTonesIn(Math.max(ref - 9, 53), ref - (m != null ? 3 : 0), pcs);
      if (!cand.length && m != null) cand = chordTonesIn(ref + 3, ref + 8, pcs);
      if (!cand.length) cand = chordTonesIn(ref - 12, ref - 1, pcs);
      if (!cand.length) cand = [ref - 3];
      const a = pick(cand, st.a, x => (x % 12 === melPc ? 1.5 : 0) + (melPc !== third && x % 12 === third ? -1.5 : 0));
      st.a = a;
      // 테너: 선율·알토 아래, C3~A4
      const top = Math.min(a, m != null ? m : a);
      const haveThird = melPc === third || a % 12 === third;
      cand = chordTonesIn(Math.max(48, top - 12), Math.min(69, top - 1), pcs);
      if (!cand.length) cand = chordTonesIn(top - 12, top - 1, pcs);
      if (!cand.length) cand = [top - 5];
      const t = pick(cand, st.t, x => (!haveThird && x % 12 !== third ? 3 : 0) + (x % 12 === melPc || x % 12 === a % 12 ? 1 : 0));
      st.t = t;
      // 베이스: 베이스음(분수 코드면 분모), E2~C4
      const upper = roles.includes('tenor') ? t : top;
      cand = chordTonesIn(40, Math.min(60, upper), [ch.bass]);
      if (!cand.length) cand = chordTonesIn(upper - 24, upper - 1, [ch.bass]);
      const bs = pick(cand, st.b, x => (x < 43 ? 1 : 0));
      st.b = bs;
      return { alto: a, tenor: t, bass: bs };
    }

    // 선율이 한 마디 이상 쉬는 동안은 코드를 "우~" 하고 허밍
    const humGaps = [];
    if (given.length && opts.beatToSec) {
      let cursor = 0;
      for (const n of notes.concat([{ b: Infinity }])) {
        const gapEnd = Math.min(n.b, given[given.length - 1].b + given[given.length - 1].bd);
        if (gapEnd - cursor >= 3) humGaps.push([cursor, gapEnd]);
        if (n.b === Infinity) break;
        cursor = Math.max(cursor, n.b + n.bd);
      }
    }
    const events = notes.map((n, i) => ({ b: n.b, n, ch: perNote[i] }));
    for (const [gs, ge] of humGaps) {
      for (const c of given) {
        const s = Math.max(c.b, gs), e = Math.min(c.b + c.bd, ge);
        if (e - s < 0.7) continue;
        const ts = opts.beatToSec(s), te = opts.beatToSec(e - 0.15);
        events.push({ b: s, hum: { t: ts, d: te - ts, b: s, bd: e - 0.15 - s }, ch: c.info });
      }
    }
    events.sort((x, y) => x.b - y.b);

    for (const ev of events) {
      const v = voice(ev.ch, ev.n ? ev.n.midi : null);
      const base = ev.n ? { t: ev.n.t, d: ev.n.d, b: ev.n.b, bd: ev.n.bd, lyric: ev.n.lyric } : { ...ev.hum, lyric: melody.hasLyrics ? '우' : null };
      for (const r of roles) out[r].push({ ...base, midi: v[r] });
    }

    const label = { alto: '알토', tenor: '테너', bass: '베이스' };
    return roles.map(r => ({
      name: `자동 화음 · ${label[r]}`,
      notes: mergeRepeats(out[r], melody.hasLyrics),
      hasLyrics: melody.hasLyrics,
      auto: true,
    }));
  }

  // 가사가 없으면 같은 음이 이어질 때 하나로 길게 부른다
  function mergeRepeats(notes, hasLyrics) {
    if (hasLyrics) return notes;
    const out = [];
    for (const n of notes) {
      const last = out[out.length - 1];
      if (last && last.midi === n.midi && Math.abs(last.t + last.d - n.t) < 1e-3 && beatStrength(n.b) < 0.5) {
        last.d += n.d; last.bd += n.bd;
      } else out.push({ ...n });
    }
    return out;
  }

  W.Harmony = { harmonize, estimateKey, parseChord };
})(window);
