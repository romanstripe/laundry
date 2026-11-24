// 카드의 날짜·시각 칸은 전부 createdAt을 한국 시간(Asia/Seoul)으로 바꿔서 쓴다.
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
})

export interface Kst {
  y: number
  m: number
  d: number
  /** 0~23 */
  h: number
  min: number
}

export function kst(ms: number): Kst {
  const p: Record<string, string> = {}
  for (const x of fmt.formatToParts(ms)) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute }
}

export const p2 = (x: number | string) => String(x).padStart(2, '0')

/** 11.20.26 (월.일.연도 두 자리) */
export const dateStr = (t: Kst, sep: string) => [t.m, t.d, t.y % 100].map(p2).join(sep)

/** 17:02 */
export const hhmm = (t: Kst) => `${p2(t.h)}:${p2(t.min)}`

/** ['PM', '05:32'] */
export const ampm = (t: Kst): [string, string] => [t.h < 12 ? 'AM' : 'PM', `${p2(t.h % 12 || 12)}:${p2(t.min)}`]

/** 문 닫는 시각: 한국시간 2027-01-01 00:00 (서버 api/_util.ts의 isClosed()와 같은 시각) */
export const CLOSE_AT = Date.parse('2027-01-01T00:00:00+09:00')
