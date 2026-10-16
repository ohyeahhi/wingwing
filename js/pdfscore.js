// PDF 악보 읽기 (베타)
// 악보 프로그램(Sibelius·Finale·MuseScore·Dorico 등)이 저장한 PDF에는 음표가 "음악 글꼴의 글자"로,
// 오선·기둥·빔은 "선"으로 들어 있다. pdf.js로 그 위치를 읽어 음높이·리듬·가사·코드를 되살린다.
// 스캔한 종이 악보(그림)는 읽지 못한다.
(function (W) {
  'use strict';

  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let libPromise = null;
  function loadLib() {
    if (W.pdfjsLib) return Promise.resolve(W.pdfjsLib);
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CDN + 'pdf.min.js';
        s.onload = () => {
          if (!W.pdfjsLib) { reject(new Error('PDF 도구를 불러오지 못했어요.')); return; }
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.js';
          resolve(W.pdfjsLib);
        };
        s.onerror = () => { libPromise = null; reject(new Error('PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  // ---------- 음악 글꼴 ----------
  const MUSIC_FONT = /opus|helsinki|maestro|petrucci|engraver|jazz|inkpen|reprise|norfolk|pori|tamburo|sonata|bravura|leland|petaluma|finale|mscore|emmentaler|gonville|sebastian|leipzig|november|broadway|ash|golden/i;
  const NOT_MUSIC = /text|chord|lyric|title/i;
  // Sonata 호환 글꼴(Sibelius·Finale)과 SMuFL 글꼴(MuseScore·Dorico)의 글자 → 기호
  const GLYPH = {};
  const def = (chars, info) => { for (const ch of chars) GLYPH[ch] = info; };
  def('œ', { k: 'head', type: 'black' }); def('˙', { k: 'head', type: 'half' }); def('wW', { k: 'head', type: 'whole' });
  def('', { k: 'head', type: 'black' }); def('', { k: 'head', type: 'half' }); def('', { k: 'head', type: 'whole' });
  def('Œ', { k: 'rest', dur: 1 }); def('‰', { k: 'rest', dur: 0.5 }); def('≈', { k: 'rest', dur: 0.25 });
  def('®', { k: 'rest', dur: 0.125 }); def('Ó', { k: 'rest', dur: 2 }); def('∑', { k: 'rest', dur: 'bar' });
  def('jJ', { k: 'flag', n: 1 }); def('rR', { k: 'flag', n: 2 }); def('kK', { k: 'flag', n: 3 });
  def('™.', { k: 'dot' });
  def('b', { k: 'acc', v: -1 }); def('n', { k: 'acc', v: 0 }); def('#', { k: 'acc', v: 1 }); def('º', { k: 'acc', v: -2 }); def('Ü', { k: 'acc', v: 2 });
  def('&', { k: 'clef', clef: 'G' }); def('?', { k: 'clef', clef: 'F' }); def('B', { k: 'clef', clef: 'C' }); def('V', { k: 'clef', clef: 'G8' });
  def('/', { k: 'clef', clef: 'perc' });
  for (let d = 0; d <= 9; d++) { GLYPH[String(d)] = { k: 'digit', v: d }; GLYPH[String.fromCharCode(0xE080 + d)] = { k: 'digit', v: d }; }

  // 음자리표 기준선의 음 (온음계 번호: C0 = 0)
  const DIA = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const CLEF_REF = { G: 4 + 7 * 4, F: 3 + 7 * 3, C: 0 + 7 * 4, G8: 4 + 7 * 3 };
  const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];
  const FLAT_ORDER = 'BEADGCF', SHARP_ORDER = 'FCGDAEB';

  // Sibelius 코드 글꼴(Opus Chords) 문자 풀기
  function decodeChord(s) {
    return s.replace(/Œ„Š/g, 'maj').replace(/¨/g, 'b').replace(/©/g, '#').replace(/‹/g, 'm').replace(/„ˆˆ/g, 'add').replace(/[„ˆ]/g, '');
  }
  const CHORD_RE = /^[A-G][#b]?(maj|m|min|dim|aug|sus|add|\d|\(|\)|b|#|\/|[A-G])*$/;

  // ---------- 한 쪽 읽기: 글자와 선 ----------
  function mul(m1, m2) { // m1 × m2 (m2 먼저)
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  async function readPage(lib, page) {
    const vp = page.getViewport({ scale: 1 });
    const V = vp.transform;
    const ops = await page.getOperatorList();
    const tc = await page.getTextContent({ disableCombineTextItems: true });
    const O = lib.OPS;
    const fontName = {};
    const fname = id => {
      if (!(id in fontName)) { try { fontName[id] = page.commonObjs.get(id).name || ''; } catch (e) { fontName[id] = ''; } }
      return fontName[id];
    };
    // 글자
    const music = [], texts = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const name = fname(it.fontName);
      const size = Math.hypot(it.transform[2], it.transform[3]);
      const [x, y] = apply(V, it.transform[4], it.transform[5]);
      const isMusic = MUSIC_FONT.test(name) && !NOT_MUSIC.test(name);
      if (isMusic) {
        const chars = [...it.str];
        const w = it.width / chars.length;
        chars.forEach((ch, i) => { if (ch.trim()) music.push({ ch, x: x + i * w, y, w: w || size * 0.37, size, font: name }); });
      } else texts.push({ str: it.str, x, y, w: it.width, size, font: name, bold: /bold/i.test(name), chordFont: /chord/i.test(name) });
    }
    // 선 (오선·세로줄·기둥·빔)
    const lines = [], polys = [];
    let ctm = [1, 0, 0, 1, 0, 0], lw = 1;
    const stack = [];
    let path = [];
    const flush = (mode) => {
      const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
      for (const sub of path) {
        if (mode === 'stroke') {
          for (let i = 0; i + 1 < sub.pts.length; i++) {
            const [a, b] = [sub.pts[i], sub.pts[i + 1]];
            if (sub.curve[i + 1]) continue;
            lines.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], w: lw * scale });
          }
          if (sub.closed && sub.pts.length > 2) {
            const a = sub.pts[sub.pts.length - 1], b = sub.pts[0];
            lines.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], w: lw * scale });
          }
        } else if (mode === 'fill' && sub.pts.length >= 3) polys.push(sub.pts);
      }
      path = [];
    };
    const T = (x, y) => apply(V, ...apply(ctm, x, y));
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === O.save) stack.push([ctm, lw]);
      else if (fn === O.restore) { const s = stack.pop(); if (s) [ctm, lw] = s; }
      else if (fn === O.transform) ctm = mul(ctm, args);
      else if (fn === O.paintFormXObjectBegin) { stack.push([ctm, lw]); if (args[0]) ctm = mul(ctm, args[0]); }
      else if (fn === O.paintFormXObjectEnd) { const s = stack.pop(); if (s) [ctm, lw] = s; }
      else if (fn === O.setLineWidth) lw = args[0];
      else if (fn === O.constructPath) {
        const [pops, pargs] = args;
        let j = 0, cur = null;
        for (const op of pops) {
          if (op === O.moveTo) { cur = { pts: [T(pargs[j], pargs[j + 1])], curve: [false], closed: false }; path.push(cur); j += 2; }
          else if (op === O.lineTo) { if (!cur) { cur = { pts: [], curve: [], closed: false }; path.push(cur); } cur.pts.push(T(pargs[j], pargs[j + 1])); cur.curve.push(false); j += 2; }
          else if (op === O.curveTo) { if (cur) { cur.pts.push(T(pargs[j + 4], pargs[j + 5])); cur.curve.push(true); } j += 6; }
          else if (op === O.curveTo2 || op === O.curveTo3) { if (cur) { cur.pts.push(T(pargs[j + 2], pargs[j + 3])); cur.curve.push(true); } j += 4; }
          else if (op === O.closePath) { if (cur) cur.closed = true; }
          else if (op === O.rectangle) {
            const [x, y, w, h] = pargs.slice(j, j + 4);
            cur = { pts: [T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)], curve: [false, false, false, false], closed: true };
            path.push(cur); j += 4;
          }
        }
      } else if (fn === O.stroke || fn === O.closeStroke) flush('stroke');
      else if (fn === O.fill || fn === O.eoFill) flush('fill');
      else if (fn === O.fillStroke || fn === O.eoFillStroke || fn === O.closeFillStroke || fn === O.closeEOFillStroke) {
        const keep = path; flush('fill'); path = keep; flush('stroke');
      } else if (fn === O.endPath) path = [];
    }
    // 아주 얇은 채운 사각형은 선으로 본다 (오선을 사각형으로 그리는 프로그램도 있다)
    for (const p of polys) {
      if (p.length !== 4 && p.length !== 5) continue;
      const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      if (h < 1.3 && w > 20) lines.push({ x0: Math.min(...xs), y0: (Math.max(...ys) + Math.min(...ys)) / 2, x1: Math.max(...xs), y1: (Math.max(...ys) + Math.min(...ys)) / 2, w: h });
      else if (w < 1.6 && h > 6) lines.push({ x0: (Math.max(...xs) + Math.min(...xs)) / 2, y0: Math.min(...ys), x1: (Math.max(...xs) + Math.min(...xs)) / 2, y1: Math.max(...ys), w });
    }
    return { width: vp.width, height: vp.height, music, texts, lines, polys };
  }

  // ---------- 오선 찾기 ----------
  function findStaves(pg) {
    const hs = [];
    for (const l of pg.lines) {
      if (Math.abs(l.y1 - l.y0) > 0.3) continue;
      hs.push({ y: (l.y0 + l.y1) / 2, x0: Math.min(l.x0, l.x1), x1: Math.max(l.x0, l.x1) });
    }
    hs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
    // 같은 높이의 조각들을 이어 붙이기
    const merged = [];
    for (const h of hs) {
      const m = merged.find(q => Math.abs(q.y - h.y) < 0.2 && h.x0 <= q.x1 + 3 && h.x1 >= q.x0 - 3);
      if (m) { m.x0 = Math.min(m.x0, h.x0); m.x1 = Math.max(m.x1, h.x1); } else merged.push({ ...h });
    }
    const long = merged.filter(h => h.x1 - h.x0 > 60).sort((a, b) => a.y - b.y);
    const staves = [];
    const used = new Set();
    for (let i = 0; i < long.length; i++) {
      if (used.has(i)) continue;
      // i 에서 시작해 간격이 같은 5줄 찾기
      for (let j = i + 1; j < long.length && long[j].y - long[i].y < 16; j++) {
        const sp = long[j].y - long[i].y;
        if (sp < 2.5 || sp > 12) continue;
        const idx = [i, j];
        for (let k = 2; k < 5; k++) {
          const want = long[i].y + sp * k;
          const m = long.findIndex((q, qi) => !used.has(qi) && Math.abs(q.y - want) < Math.max(0.35, sp * 0.06) && q.x0 < long[i].x1 && q.x1 > long[i].x0);
          if (m < 0) break;
          idx.push(m);
        }
        if (idx.length === 5) {
          idx.forEach(q => used.add(q));
          const ls = idx.map(q => long[q]);
          // 연습 기호 상자처럼 한 줄에만 붙은 선 때문에 넓어지지 않게 가운데값을 쓴다
          const med = arr => arr.sort((a, b) => a - b)[2];
          staves.push({ top: ls[0].y, bottom: ls[4].y, sp, x0: med(ls.map(q => q.x0)), x1: med(ls.map(q => q.x1)) });
          break;
        }
      }
    }
    const maxLen = Math.max(0, ...staves.map(s => s.x1 - s.x0));
    // 작은 보조 오선(오시아)은 빼기
    return staves.filter(s => s.x1 - s.x0 > maxLen * 0.55).sort((a, b) => a.top - b.top);
  }

  // 같은 시스템(줄)에 묶인 오선들: 왼쪽 세로선으로 이어져 있으면 한 시스템
  function groupSystems(pg, staves) {
    const vert = pg.lines.filter(l => Math.abs(l.x1 - l.x0) < 0.4).map(l => ({ x: l.x0, top: Math.min(l.y0, l.y1), bottom: Math.max(l.y0, l.y1) }));
    const systems = [];
    let cur = [];
    staves.forEach((s, i) => {
      if (cur.length) {
        const prev = cur[cur.length - 1];
        const joined = vert.some(v => Math.abs(v.x - s.x0) < 4 && v.top <= prev.bottom + 1 && v.bottom >= s.top - 1);
        if (!joined) { systems.push(cur); cur = []; }
      }
      cur.push(s);
    });
    if (cur.length) systems.push(cur);
    return systems;
  }

  // ---------- 한 오선 줄 읽기 ----------
  function staffElements(pg, staff, all, si) {
    const sp = staff.sp, half = sp / 2;
    const prevBottom = si > 0 ? all[si - 1].bottom : -Infinity, nextTop = si + 1 < all.length ? all[si + 1].top : Infinity;
    const lo = Math.max(staff.top - sp * 6, (prevBottom + staff.top) / 2), hi = Math.min(staff.bottom + sp * 6, (staff.bottom + nextTop) / 2);
    const inX = g => g.x > staff.x0 - 8 && g.x < staff.x1 + 4;
    const sizes = pg.music.filter(g => inX(g) && g.y > lo && g.y < hi && GLYPH[g.ch] && GLYPH[g.ch].k === 'head').map(g => g.size).sort((a, b) => a - b);
    const normal = sizes.length ? sizes[Math.floor(sizes.length / 2)] : sp * 4;
    const glyphs = pg.music.filter(g => inX(g) && g.y > lo && g.y < hi && GLYPH[g.ch]).map(g => ({ ...g, ...GLYPH[g.ch], small: g.size < normal * 0.85 }));
    const vert = pg.lines.filter(l => Math.abs(l.x1 - l.x0) < 0.4).map(l => ({ x: (l.x0 + l.x1) / 2, top: Math.min(l.y0, l.y1), bottom: Math.max(l.y0, l.y1), w: l.w }));
    return { sp, half, lo, hi, glyphs, vert, normal };
  }

  function parseStaffLine(pg, staff, all, si, state) {
    const { sp, half, lo, hi, glyphs, vert } = staffElements(pg, staff, all, si);
    const heads = glyphs.filter(g => g.k === 'head' && !g.small);
    // 기둥: 음표 머리 옆에 붙은 세로선
    const stemOf = h => {
      let best = null;
      for (const v of vert) {
        if (v.bottom - v.top < sp * 2.2) continue;
        const nearRight = Math.abs(v.x - (h.x + h.w)) < 1.8, nearLeft = Math.abs(v.x - h.x) < 1.8;
        if (!nearRight && !nearLeft) continue;
        if (h.y < v.top - half * 1.4 || h.y > v.bottom + half * 1.4) continue;
        const up = Math.abs(v.bottom - h.y) < Math.abs(v.top - h.y);
        if (!best || Math.abs(v.x - h.x) < Math.abs(best.x - h.x)) best = { ...v, up, end: up ? v.top : v.bottom };
      }
      return best;
    };
    for (const h of heads) h.stem = h.type === 'whole' ? null : stemOf(h);
    const stemSet = new Set(heads.map(h => h.stem).filter(Boolean).map(s => s.x.toFixed(1) + '|' + s.top.toFixed(1)));
    // 세로줄(마디줄): 오선 전체에 걸치고 기둥이 아닌 세로선
    const prevSt = si > 0 ? all[si - 1] : null, nextSt = si + 1 < all.length ? all[si + 1] : null;
    let bars = vert.filter(v => v.top <= staff.top + 0.8 && v.bottom >= staff.bottom - 0.8 &&
      // 위아래로 삐져나오면 마디줄이 아니다 (여러 오선을 잇는 마디줄은 예외)
      (v.top >= staff.top - 1 || (prevSt && v.top <= prevSt.bottom + 1)) && (v.bottom <= staff.bottom + 1 || (nextSt && v.bottom >= nextSt.top - 1)) &&
      !stemSet.has(v.x.toFixed(1) + '|' + v.top.toFixed(1)) && !heads.some(h => Math.abs(h.y - v.top) < half * 1.6 || Math.abs(h.y - v.bottom) < half * 1.6 ? (Math.abs(v.x - h.x) < 2 || Math.abs(v.x - h.x - h.w) < 2) : false))
      .map(v => v.x).sort((a, b) => a - b);
    const bl = [];
    for (const x of bars) { if (bl.length && x - bl[bl.length - 1] < 5) bl[bl.length - 1] = x; else bl.push(x); }
    // 빔 수 세기
    const beamsAt = (stem) => {
      let n = 0;
      for (const p of pg.polys) {
        const xs = p.map(q => q[0]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        if (stem.x < minX - 0.8 || stem.x > maxX + 0.8 || maxX - minX < 2) continue;
        // 빔 가운데 높이(기둥 위치에서)
        const L = p.filter(q => Math.abs(q[0] - minX) < 0.5).map(q => q[1]), R = p.filter(q => Math.abs(q[0] - maxX) < 0.5).map(q => q[1]);
        if (!L.length || !R.length) continue;
        const t = maxX === minX ? 0 : Math.max(0, Math.min(1, (stem.x - minX) / (maxX - minX)));
        const yc = ((Math.min(...L) + Math.max(...L)) / 2) * (1 - t) + ((Math.min(...R) + Math.max(...R)) / 2) * t;
        const thick = (Math.max(...L) - Math.min(...L));
        if (thick > sp * 0.9) continue;
        const d = stem.up ? yc - stem.end : stem.end - yc;
        if (d > -1 && d < sp * 2.6) n++;
      }
      return Math.min(n, 4);
    };
    // 음자리표·조표·박자표 (줄 맨 앞, 또는 중간에 바뀜)
    const clefs = glyphs.filter(g => g.k === 'clef').sort((a, b) => a.x - b.x);
    const clefAt = x => { let c = null; for (const g of clefs) if (g.x <= x + 1) c = g; return c; };
    const digits = glyphs.filter(g => g.k === 'digit' && !g.small);
    const accs = glyphs.filter(g => g.k === 'acc' && !g.small);
    const firstEvent = Math.min(...glyphs.filter(g => (g.k === 'head' || g.k === 'rest') && !g.small).map(g => g.x), staff.x1);
    // 조표: 음표에 붙지 않은 임시표 묶음
    const attached = a => heads.some(h => h.x - a.x > 0 && h.x - a.x < sp * 2.6 && Math.abs(h.y - a.y) < half * 0.7);
    const keyAccs = accs.filter(a => !attached(a));
    const keyGroups = [];
    for (const a of keyAccs.sort((p, q) => p.x - q.x)) {
      const g = keyGroups[keyGroups.length - 1];
      if (g && a.x - g.x1 < sp * 1.6) { g.items.push(a); g.x1 = a.x; } else keyGroups.push({ x0: a.x, x1: a.x, items: [a] });
    }
    // 박자표: 위아래로 쌓인 숫자
    const timeSigs = [];
    for (const d of digits) {
      if (Math.abs(d.y - (staff.top + sp)) < half * 1.2 || Math.abs(d.y - (staff.top + sp * 1)) < sp) {
        const lower = digits.find(e => Math.abs(e.x - d.x) < sp && e.y - d.y > sp * 1.3 && e.y - d.y < sp * 2.7);
        if (lower) {
          const num = digits.filter(e => Math.abs(e.y - d.y) < 1 && Math.abs(e.x - d.x) < sp * 1.5).sort((a, b) => a.x - b.x).map(e => e.v).join('');
          const den = digits.filter(e => Math.abs(e.y - lower.y) < 1 && Math.abs(e.x - lower.x) < sp * 1.5).sort((a, b) => a.x - b.x).map(e => e.v).join('');
          if (!timeSigs.some(t => Math.abs(t.x - d.x) < sp * 1.5)) timeSigs.push({ x: d.x, num: +num, den: +den });
        }
      }
    }

    // 줄 맨 앞의 시스템 묶음선·괄호는 마디줄이 아니다
    const edges = [staff.x0].concat(bl.filter(x => x > staff.x0 + sp * 3));
    if (edges[edges.length - 1] < staff.x1 - sp * 2) edges.push(staff.x1);
    const measures = [];
    for (let mi = 0; mi + 1 < edges.length; mi++) {
      const a = edges[mi], b = edges[mi + 1];
      if (b - a < sp * 1.5) continue;
      // 이 마디 안의 조표·박자표 바뀜 반영
      for (const g of keyGroups) if (g.x0 >= a - 1 && g.x0 < b && g.x0 < Math.max(a + sp * 12, firstEvent)) {
        const flats = g.items.filter(i => i.v < 0).length, sharps = g.items.filter(i => i.v > 0).length;
        if (flats || sharps || g.items.every(i => i.v === 0)) state.key = flats ? -flats : sharps;
      }
      for (const t of timeSigs) if (t.x >= a - 1 && t.x < b) state.time = t;
      const clef = clefAt(b) || state.clefGlyph;
      if (clef) state.clefGlyph = clef;
      measures.push(parseMeasure(a, b));
    }
    // 줄 끝의 "다음 조표 미리보기" 같은 빈 구역은 마디가 아니다
    while (measures.length && !measures[measures.length - 1].perc && measures[measures.length - 1].voices.every(v => !v.length)) measures.pop();
    return { measures, bars: bl.length };

    function parseMeasure(a, b) {
      const clefG = clefAt(a + 1) || state.clefGlyph;
      const clefName = clefG ? clefG.clef : 'G';
      if (clefName === 'perc') return { perc: true, events: [] };
      const refY = clefG ? clefG.y : staff.top + sp * 3; // 음자리표 기준선 높이
      const refDia = CLEF_REF[clefName] != null ? CLEF_REF[clefName] : CLEF_REF.G;
      const inM = g => g.x >= a - 0.5 && g.x < b - 0.5;
      const mh = heads.filter(inM);
      const rests = glyphs.filter(g => g.k === 'rest' && !g.small && inM(g));
      const flags = glyphs.filter(g => g.k === 'flag' && !g.small && inM(g));
      const dots = glyphs.filter(g => g.k === 'dot' && !g.small && g.x > a && g.x < b + sp);
      // 음높이
      const keyAlter = {};
      const k = state.key || 0;
      if (k < 0) for (const s of FLAT_ORDER.slice(0, -k)) keyAlter[s] = -1;
      if (k > 0) for (const s of SHARP_ORDER.slice(0, k)) keyAlter[s] = 1;
      const local = {};
      for (const h of mh.sort((p, q) => p.x - q.x)) {
        const dia = refDia + Math.round((refY - h.y) / half);
        const step = 'CDEFGAB'[((dia % 7) + 7) % 7], oct = Math.floor(dia / 7);
        const acc = accs.find(c => h.x - c.x > 0 && h.x - c.x < sp * 2.6 && Math.abs(h.y - c.y) < half * 0.7);
        if (acc) local[step + oct] = acc.v;
        const alter = local[step + oct] != null ? local[step + oct] : (keyAlter[step] || 0);
        h.midi = (oct + 1) * 12 + STEP_SEMI[DIA[step]] + alter;
        // 길이
        let base = h.type === 'whole' ? 4 : h.type === 'half' ? 2 : 1;
        if (h.type === 'black') {
          let n = 0;
          if (h.stem) {
            n = beamsAt(h.stem);
            const f = flags.find(g => Math.abs(g.x - h.stem.x) < 2.5 && Math.abs(g.y - h.stem.end) < sp * 2.5);
            if (f) n = Math.max(n, f.n);
          }
          base = 1 / Math.pow(2, n);
        }
        const nd = dots.filter(d => d.x > h.x + h.w * 0.6 && d.x - h.x < h.w + sp * 2.2 && Math.abs(d.y - h.y) < half * 1.2).length;
        h.dur = base * (nd >= 2 ? 1.75 : nd === 1 ? 1.5 : 1);
      }
      for (const r of rests) {
        const nd = dots.filter(d => d.x > r.x + r.w * 0.5 && d.x - r.x < r.w + sp * 1.6 && Math.abs(d.y - r.y) < sp * 1.6).length;
        r.dur = r.dur === 'bar' ? 'bar' : r.dur * (nd ? 1.5 : 1);
      }
      // 화음 묶기 (같은 기둥 또는 같은 x)
      const groups = [];
      for (const h of mh) {
        const g = groups.find(q => (h.stem && q.stem && Math.abs(h.stem.x - q.stem.x) < 1 && h.stem.up === q.stem.up) || (!h.stem && Math.abs(q.x - h.x) < 1.5));
        if (g) { g.heads.push(h); g.dur = Math.min(g.dur, h.dur); } else groups.push({ x: h.x, stem: h.stem, heads: [h], dur: h.dur, up: h.stem ? h.stem.up : null });
      }
      // 두 성부(기둥 위/아래)가 같은 자리에 있으면 나눠서 읽는다
      const multi = groups.some(g => groups.some(q => q !== g && Math.abs(q.x - g.x) < sp * 0.9 && q.up !== g.up && q.up != null && g.up != null));
      const toEvents = (gs, rs) => [...gs.map(g => ({ x: g.x, dur: g.dur, midis: g.heads.map(h => h.midi).sort((p, q) => q - p), heads: g.heads })),
        ...rs.map(r => ({ x: r.x, dur: r.dur, rest: true }))].sort((p, q) => p.x - q.x);
      const mid = staff.top + sp * 2;
      const voices = multi
        ? [toEvents(groups.filter(g => g.up !== false), rests.filter(r => r.y <= mid)), toEvents(groups.filter(g => g.up === false), rests.filter(r => r.y > mid))]
        : [toEvents(groups, rests)];
      return { a, b, voices, perc: false };
    }
  }

  // ---------- 가사·코드·제목·빠르기 ----------
  function lyricsFor(pg, staff, all, si, heads) {
    const sp = staff.sp;
    const nextTop = si + 1 < all.length ? all[si + 1].top : staff.bottom + sp * 12;
    const cands = pg.texts.filter(t => t.y > staff.bottom + sp * 0.8 && t.y < Math.min(staff.bottom + sp * 11, nextTop - sp * 2) &&
      t.x > staff.x0 - 4 && t.x < staff.x1 && !t.bold && t.size < sp * 4.2 && /[^\s.]/.test(t.str));
    if (!cands.length || !heads.length) return;
    // 음표 아래에 나란히 놓인 가장 위 줄(1절)만
    const ys = [...new Set(cands.map(t => Math.round(t.y)))].sort((a, b) => a - b);
    const underHead = t => heads.some(h => Math.abs(h.x + h.w / 2 - (t.x + t.w / 2)) < sp * 2);
    const firstY = ys.find(y => cands.filter(t => Math.abs(t.y - y) < 2 && underHead(t)).length >= 2);
    if (firstY == null) return;
    const line = cands.filter(t => Math.abs(t.y - firstY) < 2).sort((a, b) => a.x - b.x);
    for (let i = 0; i < line.length; i++) {
      const t = line[i];
      const str = t.str.trim();
      if (!str || /^[-–—_ー~]+$/.test(str)) continue;
      const cx = t.x + t.w / 2;
      let best = null, bd = Infinity;
      for (const h of heads) {
        const d = Math.abs(h.x + h.w / 2 - cx);
        if (d < bd) { bd = d; best = h; }
      }
      if (!best || bd > Math.max(sp * 2.2, t.w)) continue;
      // 다음 글자가 붙임표(-)면 낱말이 이어진다
      const nxt = line[i + 1];
      const hyph = nxt && /^[-–]$/.test(nxt.str.trim());
      best.lyric = (best.lyric || '') + str.replace(/[ー_]/g, '') + (hyph ? '' : ' ');
    }
  }

  function chordsFor(pg, staff, all, si) {
    const sp = staff.sp;
    const prevBottom = si > 0 ? all[si - 1].bottom : -Infinity;
    const cands = pg.texts.filter(t => t.y < staff.top - sp * 0.5 && t.y > Math.max(staff.top - sp * 9, prevBottom + sp * 3) &&
      t.x > staff.x0 - 6 && t.x < staff.x1 && !t.bold);
    // 같은 줄에서 붙어 있는 글자 합치기
    cands.sort((a, b) => a.y - b.y || a.x - b.x);
    const words = [];
    for (const t of cands) {
      const w = words.find(q => Math.abs(q.y - t.y) < 4 && t.x - (q.x + q.w) < 1.5 && t.x >= q.x);
      if (w) { w.str += t.str; w.w = t.x + t.w - w.x; } else words.push({ ...t });
    }
    return words.map(w => ({ x: w.x, sym: decodeChord(w.str.replace(/\s+/g, '')) })).filter(w => CHORD_RE.test(w.sym));
  }

  function pageTitle(pg) {
    // 글자가 든 것만 (중괄호·연습 기호 같은 큰 기호는 빼고)
    const big = pg.texts.filter(t => t.y < pg.height * 0.3 && /[A-Za-z\uac00-\ud7a3]{2,}/.test(t.str)).sort((a, b) => b.size - a.size);
    if (!big.length) return null;
    const med = pg.texts.map(t => t.size).sort((a, b) => a - b)[Math.floor(pg.texts.length / 2)] || 10;
    if (big[0].size < med * 1.6) return null;
    const size = big[0].size;
    const title = big.filter(t => Math.abs(t.size - size) < 0.5 && Math.abs(t.y - big[0].y) < 3).sort((a, b) => a.x - b.x).map(t => t.str).join(' ').replace(/\s+/g, ' ').trim();
    // 연습 기호(A, B …)나 괄호 같은 큰 기호는 제목이 아니다
    return (title.match(/[A-Za-z\uac00-\ud7a3]/g) || []).length >= 3 ? title : null;
  }
  // 파트 악보 첫 쪽 왼쪽 위의 악기 이름
  function pageLabel(pg, title) {
    const items = pg.texts.filter(t => t.x < pg.width * 0.3 && t.y < pg.height * 0.12 && /[A-Za-z\uac00-\ud7a3]{2,}/.test(t.str) && !/[„‹¨©Œ]/.test(t.str) && (!title || !title.includes(t.str.trim())));
    if (!items.length) return null;
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const y0 = items[0].y;
    return items.filter(t => Math.abs(t.y - y0) < 2).map(t => t.str).join(' ').replace(/\s+/g, ' ').trim() || null;
  }
  function tempoOf(pgs) {
    for (const pg of pgs) {
      const line = pg.texts.concat(pg.music.map(g => ({ str: g.ch, x: g.x, y: g.y, w: g.w })));
      const rows = {};
      for (const t of line) (rows[Math.round(t.y / 3)] = rows[Math.round(t.y / 3)] || []).push(t);
      for (const r of Object.values(rows)) {
        const s = r.sort((a, b) => a.x - b.x).map(t => t.str).join('');
        const m = s.match(/(q|♩||h|e)?([.™]?)\s*=\s*(\d{2,3})/);
        if (m) {
          let bpm = +m[3];
          if (m[1] === 'h') bpm *= 2; else if (m[1] === 'e') bpm /= 2;
          if (m[2]) bpm *= 1.5;
          return bpm;
        }
      }
    }
    return null;
  }

  // 약자 이름을 처음 나온 긴 이름으로: "Fl." → "Flute 1,2", "M.V" → "Main Vocal", "S." → "Soprano"
  function resolveName(label, known) {
    const clean = label.replace(/\s+/g, ' ').trim();
    const abbrev = /\./.test(clean) || clean.replace(/[^A-Za-z\uac00-\ud7a3]/g, '').length <= 3;
    if (!abbrev) { if (!known.includes(clean)) known.push(clean); return clean; }
    const letters = clean.replace(/[^A-Za-z\uac00-\ud7a3]/g, '').toLowerCase();
    const romanRe = /\s(I{1,3}|IV)$/;  // "Violin I" / "Vn. II" 구분용
    const roman = (clean.match(romanRe) || [])[1];
    for (const full of known) {
      const f = full.toLowerCase();
      if (!letters || f[0] !== letters[0]) continue;
      let j = 0;
      for (const ch of f) if (ch === letters[j]) j++;
      const words = full.split(/\s+/);
      const initials = words.map(w => w[0] || '').join('').toLowerCase();
      const fRoman = (full.match(romanRe) || [])[1];
      if ((j === letters.length || initials.startsWith(letters)) && (roman || '') === (fRoman || '')) return full;
    }
    return clean;
  }

  // ---------- 문서 열기 (가벼운 첫 훑기: 글자만) ----------
  async function open(arrayBuffer, progress) {
    const lib = await loadLib();
    const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false }).promise;
    const n = doc.numPages;
    const pages = [];
    const sections = [];
    for (let i = 1; i <= n; i++) {
      progress && progress(`쪽 구성을 살피는 중… ${i}/${n}`);
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      const texts = tc.items.filter(it => it.str && it.str.trim()).map(it => {
        const [x, y] = apply(vp.transform, it.transform[4], it.transform[5]);
        return { str: it.str, x, y, w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) };
      });
      const pg = { width: vp.width, height: vp.height, texts };
      const title = pageTitle(pg);
      if (title || !sections.length) {
        const label = pageLabel(pg, title);
        sections.push({ title: title || '', label: label || '', pages: [] });
      }
      sections[sections.length - 1].pages.push(i);
      pages.push(pg);
    }
    // 가장 자주 나온 제목이 곡 제목
    const count = {};
    for (const s of sections) if (s.title) count[s.title] = (count[s.title] || 0) + 1;
    const title = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || '';
    return { lib, doc, sections, title };
  }

  // ---------- 고른 부분 읽기 ----------
  /**
   * @param handle  open() 결과
   * @param pick    [{section, staffKey?}] 또는 null(전부)
   * @returns Song
   */
  async function read(handle, sectionIdx, progress) {
    const { lib, doc, sections } = handle;
    const parts = {};      // key → {name, notes, lyrics?}
    const fullNames = {};  // 단락별로 처음 나온 긴 이름들
    const partOrder = [];
    const chordEvents = [];
    const pgCache = [];
    let tempo = null, beatUnit = null, timeSig = null;
    let globalBeat = 0, songEnd = 0;
    let total = 0, done = 0;
    for (const si of sectionIdx) total += sections[si].pages.length;
    for (const si of sectionIdx) {
      const sec = sections[si];
      const state = {}; // 오선 줄 index 별 상태
      let secBeat = 0;
      globalBeat = 0; // 파트 악보들은 같은 곡이므로 모두 처음부터 겹친다
      const secParts = new Set();
      for (const pn of sec.pages) {
        progress && progress(`음표를 읽는 중… ${++done}/${total}쪽`);
        const page = await doc.getPage(pn);
        const pg = await readPage(lib, page);
        pgCache.push(pg);
        const staves = findStaves(pg);
        const systems = groupSystems(pg, staves);
        for (const sys of systems) {
          // 오선마다 이름
          const sysParts = sys.map((st, k) => {
            const lab = pg.texts.filter(t => t.x + t.w < st.x0 - 1 && t.y > st.top - st.sp * 2 && t.y < st.bottom + st.sp * 2 && t.size < st.sp * 4)
              .sort((a, b) => a.x - b.x).map(t => t.str).join(' ').replace(/\s+/g, ' ').trim();
            if (sys.length === 1) return { st, key: `s${si}`, name: sec.label || sec.title || '파트', k };
            // 둘째 줄부터는 "Fl.", "S." 같은 약자로 적히니 처음 이름에 맞춘다
            const name = lab ? resolveName(lab, fullNames[si] = fullNames[si] || []) : `오선 ${k + 1}`;
            return { st, key: `s${si}:${lab ? name : 'k' + k + '/' + sys.length}`, name, k };
          });
          const results = sysParts.map(({ st, key }) => {
            const stIdx = staves.indexOf(st);
            const sk = key;
            state[sk] = state[sk] || { key: 0 };
            const r = parseStaffLine(pg, st, staves, stIdx, state[sk]);
            r.stIdx = stIdx;
            return r;
          });
          // 시스템 안 마디 수와 길이: 박자표 기준, 첫 마디는 못갖춘마디일 수 있다
          const mCount = Math.max(0, ...results.map(r => r.measures.length));
          const anyState = state[sysParts[0].key];
          const timeLen = t => (t ? t.num * 4 / t.den : 4);
          if (!beatUnit && anyState.time) {
            beatUnit = anyState.time.den === 8 && anyState.time.num % 3 === 0 && anyState.time.num > 3 ? 1.5 : 4 / anyState.time.den;
            timeSig = { num: anyState.time.num, den: anyState.time.den };
          }
          const lens = [];
          for (let m = 0; m < mCount; m++) {
            const t = (results.find(r => r.measures[m]) && state[sysParts[results.findIndex(r => r.measures[m])].key].time) || anyState.time;
            let len = timeLen(t);
            if (secBeat === 0 && m === 0) {
              // 못갖춘마디: 실제로 채워진 길이가 짧으면 그만큼만
              const filled = Math.max(0, ...results.map(r => r.measures[0] ? Math.max(...r.measures[0].voices.map(v => v.reduce((s, e) => s + (e.dur === 'bar' ? len : e.dur), 0))) : 0));
              if (filled > 0 && filled < len - 1e-6) len = filled;
            }
            lens.push(len);
          }
          sysParts.forEach(({ key, name }, k) => {
            const r = results[k];
            if (r.measures.every(m => m.perc)) return;
            if (!parts[key]) { parts[key] = { name, voices: [[], []], section: si }; partOrder.push(key); }
            secParts.add(key);
            const p = parts[key];
            let mb = globalBeat + secBeat;
            r.measures.forEach((m, mi) => {
              const len = lens[mi] || 4;
              m.voices.forEach((evs, vi) => {
                let t = mb;
                const sum = evs.reduce((s, e) => s + (e.dur === 'bar' ? len : e.dur), 0);
                // 셋잇단음표 등으로 박이 넘치면 마디 길이에 맞게 줄인다
                const scale = sum > len + 1e-3 && Math.abs(sum * 2 / 3 - len) < 0.26 ? 2 / 3 : 1;
                for (const e of evs) {
                  const d = (e.dur === 'bar' ? len : e.dur) * scale;
                  if (!e.rest && t < mb + len - 1e-6) {
                    for (const h of e.heads) h.beat = t;
                    p.voices[vi].push({ b: t, bd: Math.min(d, mb + len - t), midis: e.midis, heads: e.heads });
                  }
                  t += d;
                }
              });
              mb += len;
            });
            // 가사 (이 오선의 모든 음표 머리)
            const heads = [];
            r.measures.forEach(m => m.voices.forEach(v => v.forEach(e => e.heads && heads.push(...e.heads))));
            lyricsFor(pg, sysParts[k].st, staves, r.stIdx, heads);
            // 코드: 시스템의 맨 위 오선에서만
            if (k === 0) {
              const evs = [];
              let mb2 = globalBeat + secBeat;
              r.measures.forEach((m, mi) => {
                const len = lens[mi] || 4;
                let t = mb2;
                const v0 = m.voices[0];
                const onlyRest = !v0.length || v0.every(e => e.rest && e.dur === 'bar');
                if (onlyRest) {
                  // 온쉼표 마디: 코드 위치를 마디 안 비율로
                  evs.push({ a: m.a, w: m.b - m.a, b: mb2, len });
                } else for (const e of v0) { evs.push({ x: e.x, b: t }); t += e.dur === 'bar' ? len : e.dur; }
                mb2 += len;
              });
              for (const c of chordsFor(pg, sysParts[k].st, staves, r.stIdx)) {
                const cx = c.x + 6;
                const span = evs.find(e => e.w && cx >= e.a - 4 && cx < e.a + e.w);
                if (span) { chordEvents.push({ b: span.b + Math.round(Math.max(0, (cx - span.a) / span.w) * span.len * 2) / 2, sym: c.sym, sec: si }); continue; }
                let best = null, bd = Infinity;
                for (const e of evs) if (e.x != null) { const d = Math.abs(e.x - cx); if (d < bd) { bd = d; best = e; } }
                if (best) chordEvents.push({ b: best.b, sym: c.sym, sec: si });
              }
            }
          });
          secBeat += lens.reduce((s, x) => s + x, 0);
        }
        if (tempo == null) tempo = tempoOf([pg]);
      }
      songEnd = Math.max(songEnd, secBeat);
    }

    // 파트 → 트랙 (가사는 음표 머리에 붙어 있다)
    const tracks = [];
    for (const key of partOrder) {
      const p = parts[key];
      p.voices.forEach((v, vi) => {
        if (!v.length) return;
        const notes = [];
        for (const e of v) {
          const lyricHead = e.heads.find(h => h.lyric);
          const lyric = lyricHead ? lyricHead.lyric : null;
          const syl = lyric ? [...lyric.trim()].filter(c => /[가-힣]/.test(c)) : [];
          if (syl.length > 1) {
            // 한 음에 여러 글자면 나눠 부른다
            const d = e.bd / syl.length;
            syl.forEach((s, k) => { for (const m of e.midis) notes.push({ b: e.b + k * d, bd: d, midi: m, lyric: s + (k === syl.length - 1 && /\s$/.test(lyric) ? ' ' : '') }); });
          } else for (const m of e.midis) notes.push({ b: e.b, bd: e.bd, midi: m, lyric });
        }
        // 가사가 있는 파트는 "가사 없는 같은 음이 바로 이어지면" 붙임줄로 본다
        if (notes.some(n => n.lyric)) {
          for (let i = notes.length - 1; i > 0; i--) {
            const n = notes[i], pv = notes[i - 1];
            if (!n.lyric && pv.midi === n.midi && Math.abs(pv.b + pv.bd - n.b) < 1e-6) { pv.bd += n.bd; notes.splice(i, 1); }
          }
        }
        // 몇 마디만 두 성부로 갈라지면 큰 쪽은 원래 이름 그대로
        const other = p.voices[1 - vi].length;
        const suffix = !other ? '' : v.length >= other * 4 ? '' : other >= v.length * 4 ? ' · 갈라진 성부' : (vi ? ' · 아랫성부' : ' · 윗성부');
        tracks.push({ name: p.name + suffix, notes });
      });
    }
    if (!tracks.length) throw new Error('이 PDF에서 음표를 찾지 못했어요. 악보 프로그램에서 저장한 PDF인지 확인해 주세요 (스캔한 악보는 읽지 못해요).');
    // 파트마다 같은 코드가 적혀 있으니 한 파트(처음 고른 것)의 코드만 쓴다
    const chordSec = chordEvents.length ? chordEvents[0].sec : null;
    const mine = chordEvents.filter(c => c.sec === chordSec).sort((a, b) => a.b - b.b);
    const chords = [];
    for (const c of mine) {
      const last = chords[chords.length - 1];
      if (last && Math.abs(last.b - c.b) < 1e-6) { last.sym = c.sym; continue; }
      chords.push({ b: c.b, sym: c.sym });
    }
    chords.forEach((c, i) => { c.bd = (i + 1 < chords.length ? chords[i + 1].b : songEnd) - c.b; });
    const title = handle.title || '';
    return W.Score.finalizeSong({
      title, tracks, tempoEvents: [{ b: 0, bpm: tempo || 100 }], chords: chords.filter(c => c.bd > 0), beatUnit, timeSig,
    });
  }

  W.PdfScore = { open, read, loadLib, _readPage: readPage, _findStaves: findStaves, _parseStaffLine: parseStaffLine, _groupSystems: groupSystems };
})(window);
