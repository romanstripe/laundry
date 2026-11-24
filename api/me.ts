import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './_firebase.js'
import { devKey, isClosed } from './_util.js'
import { HttpError, deviceIdOf, fail } from './_http.js'

const PER_DEVICE = 3

/** GET /api/me?deviceId= → 남은 칸. 사람마다 다른 값이라 캐시하지 않는다. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다') // Cron이 지우기 전(최대 한 시간)에도 보여 주지 않는다
    const dk = devKey(deviceIdOf(req.query.deviceId))
    const snap = await db.collection('items').where('devKey', '==', dk).get()
    const used = snap.docs.filter((d) => d.get('gone') === false).length
    return res.status(200).json({ max: PER_DEVICE, used, left: Math.max(0, PER_DEVICE - used) })
  } catch (e) {
    return fail(res, e, 'me failed')
  }
}
