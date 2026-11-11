// 自動プレイで点数とラウンド数の分布を見る。node bot.mjs [games]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5522' } })
await new Promise(r => setTimeout(r, 400))
const N = +(process.argv[2] || 60)
const b = await chromium.launch(MUTE_LAUNCH), bctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await muteContext(bctx); const p = await bctx.newPage()
await p.goto('http://localhost:5522/'); await p.waitForFunction(() => window.__fwReady)
await p.evaluate(b => { window.__BOTS = b }, process.env.BOTS || '')
const out = await p.evaluate(N => {
  const { S, dbg } = fw; dbg.pause()
  const peak = () => S.evs.find(e => S.t >= e.tp && S.t <= e.tp + e.dur)
  const seen = () => [0, 1, 3, 4].some(c => S.gz[c] === 2)
  let rs = 7
  const react = () => { rs = (rs * 16807) % 2147483647; return 0.5 + (rs % 1000) / 2000 }
  // あおぐ向き: 座り直した・腰を浮かせた隣の人がいればそっち、いなければ鼻の弱いおじさん側
  const fanSide = () => S.lifts.some(l => l.who === 1) && !S.lifts.some(l => l.who === 3) ? -1 : 1
  const chooseSmart = () => {
    const cf = S.farts.find(f => f.who !== 2)
    if (cf) return fw.choose('blame', cf.who)
    const ag = fw.againstYou(), best = [0, 1, 3, 4].map(j => ({ j, a: fw.argFor(j).total })).sort((a, b) => b.a - a.a)[0]
    const iF = S.farts.some(f => f.who === 2)
    if (iF && best.a >= ag.total && best.a > 0) fw.choose('blame', best.j); else fw.choose('feign')
  }
  const pol = {
    // 手がかりを見て推理する人: 見られていない時に鐘・くしゃみ・猫へ合わせ、出したら見られていない隙に隣へあおぎ、会議では証拠を比べて選ぶ
    smart(st, plain, noFan) {
      if (S.ph === 'quiet') {
        const pk = peak()
        if (pk && !seen() && !st.used.has(pk) && st.n < 2) {
          const id = pk.type === 'bell' ? 'bubo' : pk.type === 'cat' ? (plain || st.n ? null : 'pu') : pk.type === 'sneeze' ? 'pu' : null
          if (id) { st.used.add(pk); if (fw.pressFart(id)) st.n++ }
        }
        const mine = S.farts.some(f => f.who === 2 && f.pushTo === undefined)
        if (!plain && !noFan && mine && !S.fanN && !seen()) fw.pressFan(fanSide())
      } else if (S.ph === 'choose') chooseSmart()
    },
    // 推理はするが猫とうちわを使わない人
    smartNoTools(st) { return pol.smart(st, true) },
    // 推理する人からうちわだけ抜く（うちわの効きを比べる）
    smartNoFan(st) { return pol.smart(st, false, true) },
    // 人の速さ: 見てから0.5〜1秒遅れて押す（その間に山が終わる・目が向くこともある）。会議は推理する人と同じ
    human(st, noFan) {
      if (S.ph === 'quiet') {
        st.q = st.q || []
        for (const a of st.q.filter(a => !a.done && S.t >= a.at)) { a.done = true; a.fn() }
        const pk = peak()
        if (pk && !st.used.has(pk) && st.n < 2 && !seen()) {
          const id = pk.type === 'bell' ? 'bubo' : pk.type === 'sneeze' ? 'pu' : pk.type === 'cat' && !st.n ? 'pu' : null
          st.used.add(pk); if (id) { st.n++; st.q.push({ at: S.t + react(), fn: () => fw.pressFart(id) }) }
        }
        const mine = S.farts.some(f => f.who === 2 && f.pushTo === undefined)
        if (!noFan && mine && !S.fanN && !st.fq && !seen()) { st.fq = 1; st.q.push({ at: S.t + react(), fn: () => fw.pressFan(fanSide()) }) }
      } else if (S.ph === 'choose') chooseSmart()
    },
    humanNoFan(st) { return pol.human(st, true) },
    // すかし派（人の速さ）: 誰も見ていない時にすかし、見られていない隙に隣へあおぐ
    humanSuka(st, noFan) {
      if (S.ph === 'quiet') {
        st.q = st.q || []
        for (const a of st.q.filter(a => !a.done && S.t >= a.at)) { a.done = true; a.fn() }
        if (!st.n && S.t > 3 && !seen()) { st.n = 1; st.q.push({ at: S.t + react(), fn: () => fw.pressFart('suka') }) }
        const mine = S.farts.some(f => f.who === 2 && f.pushTo === undefined)
        if (!noFan && mine && !S.fanN && !st.fq && !seen()) { st.fq = 1; st.q.push({ at: S.t + react(), fn: () => fw.pressFan(fanSide()) }) }
      } else if (S.ph === 'choose') chooseSmart()
    },
    humanSukaNoFan(st) { return pol.humanSuka(st, true) },
    // 悪い使い方: 見られていても気にせずあおぐ／毎回2回あおぐ
    fanBlind(st) {
      if (S.ph === 'quiet') { const pk = S.evs.find(e => e.type === 'bell' && S.t >= e.tp + 0.3 && S.t <= e.tp + e.dur); if (pk && !st.n) { fw.pressFart('bubo'); st.n = 1; st.ft = S.t } if (st.n && S.t - st.ft > 0.5 && !S.fanN) fw.pressFan(1) }
      else if (S.ph === 'choose') chooseSmart()
    },
    fanTwice(st) {
      if (S.ph === 'quiet') { const pk = S.evs.find(e => e.type === 'bell' && S.t >= e.tp + 0.3 && S.t <= e.tp + e.dur); if (pk && !st.n) { fw.pressFart('bubo'); st.n = 1; st.ft = S.t } if (st.n && S.t - st.ft > 0.5 && (S.fanN || 0) < 2 && !seen()) fw.pressFan(S.fanN ? -1 : 1) }
      else if (S.ph === 'choose') chooseSmart()
    },
    casual(st) {
      if (S.ph === 'quiet') { const pk = S.evs.find(e => e.type !== 'cat' && S.t >= e.tp + 0.3 && S.t <= e.tp + e.dur); if (pk && !st.n) { fw.pressFart(pk.type === 'bell' ? 'bubo' : 'pu'); st.n = 1 } }
      else if (S.ph === 'choose') { const cf = S.farts.find(f => f.who !== 2); cf ? fw.choose('blame', cf.who) : fw.choose('feign') }
    },
    // 手がかりを見ずに適当に指す人（出し方は casual と同じ）
    guess(st) {
      if (S.ph === 'quiet') { const pk = S.evs.find(e => e.type !== 'cat' && S.t >= e.tp + 0.3 && S.t <= e.tp + e.dur); if (pk && !st.n) { fw.pressFart(pk.type === 'bell' ? 'bubo' : 'pu'); st.n = 1 } }
      else if (S.ph === 'choose') fw.choose('blame', [0, 1, 3, 4][Math.floor(Math.random() * 4)])
    },
    spam(st) { if (S.ph === 'quiet') fw.pressFart('suka'); else if (S.ph === 'choose') fw.choose('feign') },
    bubo(st) { if (S.ph === 'quiet') fw.pressFart('bubo'); else if (S.ph === 'choose') fw.choose('feign') },
    // 自白頼み: ブボボッを連打して毎回自白する（自白が強すぎないかを見る）
    boboConfess(st) { if (S.ph === 'quiet') fw.pressFart('bubo'); else if (S.ph === 'choose') fw.choose('confess') },
    oneConfess(st) { if (S.ph === 'quiet') { if (!st.n && fw.pressFart('bubo')) st.n = 1 } else if (S.ph === 'choose') fw.choose('confess') },
    random(st) {
      if (S.ph === 'quiet' && Math.random() < 0.006) fw.pressFart(['suka', 'pu', 'bubo'][Math.floor(Math.random() * 3)])
      else if (S.ph === 'choose') { const k = ['feign', 'blame', 'rage', 'confess'][Math.floor(Math.random() * 4)]; k === 'blame' ? fw.choose('blame', [0, 1, 3, 4][Math.floor(Math.random() * 4)]) : fw.choose(k) }
    },
  }
  const res = {}
  const only = (window.__BOTS || '').split(',').filter(Boolean)
  for (const [name, f] of Object.entries(pol)) {
    if (only.length && !only.includes(name)) continue
    rs = 7; const sc = [], rd = [], oc = {}, vp = {}, yv = {}, bl = { n: 0, ok: 0 }; let nv = 0, un = 0, fans = 0
    for (let g = 0; g < N; g++) {
      dbg.seed(1000 + g); fw.startRun()
      let st = { used: new Set(), n: 0, r: 0 }, guard = 0
      let pph = ''
      while (S.mode === 'play' && guard++ < 400000) {
        if (S.round !== st.r) { st = { used: new Set(), n: 0, r: S.round } }
        f(st); dbg.step(1)
        if (S.ph === 'react' && pph !== 'react' && S.choice === 'blame') { bl.n++; if (S.chOk) bl.ok++ }
        if (S.ph === 'verdict' && pph !== 'verdict') { oc[S.outcome] = (oc[S.outcome] || 0) + 1; if (S.unan) un++; if (S.choice !== 'confess' && S.votes.length) { const cnt = {}; for (const v of S.votes) cnt[v.j] = (cnt[v.j] || 0) + 1; const k = Object.values(cnt).sort((a, b) => b - a).join('-'); vp[k] = (vp[k] || 0) + 1; nv++; if (S.farts.some(f => f.who === 2)) { const y = cnt[2] || 0; yv[y] = (yv[y] || 0) + 1 } } }
        if (S.ph === 'peace' && pph !== 'peace') oc.peace = (oc.peace || 0) + 1
        pph = S.ph
      }
      fans += S.stats.fans; sc.push(S.score); if (S.cleared) oc.cleared = (oc.cleared || 0) + 1; rd.push(S.round - (S.lives <= 0 ? 1 : 0))
      document.querySelector('#fx').innerHTML = ''
    }
    sc.sort((a, b) => a - b); rd.sort((a, b) => a - b)
    const q = a => [a[0], a[Math.floor(a.length * 0.25)], a[Math.floor(a.length * 0.5)], a[Math.floor(a.length * 0.75)], a[a.length - 1]]
    const pct = o => Object.fromEntries(Object.entries(o).sort().map(([k, v]) => [k, Math.round(v / Math.max(1, nv) * 100) + '%']))
    res[name] = { score: q(sc), rounds: q(rd), mean: Math.round(sc.reduce((a, b) => a + b, 0) / sc.length), outcomes: oc, votes: pct(vp), youVotes: yv, unan: Math.round(un / Math.max(1, nv) * 100) + '%', blame: bl.n ? Math.round(bl.ok / bl.n * 100) + '% of ' + bl.n : '-', fansPerGame: +(fans / N).toFixed(1) }
  }
  return res
}, N)
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(7), 'score[min,q1,med,q3,max]=', JSON.stringify(v.score), 'mean=', v.mean, 'rounds=', JSON.stringify(v.rounds), JSON.stringify(v.outcomes), '\n        votes=', JSON.stringify(v.votes), 'votesOnYou(when farted)=', JSON.stringify(v.youVotes), 'unanimous=', v.unan, 'blameOK=', v.blame, 'fans/game=', v.fansPerGame)
await b.close(); server.kill()
