import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { devKey, isClosed } from './_util.js'
import { EXPIRE_AT, limitIp } from './_shared.js'
import { HttpError, deviceIdOf, fail, itemIdOf } from './_http.js'

const HIDE_AT = 3 // 신고 몇 번에 숨길지는 아직 고민 중 — 일단 3회
const IP_LIMIT = 60 // 1시간 (시작키트에 정해진 값이 없어서 임의로 잡음)
// 욕설·비하·혐오 / 개인정보 / 자해·위험한 내용 / 성적인 내용 / 광고·도배 / 기타
const REASONS = ['abuse', 'privacy', 'selfharm', 'sexual', 'spam', 'other']

/**
 * POST /api/report  body: { deviceId, itemId, reason }
 * reports/{itemId}_{devKey} 로 기기당 1번만. reports가 HIDE_AT가 되면 hidden=true — 선반에서 흔적 없이 빠진다.
 * 응답: { ok, already, hidden }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다')

    const body = (typeof req.body === 'object' && req.body) || {}
    const dk = devKey(deviceIdOf(body.deviceId))
    const itemId = itemIdOf(body.itemId)
    const reason = typeof body.reason === 'string' && REASONS.includes(body.reason) ? body.reason : null
    if (!reason) throw new HttpError(400, 'bad_reason', '신고 사유를 골라 주세요')
    await limitIp(req, 'report', IP_LIMIT, '잠시 후 다시 신고해 주세요')

    const itemRef = db.doc(`items/${itemId}`)
    const rRef = db.doc(`reports/${itemId}_${dk}`)
    const out = await db.runTransaction(async (tx) => {
      const [item, r] = await tx.getAll(itemRef, rRef)
      if (!item.exists || item.get('gone') === true) throw new HttpError(404, 'gone', '찾을 수 없는 물건이에요')
      if (item.get('devKey') === dk) throw new HttpError(400, 'own', '내가 맡긴 물건은 신고할 수 없어요')
      const hidden = item.get('hidden') === true
      if (r.exists || hidden) return { ok: true, already: r.exists, hidden }

      const n = ((item.get('reports') as number | undefined) ?? 0) + 1
      tx.set(rRef, { itemId, reason, createdAt: Timestamp.now(), expireAt: EXPIRE_AT })
      tx.update(itemRef, n >= HIDE_AT ? { reports: n, hidden: true } : { reports: n })
      return { ok: true, already: false, hidden: n >= HIDE_AT }
    })
    return res.status(200).json(out)
  } catch (e) {
    return fail(res, e, 'report failed')
  }
}
