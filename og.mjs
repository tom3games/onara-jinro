// SNS用サムネ og.png（1200x630）。node og.mjs
// 自分がこいたのに、おじさんが濡れ衣で全員に指される瞬間を左に、右にタイトルと一言
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5524' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH)
const octx = await b.newContext({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' }); await muteContext(octx); const p = await octx.newPage()
await p.goto('http://localhost:5524/'); await p.waitForFunction(() => window.__fwReady)
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  const { S, dbg, PPL } = fw
  dbg.pause(); dbg.seed(3); fw.startRun(); dbg.step(60)
  S.ph = 'vote'; S.t = 0; S.E = [0, 0, 0, 9, 0]; S.farts = [{ who: 2, id: 'bubo' }]; S.pend = 100; S.choice = 'blame'
  S.votes = [0, 1, 2, 4].map(c => ({ c, j: 3 })); S.culprit = 3
  dbg.step(150)
  fw.doFart && null
  for (const n of PPL) { n.smile = 1 }
  PPL[3].shock = 1; PPL[3].smile = 0; PPL[2].smile = 0.6
  for (const n of PPL) if (n.i !== 3) n.point = 3
  dbg.step(30)
  const c = fw.camera; c.fov = 40; c.setViewOffset(1200, 630, 230, 10, 1200, 630); c.updateProjectionMatrix(); dbg.render()
  document.querySelectorAll('#fx > *').forEach(e => e.remove())
})
await p.addStyleTag({ content: `#corner,.hudTop,.hudBot,.hint{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(42,26,34,0),rgba(42,26,34,.94) 26%);z-index:30}` })
await p.evaluate(() => {
  const ono = (t, x, y, size, rot, col) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:20;font-family:'Dela Gothic One';font-size:${size}px;color:${col};-webkit-text-stroke:4px #1b1620;paint-order:stroke fill;text-shadow:0 6px 0 #1b1620;transform:rotate(${rot}deg);white-space:nowrap`; document.body.appendChild(d) }
  ono('おじさんやろ！', 20, 24, 50, -5, '#ffd21f')
  ono('ぷすぅ…', 380, 290, 40, -8, '#9cc45a'); ono('濡れ衣！', 470, 40, 50, 8, '#ff5a3a')
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:28px;top:0;bottom:0;width:470px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:28px;letter-spacing:.12em;color:#1b1620;background:#9cc45a;padding:6px 16px 5px;border:4px solid #1b1620;transform:rotate(-3deg);box-shadow:4px 4px 0 #1b1620">FART WOLF</div>
  <div style="font-family:'Dela Gothic One';font-size:92px;line-height:1.1;white-space:nowrap;-webkit-text-stroke:3px #1b1620;paint-order:stroke fill;text-shadow:0 7px 0 #1b1620">おなら<span style="color:#ff5a3a">人狼</span></div>
  <div style="font-weight:900;font-size:30px;line-height:1.5;font-family:'Zen Maru Gothic'">大晦日のこたつで<br>こっそり<span style="color:#9cc45a">屁</span>をこいて、<br><span style="color:#ffd21f">おじさんのせい</span>にしろ。</div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(300)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
