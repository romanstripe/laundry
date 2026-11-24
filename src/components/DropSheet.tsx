import { useState } from 'react'
import { ApiError, drop } from '../lib/api'
import { lastEmoji } from '../lib/emoji'
import type { Item } from '../lib/types'
import { Sticker } from './Sticker'

type Result =
  | { kind: 'selfharm' }
  | { kind: 'ok'; item: Item; claimCode: string; randomEmoji: boolean }

interface Props {
  slotsLeft: number | null
  onDropped: (item: Item) => void
  onClose: () => void
}

/** 물건 맡기기 시트: 입력 → (성공) 방금 만든 카드 + 삭제 코드 / (자해 관련) 안내 카드 */
export function DropSheet({ slotsLeft, onDropped, onClose }: Props) {
  const [emoji, setEmoji] = useState('')
  const [story, setStory] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  if (slotsLeft !== null && slotsLeft <= 0 && !result) {
    return (
      <>
        <p className="hint" style={{ fontSize: 15, color: 'var(--fg)' }}>
          맡길 수 있는 칸을 다 썼습니다.<br />1인 3개까지 보관합니다.
        </p>
        <button className="go" onClick={onClose}>확인</button>
      </>
    )
  }

  if (result?.kind === 'selfharm') {
    return (
      <>
        <div className="care">
          <p>이건 선반에 걸지 않을게요.</p>
          <p>혼자 들고 있기 무거우면 <a href="tel:109"><b>109</b></a>(자살예방상담, 24시간)에 전화해 주세요.</p>
        </div>
        <button className="go" onClick={onClose}>확인</button>
      </>
    )
  }

  if (result?.kind === 'ok') {
    const { item, claimCode, randomEmoji } = result
    return (
      <>
        <p className="done">맡겼어요. 12월 31일 자정까지 보관합니다.</p>
        <Sticker item={item} />
        <div className="code">
          <span className="hint">삭제 코드 · 캡처해 두세요</span>
          <b>{claimCode}</b>
          {randomEmoji && (
            <p className="hint" style={{ margin: '0 0 8px' }}>
              이모지를 비워 두셔서 <span style={{ fontSize: 22 }}>{item.emoji}</span>로 걸어 뒀어요.
            </p>
          )}
          <span className="hint">다른 폰에서 지울 때 필요해요. 이 화면을 닫으면 다시 볼 수 없어요.</span>
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
        setErr('이 내용은 보관할 수 없어요. 욕설·개인정보·위험한 내용은 선반에 걸 수 없습니다.')
      } else {
        setErr(e instanceof ApiError ? e.message : '잠시 후 다시 해 주세요')
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
        <p className="hint" style={{ marginTop: 8 }}>폰 키보드에서 아무 이모지나 하나. 비워 두면 아무거나 하나 걸어 둘게요.</p>
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
      <p className="hint">이름은 남지 않습니다. 욕설·개인정보·위험한 내용은 자동으로 보관되지 않습니다.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="go" disabled={busy || story.trim().length < 5} onClick={submit}>
        {busy ? '맡기는 중…' : '맡기기'}
      </button>
    </>
  )
}
