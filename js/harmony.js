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

  function chordTonesIn(lo, hi, pcs) {
    const out = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
    return out;
  }
  const mod12 = x => ((x % 12) + 12) % 12;

  // ---------- 코드 기호 ----------
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function notePc(s) {
    let pc = PC[s[0].toUpperCase()];
    for (const c of s.slice(1)) pc += c === '#' || c === '♯' ? 1 : c === 'b' || c === '♭' ? -1 : 0;
    return mod12(pc);
  }

  // 구성음(근음 기준 반음)으로 화음 정보 만들기
  function chordInfo(root, iv, bass, sym) {
    const has = x => iv.includes(x);
    const third = has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : has(2) ? 2 : null;
    const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : null;
    const seventh = has(11) ? 11 : has(10) ? 10 : (has(9) && fifth === 6 && third === 3) ? 9 : null;
    const tens = iv.filter(x => x !== 0 && x !== third && x !== fifth && x !== seventh);
    const pc = x => (x == null ? null : mod12(root + x));
    return {
      sym, root, bass: bass == null ? root : bass,
      third: pc(third), fifth: pc(fifth), seventh: pc(seventh), tensions: tens.map(pc),
      pcs: iv.map(pc),
      dominant: third === 4 && seventh === 10,
      quality: third === 3 ? (fifth === 6 ? 'dim' : 'min') : third === 4 ? (fifth === 8 ? 'aug' : 'maj') : 'sus',
    };
  }

  /** "Ebmaj7", "Bbm7", "Ab(add2)", "Bmaj7/Db", "D#m7(b5)" ... → 화음 정보 */
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
    return chordInfo(root, iv, m[4] ? notePc(m[4]) : null, sym);
  }

  function chordAt(chords, b) {
    let lo = 0, hi = chords.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (chords[mid].b <= b + 1e-6) { ans = chords[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  // ---------- 화음 스타일 ----------
  // classic: 4성부 합창 (3화음 중심, 화성학 규칙 엄격)
  // jazz:    7음·9음을 넣은 촘촘한 화음 (평행 진행 허용)
  // acappella: 선율은 그대로, 알토·테너는 "우~" 화음을 길게, 베이스는 "둠 둠"
  const STYLES = {
    classic:   { parallel: 10, missing7: 3, rootless: 2, close: 0, tension: 1.2, inversion: true },
    jazz:      { parallel: 1.5, missing7: 5, rootless: 0.5, close: 3, tension: -0.6, inversion: false, add7: true },
    acappella: { parallel: 6, missing7: 2.5, rootless: 1.5, close: 1, tension: 0.8, inversion: false },
  };
  const RANGE = { a: [53, 74], t: [50, 69], b: [43, 62] };
  const COMFORT = { a: [57, 71], t: [52, 66], b: [45, 57] };

  // 재즈 스타일이면 3화음에 7음(또는 6음)과 9음을 보탠다
  function extendForStyle(info, st) {
    if (!st.add7 || !info) return info;
    let seventh = info.seventh, tensions = info.tensions.slice();
    if (seventh == null && info.third != null) {
      if (info.quality === 'min') seventh = mod12(info.root + 10);
      else if (info.quality === 'maj') seventh = mod12(info.root + 9); // 6음
      else if (info.quality === 'dim') seventh = mod12(info.root + 9);
    }
    if (info.quality !== 'dim' && !tensions.includes(mod12(info.root + 2))) tensions.push(mod12(info.root + 2));
    const pcs = [...new Set([...info.pcs, seventh, ...tensions].filter(x => x != null))];
    return { ...info, seventh, tensions, pcs };
  }

  // 한 순간의 화음(선율 m 은 고정, 없으면 null)에 대해 가능한 [알토, 테너, 베이스] 후보와 점수
  function voicings(info, m, st, keep) {
    const allowed = info.pcs;
    const required = [info.third, info.seventh].filter(x => x != null);
    const basses = [];
    const bassPcs = [[info.bass, 0]];
    if (info.bass === info.root && st.inversion && info.third != null) bassPcs.push([info.third, 2.2]);
    for (const [pc, cost] of bassPcs) for (const x of chordTonesIn(RANGE.b[0], RANGE.b[1], [pc])) basses.push([x, cost]);
    const top = m != null ? m : RANGE.a[1];
    let A = chordTonesIn(RANGE.a[0], Math.min(RANGE.a[1], top), allowed);
    if (!A.length && m != null) A = chordTonesIn(m + 1, m + 9, allowed); // 선율이 아주 낮으면 위로
    const T = chordTonesIn(RANGE.t[0], RANGE.t[1], allowed);
    const out = [];
    for (const a of A) for (const t of T) {
      if (t > a) continue;
      for (const [b, bcost] of basses) {
        if (b >= t) continue;
        let c = bcost;
        const voices = m != null ? [m, a, t, b] : [a, t, b];
        const pcsUsed = voices.map(mod12);
        const count = pc => pcsUsed.filter(x => x === pc).length;
        for (const r of required) if (!count(r)) c += r === info.third ? 8 : st.missing7;
        if (!count(info.root)) c += st.rootless;
        if (info.fifth != null && !count(info.fifth) && !info.seventh) c += 0.4;
        // 겹침(중복) 규칙
        if (info.third != null && count(info.third) > 1) c += 2.2;
        if (info.seventh != null && count(info.seventh) > 1) c += 5;
        for (const tn of info.tensions) {
          const k = count(tn);
          if (k) c += st.tension;
          if (k > 1) c += 3;
        }
        // 간격과 겹치기
        if (m != null) {
          if (m - a > 12) c += 4;
          if (a > m) c += 6;
          if (a === m) c += 3;
        }
        if (a - t > 12) c += 4;
        if (a === t) c += 3;
        if (t - b > 19) c += 1.5;
        if (b < 50 && t - b < 7) c += 2;          // 낮은 곳에서 촘촘하면 탁해진다
        if (st.close && (m != null ? m : a) - t > 12) c += st.close;
        // 편한 음역
        const comfort = (x, [lo, hi]) => (x < lo ? lo - x : x > hi ? x - hi : 0) * 0.35;
        c += comfort(a, COMFORT.a) + comfort(t, COMFORT.t) + comfort(b, COMFORT.b);
        out.push({ a, t, b, c });
      }
    }
    if (!out.length) {
      const a = (m != null ? m : 64) - 4, t = a - 5, b = chordTonesIn(RANGE.b[0], RANGE.b[1], [info.bass])[0] || 48;
      out.push({ a, t, b, c: 20 });
    }
    out.sort((x, y) => x.c - y.c);
    return out.slice(0, keep);
  }

  // 앞 화음 → 다음 화음으로 넘어가는 비용 (성부 진행)
  function moveCost(p, q, pm, qm, pInfo, qInfo, st) {
    const dA = q.a - p.a, dT = q.t - p.t, dB = q.b - p.b;
    let c = Math.abs(dA) * 0.5 + Math.abs(dT) * 0.5 + Math.abs(dB) * 0.15;
    if (Math.abs(dA) > 5) c += (Math.abs(dA) - 5) * 0.6;
    if (Math.abs(dT) > 5) c += (Math.abs(dT) - 5) * 0.6;
    if (Math.abs(dB) > 12) c += 2;
    // 성부 겹침(overlap)
    if (q.a < p.t || q.t > p.a || q.t < p.b || q.b > p.t) c += 1;
    // 병행 5도·8도
    const P = pm != null && qm != null ? [[pm, qm], [p.a, q.a], [p.t, q.t], [p.b, q.b]] : [[p.a, q.a], [p.t, q.t], [p.b, q.b]];
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const [x0, x1] = P[i], [y0, y1] = P[j];
      if (x0 === x1 || y0 === y1) continue;
      if (Math.sign(x1 - x0) !== Math.sign(y1 - y0)) continue;
      const i0 = mod12(x0 - y0), i1 = mod12(x1 - y1);
      if (i0 === i1 && (i0 === 0 || i0 === 7)) c += st.parallel;
    }
    // 바깥 성부의 숨은 8도·5도 (선율이 도약하며 같은 방향)
    if (pm != null && qm != null && Math.abs(qm - pm) > 2 && Math.sign(qm - pm) === Math.sign(dB) && dB !== 0) {
      const iv = mod12(qm - q.b);
      if (iv === 0 || iv === 7) c += st.parallel * 0.2;
    }
    // 딸림7화음의 이끎음은 올라가고, 7음은 내려간다
    if (pInfo && qInfo && pInfo !== qInfo && pInfo.dominant && mod12(qInfo.root - pInfo.root) === 5) {
      for (const [x0, x1] of [[p.a, q.a], [p.t, q.t]]) {
        if (mod12(x0) === pInfo.third && x1 - x0 !== 1) c += 1.5;
        if (mod12(x0) === pInfo.seventh && !(x1 - x0 === -1 || x1 - x0 === -2)) c += 2;
      }
    }
    return c;
  }

  // 동적 계획법으로 노래 전체에서 가장 자연스러운 성부 진행 찾기
  function voiceLead(events, st) {
    const K = 26;
    const memo = new Map();
    const cands = events.map(ev => {
      const key = ev.info.pcs.join(',') + '/' + ev.info.bass + '/' + ev.m;
      if (!memo.has(key)) memo.set(key, voicings(ev.info, ev.m, st, K));
      return memo.get(key);
    });
    const N = events.length;
    const score = [], back = [];
    for (let i = 0; i < N; i++) {
      score.push(new Float64Array(cands[i].length));
      back.push(new Int32Array(cands[i].length));
      for (let k = 0; k < cands[i].length; k++) {
        const q = cands[i][k];
        if (i === 0) { score[i][k] = q.c; back[i][k] = -1; continue; }
        let best = Infinity, arg = 0;
        // 오래 쉬었다 다시 시작하면 앞 화음과의 연결은 약하게 본다
        const w = events[i].b - (events[i - 1].b + events[i - 1].bd) > 3 ? 0.3 : 1;
        for (let j = 0; j < cands[i - 1].length; j++) {
          const v = score[i - 1][j] + w * moveCost(cands[i - 1][j], q, events[i - 1].m, events[i].m, events[i - 1].info, events[i].info, st);
          if (v < best) { best = v; arg = j; }
        }
        score[i][k] = best + q.c;
        back[i][k] = arg;
      }
    }
    const res = new Array(N);
    let k = 0;
    for (let j = 1; j < cands[N - 1].length; j++) if (score[N - 1][j] < score[N - 1][k]) k = j;
    for (let i = N - 1; i >= 0; i--) { res[i] = cands[i][k]; k = back[i][k]; }
    return res;
  }

  // 같은 화음이 이어지는 구간으로 묶은 코드 진행 (반주와 아카펠라에 씀)
  function chordTimeline(notes, perNote, given) {
    if (given.length) return given.map(c => ({ b: c.b, bd: c.bd, info: c.info }));
    const out = [];
    notes.forEach((n, i) => {
      const last = out[out.length - 1];
      if (last && last.info === perNote[i]) return;
      if (last) last.bd = n.b - last.b;
      out.push({ b: n.b, bd: n.bd, info: perNote[i] });
    });
    if (out.length) {
      const lastNote = notes[notes.length - 1];
      out[out.length - 1].bd = lastNote.b + lastNote.bd - out[out.length - 1].b;
    }
    return out.filter(c => c.bd > 0);
  }

  /** 선율 음마다의 화음과 코드 진행: 악보에 코드가 있으면 그대로, 없으면 조성을 추정해서 고른다 */
  function analyzeChords(notes, keyHint, chords) {
    const given = (chords || []).map(c => ({ ...c, info: parseChord(c.sym) })).filter(c => c.info).sort((a, b) => a.b - b.b);
    let perNote;
    if (given.length) {
      perNote = notes.map(n => (chordAt(given, n.b) || given[0]).info);
    } else {
      const key = estimateKey(notes, keyHint);
      const cache = {};
      perNote = chooseChords(notes, key).map(ch => {
        if (!cache[ch.name]) {
          const root = mod12(ch.root + key.tonic);
          cache[ch.name] = chordInfo(root, ch.tones.map(t => mod12(t - ch.root)), null, ch.name);
        }
        return cache[ch.name];
      });
    }
    return { given, perNote, timeline: notes.length ? chordTimeline(notes, perNote, given) : [] };
  }

  /**
   * @param melody   선율 라인
   * @param count    만들 성부 수 (1~3)
   * @param keyHint  MusicXML 조표 정보
   * @param opts     {chords: [{b, bd, sym}], beatToSec: fn, style: 'classic'|'jazz'|'acappella'}
   * @returns {{lines, chords}}  chords = 코드 진행 [{b, bd, info}]
   */
  function harmonize(melody, count, keyHint, opts) {
    const notes = melody.notes;
    opts = opts || {};
    if (!notes.length || count < 1) return { lines: [], chords: [] };
    const style = STYLES[opts.style] ? opts.style : 'classic';
    const st = STYLES[style];
    const { given, perNote, timeline } = analyzeChords(notes, keyHint, opts.chords);
    const toSec = opts.beatToSec || (b => {
      // 박 → 초: 선율 음표에서 선형 보간
      const n = notes.find(x => x.b >= b) || notes[notes.length - 1];
      return n.t + (b - n.b) * (n.d / Math.max(n.bd, 1e-6));
    });
    const roles = count === 1 ? ['a'] : count === 2 ? ['a', 'b'] : ['a', 't', 'b'];
    const out = { a: [], t: [], b: [] };
    const backingLyric = (txt) => (melody.hasLyrics ? txt : null);

    if (style === 'acappella') {
      // 화음 구간마다 알토·테너는 길게 "우~", 베이스는 박마다 "둠"
      const compound = timeline.length > 2 && timeline.every(c => Math.abs(c.b / 1.5 - Math.round(c.b / 1.5)) < 1e-3) &&
        timeline.some(c => Math.abs(c.b - Math.round(c.b)) > 1e-3);
      const pulse = compound ? 1.5 : 1;
      const melodyTop = (s, e) => {
        let top = null;
        for (const n of notes) if (n.b < e && n.b + n.bd > s) top = top == null ? n.midi : Math.max(top, n.midi);
        return top;
      };
      const evs = timeline.map(c => ({ b: c.b, bd: c.bd, info: extendForStyle(c.info, st), m: melodyTop(c.b, c.b + c.bd) }));
      const v = voiceLead(evs, st);
      evs.forEach((ev, i) => {
        const len = Math.max(0.25, ev.bd - 0.12);
        const mk = (midi, b, bd, lyric) => ({ t: toSec(b), d: toSec(b + bd) - toSec(b), b, bd, midi, lyric });
        out.a.push(mk(v[i].a, ev.b, len, backingLyric('우')));
        out.t.push(mk(v[i].t, ev.b, len, backingLyric('우')));
        const fifthPc = ev.info.fifth;
        const fifth = fifthPc == null ? null : chordTonesIn(Math.max(RANGE.b[0], v[i].b - 7), Math.min(RANGE.b[1], v[i].b + 7), [fifthPc])
          .sort((x, y) => Math.abs(x - v[i].b) - Math.abs(y - v[i].b))[0];
        for (let k = 0, b = ev.b; b < ev.b + ev.bd - 1e-6; b += pulse, k++) {
          const dur = Math.min(pulse, ev.b + ev.bd - b) * 0.55;
          const midi = k % 2 === 1 && fifth != null ? fifth : v[i].b;
          out.b.push(mk(midi, b, dur, backingLyric('둠')));
        }
      });
    } else {
      // 선율과 같은 리듬·가사로 부르는 화음 (클래식 / 재즈)
      const evs = notes.map((n, i) => ({ b: n.b, bd: n.bd, n, info: extendForStyle(perNote[i], st), m: n.midi }));
      // 선율이 한 마디 이상 쉬면 그동안 코드를 "우~" 하고 허밍 (코드 진행을 아는 경우)
      if (given.length) {
        let cursor = 0;
        const gaps = [];
        const songEnd = timeline[timeline.length - 1].b + timeline[timeline.length - 1].bd;
        for (const n of notes.concat([{ b: Infinity }])) {
          const gapEnd = Math.min(n.b, songEnd);
          if (gapEnd - cursor >= 3) gaps.push([cursor, gapEnd]);
          if (n.b === Infinity) break;
          cursor = Math.max(cursor, n.b + n.bd);
        }
        for (const [gs, ge] of gaps) for (const c of timeline) {
          const s = Math.max(c.b, gs), e = Math.min(c.b + c.bd, ge);
          if (e - s < 0.7) continue;
          evs.push({ b: s, bd: e - 0.15 - s, hum: true, info: extendForStyle(c.info, st), m: null });
        }
        evs.sort((x, y) => x.b - y.b);
      }
      const v = voiceLead(evs, st);
      evs.forEach((ev, i) => {
        const base = ev.n
          ? { t: ev.n.t, d: ev.n.d, b: ev.n.b, bd: ev.n.bd, lyric: ev.n.lyric }
          : { t: toSec(ev.b), d: toSec(ev.b + ev.bd) - toSec(ev.b), b: ev.b, bd: ev.bd, lyric: backingLyric('우') };
        for (const r of ['a', 't', 'b']) out[r].push({ ...base, midi: v[i][r] });
      });
    }

    const label = { a: '알토', t: '테너', b: '베이스' };
    const lines = roles.map(r => ({
      name: `자동 화음 · ${label[r]}`,
      notes: mergeRepeats(out[r], melody.hasLyrics),
      hasLyrics: melody.hasLyrics,
      auto: true,
      backing: style === 'acappella',
    }));
    return { lines, chords: timeline };
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

  W.Harmony = { harmonize, estimateKey, parseChord, STYLES: Object.keys(STYLES), chordProgression: (melody, keyHint, chords) => analyzeChords(melody.notes, keyHint, chords).timeline };
})(window);
