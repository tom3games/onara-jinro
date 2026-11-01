import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '5526' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await muteContext(ctx); const p = await ctx.newPage()
p.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)))
await p.goto('http://localhost:5526/'); await p.waitForFunction(() => window.__fwReady)
const r = await p.evaluate(() => { const n = fw.PPL[1]; const out = []; n.b.traverse(m => { if (m.isMesh) { const s = new fw.THREE_V(); } }); return 1 }).catch(e => e.message)
console.log(r)
await p.evaluate(() => { fw.dbg.pause(); fw.renderer.shadowMap.enabled = false; fw.dbg.render() })
await p.screenshot({ path: 'shots/dbg1.png' })
await b.close(); server.kill()
