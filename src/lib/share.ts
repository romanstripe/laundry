import { domToBlob } from 'modern-screenshot'

// 공유 이미지 배경은 카드 디자인마다 고정. 어두우면 글자는 밝게.
export const SHAREBG: Record<number, string> = {
  1: '#2a3c8f', 2: '#3b1e14', 3: '#b8322b', 4: '#ababab', 5: '#2e2f7a', 6: '#2b3a9a',
  7: '#1e78c8', 8: '#5a5cf0', 9: '#2c4c78', 10: '#3166c9', 11: '#570000', 12: '#6e9a97',
}

function lumi(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

/** 이미지에 들어갈 글자마다 폰트(와 그 글자가 든 unicode-range 조각)를 미리 받아 둔다. 안 받은 채 찍으면 글씨가 비어 나온다. */
async function loadFontsFor(root: HTMLElement) {
  const want = new Map<string, Set<string>>()
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const text = [...el.childNodes].map((n) => (n.nodeType === 3 ? n.textContent ?? '' : '')).join('').trim()
    if (!text) return
    const cs = getComputedStyle(el)
    const key = `${cs.fontStyle} ${cs.fontWeight} 16px ${cs.fontFamily}`
    if (!want.has(key)) want.set(key, new Set())
    for (const ch of text) want.get(key)!.add(ch)
  })
  await Promise.all([...want].map(([font, chars]) => document.fonts.load(font, [...chars].join('')).catch(() => [])))
}

/**
 * 화면의 카드를 1080x1920 PNG로 만든다 (화면 360x640 프레임 × scale 3).
 * 위에 "2026 LOST & FOUND", 가운데 카드, 아래 작은 글씨. 카드가 길면 비율을 유지하며 줄인다.
 * 찾는 번호는 카드 DOM에 없으므로 이미지에도 절대 들어가지 않는다. (카드만 복제해서 쓴다)
 */
export async function makeShareImage(src: HTMLElement, pad: number): Promise<Blob> {
  const bg = SHAREBG[pad] ?? '#E4E7E9'
  const fr = document.createElement('div')
  fr.className = 'sframe'
  fr.style.background = bg
  fr.style.color = lumi(bg) < 0.5 ? '#F4F6F7' : '#1C2023'

  const card = src.cloneNode(true) as HTMLElement
  card.removeAttribute('id')
  card.classList.remove('torn')
  card.querySelectorAll<HTMLElement>('.tapE').forEach((e) => {
    e.classList.remove('tapE', 'hint', 'on')
    e.removeAttribute('role')
    e.removeAttribute('aria-label')
    e.removeAttribute('tabindex')
  })

  // 화면에서는 사연이 칸을 넘치면 스크롤되지만, 이미지는 스크롤이 안 되니 칸을 사연 길이만큼 늘려서 끝까지 담는다.
  const s0 = src.querySelector<HTMLElement>('.story')
  const s1 = card.querySelector<HTMLElement>('.story')
  if (s0 && s1 && s0.scrollHeight > s0.clientHeight + 1) {
    const lh = parseFloat(getComputedStyle(s0).lineHeight) || 0
    const need = lh ? Math.ceil(s0.scrollHeight / lh) * lh : s0.scrollHeight // 줄 간격 단위로 맞춰야 줄 무늬가 끊기지 않는다
    s1.style.height = `${need}px`
    s1.style.overflow = 'visible'
  }

  const head = document.createElement('div')
  head.className = 'sh'
  head.textContent = '2026 LOST & FOUND'
  // 화면에서 글자 크기를 맞춘 카드와 같은 너비로 둔다. 너비가 다르면 줄바꿈이 달라져 글씨가 잘리거나 크기가 어긋난다.
  const cardW = src.offsetWidth || 320
  const wrap = document.createElement('div')
  wrap.style.cssText = `width:${cardW}px;display:flex;justify-content:center`
  wrap.appendChild(card)
  const foot = document.createElement('div')
  foot.className = 'sf'
  foot.innerHTML = '올해 잃어버린 것, 여기 맡겨 두었습니다<br>12월 31일 자정까지 보관합니다'
  fr.append(head, wrap, foot)
  document.body.appendChild(fr)

  try {
    const h = wrap.offsetHeight
    // 너무 작아지면 읽을 수 없으니 0.55배까지만 줄이고, 그래도 안 들어가면 이미지를 세로로 늘린다.
    const k = Math.max(0.55, Math.min(1, 500 / h, 320 / cardW))
    fr.style.height = `${Math.max(640, h * k + 140)}px`
    if (k < 1) {
      wrap.style.transform = `scale(${k})`
      wrap.style.margin = `${(-(1 - k) * h) / 2}px 0`
    }
    await loadFontsFor(fr)
    await document.fonts.ready
    // 사파리는 첫 번째 캡처에서 글씨가 비는 일이 있어서, 한 번 버리는 캡처를 먼저 한다.
    await domToBlob(fr, { scale: 1, type: 'image/png' }).catch(() => null)
    const blob = await domToBlob(fr, { scale: 3, type: 'image/png' })
    if (!blob) throw new Error('이미지를 만들지 못했습니다')
    return blob
  } finally {
    fr.remove()
  }
}
