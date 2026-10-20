// 화면 연결: 악보 불러오기 → 가수 배정 → 재생/애니메이션/WAV 저장
(function () {
  'use strict';
  const W = window;
  const $ = s => document.querySelector(s);

  // 성격: 목소리와 몸짓을 한 번에 바꾸는 묶음
  const PERSONALITY = {
    sweet:  { label: '다정',  voice: { formant: 1.5,  chirp: 0.5,  vibrato: 0.4,  brightness: 0.45, breath: 0.4 },  mood: { amp: 1,    tilt: 0,  slow: 1, pump: 0 } },
    peppy:  { label: '발랄',  voice: { formant: 1.66, chirp: 0.75, vibrato: 0.45, brightness: 0.58, breath: 0.3 },  mood: { amp: 1.3,  tilt: 0,  slow: 1, pump: 0 } },
    snooty: { label: '새침',  voice: { formant: 1.55, chirp: 0.3,  vibrato: 0.25, brightness: 0.52, breath: 0.45 }, mood: { amp: 0.7,  tilt: -4, slow: 1, pump: 0 } },
    lazy:   { label: '느긋',  voice: { formant: 1.36, chirp: 0.25, vibrato: 0.5,  brightness: 0.34, breath: 0.5 },  mood: { amp: 0.6,  tilt: 0,  slow: 2, pump: 0 } },
    jock:   { label: '씩씩',  voice: { formant: 1.34, chirp: 0.55, vibrato: 0.15, brightness: 0.56, breath: 0.15 }, mood: { amp: 1.15, tilt: 0,  slow: 1, pump: 1 } },
  };
  const DEFAULT_SINGERS = [
    { name: '솜이', species: 'rabbit', outfit: '#ff9eb5', octave: 0, personality: 'peppy', ...PERSONALITY.peppy.voice, volume: 0.9, syllables: '라' },
    { name: '나비', species: 'cat', outfit: '#8fd3ff', octave: 0, personality: 'snooty', ...PERSONALITY.snooty.voice, volume: 0.85, syllables: '라' },
    { name: '멍구', species: 'dog', outfit: '#ffd166', octave: 0, personality: 'jock', ...PERSONALITY.jock.voice, volume: 0.85, syllables: '라' },
    { name: '곰돌', species: 'bear', outfit: '#9be39b', octave: 0, personality: 'lazy', ...PERSONALITY.lazy.voice, volume: 0.95, syllables: '라' },
  ];
  const DEFAULT_STAGE = { scene: 'day', accomp: 'piano', dance: 1, greet: true, applause: true, sizeByVoice: false, groove: 'original', costume: 'auto' };
  // 배경에 맞춘 의상 ("배경에 맞춰"를 골랐을 때)
  const SCENE_COSTUME = { day: 'none', sunset: 'none', night: 'bowtie', spring: 'flower', winter: 'santa', beach: 'straw' };
  // 목소리 기본값이 바뀌면 버전을 올려서 예전 저장값을 쓰지 않는다
  const STORE_KEY = 'wingwing-choir-v3';

  const state = {
    song: null,
    lines: [],        // song.lines + 자동 화음 라인
    singers: [],
    count: 4,
    harmonyStyle: 'classic',  // 자동 화음 스타일
    stage: { ...DEFAULT_STAGE }, // 무대 꾸미기
    accomp: null,
    chordTimeline: [],        // 코드 진행 (반주에 씀)
    speed: 1,
    transpose: 0,
    reverb: 0.25,
    mix: { voice: 100, band: 100 }, // 목소리·반주 소리 크기(%)
    pos: 0,           // 곡 위치(초)
    playing: false,
    ctx: null,
    bus: null,
    handles: [],
    startWhen: 0,
    startOffset: 0,
    duration: 0,
  };

  // ---------- 저장/불러오기 ----------
  function loadPrefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    state.singers = DEFAULT_SINGERS.map((d, i) => ({
      ...d, ...(saved && saved.singers && saved.singers[i] ? saved.singers[i] : {}),
      lineId: null, mute: false, solo: false,
    }));
    if (saved && saved.count >= 1 && saved.count <= 4) state.count = saved.count;
    if (saved && saved.harmonyStyle && W.Harmony.STYLES.includes(saved.harmonyStyle)) state.harmonyStyle = saved.harmonyStyle;
    if (saved && saved.stage) state.stage = { ...DEFAULT_STAGE, ...saved.stage };
    // 반주 기본값이 '없음'→'피아노'로 바뀌기 전에 저장된 값은 새 기본값을 따른다
    if (saved && saved.stage && !saved.stageV2 && state.stage.accomp === 'none') state.stage.accomp = 'piano';
    if (saved && saved.mix) state.mix = { ...state.mix, ...saved.mix };
  }
  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        count: state.count,
        harmonyStyle: state.harmonyStyle,
        stage: state.stage,
        mix: state.mix,
        stageV2: true,
        singers: state.singers.map(({ lineId, mute, solo, ...rest }) => rest),
      }));
    } catch (e) { /* 저장 불가 환경 */ }
  }

  // ---------- 메시지 ----------
  function msg(text, kind) {
    document.querySelectorAll('.msg').forEach(m => {
      m.textContent = text || '';
      m.className = 'msg' + (kind ? ' ' + kind : '');
    });
  }

  // ---------- 화면 (① 악보 올리기 → ② 무대) ----------
  function showScreen(name) {
    $('#screenUpload').hidden = name !== 'upload';
    $('#screenStage').hidden = name !== 'stage';
    updateStartOverlay();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'stage') roll.resize();
  }

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
  function setPlayIcon(playing) {
    const b = $('#playBtn');
    b.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    b.setAttribute('aria-label', playing ? '일시정지' : '재생');
  }

  function updateStartOverlay() {
    const ov = $('#startOverlay');
    ov.hidden = state.playing || !state.song || $('#screenStage').hidden;
    const btn = $('#startBtn');
    if (state.finished) btn.textContent = '한 번 더 부르기';
    else if (state.pos > 0.5) btn.textContent = '이어서 부르기';
    else btn.textContent = '노래 시작하기';
  }

  function play() {
    if (!activeSingers().length) { msg('부를 파트가 없어요. "합창단 꾸미기"에서 파트를 골라 주세요.', 'err'); return; }
    state.finished = false;
    startPlayback(state.pos);
  }

  // ---------- 오디오 ----------
  function makeIR(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  function buildBus(ctx) {
    const input = ctx.createGain();
    input.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
    const dry = ctx.createGain();
    const wet = ctx.createGain(); wet.gain.value = state.reverb * 0.6;
    const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, 1.8);
    input.connect(dry); dry.connect(comp);
    input.connect(conv); conv.connect(wet); wet.connect(comp);
    comp.connect(ctx.destination);
    // 목소리와 반주는 각자 볼륨을 거쳐 같은 울림·컴프레서로 들어간다
    const voice = ctx.createGain(); voice.gain.value = mixGain(state.mix.voice);
    const band = ctx.createGain(); band.gain.value = mixGain(state.mix.band);
    voice.connect(input); band.connect(input);
    return { input, wet, voice, band };
  }
  // 슬라이더(0~150%) → 음량: 귀로 듣기에 고르게 커지도록 살짝 휘게
  function mixGain(pct) { return Math.pow(Math.max(0, pct) / 100, 1.6); }
  function applyMix() {
    if (!state.bus) return;
    const t = state.ctx.currentTime;
    state.bus.voice.gain.setTargetAtTime(mixGain(state.mix.voice), t, 0.04);
    state.bus.band.gain.setTargetAtTime(mixGain(state.mix.band), t, 0.04);
  }

  function ensureCtx() {
    if (!state.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      state.ctx = new AC({ latencyHint: 'interactive' });
      state.bus = buildBus(state.ctx);
    }
    if (state.ctx.state === 'suspended') state.ctx.resume();
    return state.ctx;
  }

  function lineById(id) { return state.lines.find(l => l.id === id) || null; }

  function activeSingers() {
    return state.singers.slice(0, state.count).map((s, i) => ({ s, i, line: playLine(lineById(s.lineId)) })).filter(x => x.line);
  }

  // ---------- 재즈 편곡 (스윙·보사노바·재즈 발라드) ----------
  function grooveOn() { return !!(W.Groove && state.stage.groove && state.stage.groove !== 'original' && state.song && state.song.beatToSec); }
  function songMeter() {
    const song = state.song;
    if (song && song.timeSig && song.timeSig.num && song.timeSig.den) return song.timeSig;
    return beatPulse() === 1.5 ? { num: 6, den: 8 } : { num: 4, den: 4 };
  }
  // 편곡에 맞춰 리듬을 바꾼 파트 (원래 파트는 그대로 두고, 고른 편곡마다 한 번만 만든다)
  const grooveCache = new WeakMap();
  function playLine(line) {
    if (!line || !grooveOn()) return line;
    let byId = grooveCache.get(line);
    if (!byId) { byId = {}; grooveCache.set(line, byId); }
    const id = state.stage.groove;
    if (!byId[id]) byId[id] = W.Groove.retimeLine(line, id, songMeter(), state.song.beatToSec);
    return byId[id];
  }

  function effVolume(s) {
    const anySolo = state.singers.slice(0, state.count).some(x => x.solo);
    if (s.mute || (anySolo && !s.solo)) return 0;
    return s.volume;
  }

  function voiceOpts(s) {
    return {
      octave: s.octave, formant: s.formant, chirp: s.chirp, vibrato: s.vibrato, brightness: s.brightness, breath: s.breath,
      volume: effVolume(s), transpose: state.transpose,
      syllables: splitSyl(s.syllables),
    };
  }
  function splitSyl(text) {
    const out = [];
    for (const ch of (text || '라').trim()) if (/[가-힣぀-ヿ]/.test(ch)) out.push(ch);
    if (!out.length) out.push(...(text || '').split(/[\s,-]+/).filter(Boolean));
    return out.length ? out : ['라'];
  }

  function computeDuration() {
    let d = 0;
    for (const { line } of activeSingers()) for (const n of line.notes) d = Math.max(d, n.t + n.d);
    if (!d) for (const l of state.lines) for (const n of l.notes) d = Math.max(d, n.t + n.d);
    state.duration = d;
  }

  function startPlayback(offset) {
    const ctx = ensureCtx();
    stopVoices();
    for (const c of critters) c.idle();
    lyric.holdUntil = -1;
    computeDuration();
    if (offset >= state.duration) offset = 0;
    const when = ctx.currentTime + 0.08;
    state.startWhen = when;
    state.startOffset = offset;
    state.handles = activeSingers().map(({ s, i, line }) => ({
      i, h: W.Voice.singLine(ctx, state.bus.voice, line, voiceOpts(s), offset, when, state.speed),
      ptr: 0,
    }));
    state.accomp = startAccomp(ctx, state.bus.band, offset, when);
    state.playing = true;
    setPlayIcon(true);
    updateStartOverlay();
  }

  function stopVoices() {
    for (const x of state.handles) x.h.stop();
    state.handles = [];
    if (state.accomp) { state.accomp.stop(); state.accomp = null; }
  }

  // 반주 (무대 꾸미기에서 고른 악기)
  function startAccomp(ctx, dest, offset, when) {
    const song = state.song;
    if (!song || !song.beatToSec || !state.chordTimeline.length) return null;
    if (grooveOn()) {
      // 재즈 편곡을 고르면 드럼·베이스·피아노(기타) 밴드가 반주한다
      return W.Groove.start(ctx, dest, {
        id: state.stage.groove, chords: state.chordTimeline, meter: songMeter(), beatToSec: song.beatToSec,
        offset, when, speed: state.speed, transpose: state.transpose, volume: 0.9,
      });
    }
    if (state.stage.accomp === 'none') return null;
    return W.Accomp.start(ctx, dest, {
      chords: state.chordTimeline, style: state.stage.accomp, pulse: beatPulse(),
      beatToSec: song.beatToSec, offset, when, speed: state.speed, transpose: state.transpose, volume: 0.75,
    });
  }

  // 한 박의 길이 (4분음표 = 1). 6/8 처럼 점4분음표가 한 박이면 1.5
  function beatPulse() {
    const song = state.song;
    if (song && song.beatUnit) return song.beatUnit;
    const tl = state.chordTimeline;
    if (tl.length > 2 && tl.every(c => Math.abs(c.b / 1.5 - Math.round(c.b / 1.5)) < 1e-3) && tl.some(c => Math.abs(c.b - Math.round(c.b)) > 1e-3)) return 1.5;
    return 1;
  }

  function currentPos() {
    if (!state.playing) return state.pos;
    return state.startOffset + Math.max(0, state.ctx.currentTime - state.startWhen) * state.speed;
  }

  function pause() {
    state.pos = currentPos();
    stopVoices();
    state.playing = false;
    setPlayIcon(false);
    for (const c of critters) c.idle();
    updateStartOverlay();
  }

  function seek(t) {
    state.pos = Math.max(0, Math.min(t, state.duration));
    state.finished = false;
    if (state.playing) startPlayback(state.pos);
    else { drawFrame(); updateStartOverlay(); }
  }

  let restartTimer = null;
  function restartSoon() {
    if (!state.playing) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { if (state.playing) startPlayback(currentPos()); }, 200);
  }

  // ---------- 캐릭터 ----------
  const critters = [];

  const greetTimers = [];
  function buildCritters(enter) {
    const box = $('#critters');
    for (const c of critters) c.destroy();
    critters.length = 0;
    greetTimers.forEach(clearTimeout);
    greetTimers.length = 0;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < state.count; i++) {
      const s = state.singers[i];
      const c = new W.Critters.Critter(box, s.species, s.outfit);
      const tag = document.createElement('div');
      tag.className = 'name-tag';
      c.wrap.appendChild(tag);
      c.tag = tag;
      if (enter && !reduce) {
        // 한 명씩 통통 튀어 올라와서 인사
        const d = 0.15 + i * 0.22;
        c.wrap.style.setProperty('--d', d + 's');
        c.wrap.classList.add('enter');
        const hello = ['안녕!', '반가워!', '안녕하세요!', '야호!'][i % 4];
        greetTimers.push(setTimeout(() => {
          if (state.playing) return;
          c.bounceT = performance.now();
          c.say(hello);
          if (state.stage.greet) speak(i, hello);
        }, (d + 0.75) * 1000));
        greetTimers.push(setTimeout(() => { if (!state.playing) c.say(''); }, (d + 2.4) * 1000));
      }
      critters.push(c);
    }
    applyCritterLooks();
    refreshCritterTags();
  }

  function costumeNow() {
    const c = state.stage.costume;
    return c === 'auto' ? (SCENE_COSTUME[state.stage.scene] || 'none') : c;
  }
  function applyCritterLooks() {
    const costume = costumeNow();
    critters.forEach((c, i) => {
      const s = state.singers[i];
      c.dance = state.stage.dance;
      c.mood = (PERSONALITY[s.personality] || PERSONALITY.sweet).mood;
      if (c.setCostume) c.setCostume(costume);
    });
  }

  function avgPitch(line) {
    let sum = 0, w = 0;
    for (const n of line.notes) { sum += n.midi * n.d; w += n.d; }
    return w ? sum / w : 60;
  }

  // 동물어로 짧게 말하기 (빠른 음절 + 말하는 듯한 음높이)
  function speak(i, text) {
    if (!state.ctx || state.ctx.state !== 'running') return;
    const s = state.singers[i];
    const syl = [...text].filter(ch => /[가-힣]/.test(ch));
    if (!syl.length) return;
    const line = lineById(s.lineId);
    const base = Math.round(Math.max(62, Math.min(76, (line ? avgPitch(line) : [72, 67, 62, 57][i]) + 5)));
    const step = 0.09;
    const contour = [0, 2, -1, 3, 1, 4];
    const notes = syl.map((ch, k) => ({
      t: k * step, d: step * 0.95, lyric: ch,
      midi: base + contour[k % contour.length] + (k === syl.length - 1 && /!/.test(text) ? 3 : 0),
    }));
    W.Voice.singLine(state.ctx, state.bus.voice, { notes, hasLyrics: true },
      { ...voiceOpts(s), volume: s.volume * 0.85, transpose: 0, octave: 0, vibrato: 0, chirp: Math.min(1, s.chirp + 0.3) },
      0, state.ctx.currentTime + 0.03, 1);
  }

  // 노래가 끝나면 꾸벅 인사 + 박수 + 꽃가루
  let cheerTimer = null;
  function curtainCall() {
    critters.forEach((c, i) => setTimeout(() => c.bow(), i * 120));
    // 관객도 환호
    const st = $('#stage');
    st.classList.add('cheer');
    clearTimeout(cheerTimer);
    cheerTimer = setTimeout(() => st.classList.remove('cheer'), 3200);
    fx.burst();
    if (state.ctx && state.ctx.state === 'running') W.Sfx.applause(state.ctx, state.bus.input, 3.2);
  }
  function partLabel(line) { return line ? line.name.replace(/^자동 화음 · /, '') : '쉬는 중'; }
  function refreshCritterTags() {
    critters.forEach((c, i) => {
      const s = state.singers[i];
      const line = lineById(s.lineId);
      c.tag.innerHTML = `${escapeHtml(s.name)}<small>${escapeHtml(partLabel(line))}</small>`;
      // 표정: 이 파트의 음역 안에서 높은 음일수록 눈이 커진다
      if (c.setRange && line && line.notes.length) {
        let lo = 127, hi = 0;
        for (const n of line.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
        const sh = 12 * s.octave + state.transpose; // 노래하는 음(ev.midi)에는 옥타브·조옮김이 들어 있다
        c.setRange(lo + sh, hi + sh);
      }
      c.setDimmed(!line || effVolume(s) === 0);
      // 목소리가 낮을수록 몸집이 크게
      c.setScale(state.stage.sizeByVoice && line ? Math.max(0.84, Math.min(1.16, 1 + (62 - avgPitch(line)) * 0.013)) : 1);
    });
    refreshSongMeta();
  }

  function refreshSongMeta() {
    computeDuration();
    const act = activeSingers();
    const mins = Math.floor(state.duration / 60), secs = Math.round(state.duration % 60);
    $('#songMeta').textContent = state.song
      ? `${act.length}명이 불러요 · ${act.map(a => partLabel(a.line)).join(', ')} · ${mins}분 ${secs}초`
      : '';
  }

  // 첫 화면에서 기다리는 합창단
  function buildWaiting() {
    const box = $('#waiting');
    box.innerHTML = '';
    state.singers.forEach(s => {
      const c = new W.Critters.Critter(box, s.species, s.outfit);
      c.setEyes('happy');
    });
  }

  // ---------- 그리기 루프 ----------
  function fmt(t) { t = Math.max(0, t); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); }

  let lastBob = -1;
  function drawFrame() {
    const now = performance.now();
    const pos = currentPos();
    if (state.playing && pos > state.duration + 0.4) {
      state.finished = true;
      pause();
      state.pos = 0;
      updateStartOverlay();
      if (state.stage.applause) curtainCall();
    }
    const audioT = state.playing ? state.ctx.currentTime : 0;
    const beat = state.playing && state.song && state.song.secToBeat ? state.song.secToBeat(pos) / beatPulse() : null;
    fx.tick();
    // 관객이 박자에 맞춰 고개를 까딱 (박 첫머리에 가장 크게)
    const bob = beat == null ? 0 : Math.pow(1 - (beat - Math.floor(beat)), 3);
    if (Math.abs(bob - lastBob) > 0.01) { $('#stage').style.setProperty('--bob', bob.toFixed(3)); lastBob = bob; }
    // 1) 가수마다 지금 부르는 음
    const cur = critters.map((c, i) => {
      const hx = state.playing ? state.handles.find(x => x.i === i) : null;
      let ev = null, idx = -1;
      if (hx) {
        const evs = hx.h.events;
        while (hx.ptr < evs.length && evs[hx.ptr].e < audioT) hx.ptr++;
        if (hx.ptr < evs.length && evs[hx.ptr].s <= audioT) { ev = evs[hx.ptr]; idx = hx.ptr; }
        if (!ev && (hx.ptr >= evs.length || evs[hx.ptr].s - audioT > 0.25)) c.say('');
      }
      return { ev, idx, text: ev ? (ev.text || '').trim() : '' };
    });
    // 2) 무대 위 가사 줄에 보일 글자: 이끄는 가수 것, 그가 쉬면 다른 가수들이 가장 많이 부르는 것
    const lead = leadSingerIndex();
    let topText = lead >= 0 && cur[lead] ? cur[lead].text : '';
    if (!topText) {
      const count = {};
      for (const x of cur) if (x.text) count[x.text] = (count[x.text] || 0) + 1;
      topText = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || '';
    }
    // 3) 말풍선은 가사 줄과 다른 가사를 부를 때만
    critters.forEach((c, i) => {
      const x = cur[i];
      const li = lineById(state.singers[i].lineId);
      // 자동 화음(우~, 둠 같은 반주 소리 포함)은 말풍선 없이
      c.update(now, x.ev, x.idx, pos, audioT, i !== lead && !!x.text && x.text !== topText && !(li && li.auto), beat);
    });
    renderLyrics(pos, topText);
    roll.draw(pos);
    if (!seekDragging) $('#seek').value = state.duration ? Math.round(pos / state.duration * 1000) : 0;
    $('#timeNow').textContent = fmt(pos);
    $('#timeLeft').textContent = '-' + fmt(state.duration - pos);
  }
  function loop() { drawFrame(); requestAnimationFrame(loop); }

  // ---------- 가사 한 줄 (노래방처럼) ----------
  const lyric = { line: null, phrases: [], shown: -2, spans: [], holdText: '', holdUntil: -1 };

  // 가사를 이끄는 가수: 가사가 있는 파트를 맡은 첫 번째 가수
  function leadSingerIndex() {
    // 자동 화음 파트보다 원래 악보 파트를, 그중에서도 가사가 있는 파트를 먼저
    let best = -1, bestScore = -1;
    for (let i = 0; i < state.count; i++) {
      const line = lineById(state.singers[i].lineId);
      if (!line || effVolume(state.singers[i]) === 0) continue;
      const score = (line.auto ? 0 : 2) + (line.hasLyrics ? 1 : 0);
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  // 쉼표(0.45초 넘게 쉼)나 너무 길어지면 줄을 나눈다
  function buildPhrases(line) {
    const phrases = [];
    if (!line || !line.hasLyrics) return phrases;
    let cur = null, lastEnd = -1;
    for (const n of line.notes) {
      const end = n.t + n.d;
      if (!n.lyric) {
        if (cur && n.t - lastEnd < 0.06) { cur.sylls[cur.sylls.length - 1].end = end; cur.end = end; lastEnd = end; }
        continue;
      }
      const prevText = cur && cur.sylls.length ? cur.sylls[cur.sylls.length - 1].text : '';
      const long = cur && ((cur.sylls.length >= 14 && /\s$/.test(prevText)) || cur.sylls.length >= 22);
      if (!cur || n.t - lastEnd > 0.45 || long) { cur = { start: n.t, end, sylls: [] }; phrases.push(cur); }
      cur.sylls.push({ t: n.t, end, text: n.lyric });
      cur.end = end; lastEnd = end;
    }
    return phrases;
  }

  function renderLyrics(pos, fallbackText) {
    const bar = $('#lyricBar'), lineEl = $('#lyricLine');
    const li = leadSingerIndex();
    const line = li >= 0 ? playLine(lineById(state.singers[li].lineId)) : null;
    // 곡이 바뀌면 파트 id(L0 …)가 같아도 다른 파트이므로 id가 아니라 파트 자체로 비교한다
    if (line !== lyric.line) { lyric.line = line; lyric.phrases = buildPhrases(line); lyric.shown = -2; }
    const ph = lyric.phrases;
    // 지금 부르는 줄, 없으면 곧 부를 줄 (멈춰 있을 땐 미리 보여 준다)
    let p = -1;
    for (let k = 0; k < ph.length; k++) if (pos < ph[k].end + 0.3) { p = k; break; }
    if (p >= 0 && state.playing && ph[p].start - pos > 2.5) p = -1;

    if (p >= 0) {
      if (lyric.shown !== p) {
        lyric.shown = p;
        lineEl.textContent = '';
        lyric.spans = ph[p].sylls.map(sy => {
          const sp = document.createElement('span');
          sp.textContent = sy.text;
          lineEl.appendChild(sp);
          return sp;
        });
      }
      ph[p].sylls.forEach((sy, k) => {
        const sp = lyric.spans[k];
        const now = pos >= sy.t && pos < sy.end;
        sp.className = now ? 'now' : pos >= sy.end ? 'done' : '';
      });
      bar.classList.remove('empty');
    } else if (fallbackText || pos < lyric.holdUntil) {
      // 허밍 사이의 짧은 숨에 깜빡이지 않게 잠깐 유지
      if (fallbackText) { lyric.holdText = fallbackText; lyric.holdUntil = pos + 0.6; }
      fallbackText = lyric.holdText;
      // 가사가 없는 곳의 허밍이나 가사 없는 악보: 지금 음절 하나만
      if (lyric.shown !== -1 || lineEl.textContent !== fallbackText) {
        lyric.shown = -1;
        lineEl.innerHTML = '';
        const sp = document.createElement('span');
        sp.className = 'now';
        sp.textContent = fallbackText;
        lineEl.appendChild(sp);
        lyric.spans = [sp];
      }
      bar.classList.remove('empty');
    } else {
      bar.classList.add('empty');
    }
  }

  // ---------- 피아노 롤 ----------
  const roll = new W.PianoRoll($('#roll'), t => seek(t));
  const fx = new W.StageFx($('#fx'));
  function refreshRoll() {
    const parts = [];
    for (let i = 0; i < state.count; i++) {
      const s = state.singers[i];
      const line = playLine(lineById(s.lineId));
      if (line) parts.push({ notes: line.notes, color: s.outfit, dim: effVolume(s) === 0 });
    }
    roll.setParts(parts);
  }

  // ---------- 가수 카드 ----------
  const SLIDERS = [
    ['formant', '귀여움', 1.0, 1.9, 0.01, '작은 동물일수록 목소리 울림이 높아져요'],
    ['chirp', '짹짹', 0, 1, 0.01, '프레이즈 첫 음의 "짹" 하고 내려앉는 말투와 음절마다 통통 튀는 정도'],
    ['breath', '숨결', 0, 1, 0.01, '속삭이듯 부드러운 숨소리를 섞어요'],
    ['vibrato', '떨림', 0, 1, 0.01, '긴 음에서 비브라토'],
    ['brightness', '밝기', 0, 1, 0.01, '음색의 밝기'],
    ['volume', '볼륨', 0, 1.5, 0.01, ''],
  ];

  function buildSingerCards() {
    const box = $('#singers');
    box.innerHTML = '';
    state.singers.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'singer card' + (i >= state.count ? ' off' : '');
      card.style.borderLeftColor = s.outfit;
      const speciesOpts = Object.entries(W.Critters.SPECIES).map(([k, v]) => `<option value="${k}"${k === s.species ? ' selected' : ''}>${v.name}</option>`).join('');
      card.innerHTML = `
        <div class="row"><input type="text" class="name" id="s${i}-name" data-k="name" value="${escapeHtml(s.name)}" aria-label="이름">
          <select id="s${i}-species" data-k="species" aria-label="동물">${speciesOpts}</select>
          <input type="color" id="s${i}-outfit" data-k="outfit" value="${s.outfit}" aria-label="옷 색"></div>
        <div class="row"><span>파트</span><select id="s${i}-line" data-k="lineId" class="line-sel" aria-label="파트"></select></div>
        <div class="row"><span>성격</span><select id="s${i}-personality" data-k="personality" aria-label="성격">
          ${Object.entries(PERSONALITY).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}<option value="custom">직접 조절</option></select></div>
        <div class="row"><span>옥타브</span><select id="s${i}-octave" data-k="octave" aria-label="옥타브">
          <option value="-1">한 옥타브 낮게</option><option value="0">악보대로</option><option value="1">한 옥타브 높게</option></select></div>
        <details class="voice-more" id="s${i}-more"><summary>목소리 다듬기<span class="chev down" aria-hidden="true"></span></summary>
        ${SLIDERS.map(([k, label, mn, mx, st, tip]) => `<label class="row" title="${escapeHtml(tip)}" for="s${i}-${k}"><span>${label}</span><input type="range" id="s${i}-${k}" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${s[k]}"></label>`).join('')}
        <label class="row" title="가사가 없는 악보일 때 부를 음절 (예: 라, 두비두바, 냐)"><span>가사 없을 때</span><input type="text" id="s${i}-syl" data-k="syllables" value="${escapeHtml(s.syllables)}"></label>
        </details>
        <div class="toggles"><button type="button" class="btn" data-t="mute">음소거</button><button type="button" class="btn" data-t="solo">솔로</button><button type="button" class="btn btn-tonal test" data-t="test">목소리 듣기</button></div>`;
      card.querySelector('[data-k=octave]').value = String(s.octave);
      card.querySelector('[data-k=personality]').value = PERSONALITY[s.personality] ? s.personality : 'custom';
      card.addEventListener('input', e => onSingerInput(i, e.target, false));
      card.addEventListener('change', e => onSingerInput(i, e.target, true));
      card.addEventListener('click', e => {
        const t = e.target.dataset && e.target.dataset.t;
        if (!t) return;
        if (t === 'test') { testVoice(i); return; }
        s[t] = !s[t];
        e.target.classList.toggle('on', s[t]);
        applyVolumes();
      });
      box.appendChild(card);
    });
    refreshLineSelects();
  }

  function escapeHtml(x) { return String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function onSingerInput(i, target, committed) {
    const k = target.dataset.k;
    if (!k) return;
    const s = state.singers[i];
    let v = target.value;
    if (target.type === 'range' || k === 'octave') v = parseFloat(v);
    if (k === 'lineId') v = v || null;
    if (s[k] === v) return;
    s[k] = v;
    const card = $('#singers').children[i];
    if (k === 'personality') {
      // 성격을 고르면 목소리 값과 몸짓을 한꺼번에 바꾼다
      const pr = PERSONALITY[v];
      if (pr) {
        Object.assign(s, pr.voice);
        for (const [vk, vv] of Object.entries(pr.voice)) { const el = card.querySelector(`[data-k=${vk}]`); if (el) el.value = vv; }
      }
      applyCritterLooks();
      restartSoon();
      savePrefs();
      return;
    }
    if (['formant', 'chirp', 'vibrato', 'brightness', 'breath'].includes(k) && s.personality !== 'custom') {
      s.personality = 'custom';
      card.querySelector('[data-k=personality]').value = 'custom';
    }
    if (k === 'outfit') { card.style.borderLeftColor = v; critters[i] && critters[i].setOutfit(v); refreshRoll(); }
    if (k === 'species' && critters[i]) critters[i].setSpecies(v);
    if (k === 'species' || k === 'outfit') buildWaiting();
    if (k === 'name') refreshCritterTags();
    if (k === 'lineId') { refreshCritterTags(); refreshRoll(); computeDuration(); }
    if (k === 'volume') { applyVolumes(); savePrefs(); return; }
    if (['formant', 'chirp', 'vibrato', 'brightness', 'breath', 'syllables'].includes(k) && !committed) return;
    if (['lineId', 'octave', 'formant', 'chirp', 'vibrato', 'brightness', 'breath', 'syllables'].includes(k)) restartSoon();
    savePrefs();
  }

  function applyVolumes() {
    for (const x of state.handles) x.h.setVolume(effVolume(state.singers[x.i]));
    refreshCritterTags();
    refreshRoll();
  }

  function refreshLineSelects() {
    document.querySelectorAll('.line-sel').forEach((sel, i) => {
      const s = state.singers[i];
      sel.innerHTML = '<option value="">(쉬기)</option>' + state.lines.map(l =>
        `<option value="${l.id}">${escapeHtml(l.name)}  · ${noteRange(l)}${l.hasLyrics ? ' · 가사' : ''}</option>`).join('');
      sel.value = s.lineId || '';
    });
  }

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function noteName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  function noteRange(l) {
    let lo = 127, hi = 0;
    for (const n of l.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
    return `${noteName(lo)}~${noteName(hi)}`;
  }

  // 목소리 미리듣기: "안녕하세요"
  function testVoice(i) {
    const ctx = ensureCtx();
    const s = state.singers[i];
    const base = [72, 67, 64, 55][i];
    const words = ['안', '녕', '하', '세', '요'];
    const pitches = [0, 2, 4, 2, 7];
    const notes = words.map((w, k) => ({ t: k * 0.22, d: k === 4 ? 0.6 : 0.2, midi: base + pitches[k], lyric: w }));
    W.Voice.singLine(ctx, state.bus.voice, { notes, hasLyrics: true }, { ...voiceOpts(s), volume: s.volume, transpose: 0 }, 0, ctx.currentTime + 0.05, 1);
  }

  // ---------- 인원 / 배정 ----------
  function setCount(n) {
    state.count = n;
    document.querySelectorAll('#countSeg button').forEach(b => b.classList.toggle('on', +b.dataset.n === n));
    Array.from($('#singers').children).forEach((c, i) => c.classList.toggle('off', i >= n));
    buildCritters();
    refreshRoll();
    computeDuration();
    savePrefs();
    restartSoon();
  }

  function autoAssign() {
    const songLines = state.lines;
    const pick = songLines
      .map(l => ({ l, score: (l.hasLyrics ? 1e6 : 0) + (l.auto ? 5e5 : 0) + l.notes.length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, state.count)
      .map(x => x.l);
    // 원래 파트를 우선, 높은 음부터
    const avg = l => l.notes.reduce((s, n) => s + n.midi * n.d, 0) / l.notes.reduce((s, n) => s + n.d, 0);
    pick.sort((a, b) => avg(b) - avg(a));
    state.singers.forEach((s, i) => { s.lineId = pick[i] ? pick[i].id : null; });
    refreshLineSelects();
    refreshCritterTags();
    refreshRoll();
    computeDuration();
    restartSoon();
  }

  const STYLE_LABEL = { classic: '클래식', jazz: '재즈', acappella: '아카펠라' };
  function autoHarmony(silent, preferred) {
    let melodyLine = preferred || lineById(state.singers[0].lineId);
    if (!melodyLine || melodyLine.auto) melodyLine = lineById(state.harmonyMelodyId) || state.lines.find(l => !l.auto);
    if (!melodyLine) return;
    const want = Math.max(1, state.count - 1);
    state.lines = state.lines.filter(l => !l.auto);
    const song = state.song || {};
    const res = W.Harmony.harmonize(melodyLine, Math.min(3, want), song.key, { chords: song.chords, beatToSec: song.beatToSec, style: state.harmonyStyle });
    const harm = res.lines;
    state.harmonyMelodyId = melodyLine.id;
    if (res.chords.length) state.chordTimeline = res.chords;
    harm.forEach((h, k) => { h.id = 'H' + k; state.lines.push(h); });
    state.singers[0].lineId = melodyLine.id;
    for (let i = 1; i < 4; i++) state.singers[i].lineId = harm[i - 1] ? harm[i - 1].id : null;
    if (state.count < 2) setCount(4);
    refreshLineSelects();
    refreshCritterTags();
    refreshRoll();
    computeDuration();
    restartSoon();
    if (!silent) msg(`"${melodyLine.name}" 선율에 맞춰 ${STYLE_LABEL[state.harmonyStyle]} 스타일로 ${harm.map(h => h.name.replace('자동 화음 · ', '')).join('·')} 화음을 만들었어요.` +
      (song.chords ? ' (악보의 코드 진행 사용)' : ''), 'ok');
  }

  // 편곡을 바꾸면: 리듬을 다시 잡고, 자동 화음이 클래식이면 재즈 화음으로 바꿔 준다
  function onGrooveChange() {
    const id = state.stage.groove;
    const label = (W.Groove && W.Groove.LIST.find(g => g.id === id) || {}).label || id;
    let extra = '';
    if (id !== 'original' && state.harmonyStyle === 'classic' && state.lines.some(l => l.auto)) {
      state.harmonyStyle = 'jazz';
      refreshStyleSeg();
      savePrefs();
      autoHarmony(true);
      extra = ' 자동 화음도 재즈 화음으로 바꿨어요.';
    }
    refreshRoll();
    refreshSongMeta();
    if (state.song) msg(id === 'original' ? '원곡 리듬으로 불러요.' : `${label} 편곡으로 불러요. 드럼·베이스·${id === 'bossa' ? '기타' : '피아노'} 밴드가 반주해요.${extra}`, 'ok');
    if (state.playing) startPlayback(currentPos());
  }

  function applyScene() {
    $('#stage').dataset.scene = state.stage.scene;
    fx.setScene(state.stage.scene);
    applyCritterLooks(); // "배경에 맞춰" 의상
  }
  function refreshStageControls() {
    const mark = (sel, val) => document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === String(val)));
    mark('#sceneChips', state.stage.scene);
    mark('#accSeg', state.stage.accomp);
    mark('#danceSeg', state.stage.dance);
    mark('#grooveChips', state.stage.groove);
    mark('#costumeChips', state.stage.costume);
    const accNote = $('#accNote');
    if (accNote) accNote.hidden = state.stage.groove === 'original';
    $('#optGreet').checked = state.stage.greet;
    $('#optApplause').checked = state.stage.applause;
    $('#optSize').checked = state.stage.sizeByVoice;
  }

  function refreshStyleSeg() {
    document.querySelectorAll('#styleSeg button').forEach(b => b.classList.toggle('on', b.dataset.style === state.harmonyStyle));
  }

  // ---------- 악보 불러오기 ----------
  function setSong(song, sourceLabel) {
    if (state.playing) pause();
    state.song = song;
    state.lines = song.lines.slice();
    state.pos = 0;
    state.finished = false;
    state.harmonyMelodyId = null;
    $('#songTitle').textContent = song.title;
    autoAssign();
    const top = lineById(state.singers[0].lineId) || song.lines[0];
    state.chordTimeline = W.Harmony.chordProgression(top, song.key, song.chords);
    let note = '';
    const hl = song.harmonizeLine && song.lines.find(l => l.name === song.harmonizeLine);
    if (hl) {
      if (state.count < 4) setCount(4);
      autoHarmony(true, hl);
      note = `\n"${hl.name}" 선율에 ${song.chords ? '악보의 코드 진행으로 ' : ''}알토·테너·베이스 화음을 붙였어요. 다른 파트는 합창단에서 골라 바꿀 수 있어요.`;
    } else if (song.lines.length === 1 && state.count > 1) {
      autoHarmony(true);
      note = '\n선율이 하나뿐이라 자동 화음으로 나머지 성부를 만들었어요.';
    } else if (song.chords && state.count > 1) {
      // 노래 파트가 인원보다 적고 코드 진행이 있으면, 가사가 가장 많은 파트에 화음을 붙인다
      const maxN = Math.max(...song.lines.map(l => l.notes.length));
      const real = song.lines.filter(l => l.notes.length >= maxN * 0.2);
      if (real.length < state.count) {
        const lead = real.slice().sort((a, b) => b.notes.filter(n => n.lyric).length - a.notes.filter(n => n.lyric).length)[0];
        autoHarmony(true, lead);
        note = `\n"${lead.name}" 선율에 악보의 코드 진행으로 알토·테너·베이스 화음을 붙였어요.`;
      }
    }
    const lyr = song.lines.some(l => l.hasLyrics) ? '가사 있음' : '가사 없음 → 가수별 "가사 없을 때" 음절로 불러요';
    msg(`${sourceLabel}에서 파트 ${song.lines.length}개를 읽었어요 · ${lyr}${note}`, 'ok');
    computeDuration();
    showScreen('stage');
    buildCritters(true);
    refreshRoll();
    updateStartOverlay();
    drawFrame();
  }

  async function loadFile(file) {
    ensureCtx(); // 사용자가 고른 순간에 소리를 켜 둬야 인사 소리가 나요
    try {
      const name = file.name.toLowerCase();
      let song;
      if (/\.pdf$/.test(name)) { await loadPdf(file); return; }
      if (/\.(mid|midi|kar)$/.test(name)) song = W.Midi.parseMidi(await file.arrayBuffer());
      else if (/\.mxl$/.test(name)) song = await W.Score.parseMXL(await file.arrayBuffer());
      else {
        const text = await file.text();
        if (/<score-(partwise|timewise)/.test(text)) song = W.Score.parseMusicXML(text);
        else {
          $('#textScore').value = text;
          song = W.Score.parseTextScore(text);
        }
      }
      if (!song.title || song.title === '제목 없음') song.title = file.name.replace(/\.[^.]+$/, '');
      setSong(song, file.name);
    } catch (err) {
      console.error(err);
      msg('악보를 읽지 못했어요. ' + (err.message || err), 'err');
    }
  }

  // ---------- PDF (베타) ----------
  const VOCAL_RE = /vocal|voice|chorus|choir|sopran|^alto|^tenor|^bass$|^baritone|melody|보컬|합창|코러스|소프라노|알토|테너|베이스|노래|선율|멜로디/i;
  async function loadPdf(file) {
    const progress = t => msg(t);
    msg('PDF 악보를 여는 중…');
    const handle = await W.PdfScore.open(await file.arrayBuffer(), progress);
    const secs = handle.sections.map((s, i) => ({ ...s, i })).filter(s => s.pages.length);
    const partSecs = secs.filter(s => s.label && !/score|총보|스코어/i.test(s.label));
    const finish = async idx => {
      const song = await W.PdfScore.read(handle, idx, progress);
      if (!song.title) song.title = file.name.replace(/\.[^.]+$/, '');
      setSong(song, file.name);
      const prev = document.querySelector('#screenStage .msg').textContent;
      msg(prev + '\nPDF 읽기는 베타라 틀린 음이 있을 수 있어요. 정확하게 부르려면 악보 프로그램에서 MusicXML로 내보낸 파일을 넣어 주세요.', 'ok');
    };
    if (partSecs.length >= 2) {
      msg('');
      showPicker(partSecs.map(s => ({ id: s.i, name: s.label, sub: `${s.pages.length}쪽`, on: VOCAL_RE.test(s.label) })),
        `PDF에서 파트 ${partSecs.length}개를 찾았어요. 부를 파트를 골라 주세요.`,
        async ids => {
          try { await finish(ids); } catch (err) { console.error(err); msg('악보를 읽지 못했어요. ' + (err.message || err), 'err'); }
        });
      return;
    }
    await finish(secs.map(s => s.i));
  }

  // 파트 고르기 (여러 파트가 든 PDF)
  function showPicker(items, title, onGo) {
    if (!items.some(it => it.on)) items[0].on = true;
    items = items.filter(it => it.on).concat(items.filter(it => !it.on)); // 골라 둔 파트를 위로
    const card = $('#pickCard');
    $('#pickTitle').textContent = title;
    const list = $('#pickList');
    list.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('label');
      row.className = 'list-row pick-row';
      row.innerHTML = `<input type="checkbox" class="check" ${it.on ? 'checked' : ''} data-id="${it.id}"><span class="row-text"><b>${escapeHtml(it.name)}</b><small>${escapeHtml(it.sub || '')}</small></span>`;
      list.appendChild(row);
    }
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#pickGo').onclick = () => {
      const ids = [...list.querySelectorAll('input:checked')].map(i => +i.dataset.id);
      if (!ids.length) { msg('파트를 하나 이상 골라 주세요.', 'err'); return; }
      card.hidden = true;
      onGo(ids);
    };
    $('#pickCancel').onclick = () => { card.hidden = true; msg(''); };
  }

  function loadText(text, label) {
    ensureCtx();
    try { setSong(W.Score.parseTextScore(text), label); } catch (err) { msg('악보를 읽지 못했어요.\n' + err.message, 'err'); }
  }

  // ---------- WAV 저장 ----------
  function encodeWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
    out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    ws(36, 'data'); out.setUint32(40, len * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
    }
    return new Blob([out], { type: 'audio/wav' });
  }

  let lastExportUrl = null;
  async function exportWav() {
    computeDuration();
    const act = activeSingers();
    if (!act.length) { msg('부를 파트가 없어요. 합창단에서 파트를 골라 주세요.', 'err'); return; }
    const btn = $('#exportBtn');
    btn.disabled = true; btn.textContent = '만드는 중…';
    try {
      const sr = 44100;
      const secs = state.duration / state.speed + 2.2;
      const off = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
      const bus = buildBus(off);
      for (const { s, line } of act) W.Voice.singLine(off, bus.voice, line, voiceOpts(s), 0, 0.05, state.speed);
      startAccomp(off, bus.band, 0, 0.05);
      const rendered = await off.startRendering();
      if (lastExportUrl) URL.revokeObjectURL(lastExportUrl);
      const url = lastExportUrl = URL.createObjectURL(encodeWav(rendered));
      // 다운로드를 막는 환경에서도 들을 수 있게 플레이어에도 넣는다
      const player = $('#exportPlayer');
      player.src = url;
      player.hidden = false;
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = (state.song ? state.song.title : 'choir') + ' - 동물 합창.wav';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { /* 다운로드가 막힌 환경 */ }
      msg('합창 WAV를 만들었어요. 아래 플레이어로 들을 수 있고, 플레이어 메뉴에서 저장할 수도 있어요.', 'ok');
    } catch (err) {
      console.error(err);
      msg('WAV를 만들지 못했어요. ' + err.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'WAV 만들기';
    }
  }

  // ---------- 이벤트 ----------
  let seekDragging = false;
  function bind() {
    $('#playBtn').addEventListener('click', () => { if (state.playing) pause(); else play(); });
    $('#startBtn').addEventListener('click', play);
    $('#stopBtn').addEventListener('click', () => { pause(); state.pos = 0; state.finished = false; updateStartOverlay(); drawFrame(); });
    $('#backBtn').addEventListener('click', () => { pause(); msg(''); showScreen('upload'); });
    const seekEl = $('#seek');
    seekEl.addEventListener('pointerdown', () => { seekDragging = true; });
    seekEl.addEventListener('input', () => { if (!state.playing) { state.pos = seekEl.value / 1000 * state.duration; } });
    seekEl.addEventListener('change', () => { seekDragging = false; seek(seekEl.value / 1000 * state.duration); });

    $('#speed').addEventListener('input', e => {
      $('#speedOut').textContent = e.target.value + '%';
      const p = currentPos();
      state.speed = e.target.value / 100;
      if (state.playing) { state.startOffset = p; state.startWhen = state.ctx.currentTime; }
      restartSoon();
    });
    $('#transpose').addEventListener('input', e => {
      state.transpose = +e.target.value;
      $('#transposeOut').textContent = (state.transpose > 0 ? '+' : '') + state.transpose;
      refreshCritterTags();
      restartSoon();
    });
    [['#voiceVol', 'voice'], ['#bandVol', 'band']].forEach(([sel, key]) => {
      const el = $(sel), out = $(sel + 'Out');
      el.value = state.mix[key]; out.textContent = state.mix[key] + '%';
      el.addEventListener('input', () => {
        state.mix[key] = +el.value;
        out.textContent = el.value + '%';
        applyMix();
      });
      el.addEventListener('change', savePrefs);
    });
    $('#reverb').addEventListener('input', e => {
      state.reverb = e.target.value / 100;
      $('#reverbOut').textContent = e.target.value;
      if (state.bus) state.bus.wet.gain.setTargetAtTime(state.reverb * 0.6, state.ctx.currentTime, 0.05);
    });
    $('#exportBtn').addEventListener('click', exportWav);

    $('#file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; });
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });

    document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => {
      const text = window.SAMPLE_SCORES[b.dataset.sample];
      $('#textScore').value = text;
      loadText(text, '예제 악보');
    }));
    $('#applyText').addEventListener('click', () => loadText($('#textScore').value, '텍스트 악보'));

    // 무대 꾸미기
    const segBind = (sel, key, parse, after) => document.querySelectorAll(sel + ' button').forEach(b => b.addEventListener('click', () => {
      state.stage[key] = parse(b.dataset.v);
      refreshStageControls();
      savePrefs();
      if (after) after();
    }));
    segBind('#sceneChips', 'scene', v => v, applyScene);
    segBind('#accSeg', 'accomp', v => v, () => restartSoon());
    segBind('#danceSeg', 'dance', v => +v, applyCritterLooks);
    segBind('#costumeChips', 'costume', v => v, applyCritterLooks);
    segBind('#grooveChips', 'groove', v => v, onGrooveChange);
    [['#optGreet', 'greet'], ['#optApplause', 'applause'], ['#optSize', 'sizeByVoice']].forEach(([sel, key]) => {
      $(sel).addEventListener('change', e => {
        state.stage[key] = e.target.checked;
        savePrefs();
        if (key === 'sizeByVoice') refreshCritterTags();
      });
    });

    document.querySelectorAll('#countSeg button').forEach(b => b.addEventListener('click', () => setCount(+b.dataset.n)));
    $('#autoAssign').addEventListener('click', () => { state.lines = state.lines.filter(l => !l.auto); refreshLineSelects(); autoAssign(); });
    $('#autoHarm').addEventListener('click', () => autoHarmony(false));
    document.querySelectorAll('#styleSeg button').forEach(b => b.addEventListener('click', () => {
      state.harmonyStyle = b.dataset.style;
      refreshStyleSeg();
      savePrefs();
      // 자동 화음을 쓰고 있으면 새 스타일로 다시 만든다
      if (state.lines.some(l => l.auto)) autoHarmony(false);
    }));

    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !$('#screenStage').hidden && !/INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(document.activeElement.tagName)) {
        e.preventDefault(); $('#playBtn').click();
      }
    });
  }

  // ---------- 시작 ----------
  loadPrefs();
  buildSingerCards();
  setCount(state.count);
  bind();
  buildWaiting();
  setPlayIcon(false);
  refreshStyleSeg();
  refreshStageControls();
  applyScene();
  $('#textScore').value = window.SAMPLE_SCORES.twinkle;
  showScreen('upload');
  requestAnimationFrame(loop);

  // 테스트/디버그용
  window.__choir = { state, startPlayback, pause, play, exportWav, loadText };
})();
