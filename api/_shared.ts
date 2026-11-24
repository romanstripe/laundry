import type { VercelRequest } from '@vercel/node'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { ipKey } from './_util.js'
import { HttpError } from './_http.js'

/** 문서가 자동 삭제되는 시각: 한국시간 2027-01-01 00:00 (Firestore TTL은 Timestamp 필드가 필요) */
export const EXPIRE_AT = Timestamp.fromDate(new Date('2027-01-01T00:00:00+09:00'))

/**
 * IP 제한: ipCount/{action}_{ipKey} 를 트랜잭션으로 +1, 한도를 넘으면 429.
 * ipKey는 시간(시 단위)이 섞여 있어 1시간이 지나면 새 문서가 된다. 문서는 2시간 뒤 TTL로 지워진다.
 * action을 나눠 둔 건 맡기기(30회)와 나도(300회)가 서로의 한도를 먹지 않게 하려고.
 */
export async function limitIp(req: VercelRequest, action: string, limit: number, message: string) {
  const ref = db.doc(`ipCount/${action}_${ipKey(req)}`)
  const over = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const count = (snap.get('count') as number | undefined) ?? 0
    if (count >= limit) return true
    tx.set(ref, { count: count + 1, expireAt: Timestamp.fromMillis(Date.now() + 2 * 3600_000) })
    return false
  })
  if (over) throw new HttpError(429, 'rate', message)
}
