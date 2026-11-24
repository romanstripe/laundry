import { useEffect, useState } from 'react'
import type { Item } from './types'
import { PADHF, tagNo } from './pads'
import { makeShareImage } from './share'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * 공유 이미지를 시트가 뜨자마자 미리 만들어 둔다 —
 * 눌렀을 때 바로 navigator.share를 불러야 사파리가 "사용자가 누른 것"으로 인정해 준다.
 */
export function useShareImage(item: Item, getCard: () => HTMLElement | null, enabled = true) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const name = `lost-found-${tagNo(item.pad, item.no)}.png`.replace(/\s/g, '')

  useEffect(() => {
    if (!enabled) return
    let dead = false
    setBlob(null)
    setFailed(false)
    ;(async () => {
      try {
        // 손글씨 폰트가 올라오고 카드가 글자 크기를 맞춘 뒤에 찍는다
        await document.fonts.load(`20px '${PADHF[item.pad]?.[0] ?? PADHF[1][0]}'`).catch(() => {})
        await raf()
        await raf()
        const el = getCard()
        if (!el) throw new Error('card missing')
        const b = await makeShareImage(el, item.pad)
        if (!dead) setBlob(b)
      } catch {
        if (!dead) setFailed(true)
      }
    })()
    return () => {
      dead = true
    }
    // getCard는 항상 같은 ref를 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.pad, attempt, enabled])

  return { blob, failed, name, retry: () => setAttempt((n) => n + 1) }
}

/** 공유 시트로 보낸다. 시트를 쓸 수 없으면 false (호출한 쪽이 큰 미리보기를 띄운다). 클릭 핸들러에서 바로 불러야 한다. */
export async function shareBlob(blob: Blob, name: string): Promise<boolean> {
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Lost & Found' })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return true // 사용자가 공유 창을 닫음
    }
  }
  return false
}
