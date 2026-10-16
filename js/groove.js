// 재즈 편곡 그루브: 스윙 · 보사노바 · 재즈 발라드
// 1) 노래하는 동물들의 리듬을 장르에 맞게 비튼다 (박의 경계는 그대로 두고 박 "안"의 위치만 옮겨서 곡 길이는 같다)
// 2) 같은 시간 지도로 드럼·베이스·피아노(기타) 밴드를 만들어 Web Audio 로 바로 합성한다 (샘플 없음)
(function (W) {
  'use strict';
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const mod12 = x => ((x % 12) + 12) % 12;
  const EPS = 1e-6;

  const LIST = [
    { id: 'original', label: '원곡', desc: '악보 리듬 그대로' },
    { id: 'swing', label: '스윙', desc: '통통 튀는 리듬, 걸어가는 베이스' },
    { id: 'bossa', label: '보사노바', desc: '살랑이는 기타와 바닷가 리듬' },
    { id: 'ballad', label: '재즈 발라드', desc: '브러시 드럼에 잔잔한 피아노' },
  ];
  const BAND = { swing: true, bossa: true, ballad: true };
  // 보사노바 클라베: 4/4 두 마디(8분음표 16개) 중 기타·림이 치는 자리
  const BOSSA_CLAVE = [0, 3, 6, 10, 13];

  // ---------- 박자 ----------
  // 6/8·9/8·12/8 처럼 점4분음표가 한 박인 겹박자
  function isCompound(meter) {
    return !!meter && meter.den === 8 && meter.num % 3 === 0 && meter.num > 3;
  }
  // 한 박의 길이 U(4분음표 단위)와 마디당 박 수
  function grid(meter) {
    const compound = isCompound(meter);
    let perBar = 4;
    if (compound) perBar = meter.num / 3;
    else if (meter && meter.num > 0 && meter.den > 0) perBar = Math.round(meter.num * 4 / meter.den);
    if (!(perBar >= 1)) perBar = 4;
    return { compound, U: compound ? 1.5 : 1, perBar };
  }

  // ---------- 시간 비틀기 ----------
  // 한 박 안의 위치 f(0~1)를 옮기는 꺾은선 g. null 이면 그대로(항등)
  function shapeOf(id, compound) {
    // 스윙: 곧은 8분음표 둘(0, 0.5)을 셋잇단 "길게-짧게"(0, 2/3)로
    if (id === 'swing' && !compound) return [[0, 0], [0.5, 2 / 3], [1, 1]];
    // 6/8 보사노바: 한 박의 8분음표 셋을 16분음표 3+3+2(트레실로)로
    if (id === 'bossa' && compound) return [[0, 0], [1 / 3, 0.375], [2 / 3, 0.75], [1, 1]];
    // 6/8 스윙은 이미 셋잇단(셔플) 느낌이고, 4/4 보사노바·발라드는 곧은 리듬 그대로 부른다
    return null;
  }
  function bend(pts, f) {
    if (!pts) return f;
    for (let i = 1; i < pts.length; i++) {
      const x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
      if (f <= x1 || i === pts.length - 1) return y0 + (f - x0) * (y1 - y0) / (x1 - x0);
    }
    return f;
  }
  // 박 위치 → [몇 번째 박, 박 안의 위치]. 소수 오차로 박 경계 바로 앞에 걸리면 다음 박 첫머리로 붙인다
  function split(b, U) {
    const k = Math.floor(b / U + 1e-9);
    const f = (b - k * U) / U;
    return [k, f < 0 ? 0 : f > 1 ? 1 : f];
  }

  /** 원래 박(4분음표 단위) → 편곡된 리듬에서의 초. 박 경계는 beatToSec 그대로, 박 안은 g 로 비틀어 선형 보간 */
  function warpBeat(id, meter, beatToSec) {
    const { U, compound } = grid(meter);
    const pts = shapeOf(id, compound);
    const memo = new Map();
    const edge = k => {
      let s = memo.get(k);
      if (s === undefined) { s = beatToSec(k * U); memo.set(k, s); }
      return s;
    };
    return b => {
      const [k, f] = split(b, U);
      const s0 = edge(k);
      return s0 + bend(pts, f) * (edge(k + 1) - s0);
    };
  }

  /** 파트 하나의 음표 시각을 편곡 리듬에 맞게 다시 계산한 새 파트 (원곡이면 그대로) */
  function retimeLine(line, id, meter, beatToSec) {
    if (!line || !BAND[id] || typeof beatToSec !== 'function' || !Array.isArray(line.notes)) return line;
    const w = warpBeat(id, meter, beatToSec);
    const notes = line.notes.map(n => {
      if (!Number.isFinite(n.b)) return { ...n };
      const t = w(n.b);
      return { ...n, t, d: w(n.b + Math.max(0, n.bd || 0)) - t };
    });
    // 너무 짧아져 소리가 안 나는 음은 조금 늘리되, 다음 음 시작은 넘지 않게 (단선율이라 겹치면 안 된다)
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], nx = notes[i + 1];
      let d = Math.max(0.05, Number.isFinite(n.d) ? n.d : 0);
      if (nx && nx.t > n.t && n.t + d > nx.t) d = nx.t - n.t;
      n.d = d;
    }
    return { ...line, notes };
  }

  // ---------- 화음 쌓기 ----------
  // 근음을 뺀(rootless) 재즈 보이싱의 음이름들. 아래에서 위 순서가 기본 자리
  function shapePcs(info, flip) {
    const P = x => mod12(info.root + x);
    const q = info.quality;
    const third = info.third != null ? info.third : P(q === 'min' || q === 'dim' ? 3 : 4);
    const has = pc => (info.pcs || []).includes(pc) || (info.tensions || []).includes(pc);
    let pcs;
    if (info.dominant) {
      // 딸림7화음은 두 모양을 번갈아: 3-b7-13 / b7-3-9 (윗소리가 반음·온음으로 이어지게)
      pcs = flip ? [info.seventh, third, P(2)] : [third, info.seventh, P(9)];
    } else if (q === 'min') {
      pcs = [third, info.seventh != null ? info.seventh : has(P(9)) ? P(9) : P(10), P(2)];
    } else if (q === 'dim') {
      pcs = [third, info.fifth != null ? info.fifth : P(6), info.seventh != null ? info.seventh : P(9)];
    } else if (q === 'sus') {
      pcs = [third, info.seventh != null ? info.seventh : P(10), P(2)];
    } else if (q === 'aug') {
      pcs = [third, info.fifth != null ? info.fifth : P(8), info.seventh != null ? info.seventh : P(2)];
    } else {
      // 장화음: 7음이 없으면 6음으로 (재즈에서 흔한 C6 소리)
      pcs = [third, info.seventh != null ? info.seventh : P(9), P(2)];
    }
    const out = [];
    for (const pc of pcs.concat([info.fifth, info.root])) {
      if (out.length >= 3) break;
      if (pc != null && !out.includes(pc)) out.push(pc);
    }
    return out;
  }

  // 세 음을 어떤 순서로 쌓을지(자리바꿈) 중에서 앞 보이싱과 가장 적게 움직이는 것 (MIDI 57~72 근처, 맨 윗음 74 이하)
  // 정해 둔 순서만 돌리면 B3-F4-E5 처럼 벌어지는 모양이 나와서, 가능한 순서를 모두 보고 너무 넓으면 벌점을 준다
  const ORDERS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
  function placeVoicing(pcs, prev) {
    let best = null, bestCost = Infinity;
    const n = pcs.length;
    ORDERS.forEach((ord, r) => {
      const seq = ord.map(i => pcs[i]);
      for (let lo = 53; lo <= 70; lo++) {
        if (mod12(lo) !== seq[0]) continue;
        const v = [lo];
        for (let i = 1; i < n; i++) {
          let x = v[i - 1] + 1;
          while (mod12(x) !== seq[i]) x++;
          v.push(x);
        }
        const top = v[n - 1];
        if (top > 74) continue;
        const span = top - lo;
        let cost = (lo < 57 ? (57 - lo) * 1.5 : 0) + (top > 72 ? (top - 72) * 1.5 : 0) + (span > 12 ? (span - 12) * 1.5 : 0);
        const mid = (lo + top) / 2;
        if (prev && prev.length === n) {
          for (let i = 0; i < n; i++) cost += Math.abs(v[i] - prev[i]);
          cost += 0.15 * Math.abs(mid - 64);   // 조금씩 위아래로 흘러가 버리지 않게
        } else cost += Math.abs(mid - 64) + span * 0.2 + r * 0.1;
        if (cost < bestCost) { bestCost = cost; best = v; }
      }
    });
    return best || [60, 64, 67];
  }

  // 베이스 음역(36~52) 안에서 이 음이름의 후보들
  function bassCands(pc, lo, hi) {
    const out = [];
    for (let m = lo; m <= hi; m++) if (mod12(m) === pc) out.push(m);
    return out;
  }
  function pickNear(cands, prev, center) {
    let best = cands[0], bc = Infinity;
    for (const m of cands) {
      const c = Math.abs(m - prev) + 0.3 * Math.abs(m - center);
      if (c < bc) { bc = c; best = m; }
    }
    return best;
  }

  // ---------- 밴드 악보 ----------
  /**
   * 밴드 연주 목록
   * @param id     'swing' | 'bossa' | 'ballad' ('original' 이면 빈 목록)
   * @param chords [{b, bd, info}] 원래 박 기준 코드 진행
   * @param meter  {num, den}
   * @returns [{b, dur, kind, midi?, midis?, vel, inst?, roll?}]
   *   b·dur 은 원래 4분음표 단위이고, 박 안에서는 실제 시간에 비례하는 위치다 (스윙의 "and"는 박 + 2/3)
   */
  function plan(id, chords, meter) {
    if (!BAND[id] || !Array.isArray(chords)) return [];
    const G = grid(meter);
    const { U, compound } = G;
    const pts = shapeOf(id, compound);
    // 코드도 노래와 같은 비틀기를 거쳐야 엇박에 바뀌는 코드가 노래와 같은 순간에 바뀐다
    const pos = b => { const [k, f] = split(b, U); return k * U + bend(pts, f) * U; };
    const tl = chords.filter(c => c && c.info && Number.isFinite(c.b) && c.bd > 0)
      .map(c => ({ s: pos(c.b), e: pos(c.b + c.bd), info: c.info }))
      .sort((a, b) => a.s - b.s);
    if (!tl.length) return [];

    // 6/8 보사노바는 점4분음표 한 박을 밴드의 2분음표로 여긴다 → 6/8 한 마디 = 밴드의 4/4 한 마디
    const half = id === 'bossa' && compound;
    const UB = half ? U / 2 : U;
    const perBar = half ? G.perBar * 2 : G.perBar;
    const barLen = perBar * UB;
    const songStart = tl[0].s;
    let songEnd = 0;
    for (const c of tl) songEnd = Math.max(songEnd, c.e);

    // 이 위치에서 울리는 코드 번호 (없으면 -1)
    function idxAt(x) {
      let lo = 0, hi = tl.length - 1, ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (tl[mid].s <= x + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return ans >= 0 && x < tl[ans].e - EPS ? ans : -1;
    }
    const bassPc = i => (tl[i].info.bass != null ? tl[i].info.bass : tl[i].info.root);

    const drums = [], slots = [], hits = [], thumbs = [];
    const drum = (kind, x, vel) => drums.push({ b: x, dur: 0.25 * UB, kind, vel });
    const firstBar = Math.floor((songStart + EPS) / barLen);
    let pushed = false, bossaBar = 0;
    for (let m = firstBar; m * barLen < songEnd - EPS; m++) {
      const x0 = m * barLen;
      const nextBar = x0 + barLen;
      const ciNext = idxAt(nextBar + EPS);
      if (id === 'swing') {
        for (let j = 0; j < perBar; j++) {
          const x = x0 + j * UB;
          // 라이드: "칭- 치키 칭- 치키" (2·4박이 조금 세다), 하이햇 페달은 2·4박, 킥은 들릴락 말락 매 박
          drum('ride', x, j % 2 ? 0.7 : 0.55);
          if (compound) drum('ride', x + UB * 2 / 3, 0.4);         // 12/8 셔플: 각 박의 마지막 8분음표
          else if (j % 2) drum('ride', x + UB * 2 / 3, 0.42);       // 스윙된 2·4박의 "and"
          if (j % 2) drum('hat', x, 0.5);
          drum('kick', x, 0.2);
          // 걷는 베이스: 한 박에 한 음
          slots.push({ x, dur: 0.9 * UB, role: 'walk', down: j === 0, vel: j === 0 ? 0.9 : 0.78 });
        }
        if (compound) {
          // 2박마다 피아노가 "짝", 두 마디에 한 번은 다음 코드를 마지막 8분음표에 당겨 친다
          for (let j = 1; j < perBar; j += 2) hits.push({ x: x0 + j * UB, dur: 0.5 * UB, vel: 0.55 });
          if (m % 2 === 1 && ciNext >= 0 && ciNext !== idxAt(nextBar - UB / 3)) hits.push({ x: nextBar - UB / 3, dur: 0.6 * UB, vel: 0.55, ci: ciNext });
          pushed = false;
        } else {
          // 찰스턴 리듬: 1박(짧게) + 2박의 스윙 "and". 네 마디마다 변주하고 다음 코드를 당겨 친다
          const v = (m - firstBar) % 4;
          const pat = v === 3 && perBar >= 4
            ? [[0, 0.5, 0.6], [2 + 2 / 3, 0.3, 0.5]]
            : [[0, 0.5, 0.62], [1 + 2 / 3, 0.6, 0.55]];
          for (const [p, d, vel] of pat) {
            if (p >= perBar - EPS || (p === 0 && pushed)) continue;
            hits.push({ x: x0 + p * UB, dur: d * UB, vel });
          }
          pushed = false;
          if (v === 3 && perBar >= 3 && ciNext >= 0) {
            hits.push({ x: nextBar - UB / 3, dur: 0.9 * UB, vel: 0.6, ci: ciNext });
            pushed = true;
          }
        }
      } else if (id === 'bossa') {
        // 패턴은 4/4 한 마디 단위로 생각한다. 12/8 처럼 긴 마디는 4박씩 나눠서, 3/4 처럼 짧으면 넘치는 자리는 버린다
        for (let sx = x0; sx < nextBar - EPS; sx += 4 * UB) {
          const len = Math.min(4, Math.round((nextBar - sx) / UB));
          const sEnd = sx + len * UB;
          const ciEnd = idxAt(sEnd + EPS);
          const side = bossaBar++ % 2;
          // 두 마디(8분음표 16개) 패턴: 기타·림은 보사노바 클라베 자리, 셰이커는 8분음표마다(엇박 강조)
          for (let e = 0; e < len * 2; e++) {
            const x = sx + e * UB / 2;
            drum('shaker', x, e % 2 ? 0.55 : 0.3);
            if (BOSSA_CLAVE.includes(side * 8 + e)) {
              drum('rim', x, 0.5);
              hits.push({ x, dur: 0.4 * UB, vel: 0.55, inst: 'guitar' });
            }
          }
          // 킥 "쿵-쿵 쿵-쿵" 심장 박동
          for (const [p, vel] of [[0, 0.55], [1.5, 0.3], [2, 0.5], [3.5, 0.3]]) if (p < len - EPS) drum('kick', sx + p * UB, vel);
          // 베이스: 1박 근음, 3박 5음, 코드가 바뀌면 4박 "and"에 다음 근음을 미리
          slots.push({ x: sx, dur: 1.5 * UB, role: 'root', vel: 0.9 });
          if (len > 2) slots.push({ x: sx + 2 * UB, dur: 1.5 * UB, role: 'fifthOrRoot', vel: 0.8 });
          if (len >= 2 && ciEnd >= 0 && ciEnd !== idxAt(sEnd - UB / 2)) {
            slots.push({ x: sEnd - UB / 2, dur: 0.5 * UB, role: 'root', vel: 0.75, ci: ciEnd });
          }
          // 기타 엄지: 1·3박에 낮은 음
          thumbs.push({ x: sx, dur: 0.9 * UB, root: true });
          if (len > 2) thumbs.push({ x: sx + 2 * UB, dur: 0.9 * UB, root: false });
        }
      } else if (id === 'ballad') {
        // 브러시로 매 박 "쉭", 2·4박(겹박자는 2박)에 "탁"
        for (let j = 0; j < perBar; j++) {
          const x = x0 + j * UB;
          drum('brush', x, j === 0 ? 0.45 : 0.35);
          if (j % 2) drum('snare', x, 0.45);
        }
        // 베이스는 2분음표 (겹박자는 한 박에 하나)
        const step = compound || perBar < 2 ? 1 : 2;
        for (let j = 0; j < perBar; j += step) {
          slots.push({ x: x0 + j * UB, dur: Math.min(step, perBar - j) * UB * 0.95, role: j === 0 ? 'root' : 'fifthOrRoot', vel: j === 0 ? 0.85 : 0.75 });
        }
        // 피아노: 마디 첫머리에 펼쳐 치고, 마디 가운데에서 살며시 다시
        hits.push({ x: x0, vel: 0.5, legato: true, roll: 0.035 });
        const mid = Math.floor(perBar / 2);
        if (mid >= 1) hits.push({ x: x0 + mid * UB, vel: 0.36, legato: true, roll: 0.035 });
      }
    }
    if (id === 'ballad') {
      // 코드가 바뀌는 곳마다 새로 펼쳐 치기 (같은 자리의 마디 첫머리 타건은 대신한다)
      for (const c of tl) {
        for (let i = hits.length - 1; i >= 0; i--) if (Math.abs(hits[i].x - c.s) < 0.1 * UB) hits.splice(i, 1);
        hits.push({ x: c.s, vel: 0.62, legato: true, roll: 0.035 });
      }
    }

    const out = [];
    // 드럼은 코드가 울리는 동안만 (코드 진행에 빈 곳이 있으면 같이 쉰다)
    for (const d of drums) if (d.b >= songStart - EPS && d.b < songEnd - EPS && idxAt(d.b) >= 0) out.push(d);

    // --- 베이스 ---
    // 코드가 바뀌었는데 근처에 베이스 음이 없으면 근음을 하나 넣는다 (마디 중간에 바뀌는 코드)
    for (const s of slots) if (s.ci == null) s.ci = idxAt(s.x);
    tl.forEach((c, i) => {
      if (c.s < songStart - EPS) return;
      if (slots.some(s => s.ci === i && s.x >= c.s - 0.6 * UB && s.x <= c.s + 0.55 * UB)) return;
      slots.push({ x: c.s, dur: 0.9 * UB, role: 'root', vel: 0.85, ci: i });
    });
    const bs = slots.filter(s => s.ci >= 0 && s.x >= songStart - EPS && s.x < songEnd - EPS).sort((a, b) => a.x - b.x);
    let prev = 43, prev2 = 43, target = null, lastCi = -1;
    for (let k = 0; k < bs.length; k++) {
      const s = bs[k], ci = s.ci, info = tl[ci].info;
      const root = bassPc(ci);
      const changed = ci !== lastCi;
      let role = s.role;
      if (role === 'walk') {
        if (changed || s.down) role = 'root';
        else {
          const nx = bs[k + 1];
          role = nx && nx.ci !== ci && bassPc(nx.ci) !== root ? 'approach' : 'tone';
        }
      } else if (role === 'fifthOrRoot') role = changed ? 'root' : 'fifth';
      let midi;
      if (role === 'root') {
        midi = target != null && mod12(target) === root ? target : pickNear(bassCands(root, 36, 52), prev, 43);
      } else if (role === 'fifth') {
        // 5음은 근음 아래쪽이 보사노바·발라드다운 소리 (음역을 벗어나면 위로)
        const f = info.fifth != null ? info.fifth : mod12(info.root + 7);
        const below = prev - mod12(prev - f) - (mod12(prev - f) === 0 ? 12 : 0);
        midi = below >= 36 ? below : pickNear(bassCands(f, 36, 52), prev, 43);
      } else if (role === 'approach') {
        // 다음 코드 근음으로 반음 위·아래에서 미끄러져 들어가기
        const T = pickNear(bassCands(bassPc(bs[k + 1].ci), 37, 51), prev, 43);
        midi = prev < T ? T - 1 : T + 1;
        if (midi === prev) midi = prev < T ? T + 1 : T - 1;
        target = T;
      } else {
        // 걷는 베이스 가운데 박: 코드 구성음 중 가까운 음으로. 같은 음 반복·왔던 음으로 되돌아가기는 피하고,
        // 가던 방향을 이어 가면서 다음 코드 근음 쪽으로 걸어간다 (C-B-C-B 처럼 제자리걸음이 되지 않게)
        const pcs = [info.third, info.fifth, info.seventh, info.root].filter(x => x != null);
        let goal = null;
        for (let j = k + 1; j < bs.length && j <= k + 4; j++) {
          if (bs[j].ci !== ci) { goal = pickNear(bassCands(bassPc(bs[j].ci), 36, 52), prev, 43); break; }
        }
        const dir = Math.sign(prev - prev2);
        let best = null, bc = Infinity;
        for (const pc of pcs) for (const m of bassCands(pc, 36, 52)) {
          if (m === prev) continue;
          const d = Math.abs(m - prev);
          let c = d + (d > 7 ? (d - 7) * 2 : 0) + 0.25 * Math.abs(m - 44);
          if (goal != null) c += 0.35 * Math.abs(m - goal);
          if (m === prev2) c += 3;
          if (dir && Math.sign(m - prev) !== dir) c += 1.5;
          if (c < bc) { bc = c; best = m; }
        }
        midi = best != null ? best : prev;
      }
      if (role !== 'approach') target = null;
      const nx = bs[k + 1];
      let dur = s.dur;
      if (nx) dur = Math.min(dur, nx.x - s.x - 0.04 * UB);
      dur = Math.min(dur, Math.max(tl[ci].e, s.x + 0.25 * UB) - s.x);
      if (dur > 0.02) out.push({ b: s.x, dur, kind: 'bass', midi, vel: s.vel });
      prev2 = prev;
      prev = midi;
      lastCi = ci;
    }

    // --- 피아노 / 기타 ---
    // 코드마다 보이싱을 미리 정해 둔다: 앞 코드와 가장 적게 움직이게
    const V = [];
    let domCount = 0;
    tl.forEach((c, i) => {
      const flip = c.info.dominant ? (domCount++ % 2 === 1) : false;
      V.push(placeVoicing(shapePcs(c.info, flip), V[i - 1]));
    });
    const inst = id === 'bossa' ? 'guitar' : 'piano';
    for (const h of hits) if (h.ci == null) h.ci = idxAt(h.x);
    // 패턴이 놓친 코드 바뀜(마디 중간 등)은 그 자리에서 한 번 쳐 준다
    const win = id === 'swing' ? (compound ? [0.5, 1.05] : [0.5, 0.75]) : [0.55, 1.05];
    tl.forEach((c, i) => {
      if (c.s < songStart - EPS) return;
      if (hits.some(h => h.ci === i && h.x >= c.s - win[0] * UB && h.x <= c.s + win[1] * UB)) return;
      hits.push({ x: c.s, dur: 0.5 * UB, vel: 0.55, ci: i, legato: id === 'ballad', roll: id === 'ballad' ? 0.035 : 0 });
    });
    const hs = hits.filter(h => h.ci >= 0 && h.x >= songStart - EPS && h.x < songEnd - EPS).sort((a, b) => a.x - b.x);
    hs.forEach((h, k) => {
      const nx = hs[k + 1];
      const chordEnd = tl[h.ci].e;
      let dur = h.legato ? (nx ? nx.x - h.x : chordEnd - h.x) * 0.98 : h.dur;
      dur = Math.min(dur, chordEnd - h.x);
      if (dur <= 0.02) return;
      const ev = { b: h.x, dur, kind: 'comp', midis: V[h.ci].slice(), vel: h.vel, inst: h.inst || inst };
      ev.roll = h.roll != null ? h.roll : ev.inst === 'guitar' ? 0.012 : 0;
      out.push(ev);
    });
    // 기타 엄지 베이스 (보사노바)
    let thumbCi = -1;
    for (const th of thumbs) {
      const ci = idxAt(th.x);
      if (ci < 0 || th.x < songStart - EPS) continue;
      const info = tl[ci].info;
      const pc = th.root || ci !== thumbCi || info.fifth == null ? bassPc(ci) : info.fifth;
      thumbCi = ci;
      const dur = Math.min(th.dur, tl[ci].e - th.x);
      if (dur > 0.02) out.push({ b: th.x, dur, kind: 'comp', midis: [pickNear(bassCands(pc, 45, 56), 50, 50)], vel: 0.5, inst: 'guitar', roll: 0 });
    }

    return out.sort((a, b) => a.b - b.b);
  }

  // ---------- 소리 ----------
  // 하얀 잡음 (컨텍스트마다 한 번만 만든다)
  const NOISE = new WeakMap();
  const NOISE_LEN = 1.5;
  function noiseBuf(ctx) {
    let buf = NOISE.get(ctx);
    if (!buf) {
      const n = Math.floor(ctx.sampleRate * NOISE_LEN);
      buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      NOISE.set(ctx, buf);
    }
    return buf;
  }
  // 잡음의 아무 곳에서나 len 초만 재생 (같은 구간만 반복되면 기계 소리가 난다)
  function noise(ctx, t, len) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf(ctx);
    s.start(t, Math.random() * Math.max(0, NOISE_LEN - len - 0.01), len);
    return s;
  }
  function filt(ctx, type, f, q) {
    const b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }
  // 톡 치고 지수로 사라지는 엔벨로프
  function hitEnv(ctx, t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  function chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  }

  function kick(ctx, out, t, vel) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const g = hitEnv(ctx, t, 0.5 * vel, 0.004, 0.24);
    chain(o, g, out);
    o.start(t); o.stop(t + 0.3);
  }
  function rim(ctx, out, t, vel) {
    const n = noise(ctx, t, 0.06);
    const g = hitEnv(ctx, t, 1.4 * vel, 0.001, 0.035);
    chain(n, filt(ctx, 'bandpass', 1800, 3), g, out);
    // 나무를 두드린 듯한 아주 짧은 음
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1050;
    const g2 = hitEnv(ctx, t, 0.12 * vel, 0.001, 0.025);
    chain(o, g2, out);
    o.start(t); o.stop(t + 0.05);
  }
  // 발라드의 브러시 "탁" (스네어를 브러시로 친 소리)
  function snare(ctx, out, t, vel) {
    const n = noise(ctx, t, 0.2);
    const g = hitEnv(ctx, t, 0.5 * vel, 0.003, 0.15);
    chain(n, filt(ctx, 'bandpass', 2600, 0.8), g, out);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 190;
    const g2 = hitEnv(ctx, t, 0.1 * vel, 0.002, 0.06);
    chain(o, g2, out);
    o.start(t); o.stop(t + 0.1);
  }
  function hat(ctx, out, t, vel) {
    const n = noise(ctx, t, 0.06);
    const g = hitEnv(ctx, t, 0.3 * vel, 0.001, 0.04);
    chain(n, filt(ctx, 'highpass', 7000, 0.7), g, out);
  }
  function ride(ctx, out, t, vel) {
    const n = noise(ctx, t, 0.7);
    const g = hitEnv(ctx, t, 0.16 * vel, 0.002, 0.6);
    chain(n, filt(ctx, 'highpass', 5000, 0.6), g, out);
    // 배음이 어긋난 사인파 두 개로 "칭" 하는 금속성 울림
    for (const [f, a] of [[2380, 0.03], [3613, 0.022]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g2 = hitEnv(ctx, t, a * vel, 0.002, 0.5);
      chain(o, g2, out);
      o.start(t); o.stop(t + 0.55);
    }
  }
  // 브러시를 북 위로 쓸어 주는 "쉭" (서서히 커졌다 사라짐)
  function brush(ctx, out, t, vel) {
    const len = 0.24;
    const n = noise(ctx, t, len + 0.02);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + len * 0.55);
    g.gain.linearRampToValueAtTime(0, t + len);
    chain(n, filt(ctx, 'bandpass', 2200, 0.6), filt(ctx, 'lowpass', 5000, 0.5), g, out);
  }
  function shaker(ctx, out, t, vel) {
    const n = noise(ctx, t, 0.07);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, 0.28 * vel), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    chain(n, filt(ctx, 'bandpass', 6000, 1.4), g, out);
  }
  const DRUM = { kick, rim, snare, hat, ride, brush, shaker };

  // 콘트라베이스: 사인 + 약간의 삼각파 (작은 스피커에서도 들리게), 손가락으로 튕긴 듯 빨리 올라와 서서히 사라진다
  function bass(ctx, out, t, dur, f, vel) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sine'; o2.type = 'triangle';
    o1.frequency.value = f; o2.frequency.value = f;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(2400, f * 12), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(220, f * 4), t + 0.12);
    const g = ctx.createGain();
    const peak = 0.5 * vel;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.setTargetAtTime(0, t + 0.012, 0.34);
    g.gain.setTargetAtTime(0, t + dur, 0.045);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); chain(lp, g, out);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.35); o2.stop(t + dur + 0.35);
  }
  // 피아노 컴핑 (accomp.js 피아노와 같은 결, 조금 작게)
  function piano(ctx, out, t, dur, f, vel) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = f; o2.frequency.value = f * 2.001;
    const lp = filt(ctx, 'lowpass', Math.min(4500, f * 6), 0.3);
    const g = ctx.createGain(), g2 = ctx.createGain(); g2.gain.value = 0.22;
    const peak = 0.16 * vel;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(peak * 0.35, t + 0.01, 0.28);
    g.gain.setTargetAtTime(0, t + dur, 0.09);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); chain(lp, g, out);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
  }
  // 나일론 기타: 반주 기타보다 둥글게 (삼각파 중심 + 톱니파 조금, 필터가 빠르게 닫힌다)
  function guitar(ctx, out, t, dur, f, vel) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'triangle'; o2.type = 'sawtooth';
    o1.frequency.value = f; o2.frequency.value = f * 1.002;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(Math.min(5000, f * 7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(250, f * 1.6), t + 0.14);
    const g = ctx.createGain();
    const peak = 0.15 * vel;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.006, Math.min(0.45, dur * 0.6 + 0.08));
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); chain(lp, g, out);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
  }
  const COMP = { piano, guitar };

  // 음량 균형: 볼륨 1 에서 밴드 최고점이 0.35 아래, 베이스는 또렷하게, 드럼은 뒤에서 살짝
  const MIX = { master: 0.48, drums: 0.7, bass: 0.5, comp: 1 };

  function isOffline(ctx) {
    return (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) ||
      (typeof W.webkitOfflineAudioContext !== 'undefined' && ctx instanceof W.webkitOfflineAudioContext);
  }

  /**
   * 밴드 연주 시작
   * @param opts {id, chords, meter, beatToSec, offset, when, speed, transpose, volume}
   *   offset 초(곡 기준)가 ctx 시각 when 에 울린다. 곡의 s 초 → when + (s - offset) / speed
   * @returns {{stop()}} | null
   */
  function start(ctx, dest, opts) {
    const o = opts || {};
    if (!ctx || !BAND[o.id] || !Array.isArray(o.chords) || !o.chords.length || typeof o.beatToSec !== 'function') return null;
    const meter = o.meter || { num: 4, den: 4 };
    const evs = plan(o.id, o.chords, meter);
    if (!evs.length) return null;
    // 밴드 연주 위치는 이미 비튼 시간 좌표라서, 박 안에서는 그대로 선형으로 초를 구한다
    const sec = warpBeat('original', meter, o.beatToSec);
    const speed = o.speed > 0 ? o.speed : 1;
    const offset = Number.isFinite(o.offset) ? o.offset : 0;
    const when = Number.isFinite(o.when) ? o.when : ctx.currentTime;
    const transpose = Number.isFinite(o.transpose) ? o.transpose : 0;
    const volume = Number.isFinite(o.volume) ? Math.max(0, o.volume) : 0.9;
    const items = [];
    for (const e of evs) {
      const t = sec(e.b), te = sec(e.b + e.dur);
      if (!Number.isFinite(t) || !Number.isFinite(te) || !Number.isFinite(e.vel) || t < offset - 0.01) continue;
      items.push({ e, t, te });
    }
    items.sort((a, b) => a.t - b.t);

    const bus = ctx.createGain();
    bus.gain.value = volume * MIX.master;
    bus.connect(dest);
    const drumBus = ctx.createGain(); drumBus.gain.value = MIX.drums; drumBus.connect(bus);
    const bassBus = ctx.createGain(); bassBus.gain.value = MIX.bass; bassBus.connect(bus);
    const compBus = ctx.createGain(); compBus.gain.value = MIX.comp; compBus.connect(bus);

    const at = s => when + (s - offset) / speed;
    const offline = isOffline(ctx);
    let i = 0, timer = null, stopped = false;
    function play(it, t) {
      const e = it.e;
      const dur = Math.max(0.05, (it.te - it.t) / speed);
      const vel = Math.max(0, Math.min(1.2, e.vel));
      if (e.kind === 'bass') {
        const f = mtof(e.midi + transpose);
        if (Number.isFinite(f)) bass(ctx, bassBus, t, dur, f, vel);
      } else if (e.kind === 'comp') {
        const voice = COMP[e.inst] || piano;
        (e.midis || []).forEach((m, j) => {
          const f = mtof(m + transpose);
          if (Number.isFinite(f)) voice(ctx, compBus, t + j * (e.roll || 0), dur, f, vel);
        });
      } else if (DRUM[e.kind]) DRUM[e.kind](ctx, drumBus, t, vel);
    }
    // 실시간이면 1.2초 앞까지만 조금씩 예약하고, 오프라인(WAV 만들기)이면 한 번에 전부 예약한다
    function pump() {
      if (stopped) return;
      const horizon = offline ? Infinity : ctx.currentTime + 1.2;
      while (i < items.length && at(items[i].t) < horizon) {
        const it = items[i++];
        const t = at(it.t);
        if (!offline && t < ctx.currentTime - 0.02) continue;
        play(it, Math.max(0, t));
      }
      if (i >= items.length && timer) { clearInterval(timer); timer = null; }
    }
    pump();
    if (!offline && i < items.length) timer = setInterval(pump, 150);
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        if (timer) { clearInterval(timer); timer = null; }
        try {
          const now = ctx.currentTime;
          bus.gain.cancelScheduledValues(now);
          bus.gain.setValueAtTime(bus.gain.value, now);
          bus.gain.linearRampToValueAtTime(0, now + 0.06);
        } catch (e) { /* 이미 멈춤 */ }
        setTimeout(() => { try { bus.disconnect(); } catch (e) { /* 무시 */ } }, 250);
      },
    };
  }

  W.Groove = { LIST, isCompound, warpBeat, retimeLine, plan, start };
})(window);
