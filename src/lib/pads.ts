// 사연 손글씨(와 카드 안 손글씨 숫자)는 카드 디자인마다 고정. [폰트, 크기 배율] — 시안 v4의 PADHF 그대로.
// 1 나눔 펜 · 2 글방구리 · 3 오춘기 김작가 · 4 김탕 · 5 옥수니 · 6 김탕 · 7 옥수니 · 8 글방구리 · 9 김탕 · 10 옥수니 · 11 뱅이 · 12 기철이
export const PADHF: Record<number, [string, number]> = {
  1: ['Nanum Pen Script', 1],
  2: ['Banguri', 0.9],
  3: ['Ochungi', 0.9],
  4: ['KimTang', 0.88],
  5: ['Oksooni', 0.88],
  6: ['KimTang', 0.88],
  7: ['Oksooni', 0.88],
  8: ['Banguri', 0.9],
  9: ['KimTang', 0.88],
  10: ['Oksooni', 0.88],
  11: ['Baenge', 0.95],
  12: ['Kicheori', 0.9],
}

function ord(n: number) {
  const t = n % 100
  const u = n % 10
  return n + (t > 10 && t < 14 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th')
}

/** 선반 번호표 / 카드 번호 모양 (전표별). 번호는 앞에 0을 붙이지 않는다. */
export function tagNo(pad: number, n: number): string {
  switch (pad) {
    case 1: return `N${n}`
    case 2: return `No. ${n}`
    case 3: return `${n}`
    case 4: return `N. ${n}`
    case 5: return ord(n)
    case 6: return `N${n}`
    case 7: return `No. ${n}`
    case 8: return `RX ${n}`
    case 9: return `N. ${n}`
    case 10: return ord(n)
    case 11: return `${n}`
    default: return `No. ${n}`
  }
}

export { ord }
