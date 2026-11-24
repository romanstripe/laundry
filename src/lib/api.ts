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

export const getMine = () =>
  call<{ items: Item[] }>(`/api/mine?deviceId=${encodeURIComponent(getDeviceId())}`)
