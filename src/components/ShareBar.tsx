import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PADHF, tagNo } from '../lib/pads'
import { makeShareImage } from '../lib/share'
import type { Item } from '../lib/types'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** 큰 미리보기: 공유 시트가 안 되는 곳(카톡·인스타 인앱 브라우저 등)에서는 꾹 눌러서 저장하게 한다. */
function Preview({ blob, name, onClose }: { blob: Blob; name: string; onClose: () => void }) {
  const [url] = useState(() => URL.createObjectURL(blob))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return createPortal(
    <div className="shot">
      <img src={url} alt="보관증 이미지" />
      <p>이미지를 꾹 눌러 저장해 주세요</p>
      <div className="row">
        <a href={url} download={name}>파일로 받기</a>
        <button onClick={onClose}>닫기</button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * [이미지 저장] [공유하기]. 이미지는 시트가 뜨자마자 미리 만들어 둔다 —
 * 눌렀을 때 바로 navigator.share를 불러야 사파리가 "사용자가 누른 것"으로 인정해 준다.
 */
export function ShareBar({ item, getCard }: { item: Item; getCard: () => HTMLElement | null }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [preview, setPreview] = useState(false)
  const name = `lost-found-${tagNo(item.pad, item.no)}.png`.replace(/\s/g, '')

  useEffect(() => {
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
  }, [item.id, item.pad, attempt])

  const share = async () => {
    if (!blob) return
    const file = new File([blob], name, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Lost & Found' })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return // 사용자가 공유 창을 닫음
      }
    }
    setPreview(true) // 공유 시트가 안 되면 크게 띄운다
  }

  if (failed) {
    return (
      <div className="share">
        <button className="btn" onClick={() => setAttempt((n) => n + 1)}>이미지를 만들지 못했습니다 · 다시 시도</button>
      </div>
    )
  }
  return (
    <>
      <div className="share">
        <button className="btn" disabled={!blob} onClick={() => setPreview(true)}>
          {blob ? '이미지 저장' : '이미지 준비 중…'}
        </button>
        <button className="btn dark" disabled={!blob} onClick={() => void share()}>공유하기</button>
      </div>
      {preview && blob && <Preview blob={blob} name={name} onClose={() => setPreview(false)} />}
    </>
  )
}
