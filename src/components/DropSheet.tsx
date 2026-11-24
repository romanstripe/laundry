import { useRef, useState } from 'react'
import { ApiError, drop } from '../lib/api'
import { lastEmoji } from '../lib/emoji'
import type { Item } from '../lib/types'
import { ShareBar } from './ShareBar'
import { Sticker } from './Sticker'

type Result =
  | { kind: 'selfharm' }
  | { kind: 'ok'; item: Item; claimCode: string; randomEmoji: boolean }

interface Props {
  slotsLeft: number | null
  onDropped: (item: Item) => void
  onClose: () => void
}

/** 물건 맡기기 시트: 입력 → (성공) 방금 만든 카드 + 찾는 번호 / (자해 관련) 안내 카드 */
export function DropSheet({ slotsLeft, onDropped, onClose }: Props) {
  const [emoji, setEmoji] = useState('')
  const [story, setStory] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const cardEl = useRef<HTMLDivElement | null>(null) // 방금 만든 카드 (공유 이미지로 찍을 원본)

  if (slotsLeft !== null && slotsLeft <= 0 && !result) {
    return (
      <>
        <p className="hint" style={{ fontSize: 15, color: 'var(--fg)' }}>
          맡길 수 있는 칸을 모두 썼습니다.<br />한 사람당 3개까지 보관합니다.
        </p>
        <button className="go" onClick={onClose}>확인</button>
      </>
    )
  }

  if (result?.kind === 'selfharm') {
    return (
      <>
        <div className="care">
          <p>이 이야기는 선반에 걸지 않겠습니다.</p>
          <p>혼자 안고 있기 힘드시다면 <a href="tel:109"><b>109</b></a>(자살예방상담전화, 24시간)로 연락해 주세요.</p>
        </div>
        <button className="go" onClick={onClose}>확인</button>
      </>
    )
  }

  if (result?.kind === 'ok') {
    const { item, claimCode, randomEmoji } = result
    return (
      <>
        <p className="done">맡겼습니다. 12월 31일 자정까지 보관합니다.</p>
        <Sticker
          item={item}
          onRoot={(el) => {
            cardEl.current = el
          }}
        />
        <ShareBar item={item} getCard={() => cardEl.current} />
        <div className="code">
          <span className="hint">찾는 번호 · 캡처해 두세요</span>
          <b>{claimCode}</b>
          {randomEmoji && (
            <p className="hint" style={{ margin: '0 0 8px' }}>
              이모지를 고르지 않아 <span style={{ fontSize: 22 }}>{item.emoji}</span>로 걸어 두었습니다.
            </p>
          )}
          <span className="hint">다른 폰에서 찾아갈 때 필요합니다. 이 화면을 닫으면 다시 볼 수 없습니다.</span>
        </div>
        <button className="go" onClick={onClose}>확인</button>
      </>
    )
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const r = await drop(emoji, story.trim())
      if ('selfharm' in r) {
        setResult({ kind: 'selfharm' })
        return
      }
      const item: Item = {
        id: r.id,
        no: r.no,
        emoji: r.emoji,
        story: story.trim(),
        pad: r.pad,
        createdAt: r.createdAt,
        metoo: 0,
        mine: true,
      }
      setResult({ kind: 'ok', item, claimCode: r.claimCode, randomEmoji: r.randomEmoji })
      onDropped(item)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'blocked') {
        setErr('이 내용은 보관할 수 없습니다. 내용을 조금 바꿔서 다시 시도해 주세요.')
      } else {
        setErr(e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요')
      }
    } finally {
      setBusy(false)
    }
  }

  const n = [...story].length
  return (
    <>
      <div>
        <div className="q">Item <small>잃어버린 것을 이모지 하나로</small></div>
        <input
          type="text"
          className="emoin"
          placeholder="？"
          aria-label="이모지 하나"
          autoComplete="off"
          value={emoji}
          onChange={(e) => setEmoji(lastEmoji(e.target.value))}
        />
        <p className="hint" style={{ marginTop: 8 }}>키보드에서 이모지를 하나 골라 주세요. 비워 두면 아무거나 하나 걸어 두겠습니다.</p>
      </div>
      <div>
        <div className="q">Note <small>올해 잃어버린 것에 대해</small></div>
        <textarea
          maxLength={120}
          placeholder="예) 출근길마다 듣던 노래가 있었는데"
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
        <div className="count">{n}/120</div>
      </div>
      <p className="hint">이름은 남지 않습니다. 욕설·개인정보·위험한 내용은 보관되지 않습니다.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="go" disabled={busy || story.trim().length < 5} onClick={submit}>
        {busy ? '맡기는 중…' : '맡기기'}
      </button>
    </>
  )
}
