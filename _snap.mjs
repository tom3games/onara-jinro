// 開発用の撮影。node _snap.mjs [w] [h]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5523' } })
await new Promise(r => setTimeout(r, 400))
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844)
const b = await chromium.launch(MUTE_LAUNCH), sctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP' }); await muteContext(sctx); const p = await sctx.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto('http://localhost:5523/'); await p.waitForFunction(() => window.__fwReady, null, { timeout: 8000 }).catch(() => {})
await p.waitForTimeout(800); await p.screenshot({ path: `shots/s-${W}-title.png` })
await p.evaluate(() => { fw.dbg.pause(); fw.dbg.seed(7) }); await p.click('#bStart')
await p.evaluate(() => { fw.dbg.step(200); fw.S.gz = [1, 2, 2, 2, 2]; fw.S.gzT = [9, 9, 9, 9, 9]; fw.dbg.step(2); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-quiet.png` })
await p.evaluate(() => { fw.dbg.toPeak('bell'); fw.pressFart('bubo'); fw.dbg.step(20); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-fart.png` })
await p.evaluate(() => { fw.pressFart && fw.dbg.step(60 * 3); fw.pressFart('suka'); while (fw.S.ph === 'quiet') fw.dbg.step(1); fw.dbg.step(60 * 3); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-meet.png` })
await p.evaluate(() => { while (fw.S.ph === 'meet') fw.dbg.step(1); fw.dbg.step(2); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-choose.png` })
await p.click('#c_blame'); await p.evaluate(() => { fw.dbg.step(2); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-pick.png` })
await p.click('#pickRow [data-i="3"]'); await p.evaluate(() => { fw.dbg.step(80); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-react.png` })
await p.evaluate(() => { while (fw.S.ph === 'react') fw.dbg.step(1); fw.dbg.step(150); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-vote.png` })
const v = await p.evaluate(() => { while (fw.S.ph === 'vote') fw.dbg.step(1); fw.dbg.step(70); fw.dbg.render(); return { E: fw.S.E.map(x => +x.toFixed(2)), votes: fw.S.votes.map(v => v.c + '>' + v.j), culprit: fw.S.culprit, out: fw.S.outcome, score: fw.S.score, lives: fw.S.lives } })
await p.screenshot({ path: `shots/s-${W}-verdict.png` })
await p.evaluate(() => { fw.S.lives = 0; fw.toResult(); fw.dbg.finishReveal(); fw.dbg.render() })
await p.screenshot({ path: `shots/s-${W}-result.png` })
console.log(JSON.stringify(v), errs)
await b.close(); server.kill()
