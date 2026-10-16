// 동글동글한 동물 주민 캐릭터 (SVG) + 노래하는 입 모양·표정·무대 의상 애니메이션
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

  // 무대 의상 (앱의 의상 고르기 칩이 이 목록을 쓴다). none = 평소 옷 그대로
  const COSTUMES = [
    { id: 'none',   label: '기본' },
    { id: 'flower', label: '꽃왕관' },
    { id: 'straw',  label: '밀짚모자' },
    { id: 'bowtie', label: '나비넥타이' },
    { id: 'santa',  label: '산타 모자' },
    { id: 'robe',   label: '성가대 가운' },
  ];
  const COSTUME_IDS = COSTUMES.map(c => c.id);

  // 모자 자리: 귀 모양이 종마다 달라서 머리 꼭대기에 얹을 위치·크기·기울기를 따로 맞춘다
  // (x, y) = 모자 밑동 가운데, s = 크기, r = 기울기(도)
  const HAT_FIT = {
    rabbit:   { x: 100, y: 58, s: 0.7,  r: -7 },  // 긴 귀 사이에 살짝 얹고 갸웃하게
    cat:      { x: 100, y: 57, s: 0.8,  r: 0 },   // 세모 귀 사이
    squirrel: { x: 100, y: 57, s: 0.8,  r: 0 },
    dog:      { x: 100, y: 57, s: 0.96, r: -4 },  // 귀가 옆으로 처져 있어 머리 전체를 덮는다
    bear:     { x: 100, y: 56, s: 0.82, r: 0 },   // 동그란 귀 사이
    frog:     { x: 100, y: 54, s: 0.5,  r: 0 },   // 눈 언덕 사이 골짜기에 쏙
    penguin:  { x: 100, y: 57, s: 0.96, r: 0 },
    sheep:    { x: 100, y: 38, s: 0.86, r: 0 },   // 복슬복슬한 양털 위
  };
  // 꽃왕관이 따라갈 머리 윤곽 (타원 호. 각도는 꼭대기가 90°, a0 → a1 로 왼쪽에서 오른쪽)
  const CROWN_FIT = {
    default: { cy: 108, rx: 61, ry: 55, a0: 152, a1: 28, n: 7, r: 7.5 },
    sheep:   { cy: 108, rx: 58, ry: 64, a0: 150, a1: 30, n: 7, r: 7.5 },
    // 개구리는 눈 언덕을 가리지 않도록 그 사이 이마에 작은 화관
    frog:    { cy: 62,  rx: 13, ry: 14, a0: 160, a1: 20, n: 3, r: 6.2 },
  };
  // 눈썹: 털 색에 따라 색을, 얼굴 생김새에 따라 높이와 움직임 폭을 맞춘다
  const BROW = {
    default: { dy: -18,   color: '#5a3a2e', lift: 1,    arch: 1 },
    bear:    { dy: -18,   color: '#3e2618', lift: 1,    arch: 1 },
    frog:    { dy: -15,   color: '#4d6b2e', lift: 0.6,  arch: 0.8 },  // 눈 언덕 윤곽 밖으로 삐져나가지 않게
    penguin: { dy: -14,   color: '#2a3247', lift: 0.45, arch: 0.7 },  // 흰 얼굴 무늬 밖으로 나가지 않게
    sheep:   { dy: -16.5, color: '#6b4a3a', lift: 0.7,  arch: 0.8 },  // 앞머리 양털에 닿지 않게
  };

  const FLOWER_COLORS = [
    ['#ffb3c7', '#ef8aa6'], // 분홍
    ['#fffaf0', '#e3d5bd'], // 하양
    ['#d9c8ff', '#ab94e6'], // 연보라
    ['#ffd6a5', '#eeac66'], // 살구
  ];
  const STRAW = { fill: '#f6d68c', crown: '#f9df9e', line: '#d3a44a', weave: '#e4ba62', ribbon: '#ff8fa3', ribbonLine: '#e2667f' };
  const SANTA = { red: '#f2615e', redLine: '#cc4442', fur: '#ffffff', furLine: '#d9dde6', furDot: '#eef0f5' };
  const SCARF = { fill: '#62bd8c', line: '#43996c', rib: '#4fa678', stripe: '#fff3da' };
  const TIE = { fill: '#3e4468', line: '#2a2f4b', fold: '#5a628f', knot: '#4b5281', star: '#fff1a8' };
  // 가운은 모두 같은 색이라 합창단처럼 보이고, 영대 끝만 각자 옷 색으로 남겨 누가 누군지 알 수 있게 한다
  const ROBE = { fill: '#8072d6', line: '#6152b6', pleat: '#6e60c6', white: '#ffffff', whiteLine: '#dcdfe8' };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const r2 = v => Math.round(v * 100) / 100;

  // ---------- 의상 그리기 ----------
  // 다섯 장 꽃잎. 꽃잎마다 테두리를 그려야 겹친 자리가 꽃 모양으로 읽힌다
  function flower(parent, x, y, r, ci, rot) {
    const [fill, line] = FLOWER_COLORS[ci % FLOWER_COLORS.length];
    const g = el('g', { transform: `translate(${r2(x)} ${r2(y)}) rotate(${r2(rot)})` }, parent);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      el('circle', { cx: r2(Math.cos(a) * r * 0.6), cy: r2(Math.sin(a) * r * 0.6), r: r2(r * 0.5), fill, stroke: line, 'stroke-width': 1 }, g);
    }
    el('circle', { cx: 0, cy: 0, r: r2(r * 0.34), fill: '#ffd65c', stroke: '#e5b23b', 'stroke-width': 1 }, g);
  }

  function buildFlowerCrown(head, speciesKey) {
    const f = CROWN_FIT[speciesKey] || CROWN_FIT.default;
    const g = el('g', { class: 'costume hat flower-crown' }, head);
    const at = deg => {
      const a = deg * Math.PI / 180;
      // 왼쪽→오른쪽으로 갈 때의 접선 방향 (잎을 덩굴 따라 눕히는 데 쓴다)
      return { x: 100 + f.rx * Math.cos(a), y: f.cy - f.ry * Math.sin(a), tan: Math.atan2(f.ry * Math.cos(a), f.rx * Math.sin(a)) * 180 / Math.PI };
    };
    const p0 = at(f.a0), p1 = at(f.a1);
    el('path', { d: `M${r2(p0.x)} ${r2(p0.y)} A ${f.rx} ${f.ry} 0 0 1 ${r2(p1.x)} ${r2(p1.y)}`, fill: 'none', stroke: '#79c473', 'stroke-width': r2(f.r * 0.4), 'stroke-linecap': 'round' }, g);
    // 꽃 사이마다 잎 두 장 (덩굴 위아래로 엇갈리게)
    for (let i = 0; i < f.n - 1; i++) {
      const q = at(f.a0 + (f.a1 - f.a0) * (i + 0.5) / (f.n - 1));
      for (const s of [-1, 1]) {
        el('ellipse', {
          cx: r2(q.x + s * f.r * 0.45), cy: r2(q.y + s * f.r * 0.2), rx: r2(f.r * 0.62), ry: r2(f.r * 0.3),
          fill: '#9ad68a', stroke: '#6caf62', 'stroke-width': 1,
          transform: `rotate(${r2(q.tan + s * 28)} ${r2(q.x + s * f.r * 0.45)} ${r2(q.y + s * f.r * 0.2)})`,
        }, g);
      }
    }
    const mid = (f.n - 1) / 2;
    for (let i = 0; i < f.n; i++) {
      const q = at(f.a0 + (f.a1 - f.a0) * i / (f.n - 1));
      // 가운데 꽃을 조금 크게: 왕관처럼 앞이 도드라져 보인다
      const r = f.r * (i === Math.round(mid) ? 1.18 : 1 - Math.abs(i - mid) * 0.04);
      flower(g, q.x, q.y, r, i, q.tan + i * 23);
    }
    return g;
  }

  // 밀짚모자: (0,0) = 챙 가운데. 머리 위 자리는 HAT_FIT 으로 옮긴다
  function buildStrawHat(g) {
    el('ellipse', { cx: 0, cy: 0, rx: 50, ry: 12.5, fill: STRAW.fill, stroke: STRAW.line, 'stroke-width': 2.5 }, g);
    el('ellipse', { cx: 0, cy: 1, rx: 41, ry: 8.6, fill: 'none', stroke: STRAW.weave, 'stroke-width': 1.3, 'stroke-dasharray': '2.5 3.5', 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M-27 -1 C -29 -30, -17 -36, 0 -36 C 17 -36, 29 -30, 27 -1 Q 0 6 -27 -1 Z', fill: STRAW.crown, stroke: STRAW.line, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M-20 -25 Q 0 -20 20 -25', fill: 'none', stroke: STRAW.weave, 'stroke-width': 1.3, 'stroke-dasharray': '2.5 3.5', 'stroke-linecap': 'round' }, g);
    // 리본 띠 + 옆에 묶은 나비 리본
    el('path', { d: 'M-27.7 -12 Q 0 -6 27.7 -12 L 27.3 -2.5 Q 0 4.5 -27.3 -2.5 Z', fill: STRAW.ribbon, stroke: STRAW.ribbonLine, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g);
    for (const [x2, y2] of [[13, 9], [25, 8]]) el('path', { d: `M19 -6 L ${x2} ${y2}`, stroke: STRAW.ribbon, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M19 -7 C 12 -16, 5 -11, 8 -6.5 C 5 -2, 12 2, 19 -7 Z', fill: STRAW.ribbon, stroke: STRAW.ribbonLine, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M19 -7 C 26 -16, 33 -11, 30 -6.5 C 33 -2, 26 2, 19 -7 Z', fill: STRAW.ribbon, stroke: STRAW.ribbonLine, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
    el('circle', { cx: 19, cy: -7, r: 3.2, fill: STRAW.ribbon, stroke: STRAW.ribbonLine, 'stroke-width': 1.5 }, g);
  }

  // 산타 모자: (0,0) = 흰 털 띠 가운데. 끝이 오른쪽으로 폭 접혀 내려온다
  function buildSantaHat(g) {
    el('path', { d: 'M-31 -2 C -31 -30, -15 -45, 5 -45 C 26 -45, 41 -33, 47 -15 C 40 -19, 31 -16, 29 -2 Z', fill: SANTA.red, stroke: SANTA.redLine, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M20 -39 Q 31 -32 35 -21', fill: 'none', stroke: SANTA.redLine, 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: .55 }, g);
    el('rect', { x: -37, y: -9, width: 74, height: 17, rx: 8.5, fill: SANTA.fur, stroke: SANTA.furLine, 'stroke-width': 2.5 }, g);
    for (const [x, y] of [[-26, -2], [-13, 2], [0, -3], [13, 2], [26, -2]]) el('circle', { cx: x, cy: y, r: 2.4, fill: SANTA.furDot }, g);
    const pom = el('g', { class: 'pompom' }, g);
    el('circle', { cx: 47, cy: -13, r: 8.5, fill: SANTA.fur, stroke: SANTA.furLine, 'stroke-width': 2.5 }, pom);
    el('circle', { cx: 44.5, cy: -15.5, r: 2.4, fill: SANTA.furDot }, pom);
  }

  // 털실 목도리: 턱 밑을 감고 한 자락이 앞으로 늘어진다
  function buildScarf(bodyG) {
    const g = el('g', { class: 'costume neckwear scarf' }, bodyG);
    el('path', { d: 'M76 177 C 75 190, 74 200, 73.5 211 L 89.5 211.5 C 89.5 200, 89.5 190, 90.5 179 Z', fill: SCARF.fill, stroke: SCARF.line, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    for (const y of [191, 200]) el('path', { d: `M74.6 ${y} L 89.6 ${y} L 89.5 ${y + 4} L 74.4 ${y + 4} Z`, fill: SCARF.stripe }, g);
    for (const x of [76, 80, 84, 88]) el('path', { d: `M${x} 212 L ${x - 0.5} 217`, stroke: SCARF.line, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M66 166 C 80 176, 120 176, 134 166 C 137.5 170, 137.5 177, 134.5 180.5 C 120 189, 80 189, 65.5 180.5 C 62.5 177, 62.5 170, 66 166 Z', fill: SCARF.fill, stroke: SCARF.line, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    // 뜨개 무늬 (세로 골): 띠의 곡선을 따라 짧은 줄
    for (let x = 71; x <= 129; x += 5.8) {
      const u = (x - 100) / 34;
      const yTop = 167.5 + 7.2 * (1 - u * u);
      el('path', { d: `M${r2(x)} ${r2(yTop + 2.5)} L ${r2(x)} ${r2(yTop + 9.5)}`, stroke: SCARF.rib, 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
    }
  }

  // 연주회 나비넥타이 + 반짝이 (반짝이는 update 에서 깜빡인다)
  function buildBowtie(bodyG) {
    const g = el('g', { class: 'costume neckwear bowtie' }, bodyG);
    el('path', { d: 'M100 174 C 94 167, 86 164, 82.5 166.5 C 79.5 169, 79.5 179, 82.5 181.5 C 86 184, 94 181, 100 174 Z', fill: TIE.fill, stroke: TIE.line, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M100 174 C 106 167, 114 164, 117.5 166.5 C 120.5 169, 120.5 179, 117.5 181.5 C 114 184, 106 181, 100 174 Z', fill: TIE.fill, stroke: TIE.line, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M88.5 169.5 Q 92.5 174 88.5 178.5', fill: 'none', stroke: TIE.fold, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M111.5 169.5 Q 107.5 174 111.5 178.5', fill: 'none', stroke: TIE.fold, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
    el('rect', { x: 95.5, y: 169, width: 9, height: 10, rx: 3.5, fill: TIE.knot, stroke: TIE.line, 'stroke-width': 1.8 }, g);
    el('circle', { cx: 98.3, cy: 171.6, r: 1.2, fill: '#ffffff', opacity: .8 }, g);
    const sparkle = el('g', { class: 'sparkle', transform: 'translate(122 168)' }, g);
    el('path', { d: 'M0 -5.5 Q 0.9 -0.9 5.5 0 Q 0.9 0.9 0 5.5 Q -0.9 0.9 -5.5 0 Q -0.9 -0.9 0 -5.5 Z', fill: TIE.star, stroke: '#f2cf5b', 'stroke-width': .8, 'stroke-linejoin': 'round' }, sparkle);
    return { g, sparkle, x: 122, y: 168 };
  }

  // 성가대 가운: 평소 옷 위에 길게 덮고, 흰 깃과 영대(어깨에 두르는 띠)를 얹는다
  function buildRobe(bodyG, outfit) {
    const g = el('g', { class: 'costume robe' }, bodyG);
    el('path', { d: 'M58 233 C 53 191, 68 164, 100 164 C 132 164, 147 191, 142 233 Q 121 239 100 235 Q 79 239 58 233 Z', fill: ROBE.fill, stroke: ROBE.line, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    for (const d of ['M80 200 Q 78 217 76 233', 'M120 200 Q 122 217 124 233', 'M100 206 L 100 233']) {
      el('path', { d, fill: 'none', stroke: ROBE.pleat, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
    }
    for (const s of [-1, 1]) {
      const x = v => r2(100 + s * v);
      el('path', { d: `M${x(15)} 168 C ${x(12)} 190, ${x(12)} 210, ${x(13)} 227 L ${x(3)} 227 C ${x(3)} 210, ${x(3)} 190, ${x(1)} 172 Z`, fill: ROBE.white, stroke: ROBE.whiteLine, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
      // 영대 끝단은 각자 옷 색
      el('path', { d: `M${x(12.85)} 219 L ${x(3)} 219 L ${x(3)} 227 L ${x(13)} 227 Z`, fill: outfit, stroke: 'rgba(0,0,0,.12)', 'stroke-width': 1.2 }, g);
    }
    el('path', { d: 'M75 166 C 78 181, 92 183, 100 175 C 108 183, 122 181, 125 166 C 116 172, 84 172, 75 166 Z', fill: ROBE.white, stroke: ROBE.whiteLine, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    return g;
  }

  function buildSVG(speciesKey, outfit, costume = 'none') {
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
    if (costume === 'robe') buildRobe(bodyG, outfit);
    // 팔 (가운을 입으면 소매 색)
    const sleeve = costume === 'robe' ? ROBE.fill : outfit;
    const armL = el('ellipse', { cx: 62, cy: 192, rx: 10, ry: 18, fill: sleeve, class: 'arm arm-l', transform: 'rotate(20 62 192)' }, bodyG);
    const armR = el('ellipse', { cx: 138, cy: 192, rx: 10, ry: 18, fill: sleeve, class: 'arm arm-r', transform: 'rotate(-20 138 192)' }, bodyG);
    // 목에 두르는 것은 팔보다 위, 머리(턱)보다 아래
    let sparkle = null;
    if (costume === 'bowtie') sparkle = buildBowtie(bodyG);
    if (costume === 'santa') buildScarf(bodyG);

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
      return { open, happy, blink, x, y: eyeY };
    });

    // 눈썹 (모양은 update 에서 음 높이에 따라 바뀐다. 처음엔 편안한 모양)
    const bc = BROW[speciesKey] || BROW.default;
    const brows = eyeX.map(x => {
      const side = x < 100 ? -1 : 1;
      const path = el('path', { class: 'brow', fill: 'none', stroke: bc.color, 'stroke-width': 3.6, 'stroke-linecap': 'round' }, head);
      return { path, x, y: eyeY + bc.dy, side };
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

    // 모자: 머리 그룹 맨 위에 그려서 귀 밑동을 덮고, 머리와 함께 흔들린다
    let hat = null;
    if (costume === 'flower') buildFlowerCrown(head, speciesKey);
    if (costume === 'straw' || costume === 'santa') {
      const fit = HAT_FIT[speciesKey] || HAT_FIT.penguin;
      // 바깥 그룹은 매 프레임 살짝 늦게 따라오는 흔들림, 안쪽은 종별 자리 맞춤
      const swing = el('g', { class: 'costume hat' }, head);
      // 산타 모자는 챙이 없어 밀짚모자보다 좁으니 조금 크게
      const s = r2(fit.s * (costume === 'santa' ? 1.08 : 1));
      const inner = el('g', { transform: `translate(${fit.x} ${fit.y}) rotate(${fit.r}) scale(${s})` }, swing);
      if (costume === 'straw') buildStrawHat(inner); else buildSantaHat(inner);
      hat = { g: swing, x: fit.x, y: fit.y };
    }

    return { svg, root, head, eyes, brows, closed, mouthOpen, mouth, tongue, mouthY, armL, armR, hat, sparkle };
  }

  // 박 첫머리의 찌그러짐 (0..1 = 박 안의 위치). 1이면 가장 납작, 음수면 살짝 늘어남
  // 1/3박 안에 탱 하고 되돌아오며 한 번 살짝 늘어났다가 멈춘다 (스프링 느낌)
  function beatSquash(frac) {
    const k = frac * 3;
    if (k >= 1) return 0;
    if (k < 0.1) return Math.sin(k / 0.1 * Math.PI / 2);
    const u = (k - 0.1) / 0.9;
    return Math.cos(u * Math.PI * 1.5) * (1 - u) * (1 - u);
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
      this.costume = 'none';
      this.range = null;
      // 표정은 목표값을 부드럽게 따라간다 (음이 바뀔 때 눈썹이 툭툭 튀지 않게)
      this.face = { lift: 0, arch: 2.2, inner: 0, eyeK: 1 };
      this.render();
      this.nextBlink = performance.now() + 1000 + Math.random() * 3000;
      this.blinkUntil = 0;
      this.bounceT = -1;
      this.lastEventIdx = -1;
      this.bowT = -1;
      this.seed = Math.random() * 6;
      this.lastNow = null;
      this.hatSway = 0;
    }

    render() {
      const old = this.parts && this.parts.svg;
      this.parts = buildSVG(this.species, this.outfit, this.costume);
      // 같은 자리에 갈아 끼워서 이름표 등 다른 요소와의 순서를 유지
      if (old && old.parentNode === this.wrap) old.replaceWith(this.parts.svg);
      else this.wrap.appendChild(this.parts.svg);
      this.eyeMode = null;
      this.cache = {};
      this.applyFace();
    }

    setSpecies(sp) { this.species = sp; this.render(); }
    setOutfit(c) { this.outfit = c; this.render(); }
    // 의상은 this.costume 에 남아 있어서 종/옷 색을 바꿔 다시 그려도 그대로 입고 있다
    setCostume(name) {
      const c = COSTUME_IDS.includes(name) ? name : 'none';
      if (c === this.costume) return;
      this.costume = c;
      this.render();
    }
    // 이 가수가 부를 파트의 음역 (MIDI 번호). 표정이 음역 안에서 높고 낮음을 따진다
    setRange(lo, hi) {
      if (!isFinite(lo) || !isFinite(hi)) { this.range = null; return; }
      this.range = { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
    }
    // 0 = 파트에서 가장 낮은 음, 1 = 가장 높은 음. 음역을 모르면 0.5(보통 표정)
    pitchLevel(midi) {
      const r = this.range;
      if (!r || midi == null || !isFinite(midi)) return 0.5;
      // 지속음처럼 음역이 아주 좁은 파트는 반음 하나에 표정이 휙휙 바뀌지 않게 최소 폭을 둔다
      const mid = (r.lo + r.hi) / 2, half = Math.max(2.5, (r.hi - r.lo) / 2);
      return Math.max(0, Math.min(1, (midi - (mid - half)) / (2 * half)));
    }
    setDimmed(on) { this.wrap.classList.toggle('dimmed', on); }

    setEyes(mode) {
      if (mode === this.eyeMode) return;
      this.eyeMode = mode;
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

    // 같은 값이면 DOM 을 건드리지 않는다 (가수 넷 × 매 프레임)
    setAttr(node, key, name, value) {
      if (this.cache[key] === value) return;
      this.cache[key] = value;
      node.setAttribute(name, value);
    }

    // 표정 목표: 높은 음 → 눈썹이 올라가 둥글게 휘고 눈이 커진다, 낮은 음 → 눈썹이 편안히 내려온다,
    // 눈 감고 길게 부를 때 → 눈썹이 부드럽게 내려앉는다
    updateFace(dt, eyes, pitch) {
      let lift = 0, arch = 2.2, inner = 0, eyeK = 1;
      if (eyes === 'happy') { lift = -1.8; arch = 1.4; inner = -0.9; }
      else if (pitch != null) {
        const h = pitch * 2 - 1;
        if (h > 0) { lift = 4.6 * h; arch = 2.2 + 2.6 * h; inner = -1.4 * h; }
        else { lift = 1.8 * h; arch = 2.2 + 1.1 * h; inner = 0; }
        eyeK = 1 + 0.22 * Math.max(0, Math.min(1, (pitch - 0.45) / 0.55));
      }
      const f = this.face;
      const a = 1 - Math.exp(-dt / 70);
      f.lift += (lift - f.lift) * a;
      f.arch += (arch - f.arch) * a;
      f.inner += (inner - f.inner) * a;
      // 눈을 감고 있는 동안엔 크기를 바로 맞춰 둔다 (다시 뜰 때 눈이 커지는 게 따로 보이지 않게)
      f.eyeK += (eyeK - f.eyeK) * (eyes === 'open' ? a : 1);
      this.applyFace();
    }

    applyFace() {
      const p = this.parts, f = this.face;
      const bc = BROW[this.species] || BROW.default;
      p.brows.forEach((b, i) => {
        const y0 = b.y - f.lift * bc.lift;
        const ox = b.x + b.side * 7.5, ix = b.x - b.side * 7.5;   // 바깥쪽 끝 / 미간 쪽 끝
        const oy = y0 + 1, iy = y0 + f.inner;
        const cy = (oy + iy) / 2 - 2 * f.arch * bc.arch;
        this.setAttr(b.path, 'brow' + i, 'd', `M${r2(ox)} ${r2(oy)} Q ${b.x} ${r2(cy)} ${r2(ix)} ${r2(iy)}`);
      });
      const k = f.eyeK.toFixed(3);
      p.eyes.forEach((e, i) => {
        this.setAttr(e.open, 'eye' + i, 'transform', k === '1.000' ? '' : `translate(${e.x} ${e.y}) scale(${k}) translate(${-e.x} ${-e.y})`);
      });
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
      const dt = this.lastNow == null ? 16 : Math.max(0, Math.min(100, now - this.lastNow));
      this.lastNow = now;
      let mouth = 0, round = 0, wide = 0.5, pitch = null;
      let eyes = now < this.blinkUntil ? 'blink' : 'open';
      if (ev) {
        const into = audioT - ev.s;
        const left = ev.e - audioT;
        const consonant = audioT < ev.vs;
        const env = consonant ? 0.15 : Math.min(1, (audioT - ev.vs) / 0.05) * Math.min(1, left / 0.05);
        mouth = Math.max(0, env) * (0.35 + 0.65 * ev.open);
        round = ev.round; wide = ev.wide;
        pitch = this.pitchLevel(ev.midi);
        if (evIdx !== this.lastEventIdx) {
          this.lastEventIdx = evIdx;
          if (!ev.cont) { this.bounceT = now; this.spawnNote(); }
          // 다른 가수와 같은 가사면 무대 위 가사 줄에만 보이고 말풍선은 띄우지 않는다
          this.say(showBubble ? (ev.text || '').trim() : '');
        }
        // 길게 부르는 음은 눈을 감고 행복하게
        if (ev.long && into > 0.15) eyes = 'happy';
      }
      if (now > this.nextBlink) { this.blinkUntil = now + 130; this.nextBlink = now + 2000 + Math.random() * 3500; }
      this.setMouth(mouth, round, wide);

      // ---------- 몸짓 ----------
      const lvl = this.dance == null ? 1 : Math.max(0, Math.min(2, this.dance | 0)); // 0 얌전히, 1 보통, 2 신나게
      const md = this.mood || { amp: 1, tilt: 0, slow: 1, pump: 0 };
      let y = 0, sq = 1, sway, armBase = 0, headY = 0;
      // 음이 시작될 때 통통
      if (this.bounceT >= 0) {
        const k = (now - this.bounceT) / 260;
        if (k < 1) { y = -Math.sin(k * Math.PI) * [5, 9, 11][lvl] * md.amp; sq = 1 + Math.sin(k * Math.PI) * 0.03; }
      }
      if (beat != null) {
        // 박자에 맞춰 흔들기
        const ph = beat / (md.slow || 1);
        const swing = Math.sin(ph * Math.PI);
        sway = swing * [2, 4.5, 8][lvl] * md.amp;
        if (lvl === 2) {
          y -= Math.abs(swing) * 7 * md.amp;
          armBase = 22 * Math.abs(swing) * md.amp;
        }
        armBase += md.pump * 8 * Math.abs(swing);
        // 박 첫머리마다 쿵 하고 납작해졌다 튕겨 오른다 (발을 기준으로 위아래는 줄고 옆으로 퍼진다)
        // 신나게일수록·성격이 활발할수록 크게. 흔들기와 같은 박(느긋한 성격은 두 박에 한 번)
        const squash = beatSquash(ph - Math.floor(ph)) * [0.028, 0.05, 0.062][lvl] * Math.max(0.5, Math.min(1.25, md.amp));
        sq *= 1 - squash;
        headY += squash * 30; // 머리는 한 박자 늦게 꾸벅 따라 내려온다
      } else {
        // 기다리는 동안 숨쉬기
        sway = Math.sin(now / 900 + this.seed) * 1.5;
        sq *= 1 + Math.sin(now / 700 + this.seed) * 0.008;
      }
      sway += md.tilt || 0;
      // 노래가 끝나면 꾸벅 인사
      if (this.bowT >= 0) {
        const k = (now - this.bowT) / 1500;
        if (k < 1) {
          const bw = Math.sin(Math.min(1, k * 1.25) * Math.PI);
          headY += 22 * bw; sq *= 1 - 0.06 * bw; sway *= 1 - bw; armBase -= 12 * bw;
          if (bw > 0.2) eyes = 'happy';
        } else this.bowT = -1;
      }
      this.setEyes(eyes);
      this.updateFace(dt, eyes, pitch);

      p.root.setAttribute('transform', `translate(0 ${y.toFixed(2)}) translate(100 240) scale(${(2 - sq).toFixed(3)} ${sq.toFixed(3)}) translate(-100 -240)`);
      p.head.setAttribute('transform', `translate(0 ${headY.toFixed(1)}) rotate(${sway.toFixed(2)} 100 160)`);
      const arm = (ev ? 10 + mouth * 25 : 0) + armBase;
      p.armL.setAttribute('transform', `rotate(${20 + arm} 62 178)`);
      p.armR.setAttribute('transform', `rotate(${-20 - arm} 138 178)`);

      // 모자는 머리를 살짝 늦게 따라와서 얹혀 있는 느낌이 난다
      this.hatSway += (sway - this.hatSway) * (1 - Math.exp(-dt / 140));
      if (p.hat) {
        const lag = Math.max(-6, Math.min(6, (this.hatSway - sway) * 0.6));
        this.setAttr(p.hat.g, 'hat', 'transform', `rotate(${lag.toFixed(2)} ${p.hat.x} ${p.hat.y})`);
      }
      // 나비넥타이 반짝이: 가끔 반짝 (가수마다 박자가 달라 동시에 깜빡이지 않게)
      if (p.sparkle) {
        const tw = Math.pow(Math.max(0, Math.sin(now / 420 + this.seed * 3)), 4);
        const s = p.sparkle;
        this.setAttr(s.sparkle, 'spark', 'transform', `translate(${s.x} ${s.y}) rotate(${(tw * 45).toFixed(1)}) scale(${(0.45 + 0.75 * tw).toFixed(2)})`);
        this.setAttr(s.sparkle, 'sparkO', 'opacity', (0.35 + 0.65 * tw).toFixed(2));
      }
      this.wrap.classList.toggle('singing', !!ev);
    }

    bow() { this.bowT = performance.now(); this.say(''); }
    setScale(k) { this.wrap.style.setProperty('--scale', k.toFixed(3)); }

    idle() { this.say(''); this.lastEventIdx = -1; }
    destroy() { this.wrap.remove(); }
  }

  W.Critters = { SPECIES, COSTUMES, Critter };
})(window);
