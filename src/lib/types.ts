export interface Item {
  id: string
  /** 보관 번호 (순번 아님, 앞에 0 없이 그대로 씀) */
  no: number
  emoji: string
  /** gone이면 서버가 빼고 보냄 */
  story: string
  /** 전표 디자인 1~12 */
  pad: number
  /** ms (UTC epoch). 카드의 날짜·시각은 이걸 한국 시간으로 바꿔서 씀 */
  createdAt: number
  metoo: number
  mine?: boolean
  gone?: boolean
}
