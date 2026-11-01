// 自動プレイで点数とラウンド数の分布を見る。node bot.mjs [games]
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5522' } })
await new Promise(r => setTimeout(r, 400))
const N = +(process.argv[2] || 60)
const b = await chromium.launch(MUTE_LAUNCH), bctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await muteContext(bctx); const p = await bctx.newPage()
await p.goto('http://localhost:5522/'); await p.waitForFunction(() => window.__fwReady)
const out = await p.evaluate(N => {
  const { S, dbg } = fw; dbg.pause()
  const pol = {
    smart(st) {
      if (S.ph === 'quiet') {
        const pk = S.evs.find(e => S.t >= e.tp && S.t <= e.tp + e.dur)
        const seen = [0, 1, 3, 4].some(c => S.gz[c] === 2)
        if (pk && !seen && !st.used.has(pk)) { st.used.add(pk); if (st.n < 2) { fw.pressFart(pk.type === 'bell' ? 'bubo' : 'pu'); st.n++ } }
      } else if (S.ph === 'choose') {
        const cf = S.farts.find(f => f.who !== 2)
        const iF = S.farts.some(f => f.who === 2)
        const mx = Math.max(...S.E.filter((x, i) => i !== 2))
        if (cf) fw.choose('blame', cf.who)
        else if (iF && S.E[2] > 2.2 && S.E[2] > mx * 1.6) fw.choose('confess')
        else fw.choose('feign')
      }
    },
    casual(st) {
      if (S.ph === 'quiet') { const pk = S.evs.find(e => S.t >= e.tp + 0.3 && S.t <= e.tp + e.dur); if (pk && !st.n) { fw.pressFart(pk.type === 'bell' ? 'bubo' : 'pu'); st.n = 1 } }
      else if (S.ph === 'choose') { const cf = S.farts.find(f => f.who !== 2); cf ? fw.choose('blame', cf.who) : fw.choose('feign') }
    },
    spam(st) { if (S.ph === 'quiet') fw.pressFart('suka'); else if (S.ph === 'choose') fw.choose('feign') },
    bubo(st) { if (S.ph === 'quiet') fw.pressFart('bubo'); else if (S.ph === 'choose') fw.choose('feign') },
    random(st) {
      if (S.ph === 'quiet' && Math.random() < 0.006) fw.pressFart(['suka', 'pu', 'bubo'][Math.floor(Math.random() * 3)])
      else if (S.ph === 'choose') { const k = ['feign', 'blame', 'rage', 'confess'][Math.floor(Math.random() * 4)]; k === 'blame' ? fw.choose('blame', [0, 1, 3, 4][Math.floor(Math.random() * 4)]) : fw.choose(k) }
    },
  }
  const res = {}
  for (const [name, f] of Object.entries(pol)) {
    const sc = [], rd = [], oc = {}, vp = {}, yv = {}; let nv = 0
    for (let g = 0; g < N; g++) {
      dbg.seed(1000 + g); fw.startRun()
      let st = { used: new Set(), n: 0, r: 0 }, guard = 0
      let pph = ''
      while (S.mode === 'play' && guard++ < 400000) {
        if (S.round !== st.r) { st = { used: new Set(), n: 0, r: S.round } }
        f(st); dbg.step(1)
        if (S.ph === 'verdict' && pph !== 'verdict') { oc[S.outcome] = (oc[S.outcome] || 0) + 1; if (S.choice !== 'confess' && S.votes.length) { const cnt = {}; for (const v of S.votes) cnt[v.j] = (cnt[v.j] || 0) + 1; const k = Object.values(cnt).sort((a, b) => b - a).join('-'); vp[k] = (vp[k] || 0) + 1; nv++; if (S.farts.some(f => f.who === 2)) { const y = cnt[2] || 0; yv[y] = (yv[y] || 0) + 1 } } }
        if (S.ph === 'peace' && pph !== 'peace') oc.peace = (oc.peace || 0) + 1
        pph = S.ph
      }
      sc.push(S.score); if (S.cleared) oc.cleared = (oc.cleared || 0) + 1; rd.push(S.round - (S.lives <= 0 ? 1 : 0))
      document.querySelector('#fx').innerHTML = ''
    }
    sc.sort((a, b) => a - b); rd.sort((a, b) => a - b)
    const q = a => [a[0], a[Math.floor(a.length * 0.25)], a[Math.floor(a.length * 0.5)], a[Math.floor(a.length * 0.75)], a[a.length - 1]]
    const pct = o => Object.fromEntries(Object.entries(o).sort().map(([k, v]) => [k, Math.round(v / Math.max(1, nv) * 100) + '%']))
    res[name] = { score: q(sc), rounds: q(rd), mean: Math.round(sc.reduce((a, b) => a + b, 0) / sc.length), outcomes: oc, votes: pct(vp), youVotes: yv }
  }
  return res
}, N)
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(7), 'score[min,q1,med,q3,max]=', JSON.stringify(v.score), 'mean=', v.mean, 'rounds=', JSON.stringify(v.rounds), JSON.stringify(v.outcomes), '\n        votes=', JSON.stringify(v.votes), 'votesOnYou(when farted)=', JSON.stringify(v.youVotes))
await b.close(); server.kill()
