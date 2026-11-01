// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
import { chromium, webkit } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const URL0 = 'https://tom3games.github.io/onara-jinro/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(name === 'chromium' ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }); await muteContext(ctx); const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__fwReady, null, { timeout: 15000 })
  // 遊びの通し（タイトル → こたつに入る → 鐘で ブボボッ → 会議 → しらばっくれる → 判定まで）
  await p.evaluate(() => fw.dbg.pause())
  if (opts.hasTouch) await p.tap('#bStart'); else await p.click('#bStart')
  await p.evaluate(() => fw.dbg.toPeak('bell'))
  if (opts.hasTouch) await p.tap('#f_bubo'); else await p.click('#f_bubo')
  await p.evaluate(() => { while (fw.S.ph === 'quiet' || fw.S.ph === 'meet') fw.dbg.step(1); fw.dbg.render() })
  if (opts.hasTouch) await p.tap('#c_feign'); else await p.click('#c_feign')
  const r = await p.evaluate(() => { let o = ''; let g = 0; while (fw.S.ph !== 'quiet' && fw.S.ph !== 'over' && g++ < 2000) { fw.dbg.step(1); if (fw.S.ph === 'verdict') o = fw.S.outcome } fw.dbg.render(); return 'round=' + fw.S.round + ' outcome=' + o + ' score=' + fw.S.score + ' lives=' + fw.S.lives + ' title=' + document.title + ' href=' + location.pathname })
  await p.waitForTimeout(400)
  out.push(`${name}: play=${r}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); const b = await r.arrayBuffer(); return r.status + ' ' + r.headers.get('content-type') + ' ' + b.byteLength + 'B' })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/onara-jinro', 'https://github.com/tom3games/onara-jinro/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${new RegExp(['tmk', '4men'].join(''), 'i').test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
