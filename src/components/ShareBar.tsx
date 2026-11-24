import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { shareBlob, useShareImage } from '../lib/useShareImage'
import type { Item } from '../lib/types'

/** 큰 미리보기: 공유 시트가 안 되는 곳(카톡·인스타 인앱 브라우저 등)에서는 꾹 눌러서 저장하게 한다. */
export function Preview({ blob, name, onClose }: { blob: Blob; name: string; onClose: () => void }) {
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

/** [이미지 저장] [공유하기] */
export function ShareBar({ item, getCard }: { item: Item; getCard: () => HTMLElement | null }) {
  const { blob, failed, name, retry } = useShareImage(item, getCard)
  const [preview, setPreview] = useState(false)

  const share = async () => {
    if (!blob) return
    if (!(await shareBlob(blob, name))) setPreview(true) // 공유 시트가 안 되면 크게 띄운다
  }

  if (failed) {
    return (
      <div className="share">
        <button className="btn" onClick={retry}>이미지를 만들지 못했습니다 · 다시 시도</button>
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
