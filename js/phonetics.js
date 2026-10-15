// 가사 음절 → 발음 정보(자음 · 반모음 · 모음 · 받침) 변환
// 한글은 자모 분해, 로마자는 간단한 규칙으로 처리한다.
(function (W) {
  'use strict';

  // 모음 포먼트 (Hz). 아이 목소리에 가까운 값으로 잡고, 캐릭터별 배율을 곱해 쓴다.
  const VOWELS = {
    a:  { f: [820, 1250, 2700], open: 1.0,  round: 0.2, wide: 0.6 },
    e:  { f: [520, 1950, 2750], open: 0.6,  round: 0.0, wide: 0.9 },
    i:  { f: [310, 2400, 3150], open: 0.25, round: 0.0, wide: 1.0 },
    o:  { f: [480, 850, 2650],  open: 0.6,  round: 1.0, wide: 0.2 },
    u:  { f: [340, 900, 2400],  open: 0.35, round: 1.0, wide: 0.1 },
    eo: { f: [640, 1100, 2600], open: 0.75, round: 0.4, wide: 0.4 },
    eu: { f: [360, 1450, 2600], open: 0.3,  round: 0.0, wide: 0.7 },
    m:  { f: [260, 1100, 2500], open: 0.0,  round: 0.3, wide: 0.3 }, // 허밍
  };

  // 한글 초성 19자
  const CHO = [
    { c: 'k', type: 'stop', place: 'velar' },          // ㄱ
    { c: 'kk', type: 'stop', place: 'velar', tense: true }, // ㄲ
    { c: 'n', type: 'nasal', place: 'alveolar' },       // ㄴ
    { c: 't', type: 'stop', place: 'alveolar' },        // ㄷ
    { c: 'tt', type: 'stop', place: 'alveolar', tense: true }, // ㄸ
    { c: 'r', type: 'liquid', place: 'alveolar' },      // ㄹ
    { c: 'm', type: 'nasal', place: 'labial' },         // ㅁ
    { c: 'p', type: 'stop', place: 'labial' },          // ㅂ
    { c: 'pp', type: 'stop', place: 'labial', tense: true }, // ㅃ
    { c: 's', type: 'fric', place: 'alveolar' },        // ㅅ
    { c: 'ss', type: 'fric', place: 'alveolar', tense: true }, // ㅆ
    null,                                               // ㅇ (무음)
    { c: 'j', type: 'affr', place: 'palatal' },         // ㅈ
    { c: 'jj', type: 'affr', place: 'palatal', tense: true }, // ㅉ
    { c: 'ch', type: 'affr', place: 'palatal', asp: true },  // ㅊ
    { c: 'kh', type: 'stop', place: 'velar', asp: true },    // ㅋ
    { c: 'th', type: 'stop', place: 'alveolar', asp: true }, // ㅌ
    { c: 'ph', type: 'stop', place: 'labial', asp: true },   // ㅍ
    { c: 'h', type: 'fric', place: 'glottal' },         // ㅎ
  ];

  // 한글 중성 21자 → [반모음, 모음]
  const JUNG = [
    [null, 'a'], [null, 'e'], ['y', 'a'], ['y', 'e'], [null, 'eo'], [null, 'e'],
    ['y', 'eo'], ['y', 'e'], [null, 'o'], ['w', 'a'], ['w', 'e'], ['w', 'e'],
    ['y', 'o'], [null, 'u'], ['w', 'eo'], ['w', 'e'], ['w', 'i'], ['y', 'u'],
    [null, 'eu'], ['eu', 'i'], [null, 'i'],
  ];

  // 한글 종성 28자(0 = 없음) → 받침 종류
  function jongType(idx) {
    if (idx === 0) return null;
    if ([4, 5, 6].includes(idx)) return { type: 'nasal', place: 'alveolar' }; // ㄴ ㄵ ㄶ
    if (idx === 16) return { type: 'nasal', place: 'labial' };                // ㅁ
    if (idx === 21) return { type: 'nasal', place: 'velar' };                 // ㅇ
    if (idx >= 8 && idx <= 15) return { type: 'liquid', place: 'alveolar' };  // ㄹ 계열
    return { type: 'stop', place: 'velar' };                                  // 나머지는 닫힘
  }

  function parseHangul(ch) {
    const code = ch.charCodeAt(0) - 0xac00;
    const cho = Math.floor(code / 588);
    const jung = Math.floor((code % 588) / 28);
    const jong = code % 28;
    const [glide, vowel] = JUNG[jung];
    return { onset: CHO[cho], glide, vowel, coda: jongType(jong) };
  }

  // 로마자 음절 (영어/로마자 가사)
  const LATIN_ONSET = [
    ['sh', { c: 'sh', type: 'fric', place: 'palatal' }],
    ['ch', { c: 'ch', type: 'affr', place: 'palatal', asp: true }],
    ['th', { c: 'th', type: 'fric', place: 'dental' }],
    ['ph', { c: 'f', type: 'fric', place: 'labial' }],
    ['b', { c: 'p', type: 'stop', place: 'labial' }],
    ['p', { c: 'ph', type: 'stop', place: 'labial', asp: true }],
    ['d', { c: 't', type: 'stop', place: 'alveolar' }],
    ['t', { c: 'th', type: 'stop', place: 'alveolar', asp: true }],
    ['g', { c: 'k', type: 'stop', place: 'velar' }],
    ['k', { c: 'kh', type: 'stop', place: 'velar', asp: true }],
    ['c', { c: 'kh', type: 'stop', place: 'velar', asp: true }],
    ['q', { c: 'kh', type: 'stop', place: 'velar', asp: true }],
    ['s', { c: 's', type: 'fric', place: 'alveolar' }],
    ['z', { c: 'z', type: 'fric', place: 'alveolar' }],
    ['f', { c: 'f', type: 'fric', place: 'labial' }],
    ['v', { c: 'f', type: 'fric', place: 'labial' }],
    ['h', { c: 'h', type: 'fric', place: 'glottal' }],
    ['x', { c: 's', type: 'fric', place: 'alveolar' }],
    ['j', { c: 'j', type: 'affr', place: 'palatal' }],
    ['m', { c: 'm', type: 'nasal', place: 'labial' }],
    ['n', { c: 'n', type: 'nasal', place: 'alveolar' }],
    ['l', { c: 'r', type: 'liquid', place: 'alveolar' }],
    ['r', { c: 'r', type: 'liquid', place: 'alveolar' }],
  ];
  const LATIN_VOWEL = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'i' };

  function parseLatin(word) {
    let s = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return null;
    let onset = null, glide = null;
    for (const [k, v] of LATIN_ONSET) {
      if (s.startsWith(k)) { onset = v; s = s.slice(k.length); break; }
    }
    // 남은 자음 + w/y 는 반모음 처리
    while (s && !LATIN_VOWEL[s[0]] ) {
      if (s[0] === 'w') glide = 'w';
      s = s.slice(1);
    }
    if (s.startsWith('y') && s.length > 1 && LATIN_VOWEL[s[1]]) { glide = 'y'; s = s.slice(1); }
    let vowel = 'eo';
    if (s) {
      const two = s.slice(0, 2);
      if (two === 'oo' || two === 'ou') vowel = 'u';
      else if (two === 'ee' || two === 'ea') vowel = 'i';
      else if (two === 'ai' || two === 'ay') vowel = 'e';
      else vowel = LATIN_VOWEL[s[0]] || 'a';
    }
    let coda = null;
    const tail = s.replace(/^[aeiouy]+/, '');
    if (/^(ng|n)/.test(tail)) coda = { type: 'nasal', place: tail.startsWith('ng') ? 'velar' : 'alveolar' };
    else if (/^m/.test(tail)) coda = { type: 'nasal', place: 'labial' };
    else if (/^[lr]/.test(tail)) coda = { type: 'liquid', place: 'alveolar' };
    else if (/^[bcdgkpqt]/.test(tail)) coda = { type: 'stop', place: 'velar' };
    return { onset, glide, vowel, coda };
  }

  // 일본어 가나 (간단): 모음만 추정
  function parseKana(ch) {
    const c = ch.charCodeAt(0);
    const base = c >= 0x30a0 ? c - 0x60 : c; // 가타카나 → 히라가나
    const h = String.fromCharCode(base);
    if (h === 'ん') return { onset: null, glide: null, vowel: 'm', coda: null };
    const grid = 'あいうえおかきくけこがぎぐげごさしすせそざじずぜぞたちつてとだぢづでどなにぬねのはひふへほばびぶべぼぱぴぷぺぽまみむめもらりるれろ';
    const cons = ['', 'k', 'g', 's', 'z', 't', 'd', 'n', 'h', 'b', 'p', 'm', 'r'];
    let idx = grid.indexOf(h);
    if (idx >= 0) return parseLatin(cons[Math.floor(idx / 5)] + 'aiueo'[idx % 5]);
    idx = 'やゆよわを'.indexOf(h);
    if (idx >= 0) return parseLatin(['ya', 'yu', 'yo', 'wa', 'o'][idx]);
    return null;
  }

  /**
   * 가사 한 토막을 발음 정보로 바꾼다.
   * @returns {{onset, glide, vowel, coda, text}}
   */
  function parseSyllable(text) {
    const t = (text || '').trim();
    if (!t) return null;
    for (const ch of t) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) return { ...parseHangul(ch), text: t };
      if ((code >= 0x3040 && code <= 0x30ff)) {
        const k = parseKana(ch);
        if (k) return { ...k, text: t };
      }
    }
    const latin = parseLatin(t);
    if (latin) return { ...latin, text: t };
    return { onset: null, glide: null, vowel: 'a', coda: null, text: t };
  }

  W.Phonetics = { VOWELS, parseSyllable };
})(window);
