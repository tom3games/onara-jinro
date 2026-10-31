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
const Snd = {
  ctx: null, muted: store.get('fw.mute') === '1', next: 0, step: 0, track: null, want: null, switchAt: 0, played: {},
  TEMPO: { title: 84, night: 72, meet: 112, happy: 132, sad: 66 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC()
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(c.destination)
      this.bgm = c.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
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
  rumble(t0, dur, vol, f1, f2, rate, dest) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f1, t0); o.frequency.linearRampToValueAtTime(f1 * 1.25, t0 + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 4
    lfo.type = 'square'; lfo.frequency.setValueAtTime(rate, t0); lfo.frequency.linearRampToValueAtTime(rate * 0.6, t0 + dur); lg.gain.value = 0.5; am.gain.value = 0.5
    lfo.connect(lg); lg.connect(am.gain)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(lp); lp.connect(am); am.connect(g); g.connect(dest || this.master)
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05)
  },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.3, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  koto(n, t, vol = 0.07) { this.tone(this.mtof(n), t, 0.5, 'triangle', vol, this.bgm); this.tone(this.mtof(n + 12), t, 0.12, 'sine', vol * 0.4, this.bgm) },
  // タイトル: 正月っぽい琴（都節）
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const m = [[64, -1, -1, 65, -1, -1, 69, -1, 71, -1, -1, -1, 72, -1, 71, -1], [69, -1, -1, -1, 65, -1, 64, -1, -1, -1, 65, -1, 64, -1, -1, -1],
      [76, -1, -1, 77, -1, -1, 76, -1, 72, -1, 71, -1, 69, -1, -1, -1], [71, -1, 69, -1, 65, -1, 64, -1, -1, -1, -1, -1, 52, -1, -1, -1]][bar]
    if (m[s] > 0) this.koto(m[s], t)
    if (s === 0) this.tone(this.mtof(40), t, 1.2, 'sine', 0.2, this.bgm)
    if (s === 8) this.noise(t, 0.05, 0.05, 2500, 'bandpass', this.bgm, 3)
  },
  // しずかな時間: ほぼ無音のこたつ。時計の音だけ
  p_night(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s % 4 === 0) this.noise(t, 0.02, s === 0 ? 0.04 : 0.025, 4500, 'bandpass', this.bgm, 6)
    if (s === 0) this.tone(this.mtof([40, 41, 40, 45][bar]), t, 2.2, 'sine', 0.12, this.bgm)
    if (s === 6 && bar % 2 === 0) this.koto([64, 65, 69, 71][bar], t, 0.025)
  },
  // 会議: 刻む緊張
  p_meet(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s % 4 === 0) this.tone(this.mtof([40, 40, 41, 39][bar]), t, 0.18, 'triangle', 0.3, this.bgm)
    if (s % 2 === 1) this.noise(t, 0.02, 0.03, 7000, 'highpass', this.bgm)
    if (s === 0 || s === 10) this.tone(this.mtof([64, 65, 64, 63][bar] + 12), t, 0.25, 'square', 0.02, this.bgm)
  },
  p_happy(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16, root = [48, 45, 41, 43][bar]
    if (s === 0 || s === 8) this.tone(150, t, 0.16, 'sine', 0.5, this.bgm, 45)
    if (s === 4 || s === 12) this.noise(t, 0.08, 0.12, 1500, 'bandpass', this.bgm)
    if ([0, 6, 10].includes(s)) this.tone(this.mtof(root - 12), t, 0.16, 'triangle', 0.3, this.bgm)
    const m = [[72, 76, 79, 76], [72, 76, 81, 79], [77, 76, 74, 72], [74, 79, 77, 74]][bar]
    if (s % 4 === 0) this.koto(m[s / 4], t, 0.06)
  },
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12, root = [33, 38, 40, 33][bar]
    if (s === 0) this.tone(this.mtof(root), t, 0.8, 'sine', 0.25, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.05, this.bgm) }
  },
  fart(id, muffled) {
    if (!this.ctx) return; const t = this.now(); this.mark('fart:' + id)
    const v = muffled ? 0.35 : 1
    if (id === 'suka') { this.noise(t, 0.7, 0.05, 700, 'bandpass', null, 0.7); return }
    if (id === 'pu') { this.rumble(t, 0.16, 0.35 * v, 150, 120, 30); this.noise(t, 0.12, 0.12 * v, 900, 'bandpass', null, 1.5); return }
    this.rumble(t, 1.0, 0.6 * v, 64, 46, 26); this.noise(t, 0.9, 0.18 * v, 380, 'lowpass')
    this.rumble(t + 1.0, 0.22, 0.4 * v, 120, 180, 40); this.noise(t + 1.18, 0.12, 0.1 * v, 1100, 'bandpass', null, 2)
  },
  bell() {
    if (!this.ctx) return; const t = this.now(); this.mark('bell')
    this.noise(t, 0.12, 0.5, 400, 'lowpass')
    for (const [m, v, d] of [[1, 0.5, 4], [2.76, 0.16, 2.5], [5.4, 0.07, 1.5], [0.5, 0.25, 4.5]]) this.tone(98 * m, t, d, 'sine', v)
  },
  sneezeW() { if (!this.ctx) return; const t = this.now(); this.voice(200, t, 0.35, 0.12, 900, null, 260); this.voice(230, t + 0.55, 0.4, 0.16, 1000, null, 300) },
  sneeze() { if (!this.ctx) return; const t = this.now(); this.mark('sneeze'); this.noise(t, 0.4, 0.9, 1800, 'bandpass', null, 0.8); this.voice(300, t, 0.15, 0.4, 1100, null, 180); this.voice(180, t + 0.12, 0.35, 0.3, 700, null, 120) },
  phone(dur) { if (!this.ctx) return; const t = this.now(); this.mark('phone'); const mel = [84, 88, 91, 96, 91, 88]; for (let k = 0; k * 0.08 < dur; k++) this.tone(this.mtof(mel[k % mel.length]), t + k * 0.08, 0.075, 'square', 0.12) },
  laugh(n = 4) { if (!this.ctx) return; const t = this.now(); this.mark('laugh'); for (let p = 0; p < n; p++) { const f = 140 + p * 45 + Math.random() * 30; for (let k = 0; k < 6; k++) this.voice(k % 2 ? f * 1.1 : f, t + p * 0.05 + k * 0.15, 0.11, 0.18, 800 + p * 150, null, f * 0.85) } },
  sfx(name) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12); break
      case 'sniff': for (let k = 0; k < 3; k++) this.noise(t + k * 0.14, 0.09, 0.1, 2600, 'bandpass', null, 2); break
      case 'gasp': for (let k = 0; k < 5; k++) { const f = 380 + Math.random() * 320; this.tone(f, t + Math.random() * 0.1, 0.28, 'sawtooth', 0.025, null, f * 0.62) } break
      case 'talk': for (let k = 0; k < 3; k++) this.voice(220 + Math.random() * 80, t + k * 0.09, 0.07, 0.07, 900 + Math.random() * 500); break
      case 'drum': for (let k = 0; k < 40; k++) this.noise(t + k * 0.036, 0.04, 0.05 + k * 0.004, 1800, 'bandpass', null, 0.9); break
      case 'point': this.tone(300, t, 0.12, 'square', 0.08, null, 600); break
      case 'stamp': this.tone(120, t, 0.25, 'sine', 0.7, null, 45); this.noise(t, 0.15, 0.35, 900, 'lowpass'); break
      case 'fanfare': [[72, 0], [76, 0.12], [79, 0.24], [84, 0.38]].forEach(([n, d]) => { this.tone(this.mtof(n), t + d, d > 0.3 ? 0.7 : 0.14, 'square', 0.07); this.tone(this.mtof(n - 12), t + d, d > 0.3 ? 0.7 : 0.14, 'triangle', 0.1) }); break
      case 'wahwah': [[311, 0, 0.42], [294, 0.45, 0.42], [277, 0.9, 0.42], [262, 1.35, 1.1]].forEach(([f, d, l]) => { this.tone(f, t + d, l, 'sawtooth', 0.07, null, f * 0.96); this.tone(f / 2, t + d, l, 'triangle', 0.08) }); break
      case 'safe': this.tone(1046, t, 0.12, 'triangle', 0.13); this.tone(1568, t + 0.08, 0.2, 'triangle', 0.12); break
      case 'zawa': for (let k = 0; k < 8; k++) this.voice(150 + Math.random() * 120, t + k * 0.12, 0.2, 0.04, 600 + Math.random() * 600); break
    }
  },
}

// ---------- 3D の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2))
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1e1a24)
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60)
const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a4636, 1.5)
const lampL = new THREE.PointLight(0xffd59a, 2.2, 0, 1.1); lampL.position.set(0, 2.1, -0.45)
const fill = new THREE.DirectionalLight(0xbfd0ff, 0.5); fill.position.set(-2, 3, 4)
scene.add(hemi, lampL, fill)
const MC = {}
const M = (c, flat = true) => MC[c + ':' + flat] || (MC[c + ':' + flat] = new THREE.MeshLambertMaterial({ color: c, flatShading: flat }))
const G = { box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 20, 14), cyl: new THREE.CylinderGeometry(1, 1, 1, 18), plane: new THREE.PlaneGeometry(1, 1), cone: new THREE.ConeGeometry(1, 1, 14) }
function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent) { const m = new THREE.Mesh(geo, typeof mat === 'number' ? M(mat) : mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); (parent || scene).add(m); return m }
const box = (w, h, d, c, x, y, z, p) => mesh(G.box, c, x, y, z, w, h, d, p)
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  return t
}

// 部屋: 畳・障子・窓の夜空・鏡餅・吊り下げの灯り
const tatami = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#b9b276'; c.fillRect(0, 0, w, h)
  for (let y = 0; y < h; y += 4) { c.fillStyle = y % 8 ? 'rgba(90,80,30,.10)' : 'rgba(255,250,200,.08)'; c.fillRect(0, y, w, 2) }
  c.fillStyle = '#3a4a2a'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10)
}, [4, 5])
mesh(G.plane, new THREE.MeshLambertMaterial({ map: tatami }), 0, 0, 1.5, 9, 11, 1).rotation.x = -Math.PI / 2
const shoji = canvasTex(512, 256, (c, w, h) => {
  c.fillStyle = '#efe4c8'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#6a4a2a'; c.lineWidth = 6
  for (let x = 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
  for (let y = 0; y <= h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
}, [2, 1])
const wallM = new THREE.MeshLambertMaterial({ map: shoji })
mesh(G.plane, wallM, 0, 1.4, -2.1, 8, 2.8, 1)
for (const s of [-1, 1]) { const w = mesh(G.plane, M(0xc9b48a), s * 3.2, 1.4, -0.5, 3.4, 2.8, 1); w.rotation.y = -s * Math.PI / 2 }
box(8, 0.12, 0.12, 0x5a3a20, 0, 2.2, -2.06); box(8, 0.12, 0.12, 0x5a3a20, 0, 0.06, -2.06)
// 窓（夜空とお寺の影）
const winTex = canvasTex(256, 160, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d1433'); g.addColorStop(1, '#2a2f5a'); c.fillStyle = g; c.fillRect(0, 0, w, h)
  c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(196, 40, 16, 0, 7); c.fill()
  c.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % w, (i * 53) % (h * 0.6), 2, 2)
  c.fillStyle = '#0a0a16'; c.beginPath(); c.moveTo(30, h); c.lineTo(30, 110); c.lineTo(10, 110); c.lineTo(80, 75); c.lineTo(150, 110); c.lineTo(130, 110); c.lineTo(130, h); c.fill()
  c.fillRect(0, h - 14, w, 14)
})
mesh(G.plane, new THREE.MeshBasicMaterial({ map: winTex }), 1.5, 1.45, -2.09, 1.5, 0.95, 1)
box(1.62, 0.07, 0.06, 0x5a3a20, 1.5, 1.95, -2.07); box(1.62, 0.07, 0.06, 0x5a3a20, 1.5, 0.95, -2.07); box(0.05, 1.0, 0.06, 0x5a3a20, 1.5, 1.45, -2.07)
// 鏡餅
const mochi = new THREE.Group(); mochi.position.set(-1.7, 0.75, -1.85); scene.add(mochi)
box(0.5, 0.75, 0.3, 0x6a4a2a, 0, -0.38, 0, mochi)
mesh(G.sph, 0xf6f2e6, 0, 0.08, 0, 0.17, 0.08, 0.17, mochi); mesh(G.sph, 0xf6f2e6, 0, 0.19, 0, 0.13, 0.065, 0.13, mochi); mesh(G.sph, 0xff9a1f, 0, 0.28, 0, 0.06, 0.055, 0.06, mochi)
// 時計
const clockTex = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill(); c.lineWidth = 8; c.strokeStyle = '#5a3a20'; c.stroke()
  c.strokeStyle = '#1b1620'; c.lineCap = 'round'; c.lineWidth = 7; c.beginPath(); c.moveTo(64, 64); c.lineTo(62, 26); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(64, 64); c.lineTo(52, 22); c.stroke()
})
mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: clockTex }), -0.6, 1.75, -2.08)
// 灯り
const shade = mesh(new THREE.ConeGeometry(0.42, 0.26, 18, 1, true), new THREE.MeshLambertMaterial({ color: 0xf4e2b8, side: THREE.DoubleSide, emissive: 0x6a4a20 }), 0, 2.15, -0.45)
mesh(G.cyl, 0x1b1620, 0, 2.6, -0.45, 0.01, 0.7, 0.01)
void shade

// こたつ
const kot = new THREE.Group(); kot.position.set(0, 0, -0.4); scene.add(kot)
const futonTex = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#b8232f'; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 18; i++) { const x = (i * 71) % w, y = (i * 113) % h; c.fillStyle = i % 2 ? '#f2c94c' : '#f6efe0'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + Math.cos(k * 1.26) * 9, y + Math.sin(k * 1.26) * 9, 6, 0, 7); c.fill() } c.fillStyle = '#b8232f'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill() }
}, [2, 1])
const futonM = new THREE.MeshLambertMaterial({ map: futonTex })
mesh(new THREE.BoxGeometry(1, 1, 1, 3, 1, 3), futonM, 0, 0.19, 0, 2.15, 0.38, 1.55, kot)
box(1.95, 0.05, 1.35, 0x8a5a2e, 0, 0.42, 0, kot)
// みかん・湯のみ・缶ビール
const basket = new THREE.Group(); basket.position.set(-0.1, 0.45, 0.1); kot.add(basket)
mesh(G.cyl, 0x9a6a3a, 0, 0.03, 0, 0.2, 0.06, 0.2, basket)
for (const [x, y, z] of [[-0.08, 0.1, 0], [0.08, 0.1, 0.03], [0, 0.1, -0.09], [0, 0.17, 0.0], [0.02, 0.1, 0.1]]) mesh(G.sph, 0xff9a1f, x, y, z, 0.07, 0.065, 0.07, basket)
for (const [x, z] of [[-0.55, -0.35], [0.0, -0.4], [-0.75, 0.0]]) mesh(G.cyl, 0x4a6a5a, x, 0.5, z, 0.045, 0.09, 0.045, kot)
const beer = mesh(G.cyl, 0xd8d8e0, 0.65, 0.53, -0.25, 0.05, 0.16, 0.05, kot)
box(0.1, 0.06, 0.1, 0xd8141f, 0, 0.1, 0, beer).scale.set(1.02, 0.4, 1.02)

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
  const pupils = [], brows = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.075, 0.03, 0.172); head.add(eg)
    mesh(G.sph, M(0xffffff, false), 0, 0, 0, 0.045, 0.05, 0.024, eg)
    pupils.push(mesh(G.sph, M(0x231a1f, false), 0, -0.004, 0.02, 0.024, 0.027, 0.01, eg))
    brows.push(box(0.07, 0.016, 0.016, o.style === 'bald' ? 0x9a9a9a : o.hair, s * 0.075, 0.105, 0.19, head))
  }
  if (o.glasses) for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 16), M(0x1b1620, false), s * 0.075, 0.03, 0.2, 1, 1, 1, head)
  mesh(G.sph, M(0xe0a088, false), 0, -0.02, 0.205, 0.035, 0.03, 0.03, head)
  if (o.stache) box(0.12, 0.03, 0.03, o.stache, 0, -0.07, 0.2, head)
  const mouth = mesh(G.sph, M(0x5a1424, false), 0, -0.11, 0.185, 0.04, 0.012, 0.015, head)
  const cheeks = []; for (const s of [-1, 1]) { const ck = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0 }), s * 0.13, -0.05, 0.16, 0.045, 0.03, 0.015, head); ck.rotation.y = s * 0.6; cheeks.push(ck) }
  const sweat = new THREE.Sprite(new THREE.SpriteMaterial({ map: sweatTex, transparent: true, depthTest: false })); sweat.position.set(0.24, 0.12, 0.05); sweat.scale.setScalar(0); sweat.renderOrder = 9; head.add(sweat)
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, transparent: true, depthTest: false })); eye.position.set(0, 1.5, 0); eye.scale.set(0, 0, 1); eye.renderOrder = 10; g.add(eye)
  let tag = null
  if (key === 'you') { tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: youTex, transparent: true, depthTest: false })); tag.position.set(0, 1.5, 0); tag.scale.setScalar(0.16); tag.renderOrder = 10; g.add(tag) }
  return { i, key, g, b, arms, pivot, head, pupils, brows, mouth, cheeks, sweat, eye, tag, phone, skinM, skin0: new THREE.Color(o.skin), yaw: 0, pitch: 0, tYaw: 0, tPitch: 0.1, lift: 0, talk: 0, red: 0, smile: 0, point: -1, pointK: 0, sniffT: 0, shock: 0, sweatK: 0, eyeK: 0 }
}
const PPL = D.seats.map((k, i) => makePerson(i))
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

// 匂いの煙（Sprite の使い回し）
const puffs = []
for (let k = 0; k < 60; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x9cc45a, transparent: true, opacity: 0, depthWrite: false })); sp.visible = false; scene.add(sp); puffs.push({ sp, life: 0, max: 1, v: new THREE.Vector3(), s0: 0.1, s1: 0.4, op: 0.6 }) }
function spawnPuff(p, v, life, s0, s1, op, col = 0x9cc45a) {
  const f = puffs.find(x => x.life <= 0) || puffs[0]
  f.sp.position.copy(p); f.v.copy(v); f.life = f.max = life; f.s0 = s0; f.s1 = s1; f.op = op; f.sp.material.color.setHex(col); f.sp.visible = true
}
function fartPuffs(i, id) {
  const p = buttPos(i), out = PPL[i].g.localToWorld(new THREE.Vector3(0, 0.3, -0.7)).sub(p).normalize()
  const n = id === 'suka' ? 8 : id === 'pu' ? 4 : 10, col = id === 'suka' ? 0x8fb84a : 0xb9d27a
  for (let k = 0; k < n; k++) spawnPuff(p.clone().add(new THREE.Vector3((R() - 0.5) * 0.15, R() * 0.1, (R() - 0.5) * 0.15)), out.clone().multiplyScalar(0.15 + R() * (id === 'bubo' ? 0.6 : 0.2)).add(new THREE.Vector3((R() - 0.5) * 0.2, 0.15 + R() * 0.2, (R() - 0.5) * 0.2)), id === 'suka' ? 4 : 2.2, 0.08, id === 'suka' ? 0.7 : 0.45, id === 'suka' ? 0.55 : 0.45, col)
}
const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x9cc45a, transparent: true, opacity: 0, depthWrite: false })); haze.position.set(0, 0.85, -0.6); haze.scale.set(4.2, 2.2, 1); scene.add(haze)

// ---------- 画面
const views = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of views) $('#' + v).hidden = v !== id }
function applyLang() {
  const T = TT(); document.documentElement.lang = S.lang
  document.querySelectorAll('[data-t]').forEach(el => { const v = T[el.dataset.t]; if (typeof v === 'string') el.innerHTML = v })
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  for (const id of FIDS) { const b = $('#f_' + id); b.querySelector('.fn').textContent = T['f_' + id]; b.querySelector('.fp').textContent = FT[id].pts + T.ptsU }
  for (const k of ['feign', 'blame', 'rage', 'confess']) { const b = $('#c_' + k); b.querySelector('.cn').textContent = T.ch[k]; b.querySelector('.cs').textContent = T.chSub[k] }
  document.querySelectorAll('#pickRow [data-i]').forEach(b => { b.textContent = nameOf(+b.dataset.i) })
  $('#howSteps').innerHTML = ['how1', 'how2', 'how3'].map((k, i) => `<div class="step"><span class="num">${i + 1}</span><span>${T[k]}</span></div>`).join('')
  document.title = S.lang === 'ja' ? 'おなら人狼 | FART WOLF' : 'FART WOLF | おなら人狼'
  if (S.result) fillResult()
  updateHud(true)
}

// 吹き出し・擬音（同時に出す吹き出しは2つまで）
const FX = []
function toScreen(p) { _w.copy(p).project(camera); return { x: (_w.x + 1) / 2 * innerWidth, y: (1 - _w.y) / 2 * innerHeight } }
function fx(text, cls, o = {}) {
  const el = document.createElement('div'); el.className = cls; el.textContent = text; $('#fx').appendChild(el)
  const f = { el, t: 0, life: o.life || 1.6, follow: o.follow ?? -1, at: o.at || null, x: o.x, y: o.y, size: o.size, rot: o.rot || 0, cls }
  if (cls.startsWith('sb')) { const sb = FX.filter(x => x.cls.startsWith('sb')); if (sb.length >= 2) killFx(sb[0]) }
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
const ono = (text, p, cls = 'ono', size = 30, life = 1.3) => fx(text, cls, { at: p.clone(), size, life, rot: (R() - 0.5) * 16 })
const banner = (text, cls = 'banner', life = 1.8) => fx(text, cls, { x: innerWidth / 2, y: innerHeight * 0.3, life })

// ---------- ラウンドの組み立て
function planRound() {
  const L = D.quiet, evs = []
  const jit = S.round > 3 ? 0.9 : 0
  for (let t = 3 + R() * 1.5; t < L - 1.2; t += 6 + (R() - 0.5) * 2 * jit) evs.push({ type: 'bell', src: -1, tw: t - 0.9, tp: t, dur: 1.4 })
  const free = (t, d) => evs.every(e => t + d < e.tw - 0.6 || t > e.tp + e.dur + 0.6)
  for (const [type, src, w, d, p] of [['sneeze', 0, 1.3, 0.75, 1], ['phone', 4, 0, 1.6, 0.55]]) {
    if (R() > p) continue
    for (let k = 0; k < 12; k++) { const t = 3 + R() * (L - 6); if (free(t - w, w + d)) { evs.push({ type, src, tw: t - w, tp: t, dur: d }); break } }
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
    if (id !== 'suka' && ev && R() < 0.6) t = (pick(evs.filter(e => e.type !== 'phone')) || ev).tp + 0.2
    S.cpuPlan.push({ who, id, t, done: false })
  }
}
function startRun() {
  Snd.init(); Snd.sfx('tap')
  S.seed = (S.fixedSeed ?? ((Date.now() & 0xffffff) || 1)); S.rand = mulberry(S.seed)
  S.mode = 'play'; S.round = 0; S.lives = 3; S.cleared = false; S.score = 0; S.pend = 0; S.smell = 0; S.result = null; S.photo = false; S.capPref = ''; S.wantCap = false
  S.stats = { farts: 0, framed: 0, caught: 0, best: 0 }; S.tut = !store.get('fw.played')
  show('vPlay'); clearFx(); nextRound()
}
function nextRound() {
  S.round++; S.ph = 'quiet'; S.t = 0; S.pend = 0; S.farts = []; S.cd = 0; S.zawa = false; S.smell *= 0.45; S.E = null; S.votes = []; S.culprit = -1; S.outcome = ''; S.meetQ = []
  for (const n of PPL) { n.point = -1; n.smile = 0; n.shock = 0 }
  S.gz = PPL.map(() => -1); S.gzT = PPL.map(() => 0.5 + R() * 2)
  planRound()
  setPanel('farts'); Snd.setTrack('night')
  banner(TT().roundOf.replace('{N}', S.round).replace('{M}', D.rounds) + '　' + TT().quietT, 'banner', 2)
  if (S.tut && S.round === 1) S.hintT = 0
}

// ---------- しずかな時間
const activePeak = t => S.evs.find(e => t >= e.tp && t <= e.tp + e.dur)
function watchers(i) { return CPUS.filter(c => c !== i && S.gz[c] === i) }
function doFart(i, id) {
  const f = FT[id], t = S.t, ev = activePeak(t)
  const mask = ev && D.mask[ev.type] ? (D.mask[ev.type][id] || 0) : 0
  const audible = f.loud * (1 - mask)
  const wit = watchers(i).filter(() => R() < 0.55 + 0.45 * sharp())
  const rec = { who: i, id, t, mask, audible, ev: ev ? ev.type : null, wit, smellAt: t + 2 + R() }
  S.farts.push(rec)
  const n = PPL[i]; n.lift = 1
  fartPuffs(i, id)
  const bp = buttPos(i)
  if (i === YOU) {
    S.pend += f.pts; S.stats.farts++; S.cd = D.cd
    Snd.fart(id, mask > 0.5)
    const word = { suka: S.lang === 'ja' ? 'すぅ…' : 'pssst...', pu: S.lang === 'ja' ? 'ぷっ' : 'pfft', bubo: S.lang === 'ja' ? 'ブボボボッ！！' : 'BRAAAP!!' }[id]
    ono(word, bp.clone().add(new THREE.Vector3(0, 0.5, 0)), audible > 0.2 ? 'ono red' : mask > 0 ? 'ono hid' : 'ono green', id === 'bubo' ? 40 : 28)
    if (mask > 0.5 && id !== 'suka') ono(S.lang === 'ja' ? 'かき消した！' : 'Covered!', bp.clone().add(new THREE.Vector3(0, 0.95, 0)), 'ono yel', 22, 1.1)
    if (id === 'bubo') shake = 0.35
    store.set('fw.played', '1')
  } else {
    Snd.fart(id, true)
  }
  // 聞こえたら全員が振り向く
  if (audible > 0.2) {
    for (const c of CPUS) if (c !== i && R() < 0.4 + audible) { S.gz[c] = i; S.gzT[c] = 2 + R(); PPL[c].shock = 1 }
    Snd.sfx('gasp')
  }
}
function updateQuiet(dt) {
  S.t += dt; S.cd = Math.max(0, S.cd - dt)
  const T = TT()
  for (const e of S.evs) {
    if (!e.w && S.t >= e.tw && e.tp > e.tw) { e.w = 1; if (e.type === 'sneeze') { say(e.src, T.sneezeW, 1.3); Snd.sneezeW(); PPL[e.src].tPitch = -0.3 } if (e.type === 'bell') ono(S.lang === 'ja' ? 'ゴォ…' : 'hmmm...', new THREE.Vector3(1.5, 1.45, -2), 'ono dim', 20, 0.9) }
    if (!e.p && S.t >= e.tp) {
      e.p = 1
      if (e.type === 'bell') { Snd.bell(); ono(T.bell, new THREE.Vector3(1.5, 1.6, -2), 'ono bell', 46, 1.6); shake = Math.max(shake, 0.12) }
      if (e.type === 'sneeze') { Snd.sneeze(); ono(T.sneeze, headPos(0).add(new THREE.Vector3(0.1, 0.25, 0)), 'ono yel', 34, 1); PPL[0].lift = 0.6 }
      if (e.type === 'phone') { Snd.phone(e.dur); ono(T.phone, headPos(4).add(new THREE.Vector3(0, 0.2, 0)), 'ono', 26, e.dur) }
    }
  }
  for (const p of S.cpuPlan) if (!p.done && S.t >= p.t) { p.done = true; doFart(p.who, p.id) }
  // 匂いは遅れて広がる
  for (const f of S.farts) if (!f.sm && S.t >= f.smellAt) {
    f.sm = 1; S.smell += FT[f.id].smell
    const near = [f.who - 1, f.who + 1].filter(j => j >= 0 && j < NSEAT && j !== YOU)
    for (const j of near) { PPL[j].sniffT = 1.2; if (R() < 0.5) Snd.sfx('sniff') }
  }
  if (!S.zawa && S.smell > 1.7) { S.zawa = true; Snd.sfx('zawa'); banner(T.smellUp, 'banner zawa', 1.6); for (const c of CPUS) S.gzT[c] = Math.min(S.gzT[c], 0.3 + R() * 0.5) }
  // 視線（だんだん鋭くなる。匂いがたまると周りを見回す）
  for (const c of CPUS) {
    S.gzT[c] -= dt
    if (S.gzT[c] > 0) continue
    const pYou = 0.14 + 0.065 * (S.round - 1) + (S.zawa ? 0.25 : 0) + (S.smell > 0.8 ? 0.08 : 0)
    const r = R()
    if (r < pYou) S.gz[c] = YOU
    else if (r < pYou + 0.22) S.gz[c] = pick([0, 1, 3, 4].filter(j => j !== c))
    else S.gz[c] = -1
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
  if (S.t >= D.quiet) { hideHint(); startMeeting() }
}
function showHint(txt, k) { const h = $('#hint'); if (h.dataset.k !== k || h.hidden) { h.textContent = txt; h.dataset.k = k; h.hidden = false } }
function hideHint() { $('#hint').hidden = true }

// ---------- 会議
function evidence() {
  const E = new Array(NSEAT).fill(0), sh = sharp(), k = 0.6 + 0.8 * sh + 0.12 * Math.max(0, S.round - 7), sm = new Array(NSEAT).fill(0)
  const lines = []
  for (const f of S.farts) {
    sm[f.who] += FT[f.id].smell
    if (f.audible > 0.15) {
      E[f.who] += 2.5 * f.audible
      for (const j of [f.who - 1, f.who + 1]) if (j >= 0 && j < NSEAT) E[j] += 0.45 * f.audible * (1 - sh * 0.5)
      const sp = pick(CPUS.filter(c => c !== f.who))
      lines.push({ w: 2.5 * f.audible + 0.2, sp, text: f.mask > 0 ? (f.ev === 'bell' ? TT().heardMix : TT().heardMixS) : TT().heard.replace('{X}', nameOf(f.who, true)), about: f.who })
    }
    for (const c of f.wit) { E[f.who] += 1.5; lines.push({ w: 1.6, sp: c, text: TT().witness.replace('{X}', nameOf(f.who, true)), about: f.who }) }
  }
  for (let i = 0; i < NSEAT; i++) {
    if (!sm[i]) continue
    const v = Math.pow(sm[i], 1.3)
    E[i] += 0.9 * v
    for (const j of [i - 1, i + 1]) if (j >= 0 && j < NSEAT) E[j] += 0.6 * (1 - 0.45 * sh) * v
  }
  for (let i = 0; i < NSEAT; i++) E[i] = E[i] * k + R() * 0.35
  // 匂いの方向の発言（一番強く匂う人を、その隣が言う。外れることもある）
  const smellTop = [...E.keys()].filter(i => sm[i] || sm[i - 1] || sm[i + 1]).sort((a, b) => E[b] - E[a])[0]
  if (smellTop !== undefined && sm.some(Boolean)) {
    const sp = [smellTop - 1, smellTop + 1].filter(j => j >= 0 && j < NSEAT && j !== YOU && j !== smellTop)
    if (sp.length) lines.push({ w: 1, sp: pick(sp), text: TT().smell.replace('{X}', nameOf(smellTop, true)), about: smellTop })
  }
  lines.sort((a, b) => b.w - a.w)
  return { E, lines: lines.slice(0, 2) }
}
function startMeeting() {
  if (!S.farts.length) { S.ph = 'peace'; S.t = 0; setPanel(''); banner(TT().peace, 'banner', 1.8); return }
  S.ph = 'meet'; S.t = 0; setPanel(''); Snd.setTrack('meet')
  const ev = evidence(); S.E = ev.E
  // 言い出しっぺ: 鼻のいい人ほど先に気づく（自分がこいた CPU は言い出さないことが多い）
  const cand = CPUS.map(c => ({ c, v: D.ppl[D.seats[c]].nose * (0.6 + R()) * (S.farts.some(f => f.who === c) ? 0.4 : 1) })).sort((a, b) => b.v - a.v)
  S.sniffer = cand[0].c
  S.meetQ = [{ at: 0.5, i: S.sniffer, text: pick(TT().sniff) }, ...ev.lines.map((l, k) => ({ at: 2.4 + k * 2.1, i: l.sp, text: l.text, about: l.about }))]
  banner(TT().meetT, 'banner meet', 1.6)
}
function updateMeet(dt) {
  S.t += dt
  for (const q of S.meetQ) if (!q.done && S.t >= q.at) {
    q.done = true; say(q.i, q.text, 2.6)
    if (q.about !== undefined) { S.gz[q.i] = q.about; PPL[q.i].point = q.about }
    else { PPL[q.i].sniffT = 1.5; Snd.sfx('sniff') }
  }
  // 疑われている人を見る
  for (const c of CPUS) if (!S.meetQ.some(q => q.i === c && q.done && q.about !== undefined)) S.gz[c] = topSuspect(c)
  const end = Math.max(...S.meetQ.map(q => q.at)) + 2.2
  if (S.t >= end) { S.ph = 'choose'; S.t = 0; for (const n of PPL) n.point = -1; setPanel('choose') }
}
function topSuspect(c) { let b = -1, v = -1; for (let j = 0; j < NSEAT; j++) if (j !== c && S.E[j] > v) { v = S.E[j]; b = j } return b }
function choose(kind, target) {
  if (S.ph !== 'choose' && S.ph !== 'pick') return
  if (kind === 'blame' && target === undefined) { S.ph = 'pick'; setPanel('pick'); return }
  Snd.sfx('tap'); setPanel('')
  const T = TT(), sh = sharp(), E = S.E, Ep = E[YOU]
  const iFarted = S.farts.some(f => f.who === YOU)
  S.choice = kind; S.ph = 'react'; S.t = 0
  let line = T.say[kind], ok = false
  if (kind === 'feign') {
    const loud = S.farts.some(f => f.who === YOU && f.audible > 0.5)
    ok = !loud; E[YOU] *= ok ? 0.6 : 1.05
  } else if (kind === 'blame') {
    line = line.replace('{T}', nameOf(target)); S.blameT = target
    const ratio = E[target] / Math.max(Ep, 0.1), cpuF = S.farts.some(f => f.who === target)
    ok = R() < clamp(0.3 + ratio * 0.45 + (cpuF ? 0.25 : 0) - sh * 0.15, 0.1, 0.92)
    if (ok) { E[target] += Ep * 0.7 + 0.5; E[YOU] *= 0.5 } else E[YOU] = E[YOU] * 1.3 + 0.3
  } else if (kind === 'rage') {
    const F = S.sniffer, fF = S.farts.some(f => f.who === F)
    ok = R() < clamp(0.45 - sh * 0.2 + (fF ? 0.4 : 0), 0.1, 0.9)
    if (ok) { E[F] += Ep * 0.8 + 0.6; E[YOU] *= 0.6 } else E[YOU] = E[YOU] * 1.25 + 0.3
    S.blameT = F
  }
  S.chOk = ok; S.iFarted = iFarted
  say(YOU, line, 2.6)
  PPL[YOU].point = kind === 'blame' || kind === 'rage' ? S.blameT : -1
  const resp = kind === 'confess' ? T.rConfess : kind === 'rage' ? (ok ? T.rRageOk : T.rRageNg) : ok ? pick(T.rOk) : pick(T.rNg)
  S.respQ = { at: 1.7, i: kind === 'rage' ? pick(CPUS.filter(c => c !== S.sniffer)) : pick(CPUS.filter(c => c !== S.blameT)), text: resp }
  if (kind === 'confess') { for (const c of CPUS) PPL[c].smile = 1 }
}
function updateReact(dt) {
  S.t += dt
  if (S.respQ && S.t >= S.respQ.at) { const q = S.respQ; S.respQ = null; say(q.i, q.text, 2.2); if (S.choice === 'confess') Snd.laugh(4) }
  if (S.t >= 3.6) {
    PPL[YOU].point = -1
    if (S.choice === 'confess') { S.culprit = YOU; return verdict() }
    startVote()
  }
}
function startVote() {
  S.ph = 'vote'; S.t = 0; Snd.sfx('drum')
  const sh = sharp(), vn = 1.5 * (1 - sh) + 0.35, E = S.E
  S.votes = CPUS.map(c => { let b = -1, v = -1; for (let j = 0; j < NSEAT; j++) if (j !== c) { const s = E[j] + R() * vn; if (s > v) { v = s; b = j } } return { c, j: b } })
  const cnt = new Array(NSEAT).fill(0); for (const v of S.votes) cnt[v.j]++
  const mx = Math.max(...cnt), top = [...cnt.keys()].filter(i => cnt[i] === mx).sort((a, b) => E[b] - E[a])
  S.culprit = Math.max(...E) < 0.55 || mx < 2 ? -1 : top[0]
  banner(TT().vote, 'banner meet', 1.2)
}
function updateVote(dt) {
  S.t += dt
  S.votes.forEach((v, k) => { if (!v.shown && S.t >= 0.5 + k * 0.35) { v.shown = true; PPL[v.c].point = v.j; S.gz[v.c] = v.j; Snd.sfx('point'); fx(nameOf(v.j, true) + '!', v.j === YOU ? 'vt red' : 'vt', { at: headPos(v.c).add(new THREE.Vector3(0, 0.36, 0)), size: 20, life: 1.9 }) } })
  if (S.t >= 2.4) verdict()
}
function verdict() {
  S.ph = 'verdict'; S.t = 0
  const T = TT(), c = S.culprit, iF = S.farts.some(f => f.who === YOU), cF = c >= 0 && S.farts.some(f => f.who === c)
  let bank = 0, head = '', sub = '', cls = 'verdict'
  if (S.choice === 'confess') {
    bank = Math.round(S.pend * 0.5) + (iF ? 20 : 10); S.outcome = 'confess'; head = T.confessed; sub = '+' + bank; cls += ' laugh'
    Snd.sfx('safe')
  } else if (c === -1) {
    bank = S.pend; S.outcome = 'unsolved'; head = S.lang === 'ja' ? '迷宮入り…' : 'Case unsolved...'; sub = bank ? '+' + bank : ''; cls += ' safe'; Snd.sfx('safe')
  } else if (c === YOU) {
    if (iF) { S.lives--; S.stats.caught++; S.outcome = 'caught'; head = T.caught; cls += ' bad'; Snd.sfx('wahwah'); PPL[YOU].shock = 1; S.capKind = 'caught'; S.wantCap = !S.photo || S.capPref !== 'framed' }
    else { S.outcome = 'wrongYou'; head = T.wrongYou; cls += ' safe'; Snd.sfx('wahwah') }
  } else if (!cF) {
    bank = S.pend + Math.max(30, Math.round(S.pend * 0.5)); S.stats.framed++; S.outcome = 'framed'; head = T.framed; sub = '+' + bank; cls += ' good'
    Snd.laugh(5); Snd.sfx('fanfare'); for (const n of PPL) if (n.i !== c) n.smile = 1; PPL[c].shock = 1
    S.capKind = 'framed'; S.wantCap = true; S.capPref = 'framed'
  } else {
    bank = S.pend; S.outcome = 'correct'; head = nameOf(c) + T.correct; sub = bank ? '+' + bank : ''; cls += ' safe'; Snd.sfx('stamp')
  }
  S.score += bank; S.pend = 0; S.lastBank = bank
  if (c >= 0) fx(T.culprit + ' ' + nameOf(c) + (S.lang === 'ja' ? '！' : '!'), 'vt yel', { at: headPos(c).add(new THREE.Vector3(0, 0.5, 0)), size: 28, life: 2.6 })
  fx(head + (sub ? '  ' + sub : ''), cls, { x: innerWidth / 2, y: innerHeight * (innerWidth < innerHeight ? 0.66 : 0.8), life: 2.6 })
  for (const n of PPL) n.point = -1
  if (c >= 0) for (const v of S.votes) if (v.j === c) PPL[v.c].point = c
  Snd.setTrack(S.outcome === 'caught' ? 'sad' : S.outcome === 'framed' ? 'happy' : 'night')
}
function newYear() {
  S.ph = 'over'; S.t = -1.2; S.cleared = true; S.wantCapOver = !S.photo
  const bonus = S.lives * 100; S.score += bonus
  Snd.bell(); Snd.sfx('fanfare'); Snd.laugh(5); Snd.setTrack('happy')
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
  S.result = { score: S.score, rounds: Math.max(0, rounds), farts: S.stats.farts, framed: S.stats.framed, caught: S.stats.caught }
  if (!S.photo) { renderer.render(scene, camera); capture() }
  S.resT = 0; fillResult(); show('vResult'); Snd.setTrack('title')
  for (const n of PPL) { n.point = -1; n.smile = 1 }
  PPL[YOU].smile = 0; PPL[YOU].shock = 1
}
function fillResult() {
  const r = S.result, T = TT(), rk = rankOf(r.score)
  $('#rScore').textContent = r.score; $('#rRounds').textContent = T.roundsL + ' ' + r.rounds + T.roundsU
  $('#rRank').textContent = rk.t; $('#rCmt').textContent = rk.c
  $('#rStats').innerHTML = [[T.stFart, r.farts], [T.stFramed, r.framed], [T.stCaught, r.caught]].map(([l, v]) => `<div><b>${v}</b>${l}</div>`).join('')
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
function shareText() { const r = S.result, T = TT(); return T.share.replace('{P}', r.score).replace('{R}', r.rounds).replace('{K}', rankOf(r.score).t) }
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
}

// ---------- 見た目の更新
let shake = 0
function updatePeople(dt) {
  const tm = S.time
  for (const n of PPL) {
    // 視線
    const g = S.gz[n.i]
    if (n.i === YOU) {
      if (S.mode === 'play' && (S.ph === 'meet' || S.ph === 'vote')) { const sus = topSuspect(YOU); lookAtPoint(n, headPos(sus >= 0 ? sus : 1)) }
      else if (n.point >= 0) lookAtPoint(n, headPos(n.point))
      else { n.tYaw = Math.sin(tm * 0.4) * 0.25; n.tPitch = 0.05 }
    } else if (n.point >= 0) lookAtPoint(n, headPos(n.point))
    else if (g >= 0 && S.mode === 'play') lookAtPoint(n, headPos(g))
    else if (n.key === 'itoko') { n.tYaw = 0; n.tPitch = 0.55 }
    else lookAtPoint(n, TABLE_PT.clone().add(_q.set(Math.sin(tm * 0.3 + n.i) * 0.3, 0.2, 0)))
    if (n.sniffT > 0) { n.sniffT -= dt; n.tPitch -= 0.25; n.tYaw += Math.sin(tm * 9) * 0.3 }
    const k = 1 - Math.pow(0.0008, dt)
    n.yaw = lerp(n.yaw, n.tYaw, k); n.pitch = lerp(n.pitch, n.tPitch, k)
    n.pivot.rotation.y = n.yaw * 0.75; n.pivot.rotation.x = n.pitch * 0.7
    n.b.rotation.y = n.yaw * 0.25
    for (const p of n.pupils) { p.position.x = clamp(n.yaw * 0.02, -0.014, 0.014); p.position.y = -0.004 - n.pitch * 0.012 }
    // 腰が浮く
    n.lift = Math.max(0, n.lift - dt * 1.8)
    n.b.position.y = Math.sin(Math.min(1, n.lift) * Math.PI) * 0.06; n.b.rotation.z = Math.sin(n.lift * Math.PI) * 0.06
    // 指さし（右腕）
    const arm = n.arms[1]
    if (n.point >= 0) { n.pointK = Math.min(1, n.pointK + dt * 5) } else n.pointK = Math.max(0, n.pointK - dt * 4)
    arm.rotation.x = lerp(n.key === 'itoko' ? -1.1 : -0.9, -1.55, n.pointK); arm.rotation.y = lerp(0, n.yaw * 0.9, n.pointK); arm.rotation.z = lerp(0.15, 0.05, n.pointK)
    if (n.phone) n.phone.visible = n.pointK < 0.5
    // 口・表情
    n.talk = Math.max(0, n.talk - dt)
    n.smile = Math.max(0, n.smile - dt * 0.25); n.shock = Math.max(0, n.shock - dt * 0.6)
    const open = n.talk > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(tm * 18)) : 0
    n.mouth.scale.set(0.04 + n.smile * 0.03, 0.012 + open * 0.03 + n.smile * 0.02 + n.shock * 0.035, 0.015)
    for (const [s, br] of n.brows.entries()) { br.rotation.z = (s ? -1 : 1) * (n.shock * 0.4 - n.smile * 0.2); br.position.y = 0.105 + n.shock * 0.02 }
    // 赤面・汗（あなたが疑われるほど）
    let red = 0, sweat = 0
    if (n.i === YOU && S.mode === 'play') {
      if (S.E && (S.ph === 'meet' || S.ph === 'choose' || S.ph === 'pick' || S.ph === 'react' || S.ph === 'vote')) { const mx = Math.max(...S.E), v = S.E[YOU] / Math.max(0.5, mx); sweat = v > 0.8 ? 1 : v > 0.5 ? 0.6 : 0; red = sweat * 0.5 }
      if (n.lift > 0) red = Math.max(red, 0.6)
      if (watchers(YOU).length && S.ph === 'quiet') sweat = Math.max(sweat, 0.5)
    }
    if (n.key === 'oji') red = Math.max(red, 0.35)
    n.red = lerp(n.red, red, 0.1); n.skinM.color.copy(n.skin0).lerp(_c.setHex(0xff6a5a), n.red * 0.5)
    for (const ck of n.cheeks) ck.material.opacity = 0.2 + n.red * 0.6 + n.smile * 0.3
    n.sweatK = lerp(n.sweatK, sweat, 0.15); n.sweat.scale.setScalar(n.sweatK * 0.11); n.sweat.position.y = 0.12 - ((tm * 0.6) % 1) * 0.08 * n.sweatK
    // こっちを見ている目印
    const watching = S.mode === 'play' && S.ph === 'quiet' && n.i !== YOU && S.gz[n.i] === YOU
    n.eyeK = lerp(n.eyeK, watching ? 1 : 0, 0.2); n.eye.scale.set(n.eyeK * 0.36, n.eyeK * 0.23, 1)
    n.eye.position.y = 1.5 + Math.sin(tm * 6) * 0.015
    // 笑う（体を揺らす）
    if (n.smile > 0.3) n.b.position.y += Math.abs(Math.sin(tm * 14)) * 0.025 * n.smile
  }
  if (PPL[YOU].tag) { PPL[YOU].tag.position.y = 1.52 + Math.sin(tm * 3) * 0.03; PPL[YOU].tag.visible = S.ph !== 'verdict' }
}
const _c = new THREE.Color()
function updatePuffs(dt) {
  for (const f of puffs) {
    if (f.life <= 0) continue
    f.life -= dt; if (f.life <= 0) { f.sp.visible = false; continue }
    const k = 1 - f.life / f.max
    f.sp.position.addScaledVector(f.v, dt); f.v.multiplyScalar(1 - dt * 0.8)
    f.sp.scale.setScalar(lerp(f.s0, f.s1, Math.sqrt(k))); f.sp.material.opacity = f.op * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85)
  }
  haze.material.opacity = lerp(haze.material.opacity, clamp(S.smell * 0.12, 0, 0.5), 0.05)
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
  if (S.camHome) camera.position.copy(S.camHome).add(_q.set((R() - 0.5) * shake * 0.12, (R() - 0.5) * shake * 0.12, 0))
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
  updatePeople(STEP); updatePuffs(STEP); updateFx(STEP); updateCamera(STEP)
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
  S, D, PPL, camera, drawCard, xPost, toResult, choose, pressFart, doFart, evidence, startRun, nextRound, Snd, rankOf,
  dbg: {
    pause() { S.dbgPause = true }, resume() { S.dbgPause = false; last = performance.now() },
    step(n = 1) { for (let k = 0; k < n; k++) step() }, render, seed(s) { S.fixedSeed = s },
    // しずかな時間を、次の山（音）まで進める
    toPeak(type = 'bell') { const e = S.evs.find(x => x.type === type && x.tp > S.t); if (!e) return false; while (S.ph === 'quiet' && S.t < e.tp + 0.15) step(); return true },
    finishReveal() { S.resT = 9; revealResult() },
  },
}
window.__fwReady = true
