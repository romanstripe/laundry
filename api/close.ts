import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { db } from './_firebase.js'
import { isClosed } from './_util.js'
import { HttpError, fail } from './_http.js'

// 지울 컬렉션. numbers(보관 번호 자리)는 시작키트 목록에는 없지만 우리가 만든 컬렉션이라 같이 지운다.
// counters는 마지막에.
const COLLECTIONS = ['items', 'metoo', 'reports', 'ipCount', 'claimFail', 'numbers', 'counters']

const BATCH = 500 // 한 번에 지울 수 있는 최대
const PARALLEL = 8 // 500개짜리 배치를 동시에 몇 개 커밋할지
const BUDGET_MS = 270_000 // vercel.json의 maxDuration(300초)보다 조금 짧게. 넘기면 멈추고 남은 건 다시 부르면 이어서 지운다.

const sameSecret = (got: string, want: string) =>
  got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want))

async function wipe(col: string, deadline: number): Promise<{ deleted: number; done: boolean }> {
  let deleted = 0
  for (;;) {
    if (Date.now() > deadline) return { deleted, done: false }
    // 필드를 안 읽는 쿼리(select())로 문서 참조만 가져온다
    const snap = await db.collection(col).select().limit(BATCH * PARALLEL).get()
    if (snap.empty) return { deleted, done: true }
    const jobs: Promise<unknown>[] = []
    for (let i = 0; i < snap.docs.length; i += BATCH) {
      const batch = db.batch()
      snap.docs.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref))
      jobs.push(batch.commit())
    }
    await Promise.all(jobs)
    deleted += snap.size
  }
}

/**
 * GET /api/close — 12/31 자정(한국시간 1/1 0시)에 Vercel Cron이 부른다. (vercel.json: "0 15 31 12 *" = UTC 15시)
 * Authorization 헤더가 `Bearer ${CRON_SECRET}` 일 때만 실행한다. (Vercel이 CRON_SECRET 환경변수 값으로 자동으로 붙여 준다)
 *  - 닫는 시각 전에는 지우지 않는다 (비밀값이 새도 미리 지워지지 않게).
 *  - ?dry=1 이면 아무것도 지우지 않고 컬렉션별 문서 수만 알려 준다 (점검용, 언제든 가능).
 *  - 시간이 모자라면 done:false로 끝난다. 같은 주소를 다시 부르면 이어서 지운다. (그래도 안 지워진 건 TTL이 마저 지운다)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) throw new HttpError(500, 'config', 'CRON_SECRET이 설정되지 않았습니다')
    const got = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    if (!sameSecret(got, `Bearer ${secret}`)) throw new HttpError(401, 'unauthorized', '권한이 없습니다')

    if (req.query.dry === '1') {
      const counts: Record<string, number> = {}
      for (const c of COLLECTIONS) counts[c] = (await db.collection(c).count().get()).data().count
      return res.status(200).json({ dry: true, closed: isClosed(), counts })
    }

    if (!isClosed()) throw new HttpError(409, 'early', '아직 문 닫을 시간이 아닙니다')

    const deadline = Date.now() + BUDGET_MS
    const result: Record<string, { deleted: number; done: boolean }> = {}
    let allDone = true
    for (const c of COLLECTIONS) {
      result[c] = await wipe(c, deadline)
      if (!result[c].done) {
        allDone = false
        break // 시간이 다 됨. 남은 컬렉션은 다시 불렀을 때 이어서
      }
    }
    return res.status(allDone ? 200 : 202).json({ ok: allDone, result })
  } catch (e) {
    return fail(res, e, 'close failed')
  }
}
