import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * 개발 전용: `npm run dev`만으로 api/ 의 서버 함수를 같이 돌린다. (vercel dev 없이)
 * .env.local 을 읽어서 process.env 에 넣고, /api/<이름> 요청을 api/<이름>.ts 의 default 핸들러로 넘긴다.
 * 배포(Vercel)에는 쓰이지 않는다 — 거기서는 Vercel이 api/ 를 직접 서버 함수로 만든다.
 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const m = url.pathname.match(/^\/api\/([a-z]+)$/) ?? (url.pathname === '/admin' ? [null, 'admin'] : null) // _로 시작하는 파일(내부용)은 열리지 않는다. /admin은 vercel.json rewrite와 같다
        if (!m) return next()

        const send = (code: number, body: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`)
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body: unknown = undefined
          if (raw) {
            try {
              body = JSON.parse(raw)
            } catch {
              body = raw
            }
          }
          const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams), body })
          const vres = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vres
            },
            json(b: unknown) {
              send(res.statusCode || 200, b)
              return vres
            },
            send(b: string) {
              res.end(b)
              return vres
            },
          })
          await mod.default(vreq, vres)
        } catch (e) {
          console.error('[api-dev]', e instanceof Error ? e.message : e)
          if (!res.headersSent) send(500, { error: '잠시 후 다시 시도해 주세요', code: 'server' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDev()],
})
