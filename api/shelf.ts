import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { HttpError, fail } from './_http.js'
import { isClosed } from './_util.js'

const PAGE = 20

/**
 * GET /api/shelf?after=<마지막 createdAt(ms)>
 * 선반(hidden=false)을 최신순 20개씩. offset이 아니라 커서(startAfter)라서 건너뛴 문서의 읽기 비용이 안 든다.
 * - gone=true(주인이 찾아간 것)도 빈 옷걸이로 그리려고 포함하되 story·metoo는 빼고 보낸다.
 * - devKey, claimHash는 절대 응답에 넣지 않는다. "내 것" 표시는 /api/mine으로 따로 받아서 프론트에서 합친다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다') // Cron이 지우기 전(최대 한 시간)에도 보여 주지 않는다

    const a = req.query.after
    const after = typeof a === 'string' && /^\d{1,15}$/.test(a) ? Number(a) : null

    let q = db.collection('items').where('hidden', '==', false).orderBy('createdAt', 'desc')
    if (after !== null) q = q.startAfter(Timestamp.fromMillis(after))

    const snap = await q.limit(PAGE).get()

    const items = snap.docs.map((d) => {
      const gone = d.get('gone') === true
      return {
        id: d.id,
        no: d.get('no') as number,
        emoji: d.get('emoji') as string,
        pad: d.get('pad') as number,
        createdAt: (d.get('createdAt') as Timestamp).toMillis(),
        gone,
        story: gone ? '' : (d.get('story') as string),
        metoo: gone ? 0 : ((d.get('metoo') as number | undefined) ?? 0),
      }
    })
    const next = items.length === PAGE ? items[items.length - 1].createdAt : null

    // 1분마다 새로 만들고 그 사이엔 Vercel 캐시에서 나간다 → Firestore 읽기 비용이 거의 안 난다
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({ items, next })
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store')
    return fail(res, e, 'shelf failed')
  }
}
