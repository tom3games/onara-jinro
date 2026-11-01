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
await t('バレたらハート−1・点は没収 / 濡れ衣ならボーナス', async () => {
  const r = await G(() => { const o = []; for (const k of [0, 1]) { fw.dbg.seed(50 + k) } return true })
  // 判定の計算を直接たたく
  const q = await G(() => {
    const S = fw.S, out = {}
    // バレ
    S.ph = 'react'; S.choice = 'feign'; S.pend = 130; S.lives = 3; S.score = 0; S.farts = [{ who: 2, id: 'bubo' }]; S.E = [0, 0, 9, 0, 0]
    S.votes = [0, 1, 3, 4].map(c => ({ c, j: 2 })); S.culprit = 2; fw.S.ph = 'vote'; S.t = 9; fw.dbg.step(1); out.caught = [S.outcome, S.lives, S.score]
    // 濡れ衣
    S.choice = 'blame'; S.pend = 100; S.farts = [{ who: 2, id: 'bubo' }]; S.E = [0, 0, 0, 9, 0]; S.votes = [0, 1, 2, 4].map(c => ({ c, j: 3 })); S.culprit = 3; S.ph = 'vote'; S.t = 9; const sc0 = S.score; fw.dbg.step(1); out.framed = [S.outcome, S.score - sc0]
    // 自白
    S.choice = 'confess'; S.pend = 100; S.farts = [{ who: 2, id: 'bubo' }]; S.culprit = 2; S.ph = 'react'; S.t = 9; S.respQ = null; const sc1 = S.score, l1 = S.lives; fw.dbg.step(1); out.confess = [S.outcome, S.score - sc1, S.lives - l1]
    return out
  })
  expect(q.caught[0] === 'caught' && q.caught[1] === 2 && q.caught[2] === 0 && q.framed[0] === 'framed' && q.framed[1] === 150 && q.confess[0] === 'confess' && q.confess[1] === 70 && q.confess[2] === 0, JSON.stringify(q)); return q
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
