// あおぐ前後を撮る（流れる途中・届いて鼻をつまむ・会議）。node _fanshot.mjs [w] [h]
import './mute-auto.mjs'
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844), PORT = String(5530 + (W % 7))
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', deviceScaleFactor: 2 }); await muteContext(ctx); const p = await ctx.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.evaluate(d => { window.__dir = d }, +(process.env.DIR || 1)); await p.waitForFunction(() => window.__fwReady); await p.evaluate(() => document.fonts.ready)
const shot = async n => { await p.evaluate(() => fw.dbg.render()); await p.screenshot({ path: `shots/fan-${W}${process.env.DIR === '-1' ? 'L' : ''}-${n}.png` }) }
await p.evaluate(() => { fw.dbg.pause(); fw.dbg.seed(11); fw.startRun(); const S = fw.S; S.evs = []; S.cpuPlan = []; S.resPlan = []; S.gz = [-1, -1, -1, -1, -1]; S.gzT = [99, 99, 99, 99, 99]; fw.dbg.step(150); fw.doFart(2, 'suka'); fw.dbg.step(30) })
await shot('1-ready')
await p.evaluate(() => { fw.pressFan(+(window.__dir || 1)); fw.dbg.step(22) })
await shot('2-flying')
await p.evaluate(() => { fw.dbg.step(40) })
await shot('3-hit')
await p.evaluate(() => { const S = fw.S; S.t = 99; fw.dbg.step(1); while (S.ph === 'meet' && S.t < 5.2) fw.dbg.step(1) })
await shot('4-meet')
console.log(errs.join('\n') || 'no errors')
await b.close(); server.kill()
