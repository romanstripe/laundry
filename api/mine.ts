import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { devKey, isClosed } from './_util.js'
import { HttpError, deviceIdOf, fail } from './_http.js'

/**
 * GET /api/mine?deviceId= → 이 기기가 맡긴 물건(찾아가지 않은 것).
 * 선반 응답은 모두에게 같은 캐시라 "내 것" 표시를 넣을 수 없어서 따로 받는다. 사람마다 다르니 캐시하지 않는다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다') // Cron이 지우기 전(최대 한 시간)에도 보여 주지 않는다
    const dk = devKey(deviceIdOf(req.query.deviceId))
    const [snap, likedSnap] = await Promise.all([
      db.collection('items').where('devKey', '==', dk).get(), // 단일 필드 자동 인덱스
      db.collection('metoo').where('devKey', '==', dk).limit(500).get(), // 내가 "나도"를 누른 물건
    ])
    const items = snap.docs
      .filter((d) => d.get('gone') === false && d.get('hidden') === false)
      .map((d) => ({
        id: d.id,
        no: d.get('no') as number,
        emoji: d.get('emoji') as string,
        pad: d.get('pad') as number,
        createdAt: (d.get('createdAt') as Timestamp).toMillis(),
        story: d.get('story') as string,
        metoo: (d.get('metoo') as number | undefined) ?? 0,
        gone: false,
      }))
      .sort((x, y) => y.createdAt - x.createdAt)
    const liked = likedSnap.docs.map((d) => d.get('itemId') as string)
    return res.status(200).json({ items, liked })
  } catch (e) {
    return fail(res, e, 'mine failed')
  }
}
