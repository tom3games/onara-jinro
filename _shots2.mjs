// 新要素の撮影（猫・うちわ・座り直しと本当のおなら・判定・年越し）。node _shots2.mjs [w] [h]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '5528' } })
await new Promise(r => setTimeout(r, 400))
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844)
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', deviceScaleFactor: 1 }); await muteContext(ctx); const p = await ctx.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto('http://localhost:5528/'); await p.waitForFunction(() => window.__fwReady); await p.evaluate(() => document.fonts.ready)
const shot = async (n, clip) => { await p.evaluate(() => fw.dbg.render()); await p.screenshot({ path: `shots/n-${W}-${n}.png` }); if (clip && W < 500) await p.screenshot({ path: `shots/z-${n}.png`, clip }) }
await p.evaluate(() => { fw.dbg.pause(); fw.dbg.seed(11); fw.startRun(); const S = fw.S; S.evs = [{ type: 'cat', src: -1, tw: 0.5, tp: 2.6, dur: 0.35, walk: 5.2 }]; S.cpuPlan = []; S.resPlan = []; while (S.t < 2.75) fw.dbg.step(1) })
await shot('cat')
// 座り直し（おじさん）と本当のおなら（おかん）を同時に
await p.evaluate(() => { const S = fw.S; S.evs = []; S.cpuPlan = [{ who: 1, id: 'suka', t: S.t + 0.05, done: false }]; S.resPlan = [{ who: 3, t: S.t + 0.05, done: false }]; fw.dbg.step(20) })
await shot('lift', { x: 0, y: 230, width: 330, height: 200 })
await p.evaluate(() => { const S = fw.S; S.smell = 2.2; S.zawa = true; fw.dbg.step(60) })
await shot('zawa')
await p.evaluate(() => { const S = fw.S; S.gz = [-1, -1, -1, -1, -1]; S.gzT = [9, 9, 9, 9, 9]; fw.pressFan(); fw.dbg.step(12) })
await shot('fan', { x: 60, y: 230, width: 260, height: 200 })
// 判定（あなたに2票: 怪しまれた）
await p.evaluate(() => { const S = fw.S; S.farts.push({ who: 2, id: 'bubo', wit: [], gl: [], t: 1 }); S.pend = 100; S.choice = 'feign'; S.votes = [{ c: 0, j: 2 }, { c: 1, j: 3 }, { c: 3, j: 2 }, { c: 4, j: 3 }]; S.cnt = [0, 0, 2, 2, 0]; S.culprit = -1; S.ph = 'vote'; S.t = 9; fw.dbg.step(1); fw.dbg.step(50) })
await shot('verdict-tier2')
await p.evaluate(() => { const S = fw.S; S.farts = [{ who: 2, id: 'bubo', wit: [], gl: [], t: 1 }]; S.pend = 100; S.choice = 'feign'; S.votes = [0, 1, 3, 4].map(c => ({ c, j: 2 })); S.cnt = [0, 0, 4, 0, 0]; S.culprit = 2; S.unan = true; S.ph = 'vote'; S.t = 9; fw.dbg.step(1); fw.dbg.step(50) })
await shot('verdict-caught')
await p.evaluate(() => { const S = fw.S; S.lives = 3; S.farts = [{ who: 2, id: 'bubo', wit: [], gl: [], t: 1 }]; S.lifts = [{ who: 3, real: false, seen: [] }]; S.pend = 100; S.choice = 'blame'; S.blameT = 3; S.votes = [{ c: 0, j: 3 }, { c: 1, j: 3 }, { c: 3, j: 2 }, { c: 4, j: 3 }]; S.cnt = [0, 0, 1, 3, 0]; S.culprit = 3; S.unan = true; S.ph = 'vote'; S.t = 9; fw.dbg.step(1); fw.dbg.step(50) })
await shot('verdict-framed')
await p.evaluate(() => { const S = fw.S; S.round = 8; S.ph = 'verdict'; S.t = 2.99; S.lives = 2; fw.dbg.step(2); fw.dbg.step(80) })
await shot('newyear')
await p.evaluate(() => { fw.dbg.step(200); fw.dbg.finishReveal() })
await shot('result')
console.log(errs.join('\n') || 'no errors')
await b.close(); server.kill()
