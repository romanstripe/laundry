import type { Item } from './types'

// 아직 데이터는 가짜. 나중에 GET /api/shelf 응답으로 바꾼다.
export const FAKE_TOTAL = 12480

const BASE: [string, string, number][] = [
  ['🔑', '3월에 이사하면서 예전 집 열쇠를 못 돌려받았어요. 돌아갈 생각은 없는데 가끔 생각나요.', 412],
  ['☂️', '장마 때 우산을 같이 쓰던 사람이 있었는데, 여름 끝나고 연락이 끊겼어요.', 1903],
  ['🎧', '출근길마다 듣던 플레이리스트. 회사를 옮기고 나니까 그 노래를 못 듣겠어요.', 288],
  ['✉️', '할머니께 쓰다 만 편지. 끝까지 못 썼어요.', 3120],
  ['🧤', '한쪽 장갑만 남았어요. 나머지 한쪽은 아마 1월 어느 버스 안에.', 756],
  ['📕', '다이어리 첫 장만 열심히 썼어요. 올해도.', 4511],
  ['🍀', '오래 준비한 시험에서 떨어졌어요.', 987],
  ['🧸', '본가 내 방 인형. 엄마가 버렸대요.', 640],
  ['🕯️', '새벽마다 켜 두던 작은 불. 요즘은 일찍 자요.', 233],
  ['🎟️', '못 간 콘서트 티켓. 아직 지갑에 있어요.', 1180],
  ['🪴', '처음 키운 화분이 죽었어요. 두 번째는 살아 있어요.', 520],
  ['📷', '현상 안 한 필름 한 롤. 뭐가 찍혔는지 모르겠어요.', 845],
]
const MORE = ['🌙', '🚲', '🍜', '🎮', '🧳', '💤', '🐶', '🌊', '🍰', '📱', '🎸', '🏃', '☕', '🌸', '🧩', '🚌', '🎂', '🕶️', '🧃', '⛄']
const SNIP = [
  '그냥 그랬어요. 그래도 여기 두고 가요.',
  '다시 찾을 생각은 없어요.',
  '이름만 들어도 아직 조금 웃겨요.',
  '언젠가 돌려받을 수 있을까요.',
  '이거 잃어버린 사람 저 말고도 있죠?',
  '그때는 몰랐어요.',
]

export const PAGE_SIZE = 20
export const MAX_FAKE_PAGES = 30

// 2026-01-01 00:00 KST ~ 12월 중순 사이에 흩어 놓은 가짜 createdAt (순서 고정)
const START = Date.parse('2026-01-01T00:00:00+09:00')
const SPAN = Date.parse('2026-11-20T00:00:00+09:00') - START
const scatter = (i: number) => START + ((i * 2654435761) % 1000003) * (SPAN / 1000003)

function make(i: number): Item {
  const b = BASE[i]
  return {
    id: `fake-${i}`,
    no: 347 + i * 137, // 번호는 순번이 아니라 흩어진 보관 번호
    emoji: b ? b[0] : MORE[(i * 7) % MORE.length],
    story: b ? b[1] : SNIP[(i * 5) % SNIP.length],
    pad: ((i * 5 + 1) % 12) + 1, // 서버가 랜덤으로 정해 저장할 값(가짜)
    createdAt: Math.round(scatter(i)),
    metoo: b ? b[2] : (i * 97) % 2000 + 12,
    mine: i === 0,
    gone: i === 6 || i === 17,
  }
}

/** page(0부터)번째 20개. 나중에 fetch('/api/shelf?after=')로 교체. */
export async function fetchPage(page: number): Promise<Item[]> {
  return Array.from({ length: PAGE_SIZE }, (_, k) => make(page * PAGE_SIZE + k))
}
