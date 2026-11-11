// うちわの効き: 状況を手で組んで、あおがない/左/右 で票と結果を比べる。node _fancase.mjs
import './mute-auto.mjs'
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '5524' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await muteContext(ctx); const p = await ctx.newPage()
await p.goto('http://localhost:5524/'); await p.waitForFunction(() => window.__fwReady)
const out = await p.evaluate(() => {
  const { S, dbg } = fw; dbg.pause(); const rows = []
  for (const id of ["suka", "pu"]) for (const fan of [0, -1, 1]) for (const ch of ['feign', 'blame']) {
    dbg.seed(11); fw.startRun(); S.cpuPlan = []; S.resPlan = []; S.evs = []; S.gz = [-1, -1, -1, -1, -1]; S.gzT = [99, 99, 99, 99, 99]
    S.t = 2; fw.doFart(2, id); const f = S.farts[0]; if (id !== "suka") { f.audible = 0; f.mask = 1 } S.gz = [-1, -1, -1, -1, -1]; S.gzT = [99, 99, 99, 99, 99]
    S.t = 3; if (fan) fw.pressFan(fan)
    S.t = 99; dbg.step(1); while (S.ph === 'meet') dbg.step(1)
    const ag = fw.againstYou(); const E = S.E.map(x => +x.toFixed(2))
    const tgt = ch === 'blame' ? (fan ? 2 + fan : [0, 1, 3, 4].map(j => ({ j, a: fw.argFor(j).total })).sort((a, b) => b.a - a.a)[0].j) : undefined
    fw.choose(ch, tgt); const ok = S.chOk
    while (S.ph !== 'verdict' && S.mode === 'play') dbg.step(1)
    rows.push({ id, fan, ch, tgt, ok, E, said: S.said.map(s => s.type + '>' + s.about).join(','), votes: S.votes.map(v => v.j).join(''), out: S.outcome, pend: S.pend, score: S.score })
  }
  return rows
})
for (const r of out) console.log(JSON.stringify(r))
await b.close(); server.kill()
