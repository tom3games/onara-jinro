// verify.mjs の共通部品。コピーして __fw を置き換え、ゲーム固有のテストを足す。node verify.mjs
import { chromium, webkit } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5521
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
// テストは必ず await する（しないと例外が素通りして全部 pass になる）
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
// 日本語ロケール固定・エラー収集つきでページを開く
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__fwReady, null, { timeout: 10000 })
  return p
}
// 横のはみ出し
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
// 一画面に収まる（縦スクロール不要・ボタンが画面内）
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) canvas')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
// 描画の輝度の散らばり（ほぼ単色＝何も描けていない）
const variance = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 13) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
}, sel)
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})


const G = fn => p.evaluate(fn)
await p.evaluate(() => fw.dbg.pause())
await p.click('#bStart')
await t('始めると1回戦のしずかな時間になる', async () => { const r = await G(() => [fw.S.mode, fw.S.ph, fw.S.round, document.querySelector('#farts').hidden]); expect(r[0] === 'play' && r[1] === 'quiet' && r[2] === 1 && !r[3], r); return r })
await t('鐘に合わせたブボボッは音が消え、100点が仮に乗る', async () => {
  const r = await G(() => { fw.dbg.toPeak('bell'); fw.pressFart('bubo'); const f = fw.S.farts.at(-1); return { mask: f.mask, aud: f.audible, ev: f.ev, pend: fw.S.pend } })
  expect(r.mask === 1 && r.aud === 0 && r.ev === 'bell' && r.pend === 100, JSON.stringify(r)); return r
})
await t('続けて押してもクールダウン中は出ない', async () => { const r = await G(() => fw.pressFart('pu')); expect(r === false, r) })
await t('音の無い時のブボボッは丸聞こえ・全員が振り向く', async () => {
  const r = await G(() => { fw.dbg.step(140); while (fw.S.ph === 'quiet' && fw.S.evs.some(e => fw.S.t >= e.tp && fw.S.t <= e.tp + e.dur)) fw.dbg.step(1); fw.pressFart('bubo'); const f = fw.S.farts.at(-1); return { aud: f.audible, looking: fw.S.gz.filter(g => g === 2).length } })
  expect(r.aud === 1 && r.looking >= 2, JSON.stringify(r)); return r
})
await t('音が鳴った（鐘・おなら・BGM）', async () => { const r = await G(() => fw.Snd.played); const fw0 = await G(() => ({ want: fw.Snd.want, st: fw.Snd.ctx && fw.Snd.ctx.state })); expect(r.bell && r['fart:bubo'] && fw0.want === 'night', JSON.stringify([r, fw0])); return Object.keys(r).length })
await t('会議→吹き出しは同時に2つまで→4択が出る', async () => {
  const r = await G(() => { let mx = 0; while (fw.S.ph === 'quiet' || fw.S.ph === 'meet') { fw.dbg.step(1); mx = Math.max(mx, document.querySelectorAll('#fx .sb').length) } return { ph: fw.S.ph, mx, choose: !document.querySelector('#choose').hidden, E: fw.S.E.map(x => +x.toFixed(2)) } })
  expect(r.ph === 'choose' && r.mx <= 2 && r.mx >= 1 && r.choose, JSON.stringify(r)); return r
})
await t('丸聞こえで出した後は疑いがあなたに集まる', async () => { const r = await G(() => fw.S.E); expect(r[2] === Math.max(...r), JSON.stringify(r)) })
await t('なすりつける→相手を選ぶ→投票→判定', async () => {
  await p.click('#c_blame'); expect(!(await p.isHidden('#pickRow')), 'pick hidden')
  await p.click('#pickRow [data-i="3"]')
  const r = await G(() => { const seen = new Set(); let out = ''; while (fw.S.ph !== 'quiet' && fw.S.ph !== 'over' && seen.size < 9) { fw.dbg.step(1); seen.add(fw.S.ph); if (fw.S.ph === 'verdict') out = fw.S.outcome } return { seen: [...seen], out, lives: fw.S.lives, score: fw.S.score, culprit: fw.S.culprit } })
  expect(r.seen.includes('vote') && r.seen.includes('verdict') && r.out, JSON.stringify(r)); return r
})
await t('票数で段階が決まる（0票=セーフ+完全犯罪 / 1=8割 / 2=半分 / 3=バレ / 4=完全バレ+次の回に疑い）', async () => {
  const q = await G(() => {
    const S = fw.S, out = []
    for (const yv of [0, 1, 2, 3, 4]) {
      S.ph = 'vote'; S.t = 9; S.choice = 'feign'; S.pend = 100; S.lives = 3; S.score = 0; S.farts = [{ who: 2, id: 'bubo', wit: [], gl: [] }]; S.lifts = []; S.carryNext = 0
      const vv = [0, 1, 3, 4].map((c, k) => ({ c, j: k < yv ? 2 : -1, shown: true })); S.votes = vv
      S.cnt = [0, 0, yv, 0, 0]; S.culprit = yv >= 2 ? 2 : -1; S.unan = yv === 4
      fw.dbg.step(1); out.push([yv, S.outcome, S.score, S.lives, S.carryNext])
    }
    return out
  })
  const want = [[0, 'tier0', 130, 3, 0], [1, 'tier1', 80, 3, 0], [2, 'tier2', 50, 3, 0], [3, 'caught', 0, 2, 0], [4, 'caught', 0, 2, 0.8]]
  expect(JSON.stringify(q) === JSON.stringify(want), JSON.stringify(q)); return q
})
await t('濡れ衣は票数でボーナスが変わる（2票=小 / 3票=大）・自白は半分+20', async () => {
  const q = await G(() => {
    const S = fw.S, out = {}
    for (const n of [2, 3]) {
      S.choice = 'feign'; S.pend = 100; S.farts = [{ who: 2, id: 'bubo', wit: [], gl: [] }]; S.lifts = []; S.cnt = [0, 0, 0, n, 0]; S.culprit = 3; S.votes = []; S.ph = 'vote'; S.t = 9; const s0 = S.score; fw.dbg.step(1); out['f' + n] = [S.outcome, S.score - s0]
    }
    S.choice = 'confess'; S.pend = 100; S.farts = [{ who: 2, id: 'bubo', wit: [], gl: [] }]; S.culprit = 2; S.ph = 'react'; S.t = 9; S.respQ = null; const sc1 = S.score, l1 = S.lives; fw.dbg.step(1); out.confess = [S.outcome, S.score - sc1, S.lives - l1]
    return out
  })
  // 0票なので 100 + 完全犯罪30 に、濡れ衣 2票=+30 / 3票=+60
  expect(q.f2[0] === 'framed' && q.f2[1] === 160 && q.f3[1] === 190 && q.confess[0] === 'confess' && q.confess[1] === 70 && q.confess[2] === 0, JSON.stringify(q)); return q
})
await t('すかし連打は匂いがたまって「ざわざわ」になる', async () => {
  const r = await G(() => { fw.dbg.seed(77); fw.startRun(); fw.dbg.step(30); let n = 0; while (fw.S.ph === 'quiet') { if (fw.pressFart('suka')) n++; fw.dbg.step(1) } return { n, zawa: fw.S.zawa, smell: +fw.S.smell.toFixed(2) } })
  expect(r.zawa && r.n >= 6, JSON.stringify(r)); return r
})
await t('8回戦を通すと年越し→結果（X ポストの本文と URL）', async () => {
  const r = await G(() => {
    const S = fw.S; fw.dbg.seed(5); fw.startRun(); let g = 0
    while (S.mode === 'play' && g++ < 200000) { if (S.ph === 'choose') fw.choose('feign'); fw.dbg.step(1) }
    fw.dbg.finishReveal(); const x = fw.xPost()
    return { mode: S.mode, cleared: S.cleared, rounds: S.result.rounds, score: S.result.score, lives: S.lives, x: x.text, url: x.url, href: x.href.startsWith('https://x.com/intent/post?') }
  })
  expect(r.mode === 'result' && r.cleared && r.rounds === 8 && r.x.includes(String(r.score)) && r.x.includes('#おなら人狼') && r.url === 'https://tom3games.github.io/onara-jinro/' && r.href, JSON.stringify(r)); return r
})
await t('結果画像が描ける（写真入り・保存用カード）', async () => {
  const v = await variance(p, '#rPhoto'); expect(v > 50, 'photo var ' + v)
  const c = await G(() => { const cv = fw.drawCard(); return [cv.width, cv.height, cv.toDataURL('image/png').length] }); expect(c[0] === 1080 && c[2] > 50000, c)
  return [v, c]
})
await p.screenshot({ path: `${ROOT}/shots/v-result.png` })
await t('英語に切り替えると文言が変わり、はみ出さない', async () => {
  await p.click('#bLang')
  const r = await G(() => ({ rank: document.querySelector('#rRank').textContent, again: document.querySelector('#bAgain').textContent, lang: document.documentElement.lang }))
  const o = await overflow(p)
  expect(r.lang === 'en' && /Again/.test(r.again) && /[A-Za-z]/.test(r.rank) && o.sw <= o.W && !o.bad.length, JSON.stringify([r, o])); await p.click('#bLang'); return r
})
// ---- 判定は決定的（推理と技術で決まる）
// 状況を手で組んで会議から先を回す
const setup = (o) => p.evaluate(o => {
  const S = fw.S; fw.dbg.seed(11); fw.startRun(); S.cpuPlan = []; S.resPlan = []; S.evs = []
  S.farts = o.farts.map(f => ({ wit: [], gl: [], mask: 0, audible: 0, smellAt: 0, t: 1, ...f })); S.lifts = o.lifts || []; S.fans = o.fans || []; S.carry = [0, 0, 0, 0, 0]
  S.t = 99; S.ph = 'quiet'; fw.dbg.step(1)
  while (S.ph === 'meet') fw.dbg.step(1)
  return { ph: S.ph, said: S.said.map(x => x.type + '>' + x.about), sniffer: S.sniffer }
}, o)
const run = (kind, target) => p.evaluate(([kind, target]) => { const S = fw.S; fw.choose(kind, target); const ok = S.chOk, reason = S.reason; while (S.ph !== 'verdict' && S.mode === 'play') fw.dbg.step(1); return { ok, reason, votes: S.votes.map(v => v.j), outcome: S.outcome, cnt: S.cnt } }, [kind, target])
await t('同じ seed・同じ操作なら判定も同じ（結果に乱数が入っていない）', async () => {
  const play = () => G(() => {
    const S = fw.S; fw.dbg.seed(321); fw.startRun(); const log = []; let g = 0, pph = ''
    while (S.mode === 'play' && S.round <= 4 && g++ < 60000) {
      if (S.ph === 'quiet') { const pk = S.evs.find(e => S.t >= e.tp && S.t <= e.tp + e.dur); if (pk && pk.type === 'bell') fw.pressFart('bubo') }
      if (S.ph === 'choose') { const cf = S.farts.find(f => f.who !== 2); cf ? fw.choose('blame', cf.who) : fw.choose('blame', 3) }
      fw.dbg.step(1)
      if (S.ph === 'verdict' && pph !== 'verdict') log.push(S.round + ':' + S.outcome + ':' + S.votes.map(v => v.j).join('') + ':' + S.score)
      pph = S.ph
    }
    return log.join(' ')
  })
  const a = await play(), b = await play(); expect(a === b && a.length > 10, a + ' / ' + b); return a
})
await t('本当にこいた人を指すと必ず通る', async () => {
  await setup({ farts: [{ who: 2, id: 'suka' }, { who: 0, id: 'suka', t: 3 }] })
  const r = await run('blame', 0); expect(r.ok && r.reason === 'real', JSON.stringify(r)); return r
})
await t('座り直しただけの人を指すと証拠次第（隣で座り直し=通る / 丸聞こえなら通らない）', async () => {
  await setup({ farts: [{ who: 2, id: 'suka' }], lifts: [{ who: 3, t: 4, real: false, seen: [] }] })
  const a = await run('blame', 3)
  await setup({ farts: [{ who: 2, id: 'bubo', audible: 1 }], lifts: [{ who: 3, t: 4, real: false, seen: [] }] })
  const b = await run('blame', 3)
  expect(a.ok && a.reason !== 'real' && !b.ok && b.reason === 'ngSound', JSON.stringify([a, b])); return [a.reason, b.reason]
})
await t('何もしていない離れた人を指すと通りにくい', async () => {
  await setup({ farts: [{ who: 2, id: 'suka' }] })
  const r = await run('blame', 0); expect(!r.ok, JSON.stringify(r)); return r.reason
})
await t('逆ギレは言い出しっぺが本当にこいていた時だけ通る', async () => {
  const s1 = await setup({ farts: [{ who: 2, id: 'suka' }, { who: 3, id: 'suka', t: 2 }] }); const a = await run('rage')
  const s2 = await setup({ farts: [{ who: 2, id: 'suka' }] }); const b = await run('rage')
  expect(s1.sniffer === 3 && a.ok && !b.ok, JSON.stringify([s1, a.ok, s2, b.ok])); return [s1.sniffer, s2.sniffer]
})
await t('しらばっくれる: 丸聞こえ・目撃は通らない / 隠せていれば通る', async () => {
  await setup({ farts: [{ who: 2, id: 'bubo', mask: 1 }] }); const a = await run('feign')
  await setup({ farts: [{ who: 2, id: 'bubo', mask: 1, wit: [1] }] }); const b = await run('feign')
  await setup({ farts: [{ who: 2, id: 'bubo', audible: 1 }] }); const c = await run('feign')
  expect(a.ok && !b.ok && b.reason === 'feignNgSaw' && !c.ok, JSON.stringify([a, b, c])); return [a.reason, b.reason, c.reason]
})
await t('会議の発言は証拠の種類に合う（匂いだけなら匂いの言い方、音なら音）', async () => {
  const a = await setup({ farts: [{ who: 3, id: 'suka' }] }); const la = await G(() => fw.S.meetQ.slice(1).map(q => q.text))
  const b = await setup({ farts: [{ who: 2, id: 'bubo', audible: 1 }] }); const lb = await G(() => fw.S.meetQ.slice(1).map(q => q.text))
  expect(a.said.every(x => x.startsWith('smell')) && la.every(t => /匂|側|空気/.test(t)) && b.said[0].startsWith('sound') && /音|聞こえ/.test(lb[0]), JSON.stringify([a, la, b, lb])); return [la, lb]
})
await t('CPU の性格で投票が分かれる例（耳の遠いじいちゃん・迷った時の性格）', async () => {
  const r = await G(() => {
    const S = fw.S; S.smE = [0, 0, 0, 0, 0]; S.said = []
    S.V = { 0: [0, 0.9, 1.0, 0.1, 0], 1: [0, 0, 1.0, 0.9, 0], 3: [0, 0.9, 1.0, 0, 0], 4: [0, 0.1, 1.0, 0.9, 0] }
    return [0, 1, 3, 4].map(c => fw.voteOf(c))
  })
  // 1位と2位が近い時: じいちゃんはあなたをかばう / おじさんは2位を選ぶ / おかん・いとこは1位
  expect(r[0] === 1 && r[1] === 2 && r[2] === 1 && r[3] === 2, JSON.stringify(r)); return r
})
await t('満場一致は1.5〜6.5割（普通に遊ぶ人で 6 ゲーム）、割れる回もある', async () => {
  const r = await G(() => {
    const S = fw.S; let n = 0, un = 0, split = 0
    for (let g = 0; g < 6; g++) {
      fw.dbg.seed(700 + g); fw.startRun(); let k = 0, pph = '', st = 0
      while (S.mode === 'play' && k++ < 120000) {
        if (S.ph === 'quiet') { const pk = S.evs.find(e => e.type !== 'cat' && S.t >= e.tp + 0.3 && S.t <= e.tp + e.dur); if (pk && st !== S.round) { fw.pressFart(pk.type === 'bell' ? 'bubo' : 'pu'); st = S.round } }
        else if (S.ph === 'choose') { const cf = S.farts.find(f => f.who !== 2); cf ? fw.choose('blame', cf.who) : fw.choose('feign') }
        fw.dbg.step(1)
        if (S.ph === 'verdict' && pph !== 'verdict' && S.choice !== 'confess') { n++; if (S.unan) un++; if (Math.max(...S.cnt) <= 2) split++ }
        pph = S.ph
      }
    }
    return { n, un: +(un / n).toFixed(2), split: +(split / n).toFixed(2) }
  })
  expect(r.un >= 0.15 && r.un <= 0.65 && r.split >= 0.2, JSON.stringify(r)); return r
})
// ---- 猫・うちわ
await t('猫の鳴く窓(0.35秒)の中のぷっは消える・窓の外とブボボッは丸聞こえ', async () => {
  const r = await G(() => {
    const S = fw.S; fw.dbg.seed(11); fw.startRun()
    S.evs = [{ type: 'cat', src: -1, tw: 1, tp: 3, dur: fw.D.cat.win, walk: 5 }]; S.cpuPlan = []; S.resPlan = []
    const at = (t, id) => { S.t = t; S.cd = 0; fw.doFart(2, id); return S.farts.at(-1).audible }
    return { inPu: at(3.1, 'pu'), inSuka: at(3.2, 'suka'), inBubo: at(3.3, 'bubo'), afterPu: at(3.4, 'pu'), beforePu: at(2.95, 'pu') }
  })
  expect(r.inPu === 0 && r.inSuka === 0 && r.inBubo === 1 && r.afterPu === 0.5 && r.beforePu === 0.5, JSON.stringify(r)); return r
})
await t('猫が鳴くと家族が猫を見る・鳴き声が鳴る', async () => {
  const r = await G(() => { const S = fw.S; fw.dbg.seed(11); fw.startRun(); S.evs = [{ type: 'cat', src: -1, tw: 0.2, tp: 1, dur: 0.35, walk: 5 }]; S.cpuPlan = []; S.resPlan = []; const m0 = fw.Snd.played.meow || 0; while (S.t < 1.1) fw.dbg.step(1); return { gz: [0, 1, 3, 4].map(c => S.gz[c]), cat: fw.CAT.on, meow: (fw.Snd.played.meow || 0) - m0 } })
  expect(r.gz.every(g => g === -2) && r.cat && r.meow === 1, JSON.stringify(r)); return r
})
await t('うちわ: 出した直後・匂わない時・見られてる時はバレ、良い使い方は疑われない。2回で終わり', async () => {
  const r = await G(() => {
    const S = fw.S, k = []
    const fresh = () => { fw.dbg.seed(11); fw.startRun(); S.evs = []; S.cpuPlan = []; S.resPlan = []; S.gz = [-1, -1, -1, -1, -1]; S.t = 5 }
    fresh(); S.smell = 2; S.farts = [{ who: 2, id: 'suka', t: 3, wit: [], gl: [] }]; fw.pressFan(); k.push(S.fans[0].kind)
    fresh(); S.smell = 0.1; fw.pressFan(); k.push(S.fans[0].kind)
    fresh(); S.smell = 2; S.gz[1] = 2; fw.pressFan(); k.push(S.fans[0].kind)
    fresh(); S.smell = 2; S.farts = [{ who: 3, id: 'suka', t: 1, wit: [], gl: [] }]; const sm0 = S.smell; fw.pressFan(); k.push(S.fans[0].kind, +(S.smell / sm0).toFixed(2))
    S.fanCd = 0; const two = fw.pressFan(); S.fanCd = 0; const three = fw.pressFan()
    return { k, two, three, left: S.fanLeft }
  })
  expect(JSON.stringify(r.k) === JSON.stringify(['fanFart', 'fanCold', 'fanSeen', 'ok', 0.3]) && r.two === true && r.three === false && r.left === 0, JSON.stringify(r)); return r
})
await t('うちわの悪い使い方は会議の発言と疑いに出る', async () => {
  await setup({ farts: [{ who: 2, id: 'suka', t: 3 }], fans: [{ t: 4, kind: 'fanFart', seenBy: [] }] })
  const r = await G(() => ({ said: fw.S.said.map(x => x.type), text: fw.S.meetQ.slice(1).map(q => q.text), top: fw.S.E.indexOf(Math.max(...fw.S.E)) }))
  expect(r.said[0] === 'fanFart' && /あおい/.test(r.text[0]) && r.top === 2, JSON.stringify(r)); return r
})
// ---- 音（鳴らさずに呼ばれ方を見る）
await t('おならの音は毎回ちがう（3種×15回で直前と同じ音0）・かき消し=こもる / 丸聞こえ=響く', async () => {
  const r = await G(() => {
    const Snd = fw.Snd; Snd.fartLog.length = 0; let same = 0
    for (const k of ['suka', 'pu', 'bubo']) for (let i = 0; i < 15; i++) { const a = Snd.fart(k, 'plain'), b = Snd.fartLog.at(-2); if (b && b.kind === k && b.chops === a.chops && Math.abs(b.f0 - a.f0) / a.f0 < 0.06 && Math.abs(b.dur - a.dur) / a.dur < 0.12) same++ }
    const S = fw.S; fw.dbg.seed(11); fw.startRun(); S.evs = [{ type: 'bell', src: -1, tw: 1, tp: 2, dur: 1.4 }]; S.cpuPlan = []; S.resPlan = []
    S.t = 2.2; fw.doFart(2, 'bubo'); const masked = Snd.fartLog.at(-1).how
    S.t = 5; S.cd = 0; fw.doFart(2, 'bubo'); const loud = Snd.fartLog.at(-1).how
    S.evs = [{ type: 'phone', src: 4, tw: 6, tp: 6, dur: 1.6 }]; S.t = 6.2; fw.doFart(2, 'pu'); const half = Snd.fartLog.at(-1).how
    return { same, masked, loud, half, echo: Snd.played.echo || 0 }
  })
  expect(r.same === 0 && r.masked === 'masked' && r.loud === 'busted' && r.half === 'half' && r.echo >= 1, JSON.stringify(r)); return r
})
await t('BGM: 静か→会議→判定で切り替わる・匂いがたまると崩れる', async () => {
  const r = await G(() => {
    const S = fw.S, Snd = fw.Snd, seq = []
    fw.dbg.seed(5); fw.startRun(); seq.push(Snd.want)
    while (S.ph === 'quiet') { if (S.t > 2 && !S.farts.some(f => f.who === 2)) fw.pressFart('suka'); fw.dbg.step(1) } seq.push(Snd.want)
    while (S.ph !== 'choose') fw.dbg.step(1); fw.choose('feign'); while (S.ph !== 'verdict') fw.dbg.step(1); seq.push(Snd.want)
    Snd.track = 'night'; Snd.sour = 0; Snd.bgmLog.length = 0; for (let i = 0; i < 64; i++) Snd.p_night(i, 0)
    const calm = Snd.bgmLog.slice(); Snd.sour = 1; Snd.detMax = 0; Snd.bgmLog.length = 0; for (let i = 0; i < 64; i++) Snd.p_night(i, 0)
    const sour = Snd.bgmLog.slice(), det = Snd.detMax; Snd.sour = 0
    return { seq, calm: [...new Set(calm)], sour: [...new Set(sour)], det: Math.round(det) }
  })
  expect(r.seq[0] === 'night' && r.seq[1] === 'meet' && ['happy', 'sad', 'night'].includes(r.seq[2]) && r.calm.join() === 'calm' && r.sour.join() === 'sour' && r.det >= 15, JSON.stringify(r)); return r
})
await t('通しでエラーなし', async () => { expect(p.errs.length === 0, p.errs.join('|')) })

await p.close()
// ---- 6サイズ × 全画面で一画面に収まる。画面の巡り方はゲームに合わせて書く
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })

  await q.evaluate(() => fw.dbg.pause())
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#bHowBack')
  await q.click('#bStart'); await q.evaluate(() => { fw.dbg.toPeak('bell'); fw.pressFart('bubo'); fw.dbg.step(30); fw.dbg.render() })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => { while (fw.S.ph === 'quiet' || fw.S.ph === 'meet') fw.dbg.step(1); fw.dbg.render() })
  await q.waitForTimeout(450); views.choose = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-choose.png` })
  await q.click('#c_blame'); await q.waitForTimeout(450); views.pick = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-pick.png` })
  await q.click('#pickRow [data-i="1"]'); await q.evaluate(() => { while (fw.S.ph !== 'verdict') fw.dbg.step(1); fw.dbg.step(40); fw.dbg.render() })
  await q.screenshot({ path: `${ROOT}/shots/fit-${name}-verdict.png` })
  await q.evaluate(() => { fw.toResult(); fw.dbg.finishReveal(); fw.dbg.render() })
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()
// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})

await t('WebKit: タッチで始めて、おならボタンが効く', async () => {
  await wp.evaluate(() => fw.dbg.pause()); await wp.tap('#bStart')
  await wp.evaluate(() => fw.dbg.toPeak('bell')); await wp.tap('#f_bubo')
  const r = await wp.evaluate(() => [fw.S.ph, fw.S.pend, fw.S.farts.length]); expect(r[1] === 100 && r[2] >= 1, r); return r
})
await wp.screenshot({ path: `${ROOT}/shots/webkit-play.png` })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
