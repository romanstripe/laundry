import type { VercelResponse } from '@vercel/node'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function fail(res: VercelResponse, e: unknown, tag: string) {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, code: e.code })
  // 원인만 남긴다. 요청 헤더·IP는 로그에 찍지 않는다.
  console.error(tag, e instanceof Error ? e.message : 'unknown error')
  return res.status(500).json({ error: '잠시 후 다시 시도해 주세요', code: 'server' })
}

/** Firestore 문서 ID로 쓰기 전에 모양을 확인한다 (경로에 '/'가 섞여 들어오는 걸 막음) */
export function itemIdOf(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(v)) {
    throw new HttpError(400, 'bad_item', '잘못된 요청입니다')
  }
  return v
}

export function deviceIdOf(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 100) {
    throw new HttpError(400, 'bad_device', '잘못된 요청입니다')
  }
  return v
}
