import { getDeviceId } from './device'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'network', '연결이 불안정해요. 잠시 후 다시 해 주세요')
  }
  let data: any = null
  try {
    data = await r.json()
  } catch {
    /* 본문 없음 */
  }
  if (!r.ok) throw new ApiError(r.status, data?.code ?? 'unknown', data?.error ?? '잠시 후 다시 해 주세요')
  return data as T
}

export interface Me {
  max: number
  used: number
  left: number
}
export const getMe = () => call<Me>(`/api/me?deviceId=${encodeURIComponent(getDeviceId())}`)

export type DropResult =
  | { selfharm: true }
  | { id: string; no: number; claimCode: string; emoji: string; randomEmoji: boolean; pad: number; createdAt: number }

export const drop = (emoji: string, story: string) =>
  call<DropResult>('/api/drop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId(), emoji, story }),
  })

import type { Item } from './types'

export interface ShelfPage {
  items: Item[]
  /** 다음 페이지를 부를 커서(마지막 createdAt ms). 끝이면 null */
  next: number | null
  /** 첫 페이지에만 옴 */
  total?: number
}
export const getShelf = (after?: number | null) =>
  call<ShelfPage>(after == null ? '/api/shelf' : `/api/shelf?after=${after}`)

/** items: 내가 맡긴 것, liked: 내가 "나도"를 누른 물건 id들 */
export const getMine = () =>
  call<{ items: Item[]; liked: string[] }>(`/api/mine?deviceId=${encodeURIComponent(getDeviceId())}`)

const post = <T>(url: string, body: object) =>
  call<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId(), ...body }),
  })

/** "나도 이거 잃어버림" 토글 → 서버가 알려 주는 최종 상태 */
export const toggleMetoo = (itemId: string) => post<{ on: boolean; metoo: number }>('/api/metoo', { itemId })

export type ReportReason = 'abuse' | 'privacy' | 'selfharm' | 'sexual' | 'spam' | 'other'
export const report = (itemId: string, reason: ReportReason) =>
  post<{ ok: true; already: boolean; hidden: boolean }>('/api/report', { itemId, reason })

/** 이 기기가 맡긴 물건을 찾아간다 (사연이 지워지고 빈 옷걸이가 남는다) */
export const claimById = (itemId: string) => post<{ ok: true; id: string }>('/api/claim', { itemId })

/** 다른 폰에서: 보관 번호 + 찾는 번호. 5번 틀리면 24시간 잠긴다. */
export const claimByCode = (no: number, claimCode: string) =>
  post<{ ok: true; id: string }>('/api/claim', { no, claimCode })
