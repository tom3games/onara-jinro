// おなら人狼 / FART WOLF
import * as THREE from 'three'

const D = window.FW
const $ = s => document.querySelector(s)
const STEP = 1 / 60
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }
const YOU = 2, NSEAT = 5
const CPUS = [0, 1, 3, 4]
const FT = Object.fromEntries(D.farts.map(f => [f.id, f]))
const FIDS = D.farts.map(f => f.id)

// ---------- 状態
const S = {
  lang: store.get('fw.lang') || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  mode: 'title', ph: '', t: 0, time: 0, seed: (Date.now() & 0xffffff) || 1, rand: null,
  round: 0, lives: 3, score: 0, pend: 0, smell: 0, cd: 0, zawa: false,
  evs: [], farts: [], cpuPlan: [], gz: [], gzT: [], E: null, sniffer: 1, meetQ: [], votes: [], culprit: -1, outcome: '',
  stats: { farts: 0, framed: 0, caught: 0, best: 0 }, result: null, resT: 0, dbgPause: false, doCap: false, capKind: '', tut: true, hintT: 0,
}
S.rand = mulberry(S.seed)
const R = () => S.rand()
const pick = a => a[Math.floor(R() * a.length) % a.length]
const TT = () => D.T[S.lang]
const nameOf = (i, call) => i === YOU && call ? TT().youCall : D.ppl[D.seats[i]][S.lang]
const sharp = () => clamp(0.22 + 0.13 * (S.round - 1), 0, 1)

// ---------- 音（WebAudio だけで鳴らす）
// おならは elevator-fart と同じ3層（空気の破裂＋尻の共鳴＋しぼみ）。毎回ちがう音。
// how: plain=ふつう / masked=かき消せた（こもって小さく）/ half=半分 / busted=丸聞こえ（和室に響く）
const Snd = {
  ctx: null, muted: store.get('fw.mute') === '1', next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, fartLog: [], sour: 0, bgmLog: [], detMax: 0,
  TEMPO: { title: 84, night: 72, meet: 112, happy: 132, sad: 66, ny: 144 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC()
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(c.destination)
      this.bgm = c.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      // 和室の響き（畳と障子で柔らかく、少し長め）。丸聞こえの時だけ通す
      const irL = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(2, irL, c.sampleRate)
      for (let ch = 0; ch < 2; ch++) {
        const b = ir.getChannelData(ch); let lp = 0
        for (let i = 0; i < irL; i++) { const tt = i / c.sampleRate; lp += ((Math.random() * 2 - 1) - lp) * 0.18; b[i] = lp * 2.2 * Math.exp(-tt / 0.17) }
        for (const [dl, a] of [[0.013, 0.55], [0.021, -0.4], [0.034, 0.32], [0.052, -0.22], [0.077, 0.14]]) b[Math.floor(dl * c.sampleRate) + ch * 11] += a
      }
      this.room = c.createConvolver(); this.room.buffer = ir; const rw = c.createGain(); rw.gain.value = 0.9; this.room.connect(rw); rw.connect(this.master)
      this.muf = c.createBiquadFilter(); this.muf.type = 'lowpass'; this.muf.frequency.value = 380; this.muf.Q.value = 0.5; const mg = c.createGain(); mg.gain.value = 0.32; this.muf.connect(mg); mg.connect(this.master)
      this.half = c.createBiquadFilter(); this.half.type = 'lowpass'; this.half.frequency.value = 1100; const hg = c.createGain(); hg.gain.value = 0.62; this.half.connect(hg); hg.connect(this.master)
      // 遠くのテレビ（ふすま越し: 低いところと高いところを削る）
      this.tv = c.createBiquadFilter(); this.tv.type = 'bandpass'; this.tv.frequency.value = 900; this.tv.Q.value = 0.7; const tg = c.createGain(); tg.gain.value = 0.55; this.tv.connect(tg); tg.connect(this.bgm)
      // 外の静けさ: ずっと鳴っている、ごく小さい風（ゆっくり揺れる）
      const ws = c.createBufferSource(); ws.buffer = this.noiseBuf; ws.loop = true
      const wl = c.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 240; const wg = c.createGain(); wg.gain.value = 0.018
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(wg.gain)
      ws.connect(wl); wl.connect(wg); wg.connect(this.master); ws.start(); lfo.start(); this.mark('amb:wind')
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; store.set('fw.mute', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.8 },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(Math.max(0.0002, vol), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02)
  },
  voice(f, t0, dur, vol, formant = 900, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    bp.type = 'bandpass'; bp.frequency.value = formant; bp.Q.value = 3
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(bp); bp.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; this.mark('want:' + name); if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  vol() { return this.track === 'night' ? 0.34 : 0.3 },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(this.vol(), c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb * this.drag(); this.step++ }
  },
  // 匂いがたまると sour（0..1）が上がる: テレビの歌の音程が狂い、テンポがよれ、音が抜け、低いうなりが入る
  drag() { const q = this.track === 'night' ? this.sour : 0; return q ? 1 + q * (0.08 * Math.sin(this.step * 0.37) + (Math.random() - 0.5) * 0.12) : 1 },
  det() { const q = this.track === 'night' ? this.sour : 0; if (!q) return 0; const c = q * (Math.sin(this.step * 0.13) * 34 + (Math.random() - 0.5) * 50); this.detMax = Math.max(this.detMax, Math.abs(c)); return c },
  hz(m) { return this.mtof(m) * Math.pow(2, this.det() / 1200) },
  // 琴: 爪で弾いた立ち上がり（少し上から落ちる）＋オクターブ上のきらめき
  koto(n, t, vol = 0.07, dest) { const f = this.mtof(n), d = dest || this.bgm; this.tone(f * 1.02, t, 0.7, 'triangle', vol, d, f); this.tone(f * 2, t, 0.16, 'sine', vol * 0.45, d); this.noise(t, 0.015, vol * 0.5, 3000, 'bandpass', d, 2) },
  // 三味線: のこぎり波を締まるフィルタに。さわり（ビリつき）を少し
  shami(n, t, vol = 0.06) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), f = this.mtof(n)
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.015, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03)
    lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(3600, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.18)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    o.connect(lp); lp.connect(g); g.connect(this.bgm); o.start(t); o.stop(t + 0.35)
    this.noise(t, 0.05, vol * 0.4, 5200, 'highpass', this.bgm)
  },
  // 太鼓（ドン）と縁（カッ）
  taiko(t, vol = 0.45) { this.tone(105, t, 0.32, 'sine', vol, this.bgm, 52); this.noise(t, 0.09, vol * 0.25, 300, 'lowpass', this.bgm) },
  kara(t, vol = 0.07) { this.tone(1900, t, 0.03, 'triangle', vol, this.bgm); this.noise(t, 0.02, vol * 0.6, 2500, 'bandpass', this.bgm, 5) },
  // 笛（篠笛っぽく: サインにゆれと息）
  fue(n, t, dur, vol = 0.04) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain(), f = this.mtof(n)
    o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.05); v.frequency.value = 5.5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + dur)
    v.connect(vg); vg.connect(o.frequency)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.bgm); o.start(t); v.start(t); o.stop(t + dur + 0.02); v.stop(t + dur + 0.02)
    this.noise(t, dur * 0.9, vol * 0.18, f * 2, 'bandpass', this.bgm, 6)
  },
  // 遠くの除夜の鐘（BGM の中の小さい鐘。遊びの鐘とは別）
  farBell(t, vol = 0.05) { for (const [m, v, d] of [[1, 1, 3.2], [2.76, 0.3, 2], [0.5, 0.5, 3.6]]) this.tone(98 * m, t, d, 'sine', vol * v, this.bgm, 98 * m * 0.996) },
  // タイトル: 正月の琴（都節）＋遠くの除夜の鐘
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const m = [[64, -1, -1, 65, -1, -1, 69, -1, 71, -1, -1, -1, 72, -1, 71, -1], [69, -1, -1, -1, 65, -1, 64, -1, -1, -1, 65, -1, 64, -1, -1, -1],
      [76, -1, -1, 77, -1, -1, 76, -1, 72, -1, 71, -1, 69, -1, -1, -1], [71, -1, 69, -1, 65, -1, 64, -1, -1, -1, -1, -1, 52, -1, -1, -1]][bar]
    if (m[s] > 0) this.koto(m[s], t)
    if (s === 0) this.tone(this.mtof(40), t, 1.4, 'sine', 0.18, this.bgm)
    if (s === 0 && bar % 2 === 0) this.farBell(t + 0.3, 0.035)
    if (s === 8) this.noise(t, 0.05, 0.04, 2500, 'bandpass', this.bgm, 3)
  },
  // しずかな時間: 柱時計のチクタク＋ふすま越しのテレビ（年末の歌番組っぽい演歌と拍手）＋外の静けさ
  TVMEL: [[69, 4], [72, 2], [74, 2], [76, 6], [74, 2], [72, 4], [69, 4], [67, 2], [69, 6], [-1, 8], [64, 4], [67, 2], [69, 2], [72, 6], [69, 2], [67, 4], [64, 2], [62, 2], [64, 8], [-1, 8]],
  p_night(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 8, q = this.sour
    let mode = q > 0.05 ? 'sour' : 'calm'
    const drop = () => q > 0.05 && Math.random() < q * 0.35
    // 柱時計（チッ・タッ）
    if (s % 4 === 0) this.noise(t, 0.018, s % 8 === 0 ? 0.05 : 0.035, s % 8 === 0 ? 4200 : 3300, 'bandpass', this.bgm, 8)
    // テレビ: 演歌っぽい旋律（ふすま越し）
    if (!this.tvPos || i === 0) { this.tvPos = 0; this.tvLeft = 0 }
    if (this.tvLeft <= 0) {
      const [n, len] = this.TVMEL[this.tvPos % this.TVMEL.length]; this.tvPos++; this.tvLeft = len
      if (n > 0 && !drop()) {
        const f = this.hz(n), d = len * 60 / this.TEMPO.night / 4 * 0.95
        if (this.ctx) {
          const c = this.ctx, o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain()
          o.type = 'square'; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.linearRampToValueAtTime(f, t + 0.08)
          v.frequency.value = 5.8; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.025, t + d); v.connect(vg); vg.connect(o.frequency) // こぶし
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.05); g.gain.setValueAtTime(0.03, t + d * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + d)
          o.connect(g); g.connect(this.tv); o.start(t); v.start(t); o.stop(t + d + 0.02); v.stop(t + d + 0.02)
        }
        this.mark('tv')
      }
    }
    this.tvLeft--
    // テレビの伴奏（ブラスっぽい和音とベース）
    const root = [45, 45, 41, 40, 45, 45, 41, 40][bar]
    if (s === 0 && !drop()) for (const k of [0, 3, 7]) this.tone(this.hz(root + 12 + k), t, 0.9, 'sawtooth', 0.006, this.tv)
    if (s % 8 === 0) this.tone(this.hz(root - 12), t, 0.3, 'triangle', 0.05, this.tv)
    // 遠い拍手（ときどき）
    if (s === 0 && bar === 7) for (let k = 0; k < 26; k++) this.noise(t + Math.random() * 1.6, 0.03, 0.02 * Math.sin(k / 26 * Math.PI), 2400, 'bandpass', this.tv, 1.5)
    // 遠くの除夜の鐘（遊びの鐘とは別の、ごく小さいもの）
    if (s === 0 && bar === 3) this.farBell(t, 0.012)
    // 匂いがたまると: 半音でうなる低音と、ひそひそ
    if (q > 0.05) {
      if (s === 0) { this.tone(this.mtof(root - 12), t, 2.2, 'sawtooth', 0.012 * q, this.bgm); this.tone(this.mtof(root - 11) * 1.01, t, 2.2, 'sawtooth', 0.012 * q, this.bgm) }
      if ((s === 6 || s === 13) && Math.random() < q) this.noise(t, 0.14, 0.03 * q, 3400, 'bandpass', this.bgm, 4)
    }
    if (s === 0) { this.mark('n:' + mode); this.bgmLog.push(mode); if (this.bgmLog.length > 40) this.bgmLog.shift() }
    return mode
  },
  // 会議: 三味線の刻みと太鼓（せきたてる）
  p_meet(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4, root = [52, 52, 53, 51][bar]
    if (s === 0 || s === 10) this.taiko(t, s === 0 ? 0.5 : 0.32)
    if (s === 4 || s === 12) this.kara(t)
    if (s % 2 === 0) this.shami(root + [0, 7, 12, 7, 0, 7, 13, 7][s / 2], t, 0.045)
    if (s === 8 && bar === 3) this.tone(this.mtof(76), t, 0.4, 'square', 0.015, this.bgm, this.mtof(75))
    if (s % 4 === 2) this.noise(t, 0.02, 0.02, 7000, 'highpass', this.bgm)
  },
  // 濡れ衣・セーフ: お囃子（太鼓・三味線・笛・手拍子）
  p_happy(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    if (s === 0 || s === 6 || s === 8) this.taiko(t, s === 0 ? 0.5 : 0.35)
    if (s === 4 || s === 12) { this.kara(t, 0.09); this.noise(t, 0.05, 0.08, 1400, 'bandpass', this.bgm, 1.2) }
    if (s % 2 === 1) this.noise(t, 0.02, 0.025, 7500, 'highpass', this.bgm)
    const m = [[72, 74, 76, 79], [76, 74, 72, 69], [72, 74, 76, 81], [79, 76, 74, 72]][bar]
    if (s % 4 === 0) this.fue(m[s / 4] + 12, t, 0.42, 0.03)
    if (s % 4 === 2) this.shami(m[(s - 2) / 4] - 12, t, 0.04)
  },
  // バレた: 尺八っぽい息と、下がっていく琴
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12, root = [33, 38, 40, 33][bar]
    if (s === 0) this.tone(this.mtof(root), t, 0.9, 'sine', 0.22, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.koto(n, t, 0.05) }
    if (s === 0 && bar % 2 === 0) this.fue(mel[0] - 12, t + 0.1, 1.4, 0.022)
  },
  // 年越し: 速いお囃子＋鐘のきらめき
  p_ny(i, t) {
    this.p_happy(i, t)
    const s = i % 16
    if (s === 0) for (const k of [0, 4, 7]) this.tone(this.mtof(84 + k), t + k * 0.02, 0.6, 'sine', 0.025, this.bgm)
    if (s === 8) this.tone(this.mtof(96), t, 0.3, 'triangle', 0.02, this.bgm)
  },
  // おならの中身を毎回ふる（Math.random。遊びの乱数は使わない）。直前と似すぎたら振り直す
  fartRoll(kind) {
    const R = Math.random, r = (a, b) => a + R() * (b - a)
    if (kind === 'suka') return { kind, dur: r(0.7, 1.5), f0: r(520, 950), f1: r(260, 520), flap: r(4, 11), flapD: r(0.15, 0.45), chops: 1, vibR: 0, vibD: 0, drop: 0, tail: R() < 0.55 }
    if (kind === 'pu') return { kind, dur: r(0.08, 0.24), f0: r(115, 215), drop: r(0.55, 0.85), vibR: r(7, 18), vibR2: r(5, 20), vibD: r(0.03, 0.11), flap: r(26, 48), flapD: r(0.35, 0.6), chops: R() < 0.3 ? 2 : 1, tail: R() < 0.7 }
    return { kind, dur: r(0.75, 1.45), f0: r(56, 98), drop: r(0.42, 0.75), vibR: r(4, 13), vibR2: r(3, 17), vibD: r(0.05, 0.2), flap: r(17, 36), flapD: r(0.35, 0.65), chops: 3 + Math.floor(R() * 7), tail: R() < 0.85, long: R() < 0.5 }
  },
  fart(kind = 'bubo', how = 'plain', v = 1) {
    let p = this.fartRoll(kind)
    const last = this.fartLog[this.fartLog.length - 1]
    for (let k = 0; k < 4 && last && last.kind === kind && last.chops === p.chops && Math.abs(last.f0 - p.f0) / p.f0 < 0.06 && Math.abs(last.dur - p.dur) / p.dur < 0.12; k++) p = this.fartRoll(kind)
    p.how = how; this.fartLog.push(p); if (this.fartLog.length > 60) this.fartLog.shift()
    this.mark('fart'); this.mark('fart:' + kind); this.mark('fart:' + how); if (how === 'busted') this.mark('echo')
    if (!this.ctx) return p
    const c = this.ctx, t = c.currentTime + 0.005, out = c.createGain(); out.gain.value = v
    if (how === 'masked') out.connect(this.muf)
    else if (how === 'half') out.connect(this.half)
    else { out.connect(this.master); if (how === 'busted') out.connect(this.room) }
    const R = Math.random
    if (kind === 'suka') {
      const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain()
      s.buffer = this.noiseBuf; s.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.6
      bp.frequency.setValueAtTime(p.f0, t); bp.frequency.exponentialRampToValueAtTime(p.f1, t + p.dur)
      lfo.frequency.setValueAtTime(p.flap, t); lfo.frequency.linearRampToValueAtTime(p.flap * 0.6, t + p.dur); lg.gain.value = p.flapD * 0.5; am.gain.value = 1 - p.flapD * 0.5
      lfo.connect(lg); lg.connect(am.gain)
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.12); g.gain.setValueAtTime(0.06, t + p.dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur)
      s.connect(bp); bp.connect(am); am.connect(g); g.connect(out); s.start(t, R()); lfo.start(t); s.stop(t + p.dur + 0.05); lfo.stop(t + p.dur + 0.05)
      if (p.tail) this.noise(t + p.dur * 0.88, 0.07, 0.03, 1900, 'bandpass', out, 3)
      return p
    }
    const big = kind === 'bubo'
    this.noise(t, 0.04, (big ? 0.5 : 0.28), 560 + R() * 300, 'bandpass', out, 0.9)
    const n = p.chops, w = Array.from({ length: n }, (_, k) => (0.6 + R() * 0.8) * (p.long && k === n - 1 ? 2.2 : 1)), ws = w.reduce((a, b) => a + b, 0)
    let k0 = t; p.segs = []
    for (let k = 0; k < n; k++) {
      const gap = n > 1 ? 0.008 + R() * 0.04 : 0, d = Math.max(0.04, p.dur * w[k] / ws - gap)
      const f = p.f0 * (1 - p.drop * 0.6 * k / Math.max(1, n - 1)) * (0.92 + R() * 0.16)
      const vol = (big ? 0.5 : 0.24) * (k === 0 ? 1 : 0.65 + R() * 0.35)
      this.fartSeg(k0, d, f, f * (1 - p.drop * (0.4 + R() * 0.3)), p, vol, out); p.segs.push(+d.toFixed(3))
      k0 += d + gap
    }
    if (p.tail) { this.noise(k0 - 0.01, 0.06, big ? 0.12 : 0.07, 1700 + R() * 900, 'bandpass', out, 3); this.tone(240 + R() * 120, k0 - 0.01, 0.06, 'sine', big ? 0.08 : 0.05, out, 600 + R() * 300) }
    p.total = +(k0 - t).toFixed(3)
    return p
  },
  fartSeg(t, d, f1, f2, p, vol, dest) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), vib = c.createOscillator(), vg = c.createGain(), flap = c.createOscillator(), fg = c.createGain(), am = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o2.type = 'square'; const og2 = c.createGain(); og2.gain.value = 0.35
    for (const x of [o, o2]) { x.frequency.setValueAtTime(f1 * 1.1, t); x.frequency.linearRampToValueAtTime(f1, t + d * 0.15); x.frequency.exponentialRampToValueAtTime(Math.max(25, f2), t + d) }
    vib.frequency.setValueAtTime(p.vibR, t); vib.frequency.linearRampToValueAtTime(p.vibR2, t + d)
    vg.gain.setValueAtTime(f1 * p.vibD * 0.4, t); vg.gain.linearRampToValueAtTime(f1 * p.vibD, t + d)
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency)
    flap.type = 'triangle'; flap.frequency.setValueAtTime(p.flap * (0.9 + Math.random() * 0.2), t); flap.frequency.linearRampToValueAtTime(p.flap * 0.65, t + d)
    fg.gain.value = p.flapD * 0.5; am.gain.value = 1 - p.flapD * 0.5; flap.connect(fg); fg.connect(am.gain)
    lp.type = 'lowpass'; lp.Q.value = 5; lp.frequency.setValueAtTime(Math.min(1400, f1 * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(160, f1 * 3.2), t + d)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.setValueAtTime(vol, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d)
    o.connect(lp); o2.connect(og2); og2.connect(lp); lp.connect(am); am.connect(g); g.connect(dest)
    this.noise(t, d, vol * 0.25, f1 * 3, 'bandpass', g, 1.2)
    for (const x of [o, o2, vib, flap]) { x.start(t); x.stop(t + d + 0.03) }
  },
  // 除夜の鐘: 撞木の当たり＋うなる倍音（近い2つの周波数でゆっくりうなる）。外なので少しこもらせる
  bell() {
    if (!this.ctx) return; const t = this.now(); this.mark('bell')
    this.noise(t, 0.14, 0.5, 300, 'lowpass')
    for (const [m, v, d] of [[1, 0.42, 5], [1.006, 0.3, 5], [2.76, 0.14, 3], [2.77, 0.08, 3], [5.4, 0.05, 1.6], [0.5, 0.24, 6]]) this.tone(98 * m, t, d, 'sine', v)
    this.noise(t + 0.02, 2.5, 0.03, 200, 'lowpass', this.room)
  },
  bellWarn() { if (!this.ctx) return; const t = this.now(); this.mark('bellWarn'); this.noise(t, 0.8, 0.025, 180, 'lowpass'); this.tone(60, t, 0.8, 'sine', 0.05, null, 75) },
  // 猫の「にゃ」: 声のフォルマントを い→あ→お に動かす（短い）
  meow() {
    this.mark('meow'); if (!this.ctx) return; const c = this.ctx, t = c.currentTime + 0.005, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), f0 = 620 + Math.random() * 160
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.35, t + 0.12); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.34)
    bp.type = 'bandpass'; bp.Q.value = 4; bp.frequency.setValueAtTime(2600, t); bp.frequency.linearRampToValueAtTime(1500, t + 0.15); bp.frequency.linearRampToValueAtTime(900, t + 0.34)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.03); g.gain.setValueAtTime(0.32, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
    o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4)
  },
  sneezeW() { if (!this.ctx) return; const t = this.now(); this.voice(200, t, 0.35, 0.12, 900, null, 260); this.voice(230, t + 0.55, 0.4, 0.16, 1000, null, 300) },
  sneeze() { if (!this.ctx) return; const t = this.now(); this.mark('sneeze'); this.noise(t, 0.4, 0.9, 1800, 'bandpass', null, 0.8); this.voice(300, t, 0.15, 0.4, 1100, null, 180); this.voice(180, t + 0.12, 0.35, 0.3, 700, null, 120) },
  phone(dur) { if (!this.ctx) return; const t = this.now(); this.mark('phone'); const mel = [84, 88, 91, 96, 91, 88]; for (let k = 0; k * 0.08 < dur; k++) this.tone(this.mtof(mel[k % mel.length]), t + k * 0.08, 0.075, 'square', 0.12) },
  laugh(n = 4) { if (!this.ctx) return; const t = this.now(); this.mark('laugh'); for (let p = 0; p < n; p++) { const f = 140 + p * 45 + Math.random() * 30; for (let k = 0; k < 6; k++) this.voice(k % 2 ? f * 1.1 : f, t + p * 0.05 + k * 0.15, 0.11, 0.18, 800 + p * 150, null, f * 0.85) } },
  sfx(name) {
    this.mark(name); if (!this.ctx) return; const t = this.ctx.currentTime
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12); break
      case 'sniff': for (let k = 0; k < 3; k++) this.noise(t + k * 0.14, 0.09, 0.1, 2600, 'bandpass', null, 2); break
      case 'gasp': for (let k = 0; k < 5; k++) { const f = 380 + Math.random() * 320; this.tone(f, t + Math.random() * 0.1, 0.28, 'sawtooth', 0.025, null, f * 0.62) } break
      case 'talk': for (let k = 0; k < 3; k++) this.voice(220 + Math.random() * 80, t + k * 0.09, 0.07, 0.07, 900 + Math.random() * 500); break
      case 'drum': for (let k = 0; k < 40; k++) this.noise(t + k * 0.036, 0.04, 0.05 + k * 0.004, 1800, 'bandpass', null, 0.9); this.tone(90, t + 1.46, 0.4, 'sine', 0.6, null, 45); break
      case 'point': this.tone(300, t, 0.12, 'square', 0.08, null, 600); break
      case 'stamp': this.tone(120, t, 0.25, 'sine', 0.7, null, 45); this.noise(t, 0.15, 0.35, 900, 'lowpass'); break
      case 'fanfare': [[72, 0], [76, 0.12], [79, 0.24], [84, 0.38]].forEach(([n, d]) => { this.tone(this.mtof(n), t + d, d > 0.3 ? 0.7 : 0.14, 'square', 0.07); this.tone(this.mtof(n - 12), t + d, d > 0.3 ? 0.7 : 0.14, 'triangle', 0.1) }); break
      case 'wahwah': [[311, 0, 0.42], [294, 0.45, 0.42], [277, 0.9, 0.42], [262, 1.35, 1.1]].forEach(([f, d, l]) => { this.tone(f, t + d, l, 'sawtooth', 0.07, null, f * 0.96); this.tone(f / 2, t + d, l, 'triangle', 0.08) }); break
      case 'safe': this.tone(1046, t, 0.12, 'triangle', 0.13); this.tone(1568, t + 0.08, 0.2, 'triangle', 0.12); break
      case 'zawa': for (let k = 0; k < 8; k++) this.voice(150 + Math.random() * 120, t + k * 0.12, 0.2, 0.04, 600 + Math.random() * 600); break
      case 'fan': for (let k = 0; k < 4; k++) this.noise(t + k * 0.12, 0.1, 0.12, 900 + k * 120, 'bandpass', null, 0.8); break
      case 'pop': for (let k = 0; k < 6; k++) this.noise(t + k * 0.05 + Math.random() * 0.03, 0.05, 0.12, 3000 + Math.random() * 2000, 'bandpass', null, 2); break
      case 'chime': for (let k = 0; k < 12; k++) this.tone(this.mtof(84 + [0, 4, 7, 12][k % 4]), t + k * 0.07, 0.5, 'sine', 0.05); break
    }
  },
}

// ---------- 3D の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1e1a24)
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60)
const hemi = new THREE.HemisphereLight(0xffe9cc, 0x4a3426, 1.15)
const lampL = new THREE.PointLight(0xffc98a, 1.6, 0, 1.1); lampL.position.set(0, 2.1, -0.45)
const fill = new THREE.DirectionalLight(0xbfd0ff, 0.45); fill.position.set(-2, 3, 4)
const HEMI0 = new THREE.Color(0xffe9cc)
scene.add(hemi, lampL, fill)
const MC = {}
const M = (c, flat = false) => MC[c + ':' + flat] || (MC[c + ':' + flat] = new THREE.MeshLambertMaterial({ color: c, flatShading: flat }))
const G = { box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 20, 14), cyl: new THREE.CylinderGeometry(1, 1, 1, 18), plane: new THREE.PlaneGeometry(1, 1), cone: new THREE.ConeGeometry(1, 1, 14) }
function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent) { const m = new THREE.Mesh(geo, typeof mat === 'number' ? M(mat) : mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); (parent || scene).add(m); return m }
const box = (w, h, d, c, x, y, z, p) => mesh(G.box, c, x, y, z, w, h, d, p)
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  return t
}

// 見た目だけの乱数（遊びの乱数 S.rand は使わない。ボットの分布が変わらないように）
const VR = Math.random
const ease = k => { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3) }
// 描き込み用の固定乱数（毎回同じ柄にする）
const TR = mulberry(4242)

// ---------- 部屋（和室の大晦日）
// 畳: 2枚1組の目と畳縁
const tatami = canvasTex(512, 512, (c, w, h) => {
  for (let k = 0; k < 2; k++) {
    const x0 = k * w / 2
    c.fillStyle = k ? '#c3bb80' : '#bdb57a'; c.fillRect(x0, 0, w / 2, h)
    for (let y = 0; y < h; y += 3) { c.fillStyle = `rgba(${y % 6 ? '80,72,30' : '255,250,210'},${0.06 + TR() * 0.06})`; c.fillRect(x0, y, w / 2, 1.5) }
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(90,80,40,${TR() * 0.07})`; c.fillRect(x0 + TR() * w / 2, TR() * h, 2 + TR() * 30, 1) }
    // 畳縁（長い辺）
    c.fillStyle = '#2c3a28'; c.fillRect(x0, 0, 9, h); c.fillRect(x0 + w / 2 - 9, 0, 9, h)
    c.fillStyle = 'rgba(200,190,120,.25)'; for (let y = 0; y < h; y += 14) { c.fillRect(x0 + 3, y, 3, 6); c.fillRect(x0 + w / 2 - 6, y, 3, 6) }
  }
}, [5, 6])
tatami.anisotropy = 4
const floor = mesh(G.plane, new THREE.MeshLambertMaterial({ map: tatami }), 0, 0, 1.5, 9, 11, 1); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true

// 奥の壁: 左から 土壁と床の間の掛け軸 / 柱 / 土壁（テレビと時計）/ 柱 / 雪見障子（窓）
const wallTex = canvasTex(2048, 716, (c, w, h) => {
  const X = x => (x + 4) / 8 * w, Y = y => h - y / 2.8 * h
  // 土壁
  c.fillStyle = '#c7ae86'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 9000; i++) { const v = TR(); c.fillStyle = v < 0.5 ? 'rgba(120,90,50,.10)' : 'rgba(255,240,210,.12)'; c.fillRect(TR() * w, TR() * h, 2, 2) }
  // 腰の板
  c.fillStyle = '#7a5532'; c.fillRect(0, Y(0.32), w, Y(0) - Y(0.32))
  for (let x = 0; x < w; x += 46) { c.fillStyle = 'rgba(40,24,10,.35)'; c.fillRect(x, Y(0.32), 2, Y(0) - Y(0.32)) }
  // 欄間（長押の上）: 波の透かし
  c.fillStyle = '#5b3d22'; c.fillRect(0, 0, w, Y(2.24))
  c.strokeStyle = '#e9d8a8'; c.lineWidth = 5; c.globalAlpha = 0.55
  for (let x = -40; x < w; x += 120) { c.beginPath(); for (let k = 0; k <= 120; k += 6) c.lineTo(x + k, Y(2.5) + Math.sin(k / 120 * Math.PI * 2) * 14); c.stroke() }
  c.globalAlpha = 1
  // 雪見障子（右側）
  const s0 = X(0.55), s1 = X(4)
  c.fillStyle = '#e8ddc2'; c.fillRect(s0, Y(2.2), s1 - s0, Y(0.32) - Y(2.2))
  const g = c.createLinearGradient(0, Y(2.2), 0, Y(0.32)); g.addColorStop(0, 'rgba(120,140,190,.22)'); g.addColorStop(1, 'rgba(60,70,120,.05)'); c.fillStyle = g; c.fillRect(s0, Y(2.2), s1 - s0, Y(0.32) - Y(2.2))
  c.strokeStyle = '#6a4a2a'; c.lineWidth = 5
  for (let x = s0; x <= s1; x += 52) { c.beginPath(); c.moveTo(x, Y(2.2)); c.lineTo(x, Y(0.32)); c.stroke() }
  for (let y = Y(2.2); y <= Y(0.32); y += 40) { c.beginPath(); c.moveTo(s0, y); c.lineTo(s1, y); c.stroke() }
  // 床の間（左の奥）: 掛け軸（赤い日の出と松）
  const k0 = X(-3.4), k1 = X(-2.3)
  c.fillStyle = '#b39a74'; c.fillRect(k0, Y(2.2), k1 - k0, Y(0.32) - Y(2.2))
  c.fillStyle = '#f2ead6'; c.fillRect(X(-3.05), Y(2.0), X(-2.65) - X(-3.05), Y(0.75) - Y(2.0))
  c.strokeStyle = '#8a6a3a'; c.lineWidth = 8; c.strokeRect(X(-3.05), Y(2.0), X(-2.65) - X(-3.05), Y(0.75) - Y(2.0))
  c.fillStyle = '#d23a2a'; c.beginPath(); c.arc(X(-2.85), Y(1.6), 30, 0, 7); c.fill()
  c.strokeStyle = '#2a3a2a'; c.lineWidth = 6; c.beginPath(); c.moveTo(X(-3.0), Y(1.0)); c.quadraticCurveTo(X(-2.85), Y(1.2), X(-2.7), Y(1.15)); c.stroke()
  for (let i = 0; i < 6; i++) { c.fillStyle = '#2f5a32'; c.beginPath(); c.ellipse(X(-2.95) + i * 14, Y(1.15) - (i % 2) * 10, 14, 6, 0, 0, 7); c.fill() }
  // 柱
  for (const x of [-3.45, -2.25, 0.5, 3.95]) { c.fillStyle = '#6b4626'; c.fillRect(X(x) - 14, 0, 28, h); c.fillStyle = 'rgba(255,220,170,.18)'; c.fillRect(X(x) - 12, 0, 5, h) }
})
const backWall = mesh(G.plane, new THREE.MeshLambertMaterial({ map: wallTex }), 0, 1.4, -2.1, 8, 2.8, 1); backWall.receiveShadow = true
const sideTex = canvasTex(512, 256, (c, w, h) => {
  c.fillStyle = '#c3a982'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 2600; i++) { c.fillStyle = TR() < 0.5 ? 'rgba(120,90,50,.10)' : 'rgba(255,240,210,.1)'; c.fillRect(TR() * w, TR() * h, 2, 2) }
  c.fillStyle = '#5b3d22'; c.fillRect(0, 0, w, h * 0.2); c.fillStyle = '#7a5532'; c.fillRect(0, h * 0.885, w, h * 0.115)
  for (const x of [0.02, 0.5, 0.98]) { c.fillStyle = '#6b4626'; c.fillRect(x * w - 7, 0, 14, h) }
})
for (const s of [-1, 1]) { const w = mesh(G.plane, new THREE.MeshLambertMaterial({ map: sideTex }), s * 3.2, 1.4, -0.5, 3.4, 2.8, 1); w.rotation.y = -s * Math.PI / 2 }
box(8, 0.12, 0.12, 0x5a3a20, 0, 2.2, -2.06); box(8, 0.05, 0.06, 0x4a2e18, 0, 0.32, -2.07)

// 窓（雪見障子のガラス）: 夜の雪景色と遠くのお寺。年越しで明け方の空に重ねる
function drawSky(c, w, h, dawn) {
  const g = c.createLinearGradient(0, 0, 0, h)
  if (dawn) { g.addColorStop(0, '#3a4a8a'); g.addColorStop(0.45, '#f08a6a'); g.addColorStop(0.75, '#ffd08a') } else { g.addColorStop(0, '#0b1230'); g.addColorStop(0.7, '#2a3266'); g.addColorStop(1, '#3a3f70') }
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  if (dawn) { const sg = c.createRadialGradient(w * 0.62, h * 0.66, 4, w * 0.62, h * 0.66, 120); sg.addColorStop(0, 'rgba(255,250,210,1)'); sg.addColorStop(0.2, 'rgba(255,200,120,.9)'); sg.addColorStop(1, 'rgba(255,160,90,0)'); c.fillStyle = sg; c.fillRect(0, 0, w, h); c.fillStyle = '#fff4c8'; c.beginPath(); c.arc(w * 0.62, h * 0.68, 26, 0, 7); c.fill() }
  else {
    c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(w * 0.8, h * 0.2, 18, 0, 7); c.fill(); c.fillStyle = '#0b1230'; c.beginPath(); c.arc(w * 0.8 + 8, h * 0.2 - 5, 16, 0, 7); c.fill()
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + TR() * 0.7})`; c.fillRect(TR() * w, TR() * h * 0.55, 1.5, 1.5) }
  }
  // 遠い山と雪の積もった町、お寺（鐘楼）
  c.fillStyle = dawn ? '#5a4a6a' : '#1a2040'; c.beginPath(); c.moveTo(0, h * 0.7); for (let x = 0; x <= w; x += 16) c.lineTo(x, h * 0.66 - Math.sin(x / w * 5) * 14 - Math.sin(x / 33) * 4); c.lineTo(w, h); c.lineTo(0, h); c.fill()
  const tx = w * 0.26, ty = h * 0.72, ink = dawn ? '#3a2a3a' : '#0a0c1c', snow = dawn ? '#ffe6d6' : '#cfd8f0'
  c.fillStyle = ink; c.fillRect(tx - 20, ty - 34, 40, 34); c.fillRect(tx - 26, ty - 8, 52, 10)
  c.beginPath(); c.moveTo(tx - 44, ty - 30); c.quadraticCurveTo(tx, ty - 46, tx + 44, ty - 30); c.lineTo(tx + 30, ty - 52); c.lineTo(tx - 30, ty - 52); c.fill()
  c.fillStyle = snow; c.beginPath(); c.moveTo(tx - 44, ty - 30); c.quadraticCurveTo(tx, ty - 46, tx + 44, ty - 30); c.lineTo(tx + 38, ty - 36); c.quadraticCurveTo(tx, ty - 50, tx - 38, ty - 36); c.fill()
  c.fillStyle = ink; c.fillRect(tx - 2, ty - 66, 4, 16)
  if (!dawn) { c.fillStyle = 'rgba(255,190,90,.9)'; c.beginPath(); c.arc(tx, ty - 22, 7, 0, 7); c.fill(); for (const x of [tx - 60, tx + 70]) { c.fillStyle = 'rgba(255,170,80,.8)'; c.fillRect(x, ty - 6, 5, 7) } }
  // 手前の家の屋根（雪）と灯り
  c.fillStyle = dawn ? '#4a3a4a' : '#121630'; c.fillRect(0, h * 0.86, w, h * 0.14)
  for (let i = 0; i < 6; i++) { const x = (i * 97) % w, y = h * 0.84 - (i % 3) * 6; c.fillStyle = dawn ? '#3a2a3a' : '#0d1024'; c.fillRect(x, y, 70, 30); c.fillStyle = snow; c.beginPath(); c.moveTo(x - 6, y + 2); c.lineTo(x + 35, y - 12); c.lineTo(x + 76, y + 2); c.fill(); if (!dawn && i % 2 === 0) { c.fillStyle = 'rgba(255,200,110,.85)'; c.fillRect(x + 12, y + 12, 8, 7) } }
}
const winTex = canvasTex(512, 340, (c, w, h) => drawSky(c, w, h, false))
const dawnTex = canvasTex(512, 340, (c, w, h) => drawSky(c, w, h, true))
const WIN = { x: 1.5, y: 1.45, w: 1.5, h: 0.95 }
mesh(G.plane, new THREE.MeshBasicMaterial({ map: winTex }), WIN.x, WIN.y, -2.095, WIN.w, WIN.h, 1)
const dawnPlane = mesh(G.plane, new THREE.MeshBasicMaterial({ map: dawnTex, transparent: true, opacity: 0, depthWrite: false }), WIN.x, WIN.y, -2.094, WIN.w, WIN.h, 1)
// 窓の外の雪（1回の描画）
const snowTex = canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 1, 16, 16, 15); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32) })
const SNOW_N = 90, snowGeo = new THREE.BufferGeometry(), snowPos = new Float32Array(SNOW_N * 3), snowV = []
for (let i = 0; i < SNOW_N; i++) { snowPos[i * 3] = WIN.x + (VR() - 0.5) * WIN.w; snowPos[i * 3 + 1] = WIN.y + (VR() - 0.5) * WIN.h; snowPos[i * 3 + 2] = -2.09 + VR() * 0.004; snowV.push({ v: 0.05 + VR() * 0.08, ph: VR() * 6.28 }) }
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: snowTex, size: 0.028, transparent: true, depthWrite: false, opacity: 0.9 })); scene.add(snow)
// 鐘が鳴る時のお寺の光
const glowTex = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 1, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h) })
const templeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
templeGlow.position.set(WIN.x - WIN.w * 0.24, WIN.y - WIN.h * 0.2, -2.08); templeGlow.scale.setScalar(0.5); scene.add(templeGlow)
// 窓枠（格子）
box(1.62, 0.07, 0.06, 0x5a3a20, WIN.x, WIN.y + 0.5, -2.07); box(1.62, 0.07, 0.06, 0x5a3a20, WIN.x, WIN.y - 0.5, -2.07)
for (const dx of [-0.78, 0, 0.78]) box(0.05, 1.0, 0.06, 0x5a3a20, WIN.x + dx, WIN.y, -2.07)
box(1.55, 0.03, 0.04, 0x5a3a20, WIN.x, WIN.y + 0.02, -2.075)

// テレビ（ブラウン管）と台。画面は年末の歌番組っぽい光（番組名・局名は出さない）
const tvCv = document.createElement('canvas'); tvCv.width = 160; tvCv.height = 120
const tvTexS = new THREE.CanvasTexture(tvCv); tvTexS.colorSpace = THREE.SRGBColorSpace
const TV = { g: new THREE.Group(), col: new THREE.Color(), t: 0, k: 0 }
TV.g.position.set(-1.42, 0, -1.78); TV.g.rotation.y = 0.32; scene.add(TV.g)
box(1.0, 0.36, 0.48, 0x6a4424, 0, 0.18, 0, TV.g); box(0.98, 0.02, 0.46, 0x8a5e34, 0, 0.37, 0, TV.g)
box(0.4, 0.2, 0.01, 0x4a2e18, -0.24, 0.17, 0.241, TV.g); box(0.4, 0.2, 0.01, 0x4a2e18, 0.24, 0.17, 0.241, TV.g)
const tvBody = new THREE.Group(); tvBody.position.set(-0.08, 0.38, 0); TV.g.add(tvBody)
box(0.62, 0.48, 0.42, 0x3a3634, 0, 0.24, -0.02, tvBody); box(0.5, 0.36, 0.2, 0x2a2624, 0, 0.24, -0.3, tvBody)
box(0.64, 0.06, 0.02, 0x222020, 0, 0.03, 0.2, tvBody)
const tvScreen = mesh(G.plane, new THREE.MeshBasicMaterial({ map: tvTexS }), -0.04, 0.27, 0.192, 0.46, 0.36, 1, tvBody)
box(0.06, 0.36, 0.02, 0x2a2624, 0.25, 0.27, 0.195, tvBody)
for (const y of [0.38, 0.32, 0.26]) mesh(G.cyl, 0x8a8a8a, 0.25, y, 0.21, 0.014, 0.012, 0.014, tvBody).rotation.x = Math.PI / 2
// アンテナ
for (const s of [-1, 1]) { const a = mesh(G.cyl, 0xb0b0b0, s * 0.08, 0.68, -0.05, 0.006, 0.36, 0.006, tvBody); a.rotation.z = -s * 0.5 }
const tvLight = new THREE.PointLight(0x88aaff, 0.9, 4.5, 1.4); tvLight.position.set(-1.25, 0.8, -1.3); scene.add(tvLight)
function drawTv(dt) {
  TV.t += dt; TV.k -= dt; if (TV.k > 0) return; TV.k = 0.12
  const c = tvCv.getContext('2d'), w = tvCv.width, h = tvCv.height, t = TV.t
  // 舞台: 暗い背景にスポットと客席、真ん中に歌い手のシルエット。ときどきカメラが切り替わる
  const shot = Math.floor(t / 3.2) % 3, hue = (t * 40) % 360
  c.fillStyle = `hsl(${(hue + 220) % 360},55%,${shot === 1 ? 30 : 14}%)`; c.fillRect(0, 0, w, h)
  for (let k = 0; k < 4; k++) { const x = w * (0.2 + 0.2 * k) + Math.sin(t * 1.3 + k) * 26; c.fillStyle = `hsla(${(hue + k * 80) % 360},90%,70%,.35)`; c.beginPath(); c.moveTo(x, 0); c.lineTo(x - 22, h); c.lineTo(x + 22, h); c.fill() }
  if (shot !== 1) { c.fillStyle = '#ffe6f0'; c.fillRect(0, h * 0.8, w, h * 0.04) }
  const sc = shot === 2 ? 2 : 1, cx = w / 2 + (shot === 0 ? Math.sin(t) * 6 : 0)
  c.fillStyle = shot === 1 ? 'rgba(255,255,255,.85)' : '#1a0e1a'
  c.beginPath(); c.arc(cx, h * (0.42 - 0.08 * (sc - 1)), 9 * sc, 0, 7); c.fill()
  c.beginPath(); c.moveTo(cx - 22 * sc, h); c.quadraticCurveTo(cx, h * (0.5 - 0.1 * (sc - 1)), cx + 22 * sc, h); c.fill()
  if (shot === 1) for (let k = 0; k < 30; k++) { c.fillStyle = `hsl(${k * 47 % 360},90%,65%)`; c.fillRect(((k * 53 + t * 60) % w), ((k * 31 + t * 40) % h), 3, 3) }
  // 走査線と角の暗さ
  c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1)
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); c.fillStyle = vg; c.fillRect(0, 0, w, h)
  tvTexS.needsUpdate = true
  TV.col.setHSL(((hue + 220) % 360) / 360, 0.6, shot === 1 ? 0.7 : 0.55)
  tvLight.color.copy(TV.col); tvLight.intensity = (shot === 1 ? 1.4 : 0.8) + VR() * 0.25
}
drawTv(1)

// 鏡餅（三方の上。橙・裏白・紙垂）
const mochi = new THREE.Group(); mochi.position.set(-0.98, 0.38, -1.7); scene.add(mochi)
box(0.3, 0.1, 0.3, 0xd8b47a, 0, 0.05, 0, mochi); box(0.34, 0.02, 0.34, 0xe8c88a, 0, 0.11, 0, mochi)
for (const a of [-0.5, 0.5, 2.6, -2.6]) { const l = mesh(G.sph, 0x3e7a3a, Math.sin(a) * 0.12, 0.125, Math.cos(a) * 0.12, 0.09, 0.008, 0.035, mochi); l.rotation.y = a }
mesh(G.sph, new THREE.MeshLambertMaterial({ color: 0xf8f4ea }), 0, 0.17, 0, 0.13, 0.065, 0.13, mochi)
mesh(G.sph, new THREE.MeshLambertMaterial({ color: 0xf8f4ea }), 0, 0.245, 0, 0.1, 0.05, 0.1, mochi)
mesh(G.sph, 0xff8a10, 0, 0.32, 0, 0.05, 0.045, 0.05, mochi); mesh(G.sph, 0x2f6a2a, 0.02, 0.365, 0, 0.03, 0.006, 0.014, mochi)
box(0.02, 0.1, 0.002, 0xffffff, 0.06, 0.21, 0.1, mochi).rotation.z = 0.2; box(0.02, 0.1, 0.002, 0xffffff, -0.06, 0.21, 0.1, mochi).rotation.z = -0.2

// 柱時計（年越しに向けて針が進む。振り子が揺れる）
const clock = new THREE.Group(); clock.position.set(-0.56, 1.62, -2.04); scene.add(clock)
box(0.36, 0.78, 0.1, 0x5a3418, 0, 0, 0, clock); box(0.3, 0.04, 0.12, 0x6e4422, 0, 0.4, 0, clock)
const clockTex = canvasTex(128, 128, (c) => {
  c.fillStyle = '#c9a050'; c.beginPath(); c.arc(64, 64, 63, 0, 7); c.fill()
  c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.fill()
  c.fillStyle = '#1b1620'; c.font = 'bold 15px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.save(); c.translate(64 + Math.sin(a) * 44, 64 - Math.cos(a) * 44); c.font = (k % 3 ? 'bold 10px' : 'bold 13px') + ' serif'; c.fillText(roman[k], 0, 0); c.restore() }
  for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2; c.fillRect(64 + Math.sin(a) * 53 - 0.5, 64 - Math.cos(a) * 53 - 0.5, 1.5, 1.5) }
})
mesh(new THREE.CircleGeometry(0.14, 28), new THREE.MeshBasicMaterial({ map: clockTex }), 0, 0.18, 0.052, 1, 1, 1, clock)
const handM = new THREE.MeshBasicMaterial({ color: 0x1b1620 })
const hourH = new THREE.Group(), minH = new THREE.Group(); hourH.position.set(0, 0.18, 0.056); minH.position.set(0, 0.18, 0.058); clock.add(hourH, minH)
box(0.014, 0.075, 0.003, handM, 0, 0.032, 0, hourH); box(0.009, 0.115, 0.003, handM, 0, 0.05, 0, minH)
mesh(G.plane, new THREE.MeshBasicMaterial({ color: 0x2a1c12 }), 0, -0.2, 0.051, 0.22, 0.3, 1, clock)
const pend = new THREE.Group(); pend.position.set(0, -0.06, 0.054); clock.add(pend)
box(0.008, 0.22, 0.003, 0xc9a050, 0, -0.11, 0, pend); mesh(new THREE.CircleGeometry(0.035, 18), new THREE.MeshBasicMaterial({ color: 0xe8c060 }), 0, -0.23, 0.002, 1, 1, 1, pend)
mesh(G.plane, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 }), 0, -0.2, 0.06, 0.22, 0.3, 1, clock)
function clockMinutes() {
  if (S.mode === 'title') return 60 * 23 + 50
  if (S.cleared || (S.mode === 'result' && S.cleared)) return 60 * 24
  const sub = S.ph === 'quiet' ? S.t / D.quiet * 0.8 : 0.9
  return 60 * 23 + 51 + Math.max(0, S.round - 1) + sub
}
let clockShown = 0
function updateClock(dt) {
  let m = clockMinutes(); if (!clockShown) clockShown = m
  clockShown += (m - clockShown) * Math.min(1, dt * 4)
  minH.rotation.z = -(clockShown % 60) / 60 * Math.PI * 2; hourH.rotation.z = -((clockShown / 60) % 12) / 12 * Math.PI * 2
  pend.rotation.z = Math.sin(S.time * Math.PI * 1.2) * 0.16
}

// 吊り下げの灯り（和紙のシェード）。暖かい光と影
const shadeTex = canvasTex(256, 128, (c, w, h) => {
  c.fillStyle = '#fff1cf'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(200,160,90,${TR() * 0.12})`; c.fillRect(TR() * w, TR() * h, 1 + TR() * 6, 1) }
  c.fillStyle = '#7a4a22'; for (let y = 6; y < h; y += 22) c.fillRect(0, y, w, 2)
})
const shadeGeo = new THREE.LatheGeometry([[0.08, 0.16], [0.26, 0.1], [0.4, -0.03], [0.42, -0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 24)
const shade = mesh(shadeGeo, new THREE.MeshLambertMaterial({ map: shadeTex, side: THREE.DoubleSide, emissive: 0xffb050, emissiveMap: shadeTex, emissiveIntensity: 0.75 }), 0, 2.15, -0.45)
mesh(G.cyl, 0x1b1620, 0, 2.62, -0.45, 0.01, 0.8, 0.01)
const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd08a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })); bulb.position.set(0, 2.08, -0.45); bulb.scale.setScalar(0.9); scene.add(bulb)
const spot = new THREE.SpotLight(0xffc98a, 10, 6, 1.05, 0.65, 1.2); spot.position.set(0, 2.05, -0.45); spot.target.position.set(0, 0, -0.5)
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 5; spot.shadow.bias = -0.0015; spot.shadow.radius = 4
scene.add(spot, spot.target)
// 窓からの冷たい月明かり
const moon = new THREE.DirectionalLight(0x8fa6ff, 0.35); moon.position.set(1.5, 2.5, -4); scene.add(moon)
// 判定の時のスポット（犯人の頭の上から）
const judge = new THREE.SpotLight(0xfff2d0, 0, 5, 0.32, 0.4, 1); judge.position.set(0, 2.6, 0.3); scene.add(judge, judge.target)
// 年越しの朝日（窓から）
const sunrise = new THREE.DirectionalLight(0xffa860, 0); sunrise.position.set(1.5, 1.2, -4); scene.add(sunrise)

// こたつ（布団は裾が広がって、しわが寄る）
const kot = new THREE.Group(); kot.position.set(0, 0, -0.4); scene.add(kot)
const futonTex = canvasTex(512, 512, (c, w, h) => {
  c.fillStyle = '#a81e2e'; c.fillRect(0, 0, w, h)
  // 亀甲の地紋
  c.strokeStyle = 'rgba(255,200,120,.16)'; c.lineWidth = 2
  for (let y = 0; y < h + 40; y += 36) for (let x = (y / 36 % 2) * 31; x < w + 40; x += 62) { c.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; c.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20) } c.stroke() }
  // 大きな梅と牡丹
  const flower = (x, y, r, col, mid) => { c.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, 0, 7); c.fill() } c.fillStyle = mid; c.beginPath(); c.arc(x, y, r * 0.3, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); c.stroke() } }
  for (let i = 0; i < 14; i++) { const x = TR() * w, y = TR() * h, r = 18 + TR() * 26; flower(x, y, r, i % 3 === 0 ? '#f6efe0' : i % 3 === 1 ? '#f2b8c6' : '#f2c94c', i % 3 === 2 ? '#d8642a' : '#e8a020') }
  // 縁取りの帯（紺）と、綿の縫い目
  c.fillStyle = '#23305e'; c.fillRect(0, h - 46, w, 46); c.fillStyle = '#f2c94c'; for (let x = 0; x < w; x += 24) { c.beginPath(); c.arc(x + 12, h - 23, 5, 0, 7); c.fill() }
  c.strokeStyle = 'rgba(255,240,220,.35)'; c.setLineDash([6, 8]); c.lineWidth = 2; for (let y = 64; y < h - 46; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() } c.setLineDash([])
})
const futonGeo = new THREE.BoxGeometry(2.15, 0.4, 1.55, 16, 4, 12)
{ const p = futonGeo.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = clamp((0.2 - y) / 0.4, 0, 1), fl = 1 + 0.12 * Math.pow(t, 1.4); x *= fl; z *= fl; const wr = Math.sin(x * 11 + z * 3) * 0.018 * t + Math.sin(z * 13) * 0.012 * t; if (Math.abs(z) > 0.7) z += Math.sign(z) * wr; if (Math.abs(x) > 1.0) x += Math.sign(x) * wr; if (y > 0.19) y += Math.sin(x * 3) * Math.cos(z * 4) * 0.01; p.setXYZ(i, x, y, z) } futonGeo.computeVertexNormals() }
const futon = mesh(futonGeo, new THREE.MeshLambertMaterial({ map: futonTex }), 0, 0.2, 0, 1, 1, 1, kot); futon.receiveShadow = true; futon.castShadow = true
const woodTex = canvasTex(512, 256, (c, w, h) => {
  c.fillStyle = '#8a5a2e'; c.fillRect(0, 0, w, h)
  for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(${TR() < 0.5 ? '60,34,14' : '180,120,70'},${0.05 + TR() * 0.08})`; c.fillRect(0, y + Math.sin(y * 0.05) * 3, w, 1.5) }
  for (let k = 0; k < 5; k++) { c.strokeStyle = 'rgba(60,34,14,.25)'; c.lineWidth = 2; c.beginPath(); c.ellipse(TR() * w, TR() * h, 30 + TR() * 40, 6 + TR() * 6, 0, 0, 7); c.stroke() }
  c.strokeStyle = '#5a361a'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10)
})
const top = box(1.95, 0.05, 1.35, new THREE.MeshLambertMaterial({ map: woodTex }), 0, 0.43, 0, kot); top.receiveShadow = true; top.castShadow = true
// みかん（竹かごに盛る。インスタンスで1回の描画）
const mikanTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#ff9418'; c.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { c.fillStyle = TR() < 0.5 ? 'rgba(200,90,0,.35)' : 'rgba(255,200,90,.35)'; c.fillRect(TR() * w, TR() * h, 1.5, 1.5) } })
const basket = new THREE.Group(); basket.position.set(-0.1, 0.455, 0.1); kot.add(basket)
const kagoTex = canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#b88a4a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7a5226'; c.lineWidth = 2; for (let x = 0; x < w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 8, h); c.stroke(); c.beginPath(); c.moveTo(x + 8, 0); c.lineTo(x, h); c.stroke() } }, [3, 1])
mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.08, 20, 1, true), new THREE.MeshLambertMaterial({ map: kagoTex, side: THREE.DoubleSide }), 0, 0.04, 0, 1, 1, 1, basket)
mesh(G.cyl, 0x9a6a3a, 0, 0.004, 0, 0.17, 0.008, 0.17, basket)
const MIKAN = [[-0.09, 0.07, 0], [0.09, 0.07, 0.03], [0, 0.07, -0.1], [0.01, 0.07, 0.1], [0, 0.15, 0.0], [-0.07, 0.14, -0.05], [0.07, 0.14, 0.05]]
const mikans = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshLambertMaterial({ map: mikanTex }), MIKAN.length + 1)
{ const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(); MIKAN.forEach(([x, y, z], i) => { q.setFromEuler(new THREE.Euler(TR(), TR() * 6, TR())); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.07, 0.062, 0.07)); mikans.setMatrixAt(i, m4) }); m4.compose(new THREE.Vector3(0.45, 0.08, 0.38), q.identity(), new THREE.Vector3(0.062, 0.055, 0.062)); mikans.setMatrixAt(MIKAN.length, m4) }
mikans.castShadow = true; basket.add(mikans)
// むいたみかんの皮（あなたの手前）
for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, pe = mesh(G.sph, 0xff8a10, 0.45 + Math.cos(a) * 0.075, 0.47, 0.03 + Math.sin(a) * 0.075, 0.05, 0.008, 0.03, kot); pe.rotation.y = -a }
// 湯のみ（湯気つき）と急須
const yunomiTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#6f8f76'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,240,.6)'; for (let x = 6; x < w; x += 32) { c.beginPath(); c.arc(x, h * 0.45, 8, 0, 7); c.fill() } c.fillStyle = '#3e5a46'; c.fillRect(0, h - 8, w, 8) })
const yunomiGeo = new THREE.CylinderGeometry(0.048, 0.04, 0.1, 18)
const steam = []
for (const [x, z] of [[-0.62, -0.32], [0.05, -0.42], [-0.78, 0.1], [0.62, 0.22]]) {
  const y = mesh(yunomiGeo, new THREE.MeshLambertMaterial({ map: yunomiTex }), x, 0.505, z, 1, 1, 1, kot); y.castShadow = true
  mesh(new THREE.CircleGeometry(0.042, 16), 0x7a8a2a, x, 0.548, z, 1, 1, 1, kot).rotation.x = -Math.PI / 2
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); sp.position.set(x, 0.62, z); kot.add(sp); steam.push({ sp, x, z, ph: VR() * 3 })
}
const kyusu = new THREE.Group(); kyusu.position.set(0.35, 0.455, -0.32); kot.add(kyusu)
mesh(G.sph, 0x3a2a24, 0, 0.07, 0, 0.09, 0.075, 0.09, kyusu); mesh(G.cyl, 0x3a2a24, 0, 0.14, 0, 0.05, 0.02, 0.05, kyusu); mesh(G.sph, 0x3a2a24, 0, 0.155, 0, 0.02, 0.012, 0.02, kyusu)
const spout = mesh(G.cyl, 0x3a2a24, 0.1, 0.09, 0, 0.014, 0.08, 0.014, kyusu); spout.rotation.z = -0.9
const handle = mesh(G.cyl, 0x2a1c18, -0.03, 0.08, -0.12, 0.016, 0.12, 0.016, kyusu); handle.rotation.x = 1.3
kyusu.children[0].castShadow = true
// 缶ビール（銘柄なし）
const beer = mesh(G.cyl, 0xd8d8e0, 0.72, 0.535, -0.2, 0.05, 0.16, 0.05, kot); beer.castShadow = true
box(0.1, 0.06, 0.1, 0xd8141f, 0, 0.1, 0, beer).scale.set(1.02, 0.4, 1.02)

// 猫（三毛）。こたつの手前を横切る。鳴く時は顔を上げて口を開ける
const CAT = { g: new THREE.Group(), on: false, t: 0, dur: 5, meow: 0, legs: [], dir: 1 }
{
  const g = CAT.g; g.visible = false; scene.add(g)
  const furTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#f6efe2'; c.fillRect(0, 0, w, h); c.fillStyle = '#e08a3a'; c.beginPath(); c.ellipse(30, 26, 26, 18, 0.3, 0, 7); c.fill(); c.fillStyle = '#3a2a24'; c.beginPath(); c.ellipse(86, 30, 22, 16, -0.2, 0, 7); c.fill(); c.fillStyle = '#e08a3a'; c.beginPath(); c.ellipse(110, 50, 14, 10, 0, 0, 7); c.fill() })
  const furM = new THREE.MeshLambertMaterial({ map: furTex })
  const body = mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 10), furM, 0, 0.13, 0, 1, 1, 1, g); body.rotation.z = Math.PI / 2; body.castShadow = true
  const head = new THREE.Group(); head.position.set(0.17, 0.21, 0); g.add(head); CAT.head = head
  mesh(G.sph, furM, 0, 0, 0, 0.075, 0.068, 0.072, head).castShadow = true
  for (const s of [-1, 1]) { const e = mesh(G.cone, s > 0 ? 0xe08a3a : 0x3a2a24, 0.0, 0.07, s * 0.04, 0.026, 0.05, 0.022, head); e.rotation.x = s * 0.25 }
  for (const s of [-1, 1]) { mesh(G.sph, M(0x2a3a1a), 0.06, 0.012, s * 0.03, 0.012, 0.016, 0.01, head) }
  mesh(G.sph, M(0xf08a9a), 0.074, -0.01, 0, 0.01, 0.008, 0.01, head)
  CAT.mouth = mesh(G.sph, M(0x5a1424), 0.066, -0.035, 0, 0.004, 0.003, 0.016, head)
  for (const [x, z] of [[0.12, 0.04], [0.12, -0.04], [-0.12, 0.04], [-0.12, -0.04]]) { const l = new THREE.Group(); l.position.set(x, 0.1, z); g.add(l); mesh(G.cyl, furM, 0, -0.05, 0, 0.022, 0.1, 0.022, l); CAT.legs.push(l) }
  CAT.tail = new THREE.Group(); CAT.tail.position.set(-0.17, 0.16, 0); g.add(CAT.tail)
  const tl = mesh(G.cyl, 0x3a2a24, 0, 0.1, 0, 0.016, 0.2, 0.016, CAT.tail); tl.position.y = 0.1
}
function catWalk(e) { CAT.on = true; CAT.t = 0; CAT.dur = e.walk; CAT.dir = S.round % 2 ? 1 : -1; CAT.g.visible = true }
const catPos = () => CAT.g.position.clone()
function updateCat(dt) {
  if (!CAT.on) return
  if (S.mode !== 'play' || S.ph !== 'quiet') { CAT.on = false; CAT.g.visible = false; return }
  CAT.t += dt; CAT.meow = Math.max(0, CAT.meow - dt)
  const k = CAT.t / CAT.dur; if (k >= 1) { CAT.on = false; CAT.g.visible = false; return }
  const x = lerp(-2.4, 2.4, k) * CAT.dir
  CAT.g.position.set(x, Math.abs(Math.sin(CAT.t * 9)) * 0.01, 0.78); CAT.g.rotation.y = CAT.dir > 0 ? 0 : Math.PI
  CAT.legs.forEach((l, i) => { l.rotation.z = Math.sin(CAT.t * 9 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 })
  CAT.tail.rotation.z = 0.6 + Math.sin(CAT.t * 3) * 0.3; CAT.tail.rotation.x = Math.sin(CAT.t * 2.2) * 0.3
  const m = CAT.meow > 0 ? Math.sin(CAT.meow / 0.5 * Math.PI) : 0
  CAT.head.rotation.z = m * 0.5; CAT.mouth.scale.set(0.004 + m * 0.008, 0.003 + m * 0.02, 0.016)
}
// うちわ（あなたの左手）
const uchiwaTex = canvasTex(64, 64, (c) => { c.fillStyle = '#f6efe0'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill(); c.fillStyle = '#d23a2a'; c.beginPath(); c.arc(32, 32, 14, 0, 7); c.fill(); c.strokeStyle = '#1b1620'; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.stroke() })
const uchiwa = new THREE.Group(); uchiwa.visible = false; uchiwa.rotation.x = -1.3
mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshLambertMaterial({ map: uchiwaTex, side: THREE.DoubleSide }), 0, -0.68, 0.0, 1, 1, 1, uchiwa)
mesh(G.cyl, 0x8a5a2e, 0, -0.55, 0, 0.008, 0.14, 0.008, uchiwa)
function updateRoom(dt) {
  drawTv(dt); updateClock(dt); updateCat(dt)
  // 雪
  const p = snowGeo.attributes.position
  for (let i = 0; i < SNOW_N; i++) {
    let x = p.getX(i), y = p.getY(i); const s = snowV[i]
    y -= s.v * dt; x += Math.sin(S.time * 1.3 + s.ph) * 0.02 * dt
    if (y < WIN.y - WIN.h / 2 + 0.02) { y = WIN.y + WIN.h / 2 - 0.02; x = WIN.x + (VR() - 0.5) * (WIN.w - 0.04) }
    p.setXY(i, clamp(x, WIN.x - WIN.w / 2 + 0.01, WIN.x + WIN.w / 2 - 0.01), y)
  }
  p.needsUpdate = true
  for (const s of steam) { const k = (S.time * 0.35 + s.ph) % 1; s.sp.position.set(s.x + Math.sin(S.time * 2 + s.ph) * 0.02, 0.58 + k * 0.22, s.z); s.sp.scale.set(0.06 + k * 0.08, 0.1 + k * 0.12, 1); s.sp.material.opacity = Math.sin(k * Math.PI) * 0.22 }
  templeGlow.material.opacity = Math.max(0, templeGlow.material.opacity - dt * 0.5)
  // 灯りのゆらぎ（ごくわずか）
  shade.rotation.y += dt * 0.05
}

// ---------- 人（座っている。下半身はこたつの中）
const SEAT_POS = [[-1.25, -0.4, Math.PI / 2], [-0.6, -1.2, 0], [0, -1.2, 0], [0.6, -1.2, 0], [1.25, -0.4, -Math.PI / 2]]
const LOOK = {
  jiji: { shirt: 0x2c3e6b, hair: 0xb8b8b8, style: 'bald', glasses: true, stache: 0xf0f0f0, skin: 0xeab896, scale: 0.97 },
  okan: { shirt: 0xc85a7a, hair: 0x5a3020, style: 'perm', apron: 0xf4ead0, skin: 0xf5cdb0 },
  you: { shirt: 0xffc21f, hair: 0x2b1d17, style: 'short', ahoge: true, hood: true, skin: 0xf4c7a1 },
  oji: { shirt: 0xeae6d8, hair: 0x2b2b2b, style: 'barcode', stache: 0x2b2b2b, haramaki: 0xa82a2a, skin: 0xf2b08f, scale: 1.06 },
  itoko: { shirt: 0x2b8a6e, hair: 0x1a1a1a, style: 'long', phone: true, skin: 0xf6d0b2, scale: 0.94 },
}
const sweatTex = canvasTex(64, 64, (c) => { c.fillStyle = '#8fd3ff'; c.strokeStyle = '#1b1620'; c.lineWidth = 4; c.beginPath(); c.moveTo(32, 6); c.quadraticCurveTo(54, 40, 32, 58); c.quadraticCurveTo(10, 40, 32, 6); c.fill(); c.stroke() })
const eyeTex = canvasTex(128, 80, (c) => { c.fillStyle = '#fff'; c.strokeStyle = '#1b1620'; c.lineWidth = 7; c.beginPath(); c.ellipse(64, 40, 56, 32, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#1b1620'; c.beginPath(); c.arc(64, 42, 17, 0, 7); c.fill() })
const youTex = canvasTex(64, 64, (c) => { c.fillStyle = '#ffd21f'; c.strokeStyle = '#1b1620'; c.lineWidth = 5; c.beginPath(); c.moveTo(8, 10); c.lineTo(56, 10); c.lineTo(32, 54); c.closePath(); c.fill(); c.stroke() })
const puffTex = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h) })

function makePerson(i) {
  const key = D.seats[i], o = LOOK[key], g = new THREE.Group(), [sx, sz, ry] = SEAT_POS[i]
  g.position.set(sx, 0, sz); g.rotation.y = ry; g.scale.setScalar(o.scale || 1); scene.add(g)
  const b = new THREE.Group(); g.add(b)
  const skinM = new THREE.MeshLambertMaterial({ color: o.skin }), shirtM = M(o.shirt)
  mesh(G.cyl, 0x6a3a5a, 0, 0.04, -0.05, 0.3, 0.06, 0.3, g) // 座布団
  mesh(new THREE.CapsuleGeometry(0.2, 0.26, 4, 12), shirtM, 0, 0.62, 0, 1.18, 1, 0.85, b)
  if (o.apron) box(0.34, 0.3, 0.02, o.apron, 0, 0.6, 0.17, b)
  if (o.haramaki) mesh(G.cyl, o.haramaki, 0, 0.47, 0, 0.245, 0.14, 0.18, b)
  if (o.hood) { const h = mesh(new THREE.TorusGeometry(0.17, 0.06, 6, 16), shirtM, 0, 0.87, -0.06, 1, 1, 1, b); h.rotation.x = Math.PI / 2 + 0.3 }
  const arms = []
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.27, 0.8, 0); b.add(a)
    mesh(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), shirtM, 0, -0.22, 0, 1, 1, 1, a)
    mesh(G.sph, skinM, 0, -0.46, 0, 0.065, 0.07, 0.065, a)
    a.rotation.x = -0.9; a.rotation.z = s * 0.15; arms.push(a)
  }
  // 指さし用の人さし指
  const finger = mesh(new THREE.CapsuleGeometry(0.018, 0.07, 3, 6), skinM, 0, -0.55, 0.01, 1, 1, 1, arms[1])
  let phone = null
  if (o.phone) { phone = box(0.08, 0.14, 0.015, 0x1b1620, 0, -0.5, 0.04, arms[1]); box(0.07, 0.12, 0.004, 0x7ad0ff, 0, 0, 0.009, phone) }
  const pivot = new THREE.Group(); pivot.position.set(0, 0.9, 0); b.add(pivot)
  const head = new THREE.Group(); head.position.set(0, 0.2, 0); pivot.add(head)
  mesh(G.sph, skinM, 0, 0, 0, 0.21, 0.225, 0.2, head)
  for (const s of [-1, 1]) mesh(G.sph, skinM, s * 0.205, -0.01, 0, 0.04, 0.06, 0.03, head)
  const hairM = M(o.hair)
  if (o.style === 'short' || o.style === 'long') { const h = mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.02, -0.01, 0.222, 0.24, 0.215, head); h.rotation.x = -0.35 }
  if (o.style === 'long') box(0.42, 0.36, 0.14, hairM, 0, -0.12, -0.12, head)
  if (o.style === 'perm') for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; mesh(G.sph, hairM, Math.cos(a) * 0.15, 0.1 + Math.sin(k * 2.1) * 0.03, Math.sin(a) * 0.13 - 0.04, 0.1, 0.1, 0.1, head) }
  if (o.style === 'perm') mesh(G.sph, hairM, 0, 0.17, -0.03, 0.15, 0.1, 0.14, head)
  if (o.style === 'bald') for (const s of [-1, 1]) box(0.05, 0.09, 0.16, hairM, s * 0.2, 0.02, -0.04, head)
  if (o.style === 'barcode') for (let k = -2; k <= 2; k++) box(0.34, 0.012, 0.025, hairM, 0, 0.215 - Math.abs(k) * 0.01, k * 0.05, head)
  if (o.ahoge) { const ah = mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI * 1.3), hairM, 0.03, 0.27, 0.02, 1, 1, 1, head); ah.rotation.set(0, 0.7, -0.3) }
  const pupils = [], brows = [], eyes = [], happy = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.075, 0.03, 0.172); head.add(eg); eyes.push(eg)
    mesh(G.sph, M(0xffffff), 0, 0, 0, 0.045, 0.05, 0.024, eg)
    pupils.push(mesh(G.sph, M(0x231a1f), 0, -0.004, 0.02, 0.024, 0.027, 0.01, eg))
    brows.push(box(0.075, 0.018, 0.016, o.style === 'bald' ? 0x9a9a9a : o.hair, s * 0.075, 0.105, 0.19, head))
    const hp = mesh(happyGeo, M(0x231a1f), s * 0.075, 0.02, 0.192, 1, 1, 1, head); hp.visible = false; happy.push(hp)
  }
  if (o.glasses) for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 16), M(0x1b1620), s * 0.075, 0.03, 0.2, 1, 1, 1, head)
  const nose = mesh(G.sph, M(0xe0a088), 0, -0.02, 0.205, 0.035, 0.03, 0.03, head)
  if (o.stache) box(0.12, 0.03, 0.03, o.stache, 0, -0.07, 0.2, head)
  const mouth = mesh(G.sph, M(0x5a1424), 0, -0.11, 0.185, 0.04, 0.012, 0.015, head)
  const cheeks = []; for (const s of [-1, 1]) { const ck = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xff7a7a, transparent: true, opacity: 0 }), s * 0.13, -0.05, 0.16, 0.05, 0.032, 0.015, head); ck.rotation.y = s * 0.6; cheeks.push(ck) }
  const sweats = []
  for (let k = 0; k < 3; k++) { const sw = new THREE.Sprite(new THREE.SpriteMaterial({ map: sweatTex, transparent: true, depthTest: false })); sw.scale.setScalar(0); sw.renderOrder = 9; head.add(sw); sweats.push(sw) }
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, transparent: true, depthTest: false })); eye.position.set(0, 1.5, 0); eye.scale.set(0, 0, 1); eye.renderOrder = 10; g.add(eye)
  let tag = null
  if (key === 'you') { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: youTex, transparent: true, depthTest: false })); tag.position.set(0, 1.5, 0); tag.scale.setScalar(0.16); tag.renderOrder = 10; g.add(tag) }
  // 影を落とす（小さい部品は省く）
  b.traverse(m => { if (m.isMesh && !m.material.transparent && Math.max(m.scale.x, m.scale.y) > 0.19) m.castShadow = true })
  return { i, key, g, b, arms, finger, pivot, head, pupils, brows, eyes, happy, nose, mouth, cheeks, sweats, eye, tag, phone, skinM, skin0: new THREE.Color(o.skin),
    yaw: 0, pitch: 0, yawV: 0, pitchV: 0, tYaw: 0, tPitch: 0.1, lift: 0, talk: 0, red: 0, smile: 0, point: -1, pointK: 0, sniffT: 0, shock: 0, sweatK: 0, eyeK: 0, glare: 0, relief: 0, reseat: 0, reachArm: 0, hop: 0 }
}
const happyGeo = new THREE.TorusGeometry(0.032, 0.009, 4, 10, Math.PI)
const PPL = D.seats.map((k, i) => makePerson(i))
PPL[YOU].arms[0].add(uchiwa)
const _hp = new THREE.Vector3(), _q = new THREE.Vector3(), _w = new THREE.Vector3()
const headPos = (i, out = new THREE.Vector3()) => PPL[i].head.getWorldPosition(out)
const buttPos = i => PPL[i].g.localToWorld(new THREE.Vector3(0, 0.3, -0.22))
function lookAtPoint(n, p) {
  headPos(n.i, _hp); const d = _q.copy(p).sub(_hp)
  const ry = n.g.rotation.y, c = Math.cos(-ry), s = Math.sin(-ry)
  const lx = d.x * c + d.z * s, lz = -d.x * s + d.z * c
  n.tYaw = clamp(Math.atan2(lx, lz), -1.6, 1.6); n.tPitch = clamp(Math.atan2(-d.y, Math.hypot(lx, lz)), -0.5, 0.7)
}
const TABLE_PT = new THREE.Vector3(0, 0.45, -0.4)
// CPU のただの座り直し（みかん・湯のみに手を伸ばす）。煙も表情の変化もない
function reseat(i) { const n = PPL[i]; n.lift = Math.max(n.lift, 0.8); n.reseat = 1.3 }

// 匂い: 緑の漫画もくもく（輪郭あり）。カメラ向きの板を1回の描画にまとめ、伸び縮みでうねらせる。消える時はしぼむ
const moyaTex = canvasTex(128, 128, (c) => {
  const B = [[64, 70, 34], [38, 74, 24], [90, 74, 24], [50, 48, 24], [80, 46, 22], [64, 36, 20], [30, 56, 16], [100, 56, 16]]
  c.fillStyle = '#4f7d24'; for (const [x, y, r] of B) { c.beginPath(); c.arc(x, y, r + 5, 0, 7); c.fill() }
  c.fillStyle = '#b6da6e'; for (const [x, y, r] of B) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill() }
  c.fillStyle = '#d6efa0'; for (const [x, y, r] of B.slice(3, 6)) { c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 7); c.fill() }
  c.strokeStyle = '#6f9a36'; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); for (let a = 0; a < 9.5; a += 0.2) { const r = 3 + a * 2.2; c.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r * 0.8) } c.stroke()
})
const stinkTex = canvasTex(32, 64, (c) => { c.lineCap = 'round'; for (const [col, lw] of [['#1b1620', 9], ['#9cc45a', 4.5]]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (let y = 6; y <= 58; y += 2) c.lineTo(16 + Math.sin(y / 52 * Math.PI * 3) * 7, y); c.stroke() } })
const MOYA_N = 64
const moya = new THREE.InstancedMesh(G.plane, new THREE.MeshBasicMaterial({ map: moyaTex, transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.04 }), MOYA_N)
moya.count = 0; moya.frustumCulled = false; moya.renderOrder = 3; scene.add(moya)
for (let i = 0; i < MOYA_N; i++) moya.setColorAt(i, new THREE.Color(0xffffff))
const LINE_N = 8
const slines = new THREE.InstancedMesh(G.plane, new THREE.MeshBasicMaterial({ map: stinkTex, transparent: true, depthWrite: false, alphaTest: 0.05 }), LINE_N)
slines.count = 0; slines.frustumCulled = false; slines.renderOrder = 3; scene.add(slines)
const moyaP = [], drifts = [], TINT = [0xffffff, 0xe6f7c8, 0xd4ecaa, 0xf2ffd8]
function moyaAdd(o) { moyaP.push({ t: 0, rot: VR() * 6.28, vr: (VR() - 0.5) * 1.6, ph: VR() * 6.28, wob: 2 + VR() * 2.5, tint: TINT[Math.floor(VR() * TINT.length)], g: 0.3, ...o }); while (moyaP.length > MOYA_N) moyaP.shift() }
// strength: 0..1（後半の CPU は煙が薄い）
function fartPuffs(i, id, rec, strength = 1) {
  const p = buttPos(i), side = PPL[i].g.localToWorld(new THREE.Vector3(1, 0, 0)).sub(PPL[i].g.position).normalize()
  const big = id === 'bubo', k = Math.max(1, Math.round((id === 'suka' ? 4 : big ? 7 : 3) * strength))
  for (let j = 0; j < k; j++) {
    const sd = j % 2 ? 1 : -1
    moyaAdd({ p: PPL[i].g.localToWorld(new THREE.Vector3(sd * (0.16 + VR() * 0.06), 0.8 + VR() * 0.1, -0.22)), v: side.clone().multiplyScalar(sd * (0.15 + VR() * (big ? 0.5 : 0.25))).add(_q.set(0, 0.45 + VR() * (big ? 0.4 : 0.2), 0)), s: (big ? 0.14 : 0.11) * (0.6 + 0.4 * strength) + VR() * 0.04, g: big ? 1.2 : 0.8, life: (id === 'suka' ? 2.2 : 1.3) + VR() * 0.8 })
  }
  // 遅れて匂いが両隣へ流れる（疑いが両隣にかかる仕組みを目で見せる）
  if (rec) drifts.push({ from: i, at: S.time + Math.max(0.3, rec.smellAt - S.t), n: 0, strength, id })
}
function scatterMoya() {
  for (const p of moyaP) { if (p.path) { p.path = null; p.v = new THREE.Vector3() } const d = p.p.clone().sub(_q.set(0, 0.6, -0.4)).setY(0).normalize(); p.v.copy(d.multiplyScalar(1.5 + VR())).setY(0.3); p.life = Math.min(p.life, p.t + 0.7); p.g = 1.2 }
  for (const d of drifts) d.n = 99
}
function updateMoya(dt) {
  const play = S.mode === 'play'
  // 両隣へ流れる匂い
  for (let k = drifts.length - 1; k >= 0; k--) {
    const d = drifts[k]; if (!play) { drifts.splice(k, 1); continue }
    if (S.time < d.at) continue
    const want = Math.min(4, Math.round(3 * d.strength) + 1)
    if (d.n < want && S.time >= d.at + d.n * 0.22) {
      for (const j of [d.from - 1, d.from + 1]) if (j >= 0 && j < NSEAT) {
        const a = buttPos(d.from).add(_q.set(0, 0.25, 0)), b = headPos(j).add(_q.set(0, -0.1, 0))
        moyaAdd({ path: { a, b }, p: a.clone(), v: new THREE.Vector3(), s: 0.09 + VR() * 0.04, g: 0.25, life: 1.9 + VR() * 0.4, dur: 1.5 })
      }
      d.n++
    }
    if (d.n >= want) drifts.splice(k, 1)
  }
  // たまった匂い: こたつのまわりに湧いて漂う
  const sm = play ? clamp((S.smell - 0.35) / 2.2, 0, 1) : 0, amb = moyaP.filter(p => p.amb).length, want = Math.round(sm * 14)
  if (sm > 0 && amb < want && VR() < dt * 8) {
    const a = VR() * Math.PI * 2, r = 0.95 + VR() * 0.4
    moyaAdd({ amb: true, p: new THREE.Vector3(Math.cos(a) * r * 1.1, 0.45 + VR() * 0.35, -0.4 + Math.sin(a) * r * 0.75), v: new THREE.Vector3((VR() - 0.5) * 0.08, 0.05 + VR() * 0.06, (VR() - 0.5) * 0.08), s: 0.12 + VR() * 0.1 * (0.6 + sm), g: 0.1, life: 2.6 + VR() * 1.6 })
  }
  const q = new THREE.Quaternion(), qz = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), sc = new THREE.Vector3(), m4 = new THREE.Matrix4(), col = new THREE.Color(); let n = 0
  for (let i = moyaP.length - 1; i >= 0; i--) {
    const p = moyaP[i]; p.t += dt
    if (p.amb && sm <= 0 && !p.fading && p.life - p.t > 0.45) { p.life = p.t + 0.45; p.fading = true }
    if (p.t > p.life) { moyaP.splice(i, 1); continue }
    if (p.path) { const k = ease(p.t / p.dur); p.p.lerpVectors(p.path.a, p.path.b, k); p.p.y += Math.sin(k * Math.PI) * 0.16 }
    else { p.v.multiplyScalar(1 - (p.amb ? 0.4 : 1.6) * dt); p.v.y += (p.amb ? 0.01 : 0.15) * dt; p.p.addScaledVector(p.v, dt) }
    p.s *= 1 + p.g * dt; p.rot += p.vr * dt
    const pop = Math.min(ease(p.t / 0.22), ease((p.life - p.t) / 0.45)), w = S.time * p.wob + p.ph
    qz.setFromAxisAngle(Z, p.rot + Math.sin(w * 0.5) * 0.35); q.copy(camera.quaternion).multiply(qz)
    sc.set(p.s * pop * (1 + 0.14 * Math.sin(w)), p.s * pop * (1 + 0.14 * Math.cos(w * 1.17)), 1)
    m4.compose(p.p, q, sc); moya.setMatrixAt(n, m4); moya.setColorAt(n, col.setHex(p.tint)); n++
  }
  moya.count = n; moya.instanceMatrix.needsUpdate = true; if (moya.instanceColor) moya.instanceColor.needsUpdate = true
  // 〜〜の線は「ざわ…」の間だけ
  let ln = 0
  if (play && S.zawa && S.ph === 'quiet') for (let k = 0; k < LINE_N; k++) {
    const u = (S.time * 0.35 + k * 0.37) % 1, a = k / LINE_N * Math.PI * 2 + S.time * 0.2, pop = Math.sin(u * Math.PI)
    _q.set(Math.cos(a) * 1.2, 0.6 + u * 0.9, -0.4 + Math.sin(a) * 0.8)
    sc.set(0.11 * pop, 0.22 * pop, 1); m4.compose(_q, camera.quaternion, sc); slines.setMatrixAt(ln++, m4)
  }
  slines.count = ln; slines.instanceMatrix.needsUpdate = true
}

// 紙吹雪（年越し・濡れ衣）: インスタンスで1回の描画
const CONF_N = 160
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.045, 0.028), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF_N)
confetti.count = 0; confetti.frustumCulled = false; confetti.renderOrder = 4; scene.add(confetti)
const confP = [], CONF_COL = [0xff5a3a, 0xffd21f, 0x9cc45a, 0x7dd3ff, 0xff8ad8, 0xffffff]
for (let i = 0; i < CONF_N; i++) confetti.setColorAt(i, new THREE.Color(CONF_COL[i % CONF_COL.length]))
function burstConfetti(n, at, spread = 1) {
  for (let k = 0; k < n; k++) confP.push({ p: new THREE.Vector3(at.x + (VR() - 0.5) * 2.4 * spread, at.y + VR() * 0.6, at.z + (VR() - 0.5) * 1.4 * spread), v: new THREE.Vector3((VR() - 0.5) * 0.6, -0.2 - VR() * 0.4, (VR() - 0.5) * 0.3), r: new THREE.Euler(VR() * 6, VR() * 6, VR() * 6), w: new THREE.Vector3(VR() * 8, VR() * 8, VR() * 8), t: 0, life: 2.6 + VR() * 1.4, c: k })
  while (confP.length > CONF_N) confP.shift()
}
function updateConfetti(dt) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1); let n = 0
  for (let i = confP.length - 1; i >= 0; i--) {
    const c = confP[i]; c.t += dt; if (c.t > c.life || c.p.y < 0.02) { confP.splice(i, 1); continue }
    c.p.addScaledVector(c.v, dt); c.p.x += Math.sin(c.t * 4 + c.c) * 0.004; c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt
    q.setFromEuler(c.r); m4.compose(c.p, q, one); confetti.setMatrixAt(n++, m4)
  }
  confetti.count = n; confetti.instanceMatrix.needsUpdate = true
}

// ---------- 画面
const views = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of views) $('#' + v).hidden = v !== id }
function applyLang() {
  const T = TT(); document.documentElement.lang = S.lang
  document.querySelectorAll('[data-t]').forEach(el => { const v = T[el.dataset.t]; if (typeof v === 'string') el.innerHTML = v })
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  $('#fanTxt').textContent = T.f_fan
  for (const id of FIDS) { const b = $('#f_' + id); b.querySelector('.fn').textContent = T['f_' + id]; b.querySelector('.fp').textContent = FT[id].pts + T.ptsU }
  for (const k of ['feign', 'blame', 'rage', 'confess']) { const b = $('#c_' + k); b.querySelector('.cn').textContent = T.ch[k]; b.querySelector('.cs').textContent = T.chSub[k] }
  document.querySelectorAll('#pickRow [data-i]').forEach(b => { b.textContent = nameOf(+b.dataset.i) })
  $('#howSteps').innerHTML = ['how1', 'how2', 'howFan', 'how3'].map((k, i) => `<div class="step"><span class="num">${i + 1}</span><span>${T[k]}</span></div>`).join('')
  document.title = S.lang === 'ja' ? 'おなら人狼 | FART WOLF' : 'FART WOLF | おなら人狼'
  if (S.result) fillResult()
  updateHud(true)
}

// 吹き出し・擬音（同時に出す吹き出しは2つまで）
const FX = []
function toScreen(p) { _w.copy(p).project(camera); return { x: (_w.x + 1) / 2 * innerWidth, y: (1 - _w.y) / 2 * innerHeight } }
function fx(text, cls, o = {}) {
  const f0 = null, el = document.createElement('div'); el.className = cls; el.textContent = text; $('#fx').appendChild(el)
  const f = { el, t: 0, life: o.life || 1.6, follow: o.follow ?? -1, at: o.at || null, x: o.x, y: o.y, size: o.size, rot: o.rot || 0, cls }
  if (cls.startsWith('sb')) { const sb = FX.filter(x => x.cls.startsWith('sb')); if (sb.length >= 2) killFx(sb[0]) }
  if (cls.startsWith('ono')) { const on = FX.filter(x => x !== f0 && x.cls.startsWith('ono')); if (on.length >= 2) killFx(on[0]) }   // 擬音も同時に2つまで
  if (o.size) el.style.fontSize = o.size + 'px'
  FX.push(f); return f
}
function killFx(f) { f.el.remove(); const k = FX.indexOf(f); if (k >= 0) FX.splice(k, 1) }
function clearFx() { while (FX.length) killFx(FX[0]) }
function updateFx(dt) {
  for (const f of [...FX]) {
    f.t += dt; if (f.t >= f.life) { killFx(f); continue }
    let x = f.x, y = f.y
    if (f.follow >= 0) { const s = toScreen(headPos(f.follow, _hp).add(_q.set(0, 0.3, 0))); x = s.x; y = s.y }
    else if (f.at) { const s = toScreen(f.at); x = s.x; y = s.y }
    const k = f.t / f.life, pop = Math.min(1, f.t / 0.12)
    let sc = 0.6 + 0.4 * pop, op = k > 0.85 ? (1 - k) / 0.15 : 1, dy = 0
    if (f.cls.startsWith('ono')) { dy = -f.t * 40; sc *= 1 + 0.15 * Math.sin(f.t * 30) * (1 - k) }
    const w = f.el.offsetWidth, h = f.el.offsetHeight
    if (f.cls.startsWith('sb') || f.cls.startsWith('vt')) { x = clamp(x, w / 2 + 6, innerWidth - w / 2 - 6); y = clamp(y, h + 50, innerHeight) }
    f.el.style.transform = `translate(${x - w / 2}px,${y - h + dy}px) rotate(${f.rot}deg) scale(${sc})`; f.el.style.opacity = op
  }
}
const say = (i, text, life = 2.4) => { Snd.sfx('talk'); PPL[i].talk = Math.min(life, 1.4); return fx(text, i === YOU ? 'sb mine' : 'sb', { follow: i, life }) }
const ono = (text, p, cls = 'ono', size = 30, life = 1.3) => fx(text, cls, { at: p.clone(), size, life, rot: (VR() - 0.5) * 16 })
const banner = (text, cls = 'banner', life = 1.8) => fx(text, cls, { x: innerWidth / 2, y: innerHeight * 0.3, life })

// ---------- ラウンドの組み立て（状況だけ乱数で作る。判定には乱数を使わない）
const PER = c => D.pers[D.seats[c]]
const farted = j => S.farts.some(f => f.who === j)
const lifted = j => S.lifts.some(l => l.who === j)
function setGz(c, x) { if (S.gz[c] !== x) { S.gz[c] = x; S.gzSince[c] = S.t } }
function planRound() {
  const L = D.quiet, evs = []
  const jit = S.round > 3 ? 0.9 : 0
  for (let t = 3 + R() * 1.5; t < L - 1.2; t += 6 + (R() - 0.5) * 2 * jit) evs.push({ type: 'bell', src: -1, tw: t - 0.9, tp: t, dur: 1.4 })
  const free = (t, d) => evs.every(e => t + d < e.tw - 0.6 || t > e.tp + e.dur + 0.6)
  for (const [type, src, w, d, p] of [['sneeze', 0, 1.3, 0.75, 1], ['phone', 4, 0, 1.6, 0.55]]) {
    if (R() > p) continue
    for (let k = 0; k < 12; k++) { const t = 3 + R() * (L - 6); if (free(t - w, w + d)) { evs.push({ type, src, tw: t - w, tp: t, dur: d }); break } }
  }
  // 猫: 予告なしで通り、歩いている途中のどこかで一瞬だけ鳴く
  const nCat = R() < 0.3 ? 0 : R() < 0.75 ? 1 : 2
  for (let k = 0; k < nCat; k++) for (let tr = 0; tr < 12; tr++) {
    const st = 1 + R() * (L - 2 - D.cat.walk), meow = st + D.cat.walk * (0.2 + R() * 0.6)
    if (free(meow - 0.4, D.cat.win + 0.8) && evs.every(e => e.type !== 'cat' || Math.abs(e.tw - st) > D.cat.walk + 0.5)) { evs.push({ type: 'cat', src: -1, tw: st, tp: meow, dur: D.cat.win, walk: D.cat.walk }); break }
  }
  evs.sort((a, b) => a.tw - b.tw)
  S.evs = evs
  // CPU もこっそりこく
  S.cpuPlan = []
  const nCpu = R() < 0.5 + 0.04 * S.round ? (R() < 0.25 ? 2 : 1) : 0
  for (let k = 0; k < nCpu; k++) {
    const who = R() < 0.45 ? 3 : pick(CPUS), id = R() < 0.55 ? 'suka' : R() < 0.75 ? 'pu' : 'bubo'
    let t = 2 + R() * (L - 4)
    const ev = evs.find(e => e.type === 'bell' || e.type === 'sneeze')
    if (id !== 'suka' && ev && R() < 0.6) t = (pick(evs.filter(e => e.type === 'bell' || e.type === 'sneeze')) || ev).tp + 0.2
    S.cpuPlan.push({ who, id, t, done: false })
  }
  // ただの座り直し（みかん・湯のみに手を伸ばす）。後半ほど多い
  S.resPlan = []
  const nRes = 1 + (R() < 0.5 ? 1 : 0) + (S.round > 4 && R() < 0.6 ? 1 : 0)
  for (let k = 0; k < nRes; k++) S.resPlan.push({ who: pick(CPUS), t: 1.5 + R() * (L - 3), done: false })
}
function startRun() {
  Snd.init(); Snd.sfx('tap')
  S.seed = (S.fixedSeed ?? ((Date.now() & 0xffffff) || 1)); S.rand = mulberry(S.seed)
  S.mode = 'play'; S.round = 0; S.lives = 3; S.cleared = false; S.score = 0; S.pend = 0; S.smell = 0; S.result = null; S.photo = false; S.capPref = ''; S.wantCap = false
  S.fanLeft = D.fan.uses; S.carryNext = 0; S.prevCulprit = -1
  S.stats = { farts: 0, framed: 0, caught: 0, best: 0, perfect: 0, deduce: 0, bluff: 0, unan: 0, frameVotes: 0, fans: 0 }; S.tut = !store.get('fw.played')
  show('vPlay'); clearFx(); nextRound()
}
function nextRound() {
  S.round++; S.ph = 'quiet'; S.t = 0; S.pend = 0; S.farts = []; S.lifts = []; S.fans = []; S.cd = 0; S.fanCd = 0; S.zawa = false; S.smell *= 0.45; S.E = null; S.V = null; S.votes = []; S.culprit = -1; S.unan = false; S.cnt = null; S.outcome = ''; S.tier = -1; S.meetQ = []; S.clues = []; S.said = []
  S.carry = new Array(NSEAT).fill(0); S.carry[YOU] = S.carryNext || 0; S.carryNext = 0
  for (const n of PPL) { n.point = -1; n.smile = 0; n.shock = 0 }
  S.gz = PPL.map(() => -1); S.gzT = PPL.map(() => 0.5 + R() * 2); S.gzSince = PPL.map(() => 0)
  planRound()
  setPanel('farts'); Snd.setTrack('night')
  banner(TT().roundOf.replace('{N}', S.round).replace('{M}', D.rounds) + '　' + TT().quietT, 'banner', 2)
  if (S.tut && S.round === 1) S.hintT = 0
}

// ---------- しずかな時間
const activePeak = t => S.evs.find(e => t >= e.tp && t <= e.tp + e.dur)
function watchers(i) { return CPUS.filter(c => c !== i && S.gz[c] === i) }
// 後半ほど CPU の煙は薄い（見分けが難しくなる）
const cpuPuff = () => clamp(1 - 0.09 * (S.round - 1), 0.35, 1)
function doFart(i, id) {
  const f = FT[id], t = S.t, ev = activePeak(t)
  const mask = ev && D.mask[ev.type] ? (D.mask[ev.type][id] || 0) : 0
  const audible = f.loud * (1 - mask)
  // 見られていた時間が十分なら「目撃」、短ければ「ちらっと」（目のいい人ほど早く気づく）
  const wit = [], gl = []
  for (const c of watchers(i)) (S.t - S.gzSince[c] >= 0.3 / PER(c).eye ? wit : gl).push(c)
  const rec = { who: i, id, t, mask, audible, ev: ev ? ev.type : null, wit, gl, smellAt: t + 2.5 }
  S.farts.push(rec); S.lifts.push({ who: i, t, real: true, seen: watchers(i) })
  const n = PPL[i]; n.lift = 1
  if (i !== YOU) n.relief = 1.4 * cpuPuff()
  fartPuffs(i, id, rec, i === YOU ? 1 : cpuPuff())
  const how = audible > 0.2 ? 'busted' : mask >= 0.99 ? 'masked' : mask > 0 ? 'half' : 'plain'
  const bp = buttPos(i)
  if (i === YOU) {
    S.pend += f.pts; S.stats.farts++; S.cd = D.cd
    Snd.fart(id, how)
    const word = { suka: S.lang === 'ja' ? 'すぅ…' : 'pssst...', pu: S.lang === 'ja' ? 'ぷっ' : 'pfft', bubo: S.lang === 'ja' ? 'ブボボボッ！！' : 'BRAAAP!!' }[id]
    // かき消せた時は「かき消した！」だけ（鐘などの擬音と合わせて文字を2つまでにする）
    if (!(mask > 0.5 && id !== 'suka')) ono(word, bp.clone().add(new THREE.Vector3(0, 0.5, 0)), audible > 0.2 ? 'ono red' : mask > 0 ? 'ono hid' : 'ono green', id === 'bubo' ? 40 : 28)
    if (mask > 0.5 && id !== 'suka') ono(S.lang === 'ja' ? 'かき消した！' : 'Covered!', bp.clone().add(new THREE.Vector3(0, 0.95, 0)), 'ono yel', 22, 1.1)
    if (id === 'bubo') shake = 0.35
    store.set('fw.played', '1')
  } else {
    Snd.fart(id, how, 0.7)
  }
  // 聞こえたら振り向く（耳の遠いじいちゃんは大きい音だけ）
  if (audible > 0.2) {
    for (const c of CPUS) if (c !== i && audible * PER(c).hear > 0.3) { setGz(c, i); S.gzT[c] = 2.5; PPL[c].shock = 1 }
    Snd.sfx('gasp')
  }
}
// ただの座り直し（煙も表情も変わらない。見ていた家族は少し怪しむ）
function doReseat(i) { reseat(i); S.lifts.push({ who: i, t: S.t, real: false, seen: CPUS.filter(c => c !== i && S.gz[c] === i) }) }
// うちわ: 匂いを散らす。出した直後・匂わない時・見られている時は怪しまれる
function pressFan() {
  Snd.init()
  if (S.mode !== 'play' || S.ph !== 'quiet' || !(S.fanLeft > 0) || S.fanCd > 0) return false
  S.fanLeft--; S.fanCd = D.fan.cd; S.stats.fans++
  const recent = S.farts.some(f => f.who === YOU && S.t - f.t <= D.fan.recent)
  const cold = S.smell < D.fan.cold
  const seenBy = watchers(YOU)
  const kind = recent ? 'fanFart' : cold ? 'fanCold' : seenBy.length ? 'fanSeen' : 'ok'
  S.fans.push({ t: S.t, kind, seenBy })
  S.smell *= D.fan.scatter; for (const f of S.farts) f.fanned = true
  if (S.smell < 1.7) S.zawa = false
  PPL[YOU].fanT = 1.2; scatterMoya(); Snd.sfx('fan')
  if (kind !== 'ok') {
    const sp = seenBy[0] ?? 1
    say(sp, TT()[kind], 1.8); PPL[sp].shock = 1; setGz(sp, YOU); S.gzT[sp] = 1.5
  }
  return true
}
function updateQuiet(dt) {
  S.t += dt; S.cd = Math.max(0, S.cd - dt); S.fanCd = Math.max(0, S.fanCd - dt)
  const T = TT()
  for (const e of S.evs) {
    if (!e.w && S.t >= e.tw && e.tp > e.tw) {
      e.w = 1
      if (e.type === 'sneeze') { say(e.src, T.sneezeW, 1.3); Snd.sneezeW(); PPL[e.src].tPitch = -0.3 }
      if (e.type === 'bell') { ono(S.lang === 'ja' ? 'ゴォ…' : 'hmmm...', new THREE.Vector3(1.5, 1.45, -2), 'ono dim', 20, 0.9); Snd.bellWarn() }
      if (e.type === 'cat') catWalk(e)
    }
    if (!e.p && S.t >= e.tp) {
      e.p = 1
      if (e.type === 'bell') { Snd.bell(); ono(T.bell, new THREE.Vector3(1.5, 1.6, -2), 'ono bell', 46, 1.6); shake = Math.max(shake, 0.12); templeGlow.material.opacity = 1 }
      if (e.type === 'sneeze') { Snd.sneeze(); ono(T.sneeze, headPos(0).add(new THREE.Vector3(0.1, 0.25, 0)), 'ono yel', 34, 1); PPL[0].lift = 0.6 }
      if (e.type === 'phone') { Snd.phone(e.dur); ono(T.phone, headPos(4).add(new THREE.Vector3(0, 0.2, 0)), 'ono', 26, e.dur) }
      if (e.type === 'cat') {
        Snd.meow(); CAT.meow = 0.5; ono(T.cat, catPos().add(_q.set(0, 0.3, 0)), 'ono yel', 26, 0.9)
        for (const c of CPUS) { setGz(c, -2); S.gzT[c] = 1.1 }
        e.love = 1
      }
    }
    if (e.type === 'cat' && e.love === 1 && S.t >= e.tp + 0.45) { e.love = 2; say(CPUS[S.round % 4], T.catLove[S.round % T.catLove.length], 1.3) }
  }
  for (const p of S.cpuPlan) if (!p.done && S.t >= p.t) { p.done = true; doFart(p.who, p.id) }
  for (const p of S.resPlan) if (!p.done && S.t >= p.t) { p.done = true; doReseat(p.who) }
  // 匂いは遅れて広がる
  for (const f of S.farts) if (!f.sm && S.t >= f.smellAt) {
    f.sm = 1; S.smell += FT[f.id].smell * (f.fanned ? D.fan.scatter : 1)
    const near = [f.who - 1, f.who + 1].filter(j => j >= 0 && j < NSEAT && j !== YOU)
    for (const j of near) { PPL[j].sniffT = 1.2; Snd.sfx('sniff') }
  }
  if (!S.zawa && S.smell > 1.7) { S.zawa = true; Snd.sfx('zawa'); banner(T.smellUp, 'banner zawa', 1.6); for (const c of CPUS) S.gzT[c] = Math.min(S.gzT[c], 0.3 + R() * 0.5) }
  // 視線（だんだん鋭くなる。匂いがたまると周りを見回す）
  for (const c of CPUS) {
    S.gzT[c] -= dt
    if (S.gzT[c] > 0) continue
    const pYou = 0.14 + 0.065 * (S.round - 1) + (S.zawa ? 0.25 : 0) + (S.smell > 0.8 ? 0.08 : 0)
    const r = R()
    if (r < pYou) setGz(c, YOU)
    else if (r < pYou + 0.22) setGz(c, pick([0, 1, 3, 4].filter(j => j !== c)))
    else setGz(c, -1)
    S.gzT[c] = (S.gz[c] === YOU ? 1.2 + R() * 1.4 : 1.5 + R() * 2.5) * (S.zawa ? 0.7 : 1)
  }
  // 1回戦だけ、案内を出す
  if (S.tut && S.round === 1) {
    const nb = S.evs.find(e => e.type === 'bell' && e.tp > S.t && e.tp - S.t < 1.6)
    if (nb) showHint(T.hintBell, 'bell')
    else if (watchers(YOU).length) showHint(T.hintLook, 'look')
    else if (S.t < 3) showHint(T.hintFirst, 'first')
    else hideHint()
  }
  // 匂いがたまるほど音楽が崩れる（見た目・音だけ）
  const sourT = S.zawa ? 1 : clamp((S.smell - 0.7) / 1.0, 0, 0.8)
  Snd.sour = clamp(Snd.sour + (sourT - Snd.sour) * Math.min(1, dt * (sourT > Snd.sour ? 0.6 : 1.5)), 0, 1); if (Snd.sour < 0.01 && !sourT) Snd.sour = 0
  if (S.t >= D.quiet) { hideHint(); startMeeting() }
}
function showHint(txt, k) { const h = $('#hint'); if (h.dataset.k !== k || h.hidden) { h.textContent = txt; h.dataset.k = k; h.hidden = false } }
function hideHint() { $('#hint').hidden = true }

// ---------- 会議: CPU ひとりずつの見方（決定的）
// V[c][j] = c が j を疑う強さ。clues = 会議で言える根拠（種類つき）
function evidence() {
  const sh = sharp(), V = {}, clues = [], smE = new Array(NSEAT).fill(0)
  for (const c of CPUS) V[c] = new Array(NSEAT).fill(0)
  const src = new Array(NSEAT).fill(0)
  for (const f of S.farts) {
    src[f.who] += FT[f.id].smell * (f.fanned ? D.fan.scatter + 0.05 : 1)
    if (f.audible > 0.15) for (const c of CPUS) if (c !== f.who) {
      const w = 2.5 * f.audible * PER(c).hear; V[c][f.who] += w
      clues.push({ type: f.mask > 0 ? 'soundMix' : 'sound', c, about: f.who, w: w + 0.2, ev: f.ev })
    }
    for (const c of f.wit) { V[c][f.who] += 2.0; clues.push({ type: 'saw', c, about: f.who, w: 1.9 }) }
    for (const c of f.gl) { V[c][f.who] += 0.7; clues.push({ type: 'glance', c, about: f.who, w: 0.7 }) }
  }
  // 匂い: 隣の人の鼻は向きが分かる。離れた人は出どころと両隣の区別がつきにくい
  for (let i = 0; i < NSEAT; i++) {
    if (!src[i]) continue
    const v = Math.pow(src[i], 1.3)
    for (const c of CPUS) {
      if (c === i) continue
      const nose = PER(c).nose, near = Math.abs(c - i) === 1
      const a = (near ? 1.1 : 0.6) * nose * v; V[c][i] += a; smE[i] += a / 4
      for (const j of [i - 1, i + 1]) if (j >= 0 && j < NSEAT && j !== c) { const b = (near ? 0.25 : 0.6 - 0.2 * sh) * nose * v; V[c][j] += b; smE[j] += b / 4 }
      if (near) clues.push({ type: 'smell', c, about: i, w: 0.9 * nose * v })
      else clues.push({ type: 'smell', c, about: i, w: 0.5 * nose * v })
    }
  }
  // 座り直し・腰浮き（CPU 同士）: 見ていた人だけ
  for (const l of S.lifts) if (l.who !== YOU) for (const c of l.seen) { V[c][l.who] += 0.6; clues.push({ type: 'lift', c, about: l.who, w: 0.6 }) }
  // うちわ
  for (const fn of S.fans) {
    if (fn.kind === 'fanFart') for (const c of CPUS) { V[c][YOU] += 2.2; clues.push({ type: 'fanFart', c, about: YOU, w: 2.0 }) }
    if (fn.kind === 'fanCold') for (const c of CPUS) { V[c][YOU] += 0.8; clues.push({ type: 'fanCold', c, about: YOU, w: 0.75 }) }
    for (const c of fn.seenBy) { V[c][YOU] += 1.2; if (fn.kind !== 'fanFart') clues.push({ type: 'fanSeen', c, about: YOU, w: 1.1 }) }
  }
  // 性格
  for (const c of CPUS) {
    const p = PER(c)
    for (let j = 0; j < NSEAT; j++) if (j !== c) V[c][j] += S.carry[j]
    if (p.grudge && S.prevCulprit >= 0 && S.prevCulprit !== c && S.farts.length) { V[c][S.prevCulprit] += p.grudge * 0.6; clues.push({ type: 'grudge', c, about: S.prevCulprit, w: 0.5 }) }
    if (p.protect) V[c][YOU] *= 1 - p.protect
    // 自分がこいた人は黙る。おじさんは自分がこくと人を指す
    if (farted(c) && p.deflect) { let b = c === 2 ? 1 : c - 1, bv = -1; for (let j = 0; j < NSEAT; j++) if (j !== c && V[c][j] > bv) { bv = V[c][j]; b = j } V[c][b] += p.deflect * 1.2 }
  }
  for (const c of CPUS) V[c][c] = 0
  clues.sort((a, b) => b.w - a.w || a.c - b.c || a.about - b.about)
  return { V, clues, smE }
}
const avgE = V => { const E = new Array(NSEAT).fill(0); for (const c of CPUS) for (let j = 0; j < NSEAT; j++) E[j] += V[c][j] / 4; return E }
function lineOf(cl) {
  const L = TT().L, arr = L[cl.type] || L.smell
  let k = (S.round + cl.about) % arr.length
  if (cl.type === 'soundMix') k = { bell: 0, sneeze: 1, cat: 2, phone: 1 }[cl.ev] ?? 0
  return arr[k].replace('{X}', nameOf(cl.about, true))
}
function startMeeting() {
  Snd.sour = 0
  if (!S.farts.length) { S.ph = 'peace'; S.t = 0; setPanel(''); banner(TT().peace, 'banner', 1.8); return }
  S.ph = 'meet'; S.t = 0; setPanel(''); Snd.setTrack('meet')
  const ev = evidence(); S.V = ev.V; S.smE = ev.smE
  // 会議の発言: 根拠の強い順に2つ（同じ相手・同じ種類は重ねない）
  const said = []
  for (const cl of ev.clues) { if (said.length >= 2) break; if (said.some(s => s.about === cl.about && (s.type === cl.type || s.c === cl.c))) continue; said.push(cl) }
  S.said = said
  // 流されやすい人は、聞いた発言を信じる
  for (const s of said) for (const c of CPUS) if (c !== s.c && c !== s.about) S.V[c][s.about] += PER(c).follow * 0.5 * s.w
  S.E = avgE(S.V)
  // 言い出しっぺ: 鼻のいい人。自分がこいた人は黙るが、おじさんは自分から言い出す（言い出しっぺの法則）
  const cand = CPUS.map(c => ({ c, v: D.ppl[D.seats[c]].nose * (farted(c) ? (PER(c).deflect ? 2 : 0.5) : 1) })).sort((a, b) => b.v - a.v || a.c - b.c)
  S.sniffer = cand[0].c
  S.meetQ = [{ at: 0.5, i: S.sniffer, text: TT().sniff[S.round % TT().sniff.length] }, ...said.map((l, k) => ({ at: 2.4 + k * 2.3, i: l.c, text: lineOf(l), about: l.about, type: l.type }))]
  banner(TT().meetT, 'banner meet', 1.6)
}
function updateMeet(dt) {
  S.t += dt
  for (const q of S.meetQ) if (!q.done && S.t >= q.at) {
    q.done = true; say(q.i, q.text, 2.6)
    if (q.about !== undefined) { S.gz[q.i] = q.about; PPL[q.i].point = q.about }
    else { PPL[q.i].sniffT = 1.5; Snd.sfx('sniff') }
  }
  for (const c of CPUS) if (!S.meetQ.some(q => q.i === c && q.done && q.about !== undefined)) S.gz[c] = topSuspect(c)
  const end = Math.max(...S.meetQ.map(q => q.at)) + 2.4
  if (S.t >= end) { S.ph = 'choose'; S.t = 0; for (const n of PPL) n.point = -1; setPanel('choose') }
}
function topSuspect(c) {
  const row = S.V && S.V[c] ? S.V[c] : S.E
  let b = -1, v = -1; if (!row) return b
  for (let j = 0; j < NSEAT; j++) if (j !== c && row[j] > v) { v = row[j]; b = j } return b
}
// あなたに向く証拠（言い逃れの比べ相手）
function againstYou() {
  const mine = S.farts.filter(f => f.who === YOU)
  const sound = mine.reduce((m, f) => Math.max(m, f.audible > 0.15 ? 2.5 * f.audible : 0), 0)
  const saw = mine.reduce((s, f) => s + 1.5 * f.wit.length + 0.5 * f.gl.length, 0)
  const fan = S.fans.reduce((s, f) => s + (f.kind === 'fanFart' ? 2.2 : f.kind === 'fanCold' ? 0.8 : f.kind === 'fanSeen' ? 1.2 : 0), 0)
  const smell = S.smE ? S.smE[YOU] : 0
  const parts = { sound, saw, fan, smell }
  return { ...parts, total: sound + saw + fan + smell + S.carry[YOU], top: Object.entries(parts).sort((a, b) => b[1] - a[1])[0][0] }
}
// なすりつけの材料（相手に向く証拠）
function argFor(T) {
  const parts = { real: farted(T) ? 9 : 0, lift: lifted(T) ? 1.2 : 0, smell: S.smE ? S.smE[T] : 0, meet: 0.8 * S.said.filter(s => s.about === T).length, near: Math.abs(T - YOU) === 1 ? 0.5 : 0 }
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0), top: Object.entries(parts).sort((a, b) => b[1] - a[1])[0][0] }
}
function choose(kind, target) {
  if (S.ph !== 'choose' && S.ph !== 'pick') return
  if (kind === 'blame' && target === undefined) { S.ph = 'pick'; setPanel('pick'); return }
  Snd.sfx('tap'); setPanel('')
  const T = TT(), R2 = T.R, V = S.V
  const iFarted = farted(YOU), ag = againstYou()
  S.choice = kind; S.ph = 'react'; S.t = 0
  let line = T.say[kind], ok = false, resp = '', reason = ''
  S.blameT = -1
  const each = fn => { for (const c of CPUS) fn(V[c], c) }
  if (kind === 'feign') {
    const otherSmell = Math.max(...S.smE.filter((x, j) => j !== YOU))
    ok = !iFarted || (ag.sound === 0 && ag.saw === 0 && ag.fan === 0 && ag.smell <= otherSmell + 0.2)
    reason = ok ? 'feignOk' : ag.sound > 0 ? 'feignNgSound' : ag.saw > 0 ? 'feignNgSaw' : ag.fan > 0 ? 'ngFan' : 'feignNgSmell'
    // 信じる度合いは人による（流されやすい・かばう人ほど信じる）
    each((v, c) => { const tr = clamp(0.35 + PER(c).follow + PER(c).protect, 0, 1); v[YOU] = ok ? v[YOU] * (1 - 0.5 * tr) : v[YOU] * 1.1 + 0.1 })
  } else if (kind === 'blame') {
    line = line.replace('{T}', nameOf(target)); S.blameT = target
    const a = argFor(target), hard = ag.sound > 0 || ag.saw > 0
    if (a.real) { ok = true; reason = 'real' }
    else { ok = iFarted ? a.total >= ag.total && a.total > 0 : a.total > 0; reason = ok ? a.top : (iFarted ? { sound: 'ngSound', saw: 'ngSaw', fan: 'ngFan', smell: 'ngSmell' }[ag.top] : 'ngWeak') }
    // ほんまにこいた人を指したら必ず通る。ただし自分も丸聞こえ・目撃なら道連れで二人とも疑われる
    // 信じる度合い: 流されやすさ＋自分でも怪しいと思っていたか＋隣で匂ったか
    if (ok) each((v, c) => { if (c === target) return; const fl = PER(c).follow >= 0.5 ? PER(c).follow : 0, tr = clamp(fl + (v[target] > 0.3 ? 0.45 : 0) + 0, 0, 1); v[target] += tr * (v[YOU] * 0.7 + 0.5); if (!(a.real && hard)) v[YOU] *= 1 - 0.6 * tr })
    else each(v => { v[YOU] = v[YOU] * 1.15 + 0.2 })
  } else if (kind === 'rage') {
    const F = S.sniffer; ok = farted(F); S.blameT = F; reason = ok ? 'rageOk' : 'rageNg'
    if (ok) each((v, c) => { if (c === F) return; const tr = clamp(0.4 + PER(c).follow, 0, 1); v[F] += tr * (v[YOU] * 0.7 + 0.5); v[YOU] *= 1 - 0.5 * tr }); else each(v => { v[YOU] = v[YOU] * 1.25 + 0.3 })
  }
  S.chOk = ok; S.iFarted = iFarted; S.reason = reason
  S.E = avgE(V)
  say(YOU, line, 2.6)
  PPL[YOU].point = kind === 'blame' || kind === 'rage' ? S.blameT : -1
  if (kind === 'confess') resp = T.rConfess
  else { const r = R2[reason] || R2.feignOk; resp = r.replace('{T}', S.blameT >= 0 ? nameOf(S.blameT) : '') }
  // 返すのは、指された人でも言い出しっぺでもない人（決まった順）
  const responder = kind === 'rage' ? CPUS.find(c => c !== S.sniffer) : CPUS.find(c => c !== S.blameT && c !== (kind === 'blame' ? -1 : S.sniffer)) ?? 1
  S.respQ = { at: 1.7, i: responder, text: resp }
  if (kind === 'blame' && ok && farted(target)) PPL[target].shock = 1
  if (kind === 'confess') { for (const c of CPUS) PPL[c].smile = 1 }
}
function updateReact(dt) {
  S.t += dt
  if (S.respQ && S.t >= S.respQ.at) { const q = S.respQ; S.respQ = null; say(q.i, q.text, 2.4); if (S.choice === 'confess') Snd.laugh(4) }
  if (S.t >= 3.9) {
    PPL[YOU].point = -1
    if (S.choice === 'confess') { S.culprit = YOU; return verdict() }
    startVote()
  }
}
// 投票: 各自の見方で一番疑う人。1位と2位が近い時は性格で決める
function voteOf(c) {
  const row = S.V[c], p = PER(c), cand = [...row.keys()].filter(j => j !== c).sort((a, b) => row[b] - row[a] || a - b)
  const a = cand[0], b = cand[1]
  if (row[a] < D.unsure) return -1 // わからん
  if (row[a] - row[b] >= D.doubt * row[a]) return a
  // 迷った時
  const key = D.seats[c]
  if (key === 'jiji') return a === YOU ? b : a
  if (key === 'okan') return S.smE[b] > S.smE[a] ? b : a
  if (key === 'oji') return b
  if (key === 'itoko') { const last = S.said.at(-1); return last && (last.about === a || last.about === b) ? last.about : a }
  return a
}
function startVote() {
  S.ph = 'vote'; S.t = 0; Snd.sfx('drum')
  S.votes = CPUS.map(c => ({ c, j: voteOf(c) }))
  const cnt = new Array(NSEAT).fill(0); for (const v of S.votes) if (v.j >= 0) cnt[v.j]++
  const mx = Math.max(...cnt), top = [...cnt.keys()].filter(i => cnt[i] === mx)
  S.cnt = cnt
  S.culprit = mx >= 2 && top.length === 1 ? top[0] : -1
  S.unan = S.culprit >= 0 && cnt[S.culprit] === (S.culprit === YOU ? 4 : 3)
  banner(TT().vote, 'banner meet', 1.2)
}
function updateVote(dt) {
  S.t += dt
  S.votes.forEach((v, k) => {
    if (!v.shown && S.t >= 0.5 + k * 0.45) {
      v.shown = true; Snd.sfx('point')
      if (v.j < 0) { fx('？', 'vt', { at: headPos(v.c).add(new THREE.Vector3(0, 0.36, 0)), size: 22, life: 1.9 }); return }
      PPL[v.c].point = v.j; S.gz[v.c] = v.j
      fx(nameOf(v.j, true) + '!', v.j === YOU ? 'vt red' : 'vt', { at: headPos(v.c).add(new THREE.Vector3(0, 0.36, 0)), size: 20, life: 1.9 })
    }
  })
  if (S.t >= 2.6) verdict()
}
function verdict() {
  S.ph = 'verdict'; S.t = 0
  const T = TT(), c = S.culprit, iF = farted(YOU), cnt = S.cnt || new Array(NSEAT).fill(0), pend = S.pend
  let bank = 0, head = '', cls = 'verdict', label = ''
  S.outcome = 'unsolved'; S.tier = -1
  if (S.choice === 'confess') {
    bank = Math.round(pend * 0.5) + (iF ? 20 : 10); S.outcome = 'confess'; head = T.confessed; cls += ' laugh'
    Snd.sfx('safe')
  } else {
    const yv = cnt[YOU]
    if (iF) {
      const tier = Math.min(4, yv), td = D.tiers[tier]; S.tier = tier
      bank = Math.round(pend * td.keep)
      if (td.heart) { S.lives--; S.stats.caught++; S.outcome = 'caught'; PPL[YOU].shock = 1; FX3.red = 1; shake = 0.3; Snd.sfx('wahwah'); S.capKind = 'caught'; S.wantCap = !S.photo || S.capPref !== 'framed' }
      else S.outcome = 'tier' + tier
      if (td.carry) S.carryNext = td.carry
      if (tier === 0) { S.stats.perfect++; bank += D.bonus.perfect }
      head = T.tier[tier] + (td.heart ? (S.lang === 'ja' ? '！ハート−1' : '! -1 heart') : '')
      cls += td.heart ? ' bad' : tier === 0 ? ' good' : ' safe'
      if (!td.heart) Snd.sfx(tier === 0 ? 'fanfare' : 'safe')
    } else if (yv > 0) { S.outcome = 'wrongYou'; head = T.R.innocent[S.round % T.R.innocent.length] + (S.lang === 'ja' ? '（ノーカウント）' : ' (no count)'); cls += ' safe' }
    if (c >= 0 && c !== YOU) {
      const cF = farted(c)
      if (!cF) {
        const fb = cnt[c] >= 3 ? Math.max(50, Math.round(pend * 0.6)) : Math.max(20, Math.round(pend * 0.3))
        let extra = fb
        if (S.choice === 'blame' && S.blameT === c && lifted(c)) { S.stats.bluff++; extra += D.bonus.bluff; label = T.bluff }
        bank += extra; S.stats.framed++; S.stats.frameVotes += cnt[c]; S.outcome = 'framed'; head = (label ? label + '！' : '') + T.framed; cls = 'verdict good'
        Snd.laugh(cnt[c] >= 3 ? 6 : 3); Snd.sfx('fanfare'); for (const n of PPL) if (n.i !== c) n.smile = 1; PPL[c].shock = 1; burstConfetti(cnt[c] >= 3 ? 80 : 40, headPos(c).add(_q.set(0, 0.9, 0)), 0.6)
        S.capKind = 'framed'; S.wantCap = true; S.capPref = 'framed'
      } else if (S.choice === 'blame' && S.blameT === c) {
        bank += D.bonus.deduce; S.stats.deduce++; S.outcome = 'blamed'; label = T.deduce; head = label + '！' + T.blamed; cls = 'verdict good'
        Snd.laugh(3); Snd.sfx('fanfare'); PPL[c].shock = 1
      } else if (!iF) { S.outcome = 'correct'; head = nameOf(c) + T.correct; Snd.sfx('stamp') }
    }
    if (!head) { head = S.lang === 'ja' ? '迷宮入り…' : 'Case unsolved...'; cls += ' safe'; Snd.sfx('safe') }
    if (S.unan) S.stats.unan++
    if (c >= 0) S.prevCulprit = c
  }
  S.score += bank; S.pend = 0; S.lastBank = bank
  // 文字は2つまで: 犯人（＋満場一致・技の名前）と、結果の帯
  for (const f of [...FX]) if (f.cls.startsWith('vt')) killFx(f)
  if (c >= 0) fx((S.unan ? T.unan + (S.lang === 'ja' ? 'で ' : ': ') : T.culprit + ' ') + nameOf(c) + (S.lang === 'ja' ? '！' : '!'), 'vt yel', { at: headPos(c).add(new THREE.Vector3(0, 0.5, 0)), size: 26, life: 2.9 })
  fx(head + (bank ? '  +' + bank : ''), cls, { x: innerWidth / 2, y: innerHeight * (innerWidth < innerHeight ? 0.66 : 0.8), life: 2.9 })
  for (const n of PPL) n.point = -1
  if (c >= 0) for (const v of S.votes) if (v.j === c) PPL[v.c].point = c
  Snd.setTrack(S.outcome === 'caught' ? 'sad' : S.outcome === 'framed' || S.outcome === 'blamed' || S.tier === 0 ? 'happy' : 'night')
}
function newYear() {
  S.ph = 'over'; S.t = -1.2; S.cleared = true; S.wantCapOver = !S.photo
  const bonus = S.lives * 100; S.score += bonus
  Snd.bell(); Snd.sfx('fanfare'); Snd.sfx('chime'); Snd.laugh(5); Snd.setTrack('ny'); templeGlow.material.opacity = 1; burstConfetti(150, new THREE.Vector3(0, 2.0, -0.6), 1)
  for (const n of PPL) n.smile = 1
  banner(TT().newYear, 'banner meet', 3.4)
  fx(TT().nyBonus + ' +' + bonus, 'verdict good', { x: innerWidth / 2, y: innerHeight * (innerWidth < innerHeight ? 0.66 : 0.8), life: 3.4 })
}
function updateVerdict(dt) {
  S.t += dt
  if (S.wantCap && S.t >= 0.9) { S.wantCap = false; S.doCap = true }
  if (S.t >= 3) {
    if (S.lives <= 0) { S.ph = 'over'; S.t = 0; banner(TT().gameOver, 'banner over', 2.2); Snd.setTrack('sad') }
    else if (S.round >= D.rounds) newYear()
    else nextRound()
  }
}

// ---------- 結果
function rankOf(score) { const r = TT().ranks; let k = 0; r.forEach((x, i) => { if (score >= x[0]) k = i }); return { i: k, t: r[k][1], c: r[k][2] } }
function toResult() {
  S.mode = 'result'; S.ph = ''; clearFx(); hideHint(); setPanel('')
  const rounds = S.round - (S.lives <= 0 ? 1 : 0)
  S.result = { score: S.score, rounds: Math.max(0, rounds), farts: S.stats.farts, framed: S.stats.framed, caught: S.stats.caught, perfect: S.stats.perfect, deduce: S.stats.deduce, bluff: S.stats.bluff, unan: S.stats.unan }
  if (!S.photo) { renderer.render(scene, camera); capture() }
  S.resT = 0; fillResult(); show('vResult'); Snd.setTrack('title')
  for (const n of PPL) { n.point = -1; n.smile = 1 }
  PPL[YOU].smile = 0; PPL[YOU].shock = 1
}
function fillResult() {
  const r = S.result, T = TT(), rk = rankOf(r.score)
  $('#rScore').textContent = r.score; $('#rRounds').textContent = T.roundsL + ' ' + r.rounds + T.roundsU
  $('#rRank').textContent = rk.t; $('#rCmt').textContent = rk.c
  $('#rStats').innerHTML = [[T.stPerfect, r.perfect], [T.stDeduce, r.deduce], [T.stFramed, r.framed], [T.stCaught, r.caught]].map(([l, v]) => `<div><b>${v}</b>${l}</div>`).join('')
  drawPhoto()
}
const photo = document.createElement('canvas'); photo.width = 512; photo.height = 384
function capture() {
  const c = photo.getContext('2d'), sw = renderer.domElement.width, sh = renderer.domElement.height
  const a = photo.width / photo.height, w = Math.min(sw, sh * a), h = w / a
  c.drawImage(renderer.domElement, (sw - w) / 2, Math.max(0, (sh - h) / 2 - sh * 0.08), w, h, 0, 0, photo.width, photo.height); S.photo = true
}
function drawPhoto() { const c = $('#rPhoto').getContext('2d'); if (S.photo) c.drawImage(photo, 0, 0, 256, 192); else { c.fillStyle = '#b8232f'; c.fillRect(0, 0, 256, 192) } }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function drawCard() {
  const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), r = S.result, T = TT(), rk = rankOf(r.score)
  c.fillStyle = '#2a1a22'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#b8232f'; c.fillRect(0, 0, W, 150)
  c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '72px "Dela Gothic One"'; c.fillText(S.lang === 'ja' ? 'おなら人狼' : 'FART WOLF', W / 2, 100)
  c.save(); roundRect(c, 90, 190, 900, 520, 30); c.clip(); if (S.photo) { const sh = 512 * 520 / 900; c.drawImage(photo, 0, (384 - sh) / 2, 512, sh, 90, 190, 900, 520) } else { c.fillStyle = '#5a3a2a'; c.fillRect(90, 190, 900, 520) } c.restore()
  c.lineWidth = 8; c.strokeStyle = '#fff8ec'; roundRect(c, 90, 190, 900, 520, 30); c.stroke()
  c.fillStyle = '#ffd21f'; c.font = '150px "Dela Gothic One"'; const nw = c.measureText(r.score + '').width
  c.font = '900 50px "Zen Maru Gothic"'; const uw = c.measureText(T.scoreU).width, x0 = W / 2 - (nw + 12 + uw) / 2
  c.textAlign = 'left'; c.font = '150px "Dela Gothic One"'; c.fillText(r.score + '', x0, 880); c.font = '900 50px "Zen Maru Gothic"'; c.fillText(T.scoreU, x0 + nw + 12, 880); c.textAlign = 'center'
  c.fillStyle = '#fff8ec'; c.font = '900 46px "Zen Maru Gothic"'; c.fillText(rk.t + '　' + T.roundsL + ' ' + r.rounds + T.roundsU, W / 2, 960)
  c.fillStyle = 'rgba(255,248,236,.6)'; c.font = '900 30px "Zen Maru Gothic"'; c.fillText(T.cardFoot, W / 2, 1040)
  return cv
}
async function loadFonts() { if (!document.fonts || !document.fonts.load) return; await Promise.all(['72px "Dela Gothic One"', '900 40px "Zen Maru Gothic"'].map(f => document.fonts.load(f, 'おなら人狼FARTWOLF0123456789点回戦').catch(() => {}))) }
async function saveCard() {
  if (!S.result) return; Snd.sfx('tap'); await loadFonts()
  const url = drawCard().toDataURL('image/png'), a = document.createElement('a'); a.href = url; a.download = 'fart-wolf.png'; document.body.appendChild(a); a.click(); a.remove()
}
const PUBLIC_URL = 'https://tom3games.github.io/onara-jinro/'
function shareText() { const r = S.result, T = TT(); return T.share2.replace('{P}', r.score).replace('{R}', r.rounds).replace('{K}', rankOf(r.score).t).replace('{C}', r.perfect).replace('{D}', r.deduce) }
function xPost() { const text = shareText(); return { text, url: PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(PUBLIC_URL)}` } }
function openX() { if (!S.result) return; Snd.sfx('tap'); window.open(xPost().href, '_blank', 'noopener') }

// ---------- HUD とパネル
function setPanel(k) { $('#farts').hidden = k !== 'farts'; $('#choose').hidden = k !== 'choose'; $('#pickRow').hidden = k !== 'pick' }
let lastHud = ''
function updateHud(force) {
  const key = [S.score, S.pend, S.lives, S.round, S.lang, S.cd > 0].join('|')
  if (key === lastHud && !force) return; lastHud = key
  $('#hScore').innerHTML = S.score + (S.pend ? ` <small>+${S.pend}</small>` : '')
  $('#hRound').textContent = TT().roundOf.replace('{N}', Math.max(1, S.round)).replace('{M}', D.rounds)
  document.querySelectorAll('#hLives i').forEach((el, k) => el.classList.toggle('off', k >= S.lives))
}
function updateFartBtns() {
  const k = S.cd / D.cd
  for (const id of FIDS) { const b = $('#f_' + id); b.style.setProperty('--cd', k.toFixed(3)); b.disabled = !(S.ph === 'quiet' && S.cd <= 0) }
  const fb = $('#f_fan'); fb.disabled = !(S.ph === 'quiet' && S.fanLeft > 0 && S.fanCd <= 0); fb.querySelectorAll('.dots i').forEach((el, k) => el.classList.toggle('off', k >= S.fanLeft))
}

// ---------- 見た目の更新
let shake = 0
function updatePeople(dt) {
  const tm = S.time, talkPh = S.mode === 'play' && ['meet', 'choose', 'pick', 'react', 'vote', 'verdict'].includes(S.ph)
  for (const n of PPL) {
    // 視線
    const g = S.gz[n.i]
    if (n.i === YOU) {
      if (S.mode === 'play' && (S.ph === 'meet' || S.ph === 'vote')) { const sus = topSuspect(YOU); lookAtPoint(n, headPos(sus >= 0 ? sus : 1)) }
      else if (n.point >= 0) lookAtPoint(n, headPos(n.point))
      else { n.tYaw = Math.sin(tm * 0.4) * 0.25; n.tPitch = 0.05 }
    } else if (n.point >= 0) lookAtPoint(n, headPos(n.point))
    else if (g === -2 && S.mode === 'play') lookAtPoint(n, catPos().add(_q.set(0, 0.15, 0)))
    else if (g >= 0 && S.mode === 'play') lookAtPoint(n, headPos(g))
    else if (n.key === 'itoko') { n.tYaw = 0; n.tPitch = 0.55 }
    else lookAtPoint(n, TABLE_PT.clone().add(_q.set(Math.sin(tm * 0.3 + n.i) * 0.3, 0.2, 0)))
    // くんくん: 鼻を上げて小刻みに
    let bob = 0
    if (n.sniffT > 0) { n.sniffT -= dt; n.tPitch -= 0.3; bob = Math.sin(tm * 24) * 0.07; n.nose.scale.set(0.035, 0.03 * (1 + 0.25 * Math.abs(Math.sin(tm * 24))), 0.03) } else n.nose.scale.set(0.035, 0.03, 0.03)
    // 振り向き: ばねで（驚いた時は速く、少し行き過ぎて戻る）
    const st = n.shock > 0.5 ? 170 : 55, dp = n.shock > 0.5 ? 13 : 11
    n.yawV += ((n.tYaw - n.yaw) * st - n.yawV * dp) * dt; n.yaw += n.yawV * dt
    n.pitchV += ((n.tPitch - n.pitch) * st - n.pitchV * dp) * dt; n.pitch += n.pitchV * dt
    n.pivot.rotation.y = n.yaw * 0.75; n.pivot.rotation.x = n.pitch * 0.7 + bob - n.smile * 0.18 * Math.abs(Math.sin(tm * 7))
    n.b.rotation.y = n.yaw * 0.25
    for (const p of n.pupils) { p.position.x = clamp(n.yaw * 0.02, -0.014, 0.014) + (n.i === YOU && n.sweatK > 0.5 ? Math.sin(tm * 40) * 0.004 : 0); p.position.y = -0.004 - n.pitch * 0.012; const ps = 1 - n.shock * 0.35; p.scale.set(0.024 * ps, 0.027 * ps, 0.01) }
    // 腰が浮く（本当にこいた時と、ただの座り直し）
    n.lift = Math.max(0, n.lift - dt * 1.8)
    n.b.position.y = Math.sin(Math.min(1, n.lift) * Math.PI) * 0.07; n.b.rotation.z = Math.sin(n.lift * Math.PI) * 0.07
    // 座り直し: 左手をみかんへ伸ばして戻す
    n.reseat = Math.max(0, n.reseat - dt); const rk = Math.sin(clamp(n.reseat / 1.3, 0, 1) * Math.PI)
    n.arms[0].rotation.x = lerp(-0.9, -1.75, rk) + (n.smile > 0.3 ? Math.sin(tm * 16) * 0.35 * n.smile : 0)
    n.arms[0].rotation.z = lerp(-0.15, 0.45, rk)
    if (n.fanT > 0) { n.fanT -= dt; const fk = Math.min(1, n.fanT * 3); n.arms[0].rotation.x = lerp(-0.9, -1.5, fk); n.arms[0].rotation.z = -0.3 + Math.sin(tm * 26) * 0.5 * fk; uchiwa.visible = true } else if (n.i === YOU) uchiwa.visible = false
    // 指さし（右腕を伸ばして体ごと乗り出す。ぐいっと突く）
    if (n.point >= 0) n.pointK = Math.min(1, n.pointK + dt * 6); else n.pointK = Math.max(0, n.pointK - dt * 4)
    const jab = n.pointK > 0.9 ? Math.sin(tm * 10) * 0.06 : 0
    const arm = n.arms[1]
    arm.rotation.x = lerp(n.key === 'itoko' ? -1.1 : -0.9, -1.6 + jab, n.pointK); arm.rotation.y = lerp(0, n.yaw * 0.9, n.pointK); arm.rotation.z = lerp(0.15, 0.05, n.pointK)
    n.finger.scale.setScalar(0.4 + 0.6 * n.pointK)
    n.b.rotation.x = 0.16 * n.pointK + 0.2 * rk - n.hop * 0.1; n.b.rotation.z += 0.12 * rk
    if (n.phone) n.phone.visible = n.pointK < 0.5
    // 表情の値
    n.talk = Math.max(0, n.talk - dt)
    n.smile = Math.max(0, n.smile - dt * 0.25); n.shock = Math.max(0, n.shock - dt * 0.6); n.relief = Math.max(0, n.relief - dt * 0.8); n.hop = Math.max(0, n.hop - dt * 3)
    n.glare = lerp(n.glare, talkPh && n.i !== YOU && (n.point >= 0 || S.gz[n.i] >= 0) && n.smile < 0.3 ? 1 : 0, 0.12)
    // 目: 驚き=見開く / にらむ=細める / 笑う・ほっとする=つむる（∩）
    const closed = n.smile > 0.35 || n.relief > 0.3
    const open = closed ? 0.12 : clamp(1 + n.shock * 0.4 - n.glare * 0.45, 0.4, 1.4)
    for (const e of n.eyes) e.scale.set(1, open, 1)
    for (const h of n.happy) h.visible = closed
    const talkOpen = n.talk > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(tm * 18)) : 0
    n.mouth.scale.set(0.04 + n.smile * 0.04 + n.relief * 0.01, 0.012 + talkOpen * 0.03 + n.smile * 0.035 + n.shock * 0.04 + n.relief * 0.012, 0.015)
    n.mouth.position.y = -0.11 - n.smile * 0.008
    for (const [s, br] of n.brows.entries()) { const sg = s ? -1 : 1; br.rotation.z = sg * (n.shock * 0.4 - n.smile * 0.2 - n.glare * 0.45 + n.relief * 0.25); br.position.y = 0.105 + n.shock * 0.025 - n.glare * 0.012 + n.relief * 0.015 }
    // 赤面・汗（あなたが疑われるほど）
    let red = 0, sweat = 0
    if (n.i === YOU && S.mode === 'play') {
      if (S.E && (S.ph === 'meet' || S.ph === 'choose' || S.ph === 'pick' || S.ph === 'react' || S.ph === 'vote')) { const mx = Math.max(...S.E), v = S.E[YOU] / Math.max(0.5, mx); sweat = v > 0.8 ? 1 : v > 0.5 ? 0.6 : 0; red = sweat * 0.7 }
      if (n.lift > 0) red = Math.max(red, 0.7)
      if (watchers(YOU).length && S.ph === 'quiet') sweat = Math.max(sweat, 0.5)
    }
    if (n.key === 'oji') red = Math.max(red, 0.35)
    if (n.glare > 0.5) red = Math.max(red, 0.25)
    n.red = lerp(n.red, red, 0.1); n.skinM.color.copy(n.skin0).lerp(_c.setHex(0xff6a5a), n.red * 0.5)
    for (const ck of n.cheeks) ck.material.opacity = 0.15 + n.red * 0.7 + n.smile * 0.3
    n.sweatK = lerp(n.sweatK, sweat, 0.15)
    n.sweats.forEach((sw, k) => {
      const on = k === 0 ? n.sweatK : clamp((n.sweatK - 0.5) * 2, 0, 1), u = (tm * 0.9 + k * 0.37) % 1, sd = k === 1 ? -1 : 1
      sw.scale.setScalar(on * (k ? 0.08 : 0.11) * (k ? Math.sin(u * Math.PI) : 1))
      sw.position.set(sd * (0.24 + (k ? u * 0.12 : 0)), 0.12 + (k ? u * 0.1 - u * u * 0.2 : -((tm * 0.6) % 1) * 0.08), 0.05)
    })
    // こっちを見ている目印
    const watching = S.mode === 'play' && S.ph === 'quiet' && n.i !== YOU && S.gz[n.i] === YOU
    n.eyeK = lerp(n.eyeK, watching ? 1 : 0, 0.2); n.eye.scale.set(n.eyeK * 0.36, n.eyeK * 0.23, 1)
    n.eye.position.y = 1.5 + Math.sin(tm * 6) * 0.015
    // 笑う（体を揺らす）・驚いて跳ねる
    if (n.smile > 0.3) n.b.position.y += Math.abs(Math.sin(tm * 14)) * 0.03 * n.smile
    if (n.shock > 0.85 && n.hop <= 0) n.hop = 0.4
    n.b.position.y += Math.sin(clamp(n.hop / 0.4, 0, 1) * Math.PI) * 0.06
  }
  if (PPL[YOU].tag) { PPL[YOU].tag.position.y = 1.52 + Math.sin(tm * 3) * 0.03; PPL[YOU].tag.visible = S.ph !== 'verdict' }
}
const _c = new THREE.Color()
// 部屋の光の演出（匂い・判定・年越し）
const FX3 = { judge: 0, judgeAt: -1, ny: 0, dim: 0, red: 0 }
function updateLights(dt) {
  const v = S.mode === 'play' && S.ph === 'verdict', c = S.culprit
  FX3.judge = lerp(FX3.judge, v && c >= 0 ? 1 : 0, Math.min(1, dt * 5))
  if (c >= 0) { headPos(c, _hp); judge.target.position.copy(_hp); judge.position.set(_hp.x * 0.6, 2.7, _hp.z + 0.6) }
  judge.intensity = FX3.judge * 14
  FX3.dim = lerp(FX3.dim, v && c >= 0 ? 0.55 : S.mode === 'play' && S.ph === 'vote' ? 0.3 : 0, Math.min(1, dt * 4))
  const nyk = S.cleared ? FX3.ny = Math.min(1, FX3.ny + dt * 0.5) : (FX3.ny = Math.max(0, FX3.ny - dt * 2))
  spot.intensity = 10 * (1 - FX3.dim) + 3 * nyk; lampL.intensity = 1.6 * (1 - FX3.dim * 0.8)
  hemi.intensity = 1.15 * (1 - FX3.dim * 0.6) + 0.5 * nyk
  // 匂いがたまると部屋が少し緑がかる
  const sm = S.mode === 'play' ? clamp((S.smell - 0.6) / 2, 0, 1) * 0.35 : 0
  hemi.color.copy(HEMI0).lerp(_c.setHex(0xc8e890), sm).lerp(_c.setHex(0xffc890), nyk * 0.6)
  sunrise.intensity = nyk * 2.2; dawnPlane.material.opacity = nyk
  // バレた時は赤く脈打つ
  FX3.red = Math.max(0, FX3.red - dt * 0.8)
  const vg = $('#vignette'); vg.style.background = FX3.red > 0.01 ? `radial-gradient(120% 90% at 50% 42%,transparent 45%,rgba(200,20,30,${(0.5 * FX3.red * (0.7 + 0.3 * Math.sin(S.time * 12))).toFixed(3)}) 100%)` : ''
}
const camBase = new THREE.Vector3(0, 0.62, -0.55)
function frameCamera() {
  const W = innerWidth, H = innerHeight, a = W / H
  camera.aspect = a
  camera.fov = a < 0.8 ? 46 : 38
  const tH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const halfW = 1.62, halfH = a < 0.8 ? 1.0 : 1.45
  const dist = Math.max(halfW / (tH * a), halfH / tH) + 0.2
  const dir = new THREE.Vector3(0, 0.55, 1).normalize()
  camera.position.copy(camBase).addScaledVector(dir, dist)
  camera.lookAt(camBase)
  // 縦画面は人を上に寄せて、下のボタンと重ねない
  if (a < 0.8) camera.setViewOffset(W, H, 0, H * 0.05, W, H); else camera.setViewOffset(W, H, 0, H * 0.04, W, H)
  camera.updateProjectionMatrix()
  S.camHome = camera.position.clone()
}
function updateCamera(dt) {
  shake = Math.max(0, shake - dt)
  if (S.camHome) camera.position.copy(S.camHome).add(_q.set((VR() - 0.5) * shake * 0.12, (VR() - 0.5) * shake * 0.12, 0))
  if (S.camHome && FX3.judge > 0.01 && S.culprit >= 0) camera.position.lerp(headPos(S.culprit, _w), 0.1 * FX3.judge)
}

// ---------- ループ
function step() {
  S.time += STEP
  if (S.mode === 'play') {
    if (S.ph === 'quiet') updateQuiet(STEP)
    else if (S.ph === 'meet') updateMeet(STEP)
    else if (S.ph === 'react') updateReact(STEP)
    else if (S.ph === 'vote') updateVote(STEP)
    else if (S.ph === 'verdict') updateVerdict(STEP)
    else if (S.ph === 'peace') { S.t += STEP; if (S.t > 2) { if (S.round >= D.rounds) newYear(); else nextRound() } }
    else if (S.ph === 'over') { S.t += STEP; if (S.wantCapOver && S.t > 0.4) { S.wantCapOver = false; S.doCap = true } if (S.t > 2.4) toResult() }
  }
  if (S.mode === 'result') { S.resT += STEP; revealResult() }
  updatePeople(STEP); updateMoya(STEP); updateConfetti(STEP); updateRoom(STEP); updateLights(STEP); updateFx(STEP); updateCamera(STEP)
}
function revealResult() { document.querySelectorAll('#vResult .reveal').forEach((el, k) => el.classList.toggle('on', S.resT > 0.3 + k * 0.25)) }
function render() {
  renderer.render(scene, camera)
  if (S.doCap) { S.doCap = false; capture() }
}
let acc = 0, last = performance.now()
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now(); let dt = (now - last) / 1000; last = now
  if (dt > 0.25) dt = 0.25
  Snd.tick()
  if (!S.dbgPause) { acc += dt; let n = 0; while (acc >= STEP && n < 8) { step(); acc -= STEP; n++ } if (n === 8) acc = 0 }
  if (S.mode === 'play') { updateHud(); updateFartBtns() }
  render()
}

// ---------- 操作
function syncMute() { $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted }
function toTitle() { Snd.sfx('tap'); S.mode = 'title'; S.ph = ''; clearFx(); hideHint(); S.gz = PPL.map(() => -1); S.smell = 0; show('vTitle'); Snd.setTrack('title') }
function pressFart(id) { Snd.init(); if (S.mode !== 'play' || S.ph !== 'quiet' || S.cd > 0) return false; doFart(YOU, id); return true }
for (const id of FIDS) $('#f_' + id).addEventListener('pointerdown', e => { e.preventDefault(); pressFart(id) })
$('#f_fan').addEventListener('pointerdown', e => { e.preventDefault(); pressFan() })
for (const k of ['feign', 'blame', 'rage', 'confess']) $('#c_' + k).addEventListener('click', () => choose(k))
document.querySelectorAll('#pickRow [data-i]').forEach(b => b.addEventListener('click', () => choose('blame', +b.dataset.i)))
$('#bPickX').addEventListener('click', () => { if (S.ph === 'pick') { S.ph = 'choose'; setPanel('choose') } })
$('#bStart').addEventListener('click', startRun)
$('#bHow').addEventListener('click', () => { Snd.init(); Snd.sfx('tap'); show('vHow') })
$('#bHowBack').addEventListener('click', () => { Snd.sfx('tap'); show('vTitle') })
$('#bAgain').addEventListener('click', startRun)
$('#bTitle').addEventListener('click', toTitle)
$('#bSave').addEventListener('click', saveCard)
$('#bX').addEventListener('click', openX)
$('#bLang').addEventListener('click', () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('fw.lang', S.lang); applyLang(); Snd.sfx('tap') })
$('#bMute').addEventListener('click', () => { Snd.init(); Snd.setMute(!Snd.muted); syncMute() })
addEventListener('keydown', e => {
  if (e.repeat) return
  if ((e.key === '4' || e.key.toLowerCase() === 'f') && S.ph === 'quiet') { pressFan(); return }
  const k = { '1': 'suka', '2': 'pu', '3': 'bubo', a: 'suka', s: 'pu', d: 'bubo' }[e.key.toLowerCase()]
  if (k && S.ph === 'quiet') pressFart(k)
})
document.addEventListener('pointerdown', () => Snd.init(), { once: true })
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); frameCamera() })
renderer.setSize(innerWidth, innerHeight, false); frameCamera()
applyLang(); syncMute(); show('vTitle'); Snd.setTrack('title')
requestAnimationFrame(loop)

// ---------- 検証用の窓口
window.fw = {
  S, D, PPL, camera, renderer, pressFan, evidence, againstYou, argFor, voteOf, CAT, moya, drawCard, xPost, toResult, choose, pressFart, doFart, evidence, startRun, nextRound, Snd, rankOf,
  dbg: {
    pause() { S.dbgPause = true }, resume() { S.dbgPause = false; last = performance.now() },
    step(n = 1) { for (let k = 0; k < n; k++) step() }, render, seed(s) { S.fixedSeed = s },
    // しずかな時間を、次の山（音）まで進める
    toPeak(type = 'bell') { const e = S.evs.find(x => x.type === type && x.tp > S.t); if (!e) return false; while (S.ph === 'quiet' && S.t < e.tp + 0.15) step(); return true },
    finishReveal() { S.resT = 9; revealResult() },
  },
}
window.__fwReady = true
