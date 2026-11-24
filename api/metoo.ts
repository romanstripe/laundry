import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { devKey, isClosed } from './_util.js'
import { EXPIRE_AT, limitIp } from './_shared.js'
import { HttpError, deviceIdOf, fail, itemIdOf } from './_http.js'

const IP_LIMIT = 300 // 1시간

/**
 * POST /api/metoo  body: { deviceId, itemId } — "나도 이거 잃어버림" 토글.
 * metoo/{itemId}_{devKey} 문서가 있으면 지우고 items.metoo -1, 없으면 만들고 +1. 트랜잭션.
 * 응답: { on, metoo } — 화면은 먼저 바꿔 두고(낙관적 업데이트) 이 값으로 맞춘다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다')

    const body = (typeof req.body === 'object' && req.body) || {}
    const dk = devKey(deviceIdOf(body.deviceId))
    const itemId = itemIdOf(body.itemId)
    await limitIp(req, 'metoo', IP_LIMIT, '잠시 후 다시 눌러 주세요')

    const itemRef = db.doc(`items/${itemId}`)
    const mRef = db.doc(`metoo/${itemId}_${dk}`)
    const out = await db.runTransaction(async (tx) => {
      const [item, m] = await tx.getAll(itemRef, mRef)
      if (!item.exists || item.get('gone') === true || item.get('hidden') === true) {
        throw new HttpError(404, 'gone', '찾을 수 없는 물건입니다')
      }
      if (item.get('devKey') === dk) throw new HttpError(400, 'own', '내가 맡긴 물건에는 누를 수 없습니다')

      const cur = (item.get('metoo') as number | undefined) ?? 0
      if (m.exists) {
        const n = Math.max(0, cur - 1)
        tx.delete(mRef)
        tx.update(itemRef, { metoo: n })
        return { on: false, metoo: n }
      }
      const n = cur + 1
      tx.set(mRef, { itemId, devKey: dk, createdAt: Timestamp.now(), expireAt: EXPIRE_AT })
      tx.update(itemRef, { metoo: n })
      return { on: true, metoo: n }
    })
    return res.status(200).json(out)
  } catch (e) {
    return fail(res, e, 'metoo failed')
  }
}
