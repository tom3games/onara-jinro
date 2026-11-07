// fps とドローコールの目安。node _fps.mjs [port]（GPU 描画で実時間に遊ばせる）
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname, PORT = +(process.argv[2] || 5525)
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const [w, h, dpr] of [[390, 844, 2], [844, 390, 2], [1440, 900, 1]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }); await muteContext(ctx)
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__fwReady)
  await p.evaluate(() => { fw.dbg.seed(7); fw.startRun() })
  // 実時間で 5 秒（しずかな時間）。途中で匂いをためる
  const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); setTimeout(() => fw.pressFart('suka'), 800); setTimeout(() => fw.pressFart('suka'), 3200); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(Math.round(n / 5)) }; requestAnimationFrame(f) }))
  const r = await p.evaluate(() => { fw.dbg.pause(); const gl = fw.renderer.getContext(), px = new Uint8Array(4); const t0 = performance.now(); for (let i = 0; i < 120; i++) { fw.dbg.step(1); fw.dbg.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) } const ms = (performance.now() - t0) / 120; return { ms: ms.toFixed(2), calls: fw.renderer.info.render.calls, tris: fw.renderer.info.render.triangles } })
  console.log(`${w}x${h}@${dpr}: fps=${fps} frame=${r.ms}ms calls=${r.calls} tris=${r.tris}`)
  await ctx.close()
}
await b.close(); server.kill()
