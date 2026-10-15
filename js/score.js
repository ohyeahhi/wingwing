// 악보 공통 모델 + MusicXML(.musicxml/.xml/.mxl) 파서 + 텍스트 악보 파서
//
// Song = {
//   title, bpm, key: {fifths, mode}|null,
//   lines: [{ id, name, hasLyrics, notes: [{ t, d, b, bd, midi, lyric }] }]
// }
//   t,d  : 시작/길이 (초, 원래 빠르기 기준)
//   b,bd : 시작/길이 (4분음표 = 1박)
(function (W) {
  'use strict';

  // ---------- 빠르기 지도 ----------
  function makeTempoMap(events, fallbackBpm) {
    const ev = (events || []).filter(e => e.bpm > 0).sort((a, b) => a.b - b.b);
    const dedup = [];
    for (const e of ev) {
      if (dedup.length && Math.abs(dedup[dedup.length - 1].b - e.b) < 1e-6) dedup[dedup.length - 1] = e;
      else dedup.push(e);
    }
    if (!dedup.length || dedup[0].b > 1e-6) dedup.unshift({ b: 0, bpm: dedup.length ? dedup[0].bpm : (fallbackBpm || 100) });
    // 각 구간 시작 시각(초) 미리 계산
    let sec = 0;
    for (let i = 0; i < dedup.length; i++) {
      if (i > 0) sec += (dedup[i].b - dedup[i - 1].b) * 60 / dedup[i - 1].bpm;
      dedup[i].sec = sec;
    }
    return {
      events: dedup,
      toSec(b) {
        let i = dedup.length - 1;
        while (i > 0 && dedup[i].b > b) i--;
        return dedup[i].sec + (b - dedup[i].b) * 60 / dedup[i].bpm;
      },
      toBeat(t) {
        let i = dedup.length - 1;
        while (i > 0 && dedup[i].sec > t) i--;
        return dedup[i].b + (t - dedup[i].sec) * dedup[i].bpm / 60;
      },
    };
  }

  // ---------- 트랙(화음 포함 가능) → 단선율 라인들 ----------
  const MAX_SPLIT = 4;
  function splitTrack(track) {
    const notes = track.notes.slice().sort((a, b) => a.b - b.b || b.midi - a.midi);
    const groups = [];
    for (const n of notes) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.b - n.b) < 1e-3) g.notes.push(n);
      else groups.push({ b: n.b, notes: [n] });
    }
    let maxSize = 1;
    for (const g of groups) {
      g.notes.sort((a, b) => b.midi - a.midi);
      // 같은 음이 겹친 경우 하나만
      g.notes = g.notes.filter((n, i) => i === 0 || n.midi !== g.notes[i - 1].midi);
      g.lyric = (g.notes.find(n => n.lyric) || {}).lyric || null;
      maxSize = Math.max(maxSize, g.notes.length);
    }
    const K = Math.min(maxSize, MAX_SPLIT);
    const out = [];
    const labels = K === 2 ? ['윗음', '아랫음'] : K === 3 ? ['윗음', '가운데음', '아랫음'] : ['1번째 음', '2번째 음', '3번째 음', '4번째 음'];
    for (let i = 0; i < K; i++) {
      const lineNotes = groups.map(g => {
        const len = g.notes.length;
        const idx = len > K ? Math.round(i * (len - 1) / (K - 1)) : Math.min(i, len - 1);
        const n = g.notes[idx];
        return { b: n.b, bd: n.bd, midi: n.midi, lyric: g.lyric };
      });
      // 겹침 정리: 다음 음 시작 전에 끝나도록
      for (let j = 0; j < lineNotes.length - 1; j++) {
        const gap = lineNotes[j + 1].b - lineNotes[j].b;
        if (lineNotes[j].bd > gap) lineNotes[j].bd = gap;
      }
      out.push({ name: K > 1 ? `${track.name} · ${labels[i]}` : track.name, notes: lineNotes.filter(n => n.bd > 1e-4) });
    }
    return out;
  }

  function finalizeSong({ title, tracks, tempoEvents, key, fallbackBpm, chords, harmonizeLine, beatUnit }) {
    const tempo = makeTempoMap(tempoEvents, fallbackBpm);
    const lines = [];
    for (const tr of tracks) {
      if (!tr.notes.length) continue;
      for (const l of splitTrack(tr)) {
        if (!l.notes.length) continue;
        for (const n of l.notes) {
          n.t = tempo.toSec(n.b);
          n.d = tempo.toSec(n.b + n.bd) - n.t;
        }
        l.hasLyrics = l.notes.some(n => n.lyric);
        l.id = 'L' + lines.length;
        lines.push(l);
      }
    }
    if (!lines.length) throw new Error('악보에서 음표를 찾지 못했어요.');
    return {
      title: title || '제목 없음', bpm: Math.round(tempo.events[0].bpm), key: key || null, lines,
      chords: chords && chords.length ? chords : null,
      harmonizeLine: harmonizeLine || null,
      beatToSec: b => tempo.toSec(b),
      secToBeat: t => tempo.toBeat(t),
      beatUnit: beatUnit || null,
    };
  }

  // ---------- MusicXML ----------
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const kids = (el, name) => Array.from(el ? el.children : []).filter(c => !name || c.tagName === name);
  const kid = (el, name) => kids(el, name)[0] || null;
  const txt = (el, name) => { const k = kid(el, name); return k ? k.textContent.trim() : null; };

  function parseMusicXML(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('MusicXML을 읽을 수 없어요 (XML 형식 오류).');
    const root = doc.documentElement;
    if (root.tagName === 'score-timewise') throw new Error('score-timewise 형식은 지원하지 않아요. score-partwise로 저장해 주세요.');
    if (root.tagName !== 'score-partwise') throw new Error('MusicXML 파일이 아닌 것 같아요.');

    const title = txt(kid(root, 'work'), 'work-title') || txt(root, 'movement-title') || '';
    const partNames = {};
    for (const sp of root.getElementsByTagName('score-part')) {
      partNames[sp.getAttribute('id')] = txt(sp, 'part-name') || txt(sp, 'part-abbreviation') || sp.getAttribute('id');
    }
    const tempoEvents = [];
    const chordEvents = [];
    let chordPart = null;
    let beatUnit = null;
    let key = null;
    const tracks = {};
    const trackOrder = [];
    const parts = kids(root, 'part');

    parts.forEach((part, pi) => {
      const pid = part.getAttribute('id');
      let divisions = 1;
      let measureStart = 0;
      const pending = {}; // 붙임줄 이어 붙이기
      const staffsUsed = new Set();
      const voicesUsed = new Set();
      for (const measure of kids(part, 'measure')) {
        let cursor = 0, maxCursor = 0, lastStart = 0;
        const addTempo = (sound) => {
          const tv = sound && parseFloat(sound.getAttribute('tempo'));
          if (tv > 0) tempoEvents.push({ b: measureStart + cursor, bpm: tv });
        };
        for (const el of kids(measure)) {
          switch (el.tagName) {
            case 'attributes': {
              const dv = parseFloat(txt(el, 'divisions'));
              if (dv > 0) divisions = dv;
              const k = kid(el, 'key');
              if (k && !key) key = { fifths: parseInt(txt(k, 'fifths') || '0', 10), mode: txt(k, 'mode') || 'major' };
              const tm = kid(el, 'time');
              if (tm && !beatUnit) {
                const beats = parseInt(txt(tm, 'beats') || '4', 10), type = parseInt(txt(tm, 'beat-type') || '4', 10);
                // 6/8·9/8·12/8 은 점4분음표가 한 박
                beatUnit = type === 8 && beats % 3 === 0 && beats > 3 ? 1.5 : 4 / type;
              }
              break;
            }
            case 'backup': cursor -= parseFloat(txt(el, 'duration') || '0') / divisions; break;
            case 'forward': cursor += parseFloat(txt(el, 'duration') || '0') / divisions; maxCursor = Math.max(maxCursor, cursor); break;
            case 'sound': addTempo(el); break;
            case 'harmony': {
              if (chordPart !== null && chordPart !== pi) break;
              const sym = harmonyToSymbol(el);
              if (sym) {
                chordPart = pi;
                const off = parseFloat(txt(el, 'offset') || '0') / divisions;
                chordEvents.push({ b: measureStart + cursor + off, sym });
              }
              break;
            }
            case 'direction': {
              const snd = kid(el, 'sound');
              if (snd && snd.getAttribute('tempo')) addTempo(snd);
              else {
                const met = el.getElementsByTagName('metronome')[0];
                if (met) {
                  const pm = parseFloat(txt(met, 'per-minute'));
                  const unit = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }[txt(met, 'beat-unit')] || 1;
                  const dot = kid(met, 'beat-unit-dot') ? 1.5 : 1;
                  if (pm > 0) tempoEvents.push({ b: measureStart + cursor, bpm: pm * unit * dot });
                }
              }
              break;
            }
            case 'note': {
              if (kid(el, 'grace') || kid(el, 'cue')) break;
              const dur = parseFloat(txt(el, 'duration') || '0') / divisions;
              const isChord = !!kid(el, 'chord');
              const start = isChord ? lastStart : cursor;
              if (!isChord) { lastStart = cursor; cursor += dur; }
              maxCursor = Math.max(maxCursor, cursor);
              const pitch = kid(el, 'pitch');
              if (kid(el, 'rest') || !pitch || dur <= 0) break;
              const midi = (parseInt(txt(pitch, 'octave'), 10) + 1) * 12 + STEP[txt(pitch, 'step')] + Math.round(parseFloat(txt(pitch, 'alter') || '0'));
              const voice = txt(el, 'voice') || '1';
              const staff = txt(el, 'staff') || '1';
              staffsUsed.add(staff); voicesUsed.add(voice);
              const ties = kids(el, 'tie').map(t => t.getAttribute('type'));
              const tKey = `${pid}|${staff}|${voice}`;
              const absStart = measureStart + start;
              const pKey = tKey + '|' + midi;
              if (ties.includes('stop') && pending[pKey] && Math.abs(pending[pKey].end - absStart) < 0.02) {
                pending[pKey].note.bd += dur;
                pending[pKey].end += dur;
                if (!ties.includes('start')) delete pending[pKey];
                break;
              }
              const lyrics = kids(el, 'lyric');
              const ly = lyrics.find(l => (l.getAttribute('number') || '1') === '1') || lyrics[0];
              let lyric = ly ? kids(ly, 'text').map(t => t.textContent).join('').trim() || null : null;
              const syllabic = ly && txt(ly, 'syllabic');
              if (lyric && (!syllabic || syllabic === 'single' || syllabic === 'end')) lyric += ' ';
              const note = { b: absStart, bd: dur, midi, lyric };
              if (!tracks[tKey]) { tracks[tKey] = { pid, pi, staff, voice, notes: [] }; trackOrder.push(tKey); }
              tracks[tKey].notes.push(note);
              if (ties.includes('start')) pending[pKey] = { note, end: absStart + dur };
              break;
            }
          }
        }
        measureStart += maxCursor;
      }
      // 이름 붙이기
      for (const k of trackOrder) {
        const tr = tracks[k];
        if (tr.pid !== pid || tr.name) continue;
        let name = partNames[pid] || `파트 ${pi + 1}`;
        if (staffsUsed.size > 1) name += ` (${tr.staff === '1' ? '위' : tr.staff === '2' ? '아래' : tr.staff + '번'} 보표)`;
        if (voicesUsed.size > 1) name += ` 성부${tr.voice}`;
        tr.name = name;
      }
    });

    chordEvents.sort((a, b) => a.b - b.b);
    const songEnd = Math.max(0, ...Object.values(tracks).flatMap(t => t.notes.map(n => n.b + n.bd)));
    const chords = chordEvents.map((c, i) => ({ ...c, bd: (i + 1 < chordEvents.length ? chordEvents[i + 1].b : songEnd) - c.b })).filter(c => c.bd > 0);
    return finalizeSong({ title, tracks: trackOrder.map(k => tracks[k]), tempoEvents, key, chords, beatUnit });
  }

  // <harmony> → "Ebmaj7" 같은 코드 기호
  const KIND = {
    major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7',
    'minor-seventh': 'm7', 'diminished-seventh': 'dim7', 'augmented-seventh': 'aug', 'half-diminished': 'm7b5',
    'major-minor': 'm', 'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '7', 'major-ninth': 'maj7',
    'minor-ninth': 'm7', 'dominant-11th': '7', 'major-11th': 'maj7', 'minor-11th': 'm7', 'dominant-13th': '7',
    'major-13th': 'maj7', 'minor-13th': 'm7', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '',
  };
  function harmonyToSymbol(h) {
    const root = kid(h, 'root');
    if (!root) return null;
    const acc = a => { const v = Math.round(parseFloat(a || '0')); return v > 0 ? '#'.repeat(v) : 'b'.repeat(-v); };
    let sym = txt(root, 'root-step') + acc(txt(root, 'root-alter'));
    const kind = txt(h, 'kind') || 'major';
    if (kind === 'none') return null;
    sym += KIND[kind] !== undefined ? KIND[kind] : '';
    const bass = kid(h, 'bass');
    if (bass) sym += '/' + txt(bass, 'bass-step') + acc(txt(bass, 'bass-alter'));
    return sym;
  }

  // ---------- .mxl (압축 MusicXML) ----------
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 .mxl 압축 해제를 지원하지 않아요. 압축 안 된 .musicxml로 저장해 주세요.');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('.mxl 압축 파일을 읽을 수 없어요.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + elen + clen;
    }
    async function read(name) {
      const f = files[name];
      if (!f) return null;
      const lnlen = dv.getUint16(f.off + 26, true), lelen = dv.getUint16(f.off + 28, true);
      const data = u8.subarray(f.off + 30 + lnlen + lelen, f.off + 30 + lnlen + lelen + f.csize);
      const raw = f.method === 8 ? await inflateRaw(data) : data;
      return dec.decode(raw);
    }
    return { names: Object.keys(files), read };
  }

  async function parseMXL(buf) {
    const zip = await unzip(buf);
    let path = null;
    const container = await zip.read('META-INF/container.xml');
    if (container) {
      const m = container.match(/full-path="([^"]+)"/);
      if (m) path = m[1];
    }
    if (!path) path = zip.names.find(n => !n.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(n));
    if (!path) throw new Error('.mxl 안에서 악보를 찾지 못했어요.');
    return parseMusicXML(await zip.read(path));
  }

  // ---------- 텍스트 악보 ----------
  // 예)  제목: 반짝반짝 작은별
  //      빠르기: 100
  //      소프라노: C5 C5 G5 G5 | A5 A5 G5:2
  //      소프라노 가사: 반짝반짝 작은별
  function parseDur(s) {
    if (!s) return 1;
    if (s.includes('/')) { const [a, b] = s.split('/'); return parseFloat(a || '1') / parseFloat(b); }
    return parseFloat(s);
  }

  function splitLyrics(str) {
    const out = [];
    for (const tok of str.split(/\s+/).filter(Boolean)) {
      if (/^[_\-~]$/.test(tok)) { out.push(null); continue; } // 늘임표: 앞 모음 이어 부르기
      // 낱말의 마지막 음절 뒤에 빈칸을 붙여 둔다 (화면에 가사를 띄어 쓸 때 쓰고, 발음에는 영향 없음)
      let last = -1;
      if (/[가-힣]/.test(tok)) {
        for (const ch of tok) {
          if (/[가-힣]/.test(ch)) { out.push(ch); last = out.length - 1; }
          else if (/[-_~]/.test(ch)) out.push(null); // 낱말 안의 "-" 도 앞 모음 늘이기
        }
      } else if (/[぀-ヿ]/.test(tok)) {
        for (const ch of tok) if (/[぀-ヿ]/.test(ch) && !'ゃゅょャュョっッー'.includes(ch)) { out.push(ch); last = out.length - 1; }
      } else {
        for (const part of tok.split('-')) if (part) { out.push(part); last = out.length - 1; }
      }
      if (last >= 0) out[last] += ' ';
    }
    return out;
  }

  function parseTextScore(text) {
    let title = '', bpm = 100, harmonizeLine = null, beatUnit = null;
    const chords = [];
    let chordCursor = 0;
    const voices = {};
    const order = [];
    const lyricLines = {};
    const commonLyrics = [];
    const errors = [];
    text.split(/\r?\n/).forEach((raw, ln) => {
      const line = raw.trim().startsWith('#') ? '' : raw.replace(/\s#\s.*$/, '').trim();
      if (!line) return;
      const m = line.match(/^([^:：]+?)\s*[:：]\s*(.*)$/);
      if (!m) { errors.push(`${ln + 1}번째 줄: "이름: 내용" 형식이 아니에요.`); return; }
      const name = m[1].trim(), body = m[2];
      const low = name.toLowerCase();
      if (['제목', 'title'].includes(low)) { title = body.trim(); return; }
      if (['빠르기', 'tempo', 'bpm'].includes(low)) { bpm = parseFloat(body) || bpm; return; }
      if (['박자', 'time', 'meter'].includes(low)) {
        const tm = body.match(/(\d+)\s*\/\s*(\d+)/);
        if (tm) { const bt = +tm[1], ty = +tm[2]; beatUnit = ty === 8 && bt % 3 === 0 && bt > 3 ? 1.5 : 4 / ty; }
        return;
      }
      if (['가사', 'lyrics', 'lyric'].includes(low)) { commonLyrics.push(...splitLyrics(body)); return; }
      if (['화음', 'harmony', 'harmonize'].includes(low)) { harmonizeLine = body.trim(); return; }
      if (['코드', 'chords', 'chord'].includes(low)) {
        for (const tok of body.split(/\s+/).filter(t => t && t !== '|' && t !== '||')) {
          const cm = tok.match(/^(.+?)(?::([\d./]+))?$/);
          const d = parseDur(cm[2]);
          if (!/^(N\.?C\.?|-|R|쉼)$/i.test(cm[1])) {
            if (!(W.Harmony && W.Harmony.parseChord(cm[1]))) { errors.push(`${ln + 1}번째 줄: 코드 "${cm[1]}" 를 읽을 수 없어요.`); continue; }
            chords.push({ b: chordCursor, bd: d, sym: cm[1] });
          }
          chordCursor += d;
        }
        return;
      }
      const lm = name.match(/^(.+?)[\s._-]*(가사|lyrics?)$/i);
      if (lm) { const v = lm[1].trim(); (lyricLines[v] = lyricLines[v] || []).push(...splitLyrics(body)); return; }
      if (!voices[name]) { voices[name] = { name, notes: [], cursor: 0 }; order.push(name); }
      const v = voices[name];
      for (const tok of body.split(/\s+/).filter(t => t && t !== '|' && t !== '||')) {
        let mm = tok.match(/^([A-Ga-g])([#b♯♭]*)(-?\d)(?::([\d./]+))?(?:\/(.+))?$/);
        if (mm) {
          const acc = [...mm[2]].reduce((s, c) => s + (c === '#' || c === '♯' ? 1 : -1), 0);
          const midi = (parseInt(mm[3], 10) + 1) * 12 + STEP[mm[1].toUpperCase()] + acc;
          const d = parseDur(mm[4]);
          const il = mm[5];
          v.notes.push({ b: v.cursor, bd: d, midi, lyric: il === undefined ? undefined : /^[-_~]$/.test(il) ? null : il });
          v.cursor += d;
          continue;
        }
        mm = tok.match(/^(?:R|r|쉼)(?::([\d./]+))?$/);
        if (mm) { v.cursor += parseDur(mm[1]); continue; }
        errors.push(`${ln + 1}번째 줄: "${tok}" 를 음표로 읽을 수 없어요. (예: C5, F#4:2, R:1)`);
      }
    });
    if (errors.length) throw new Error(errors.slice(0, 5).join('\n'));
    const tracks = order.map(name => {
      const v = voices[name];
      const ly = lyricLines[name] || commonLyrics;
      let li = 0;
      for (const n of v.notes) {
        if (n.lyric !== undefined) continue;
        n.lyric = li < ly.length ? ly[li] : null;
        li++;
      }
      for (const n of v.notes) if (n.lyric === undefined) n.lyric = null;
      return { name: v.name, notes: v.notes };
    });
    if (harmonizeLine && !voices[harmonizeLine]) throw new Error(`화음: "${harmonizeLine}" 이라는 파트가 없어요.`);
    return finalizeSong({ title, tracks, tempoEvents: [{ b: 0, bpm }], chords, harmonizeLine, beatUnit });
  }

  W.Score = { makeTempoMap, finalizeSong, parseMusicXML, parseMXL, parseTextScore };
})(window);
