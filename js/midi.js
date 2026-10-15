// 표준 MIDI 파일(.mid/.midi/.kar) 파서 → Song 모델
(function (W) {
  'use strict';

  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* 다음 시도 */ }
    try { return new TextDecoder('euc-kr').decode(bytes); } catch (e) { /* 다음 시도 */ }
    return String.fromCharCode(...bytes);
  }

  function parseMidi(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let p = 0;
    const str4 = () => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
    if (str4() !== 'MThd') throw new Error('MIDI 파일이 아니에요.');
    const hlen = dv.getUint32(p + 4);
    const ntrks = dv.getUint16(p + 10);
    let division = dv.getUint16(p + 12);
    if (division & 0x8000) {
      // SMPTE 시간 단위: 초당 틱 → 120bpm 기준 4분음표 틱으로 근사
      const fps = 256 - (division >> 8);
      division = Math.round(fps * (division & 0xff) / 2);
    }
    p += 8 + hlen;

    const tempoEvents = [];
    const lyricEvents = [];
    const tracks = [];
    let title = '';

    for (let ti = 0; ti < ntrks && p < u8.length; ti++) {
      while (p < u8.length && str4() !== 'MTrk') { p += 8 + dv.getUint32(p + 4); }
      if (p >= u8.length) break;
      const len = dv.getUint32(p + 4);
      let q = p + 8;
      const end = q + len;
      p = end;
      let tick = 0, status = 0;
      let trackName = '';
      const open = {};   // `${ch}|${note}` → [시작 틱 목록]
      const byCh = {};   // 채널별 음표
      const programs = {};
      const vlq = () => { let v = 0, b; do { b = u8[q++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && q < end); return v; };
      while (q < end) {
        tick += vlq();
        let st = u8[q];
        if (st & 0x80) { status = st; q++; } else st = status;
        const type = st & 0xf0, ch = st & 0x0f;
        if (st === 0xff) {
          const mt = u8[q++];
          const ml = vlq();
          const data = u8.subarray(q, q + ml);
          q += ml;
          if (mt === 0x51 && ml === 3) tempoEvents.push({ tick, bpm: 60000000 / ((data[0] << 16) | (data[1] << 8) | data[2]) });
          else if (mt === 0x03) { trackName = decodeText(data).trim(); if (ti === 0 && !title) title = trackName; }
          else if (mt === 0x05) lyricEvents.push({ tick, text: decodeText(data), track: ti });
          else if (mt === 0x01) {
            const t = decodeText(data);
            if (/^[\\/]/.test(t)) lyricEvents.push({ tick, text: t.slice(1), track: ti, kar: true }); // .kar 가사
          }
          else if (mt === 0x2f) break;
          continue;
        }
        if (st === 0xf0 || st === 0xf7) { q += vlq(); continue; }
        if (type === 0x90 || type === 0x80) {
          const note = u8[q], vel = u8[q + 1];
          q += 2;
          const k = ch + '|' + note;
          if (type === 0x90 && vel > 0) (open[k] = open[k] || []).push(tick);
          else if (open[k] && open[k].length) {
            const s = open[k].shift();
            if (tick > s) (byCh[ch] = byCh[ch] || []).push({ s, e: tick, midi: note });
          }
        } else if (type === 0xc0) { programs[ch] = u8[q]; q += 1; }
        else if (type === 0xd0) q += 1;
        else q += 2;
      }
      for (const ch in byCh) {
        if (+ch === 9) continue; // 드럼 채널 제외
        const chCount = Object.keys(byCh).filter(c => +c !== 9).length;
        let name = trackName || `트랙 ${ti + 1}`;
        if (chCount > 1) name += ` (채널 ${+ch + 1})`;
        tracks.push({ name, track: ti, notes: byCh[ch].sort((a, b) => a.s - b.s) });
      }
    }

    // 가사를 가장 잘 맞는 트랙에 붙인다
    if (lyricEvents.length) {
      const useKar = lyricEvents.some(l => l.kar) && !lyricEvents.some(l => !l.kar);
      const lyr = lyricEvents.filter(l => !!l.kar === useKar)
        .map(l => ({ tick: l.tick, text: l.text.replace(/[\r\n\\/]/g, '').trim() }))
        .filter(l => l.text);
      const tol = division / 16;
      let best = null, bestScore = 0;
      for (const tr of tracks) {
        let score = 0;
        const starts = tr.notes.map(n => n.s);
        for (const l of lyr) if (starts.some(s => Math.abs(s - l.tick) <= tol)) score++;
        if (score > bestScore) { bestScore = score; best = tr; }
      }
      if (best) {
        let j = 0;
        for (const n of best.notes) {
          while (j < lyr.length && lyr[j].tick < n.s - tol) j++;
          if (j < lyr.length && Math.abs(lyr[j].tick - n.s) <= tol) { n.lyric = lyr[j].text; j++; }
        }
      }
    }

    const outTracks = tracks.map(tr => ({
      name: tr.name,
      notes: tr.notes.map(n => ({ b: n.s / division, bd: (n.e - n.s) / division, midi: n.midi, lyric: n.lyric || null })),
    }));
    return W.Score.finalizeSong({
      title,
      tracks: outTracks,
      tempoEvents: tempoEvents.map(e => ({ b: e.tick / division, bpm: e.bpm })),
      fallbackBpm: 120,
    });
  }

  W.Midi = { parseMidi };
})(window);
