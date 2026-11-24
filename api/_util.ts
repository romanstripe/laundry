import { createHash, randomInt } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function salt(): string {
  const s = process.env.SALT
  if (!s) throw new Error('SALT 환경변수가 없습니다')
  return s
}

/**
 * IP 제한용 키. x-forwarded-for의 첫 IP + SALT + 현재 UTC 시각(시 단위)을 sha256.
 * 원래 IP는 저장하지도, 로그로 남기지도 않는다. 시간이 섞여 있어서 한 시간이 지나면 키가 바뀐다.
 */
export function ipKey(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for']
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim() ?? ''
  const hour = new Date().toISOString().slice(0, 13) // 예: 2026-11-20T07
  return sha256(first + salt() + hour)
}

/** 기기 키. DB에는 deviceId 원본이 아니라 이 해시만 저장한다. */
export function devKey(deviceId: string): string {
  return sha256(deviceId + salt())
}

const CLOSE_AT = Date.parse('2027-01-01T00:00:00+09:00') // 한국시간 2027-01-01 00:00

/** 문 닫는 시각(한국시간 2027-01-01 00:00) 이후면 true */
export function isClosed(): boolean {
  return Date.now() >= CLOSE_AT
}

// 삭제 코드: 헷갈리는 글자(0, O, 1, I)를 뺀 6자리. 겉모양은 "K7Q-2MF"
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeClaimCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)]
  return s.slice(0, 3) + '-' + s.slice(3)
}

/** 사용자가 입력한 삭제 코드를 비교용으로 정리 (대소문자·하이픈·공백 무시) */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * DB에는 삭제 코드 원본이 아니라 이 해시만 저장한다. (번호 + 코드 + SALT)
 * 번호만 섞으면 번호를 아는 누구나 만들 수 있어서 코드도 함께 해시에 넣었다.
 */
export const claimHash = (no: number, code: string) => sha256(`${no}:${normalizeCode(code)}:${salt()}`)
