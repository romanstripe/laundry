import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomInt } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { claimHash, devKey, isClosed, makeClaimCode } from './_util.js'
import { EXPIRE_AT, limitIp } from './_shared.js'
import { moderate } from './_moderate.js'
import { HttpError, deviceIdOf, fail } from './_http.js'

const MAX_ITEMS = 99_999 // 전체 상한
const PER_DEVICE = 3
const IP_LIMIT = 30 // 1시간(ipKey가 시간마다 바뀜)
const STORY_MIN = 5
const STORY_MAX = 120
const SMALL_TOTAL = 9_990 // 10~9999 (2·3·4자리) 칸 수

const POOL = ['☂️', '🔑', '🧤', '✉️', '🎧', '📷', '🌙', '🚲', '🧳', '💤', '🧩', '🕯️', '🎈', '🧦', '🪁', '📼', '🧷', '🪞']

const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** 정확히 한 글자(grapheme)이고 이모지 또는 국기(지역 표시 문자 2개)여야 한다 */
function validEmoji(e: string): boolean {
  const gs = [...seg.segment(e)]
  if (gs.length !== 1) return false
  const g = gs[0].segment
  if (g.length > 20) return false
  if (/^\p{Regional_Indicator}{2}$/u.test(g)) return true
  return /\p{Extended_Pictographic}/u.test(g)
}

/** 111·777·1234·4321·1000·2000·2026·1231처럼 눈에 띄는 번호는 뽑지 않는다 */
function boring(n: number): boolean {
  const s = String(n)
  if (n % 100 === 0) return true // 딱 떨어지는 수
  if (/^(\d)\1+$/.test(s)) return true // 같은 숫자 반복
  const d = [...s].map(Number)
  if (d.every((x, i) => i === 0 || x === d[i - 1] + 1)) return true // 연속 증가
  if (d.every((x, i) => i === 0 || x === d[i - 1] - 1)) return true // 연속 감소
  return n === 2026 || n === 1231
}

/** 2·3·4자리(10~9999) 칸이 80% 차면 5자리(10000~99999)도 반반 섞는다. 한 자리 수는 쓰지 않는다. */
function candidates(mixFive: boolean, count = 8): number[] {
  const out = new Set<number>()
  let guard = 0
  while (out.size < count && guard++ < 200) {
    const n = mixFive && randomInt(2) === 1 ? randomInt(10_000, 100_000) : randomInt(10, 10_000)
    if (!boring(n)) out.add(n)
  }
  return [...out]
}

async function activeCount(dk: string, tx?: FirebaseFirestore.Transaction): Promise<number> {
  const q = db.collection('items').where('devKey', '==', dk) // 단일 필드라 자동 인덱스로 충분
  const snap = await (tx ? tx.get(q) : q.get())
  return snap.docs.filter((d) => d.get('gone') === false).length
}

class NoFreeNumber extends Error {}

async function store(p: { dk: string; emoji: string; story: string; claimCode: string }) {
  const pad = randomInt(1, 13) // 전표 1~12 (서버가 랜덤으로 정해 저장)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.runTransaction(async (tx) => {
        const counterRef = db.doc('counters/items')
        const c = await tx.get(counterRef)
        const count = (c.get('count') as number | undefined) ?? 0
        const small = (c.get('small') as number | undefined) ?? 0
        if (count >= MAX_ITEMS) throw new HttpError(409, 'full', '보관함이 가득 찼습니다')
        if ((await activeCount(p.dk, tx)) >= PER_DEVICE) {
          throw new HttpError(409, 'slots', '맡길 칸을 모두 썼습니다')
        }

        const cands = candidates(small >= SMALL_TOTAL * 0.8)
        const snaps = await tx.getAll(...cands.map((n) => db.doc(`numbers/${n}`)))
        const free = snaps.findIndex((s) => !s.exists)
        if (free < 0) throw new NoFreeNumber()
        const no = cands[free]

        const itemRef = db.collection('items').doc()
        const createdAt = Timestamp.now()
        tx.set(db.doc(`numbers/${no}`), { itemId: itemRef.id, expireAt: EXPIRE_AT })
        tx.set(itemRef, {
          no,
          emoji: p.emoji,
          story: p.story,
          pad,
          devKey: p.dk,
          claimHash: claimHash(no, p.claimCode),
          createdAt,
          gone: false,
          hidden: false,
          reports: 0,
          metoo: 0,
          expireAt: EXPIRE_AT,
        })
        tx.set(counterRef, { count: count + 1, small: small + (no < 10_000 ? 1 : 0) }, { merge: true })
        return { id: itemRef.id, no, pad, createdAt: createdAt.toMillis() }
      })
    } catch (e) {
      if (e instanceof NoFreeNumber) continue
      throw e
    }
  }
  throw new HttpError(503, 'busy', '잠시 후 다시 맡겨 주세요')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')

    // 1. 문 닫음
    if (isClosed()) throw new HttpError(403, 'closed', '문을 닫았습니다')

    // 2. 검사
    const body = (typeof req.body === 'object' && req.body) || {}
    const dk = devKey(deviceIdOf(body.deviceId))
    const rawEmoji = typeof body.emoji === 'string' ? body.emoji.trim() : ''
    const story = typeof body.story === 'string' ? body.story.trim() : ''
    const randomEmoji = rawEmoji === ''
    if (!randomEmoji && !validEmoji(rawEmoji)) throw new HttpError(400, 'bad_emoji', '이모지는 하나만 넣어 주세요')
    const len = [...story].length
    if (len < STORY_MIN || len > STORY_MAX) {
      throw new HttpError(400, 'bad_story', `사연은 ${STORY_MIN}~${STORY_MAX}자로 써 주세요`)
    }
    const emoji = randomEmoji ? POOL[randomInt(POOL.length)] : rawEmoji

    // 3. IP 제한
    await limitIp(req, 'drop', IP_LIMIT, '잠시 후 다시 맡겨 주세요')

    // 4. 기기 제한 (저장 트랜잭션 안에서 한 번 더 본다)
    if ((await activeCount(dk)) >= PER_DEVICE) throw new HttpError(409, 'slots', '맡길 칸을 모두 썼습니다')

    // 5. 검열 — 실패하면 저장하지 않는다
    let verdict
    try {
      verdict = await moderate(story, emoji)
    } catch {
      throw new HttpError(503, 'moderation', '잠시 후 다시 맡겨 주세요')
    }
    if (verdict === 'selfharm') return res.status(200).json({ selfharm: true })
    if (verdict === 'blocked') throw new HttpError(422, 'blocked', '보관할 수 없는 내용입니다')

    // 6. 저장
    const claimCode = makeClaimCode()
    const saved = await store({ dk, emoji, story, claimCode })

    // 7. 응답 — claimCode는 이때 한 번만 보여 준다 (pad·createdAt은 방금 만든 카드를 바로 그리려고 같이 보냄)
    return res.status(200).json({ id: saved.id, no: saved.no, claimCode, emoji, randomEmoji, pad: saved.pad, createdAt: saved.createdAt })
  } catch (e) {
    return fail(res, e, 'drop failed')
  }
}
