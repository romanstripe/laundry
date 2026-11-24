import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { claimHash, devKey, isClosed, normalizeCode } from './_util.js'
import { EXPIRE_AT, limitIp } from './_shared.js'
import { HttpError, deviceIdOf, fail, itemIdOf } from './_http.js'

const MAX_FAILS = 5
const LOCK_MS = 24 * 3600_000
const IP_LIMIT = 30 // 1시간. 시작키트에 값이 없어서 임의로 잡음

// 찾아가기: 사연·나도 수·신고 수를 지우고 gone=true. 문서는 남겨서 선반에 흐린 빈 옷걸이 + "주인이 찾아감"이 보이게 한다.
const CLAIMED = { gone: true, story: FieldValue.delete(), metoo: FieldValue.delete(), reports: FieldValue.delete() }

const sameHash = (a: unknown, b: string) => {
  if (typeof a !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** 그 물건의 metoo/reports 문서를 지운다 (500개씩) */
async function cleanup(itemId: string) {
  for (const col of ['metoo', 'reports']) {
    for (;;) {
      const snap = await db.collection(col).where('itemId', '==', itemId).limit(500).get()
      if (snap.empty) break
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      if (snap.size < 500) break
    }
  }
}

/**
 * POST /api/claim
 *  - { itemId, deviceId }       : 이 기기가 맡긴 물건이면 바로 처리
 *  - { no, claimCode }          : 다른 폰에서 보관 번호 + 찾는 번호로 확인.
 *                                 틀리면 claimFail/{no}에 횟수 +1, 5번 틀리면 24시간 잠금. IP 제한도 같이 적용.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다')

    const body = (typeof req.body === 'object' && req.body) || {}

    // ── 기기로 확인 ──
    if (body.claimCode === undefined) {
      const dk = devKey(deviceIdOf(body.deviceId))
      const itemId = itemIdOf(body.itemId)
      await limitIp(req, 'claim', IP_LIMIT, '잠시 후 다시 시도해 주세요')
      const ref = db.doc(`items/${itemId}`)
      await db.runTransaction(async (tx) => {
        const item = await tx.get(ref)
        if (!item.exists) throw new HttpError(404, 'gone', '찾을 수 없는 물건입니다')
        if (item.get('devKey') !== dk) throw new HttpError(403, 'not_mine', '이 폰에서 맡긴 물건이 아닙니다')
        if (item.get('gone') === true) throw new HttpError(409, 'gone', '이미 찾아간 물건입니다')
        tx.update(ref, CLAIMED)
      })
      await cleanup(itemId)
      return res.status(200).json({ ok: true, id: itemId })
    }

    // ── 번호 + 찾는 번호로 확인 ──
    const no = Number(body.no)
    if (!Number.isInteger(no) || no < 10 || no > 99_999) throw new HttpError(400, 'bad_no', '보관 번호를 확인해 주세요')
    const code = typeof body.claimCode === 'string' ? normalizeCode(body.claimCode) : ''
    if (code.length !== 6) throw new HttpError(400, 'bad_code', '찾는 번호는 6자리입니다') // 모양이 틀린 건 횟수에 안 센다
    await limitIp(req, 'claim', IP_LIMIT, '잠시 후 다시 시도해 주세요')

    const out = await db.runTransaction(async (tx) => {
      const failRef = db.doc(`claimFail/${no}`)
      const [fl, num] = await tx.getAll(failRef, db.doc(`numbers/${no}`))
      const now = Date.now()
      const lockedUntil = fl.get('lockedUntil') as Timestamp | undefined
      if (lockedUntil && lockedUntil.toMillis() > now) return { status: 'locked' as const }

      const itemId = num.get('itemId') as string | undefined
      const item = itemId ? await tx.get(db.doc(`items/${itemId}`)) : null
      // 없는 번호도 틀린 코드와 똑같이 보이게 한다 (번호가 쓰였는지 코드로 알아내지 못하게)
      const hashOk = !!item?.exists && sameHash(item.get('claimHash'), claimHash(no, code))

      if (item && hashOk) {
        if (item.get('gone') === true) return { status: 'gone' as const }
        tx.update(item.ref, CLAIMED)
        if (fl.exists) tx.delete(failRef)
        return { status: 'ok' as const, id: item.id }
      }

      // 틀림: 잠금이 풀린 뒤라면 0부터 다시 센다
      const prev = lockedUntil ? 0 : ((fl.get('count') as number | undefined) ?? 0)
      const count = prev + 1
      const locks = count >= MAX_FAILS
      tx.set(failRef, {
        count,
        ...(locks ? { lockedUntil: Timestamp.fromMillis(now + LOCK_MS) } : {}),
        expireAt: EXPIRE_AT,
      })
      return { status: 'wrong' as const, left: Math.max(0, MAX_FAILS - count), locked: locks }
    })

    if (out.status === 'ok') {
      await cleanup(out.id)
      return res.status(200).json({ ok: true, id: out.id })
    }
    if (out.status === 'gone') throw new HttpError(409, 'gone', '이미 찾아간 물건입니다')
    if (out.status === 'locked' || out.locked) {
      throw new HttpError(429, 'locked', '5번 틀려 24시간 동안 잠겼습니다. 내일 다시 시도해 주세요.')
    }
    throw new HttpError(401, 'wrong', `보관 번호나 찾는 번호가 맞지 않습니다 (${out.left}번 남음)`)
  } catch (e) {
    return fail(res, e, 'claim failed')
  }
}
