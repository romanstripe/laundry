const KEY = 'lf-device-id'
let memo: string | null = null

/** 처음 열 때 만들어 localStorage에 저장한다. 저장이 막힌 브라우저면 이번 탭 동안만 쓴다. */
export function getDeviceId(): string {
  if (memo) return memo
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && saved.length >= 8) return (memo = saved)
  } catch {
    /* 저장소 접근 불가 */
  }
  const id = crypto.randomUUID()
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* 저장소 접근 불가 */
  }
  return (memo = id)
}
