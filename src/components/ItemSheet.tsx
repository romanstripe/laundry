import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, claimById, report, toggleMetoo, type ReportReason } from '../lib/api'
import type { Item } from '../lib/types'
import { ClaimConfirm, ClaimForm } from './ClaimForm'
import { shareBlob, useShareImage } from '../lib/useShareImage'
import { Preview } from './ShareBar'
import { Sticker } from './Sticker'

const REASONS: [ReportReason, string][] = [
  ['abuse', '욕설·비하·혐오'],
  ['privacy', '개인정보가 들어 있습니다'],
  ['selfharm', '자해·위험한 내용'],
  ['sexual', '성적인 내용'],
  ['spam', '광고·도배'],
  ['other', '기타'],
]

/** 아래에서 올라오는 메뉴. 시트의 transform 영향을 안 받게 body로 포털한다. */
function Pop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="pop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pb">
        {children}
        <button className="x" onClick={onClose}>닫기</button>
      </div>
    </div>,
    document.body,
  )
}

interface Props {
  item: Item
  /** 이 기기가 이미 "나도"를 눌렀는지 */
  liked: boolean
  metoo: number
  onMetoo: (id: string, on: boolean, metoo: number) => void
  /** 신고로 숨겨졌으면 hidden=true */
  onReported: (id: string, hidden: boolean) => void
  /** 찾아가기가 끝났을 때 (카드가 찢어지는 모션 뒤에 불린다) */
  onClaimed: (id: string) => void
}

/** 카드 + "N명이 같은 걸 잃어버렸어요" 줄 + ⋯ 메뉴. 카드 위 이모지가 곧 "나도" 버튼이다. */
export function ItemSheet({ item, liked, metoo, onMetoo, onReported, onClaimed }: Props) {
  // 찾아가기: 'mine' = 내 폰에서 바로(확인 한 번), 'code' = 찾는 번호 입력
  const [claim, setClaim] = useState<null | 'ask' | 'code'>(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const tear = (id: string) => {
    card.current?.classList.add('torn')
    setTimeout(() => onClaimed(id), 550)
  }
  const claimMine = async () => {
    setClaimBusy(true)
    setMsg('')
    try {
      const r = await claimById(item.id)
      tear(r.id)
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요')
      setClaim(null)
    } finally {
      setClaimBusy(false)
    }
  }

  const [me, setMe] = useState(liked)
  const [count, setCount] = useState(metoo)
  const [msg, setMsg] = useState('')
  const [pop, setPop] = useState<null | 'menu' | 'reasons' | 'done'>(null)
  const [doneMsg, setDoneMsg] = useState<{ title: string; body: string }>({ title: '', body: '' })
  const [reporting, setReporting] = useState(false)

  const card = useRef<HTMLDivElement | null>(null)
  // 내 카드만: 메뉴에서 저장·공유할 이미지를 미리 만들어 둔다 (남의 카드는 만들지 않는다)
  const img = useShareImage(item, () => card.current, item.mine)
  const [preview, setPreview] = useState(false)
  const st = useRef({ me: liked, count: metoo })
  const busy = useRef(false)
  const cb = useRef({ onMetoo })
  cb.current = { onMetoo }

  // 카드 안에서 이모지가 들어 있는 칸을 눌리는 버튼으로 만든다: 한 번 누르면 +1, 다시 누르면 취소 (기기당 1번).
  // 내가 맡긴 카드는 제외. 숫자는 먼저 바꾸고(낙관적 업데이트), 서버가 실패하면 되돌린다.
  useEffect(() => {
    const root = card.current
    if (!root || item.mine) return
    const apply = (s: { me: boolean; count: number }) => {
      st.current = s
      setMe(s.me)
      setCount(s.count)
    }
    const hit = (el: HTMLElement) => {
      if (busy.current) return
      busy.current = true
      setMsg('')
      const prev = { ...st.current }
      apply({ me: !prev.me, count: prev.count + (prev.me ? -1 : 1) })
      el.classList.remove('on', 'hint')
      void el.offsetWidth
      el.classList.add('on')
      if (!prev.me) {
        const r = el.getBoundingClientRect()
        const f = document.createElement('span')
        f.className = 'plus'
        f.textContent = '+1'
        f.style.left = r.left + r.width / 2 - 10 + 'px'
        f.style.top = r.top - 6 + 'px'
        document.body.appendChild(f)
        setTimeout(() => f.remove(), 800)
      }
      toggleMetoo(item.id)
        .then((r) => {
          apply({ me: r.on, count: r.metoo })
          cb.current.onMetoo(item.id, r.on, r.metoo)
        })
        .catch((e) => {
          apply(prev)
          setMsg(e instanceof ApiError ? e.message : '잠시 후 다시 눌러 주세요')
        })
        .finally(() => {
          busy.current = false
        })
    }

    const els = [...root.querySelectorAll<HTMLElement>('*')].filter(
      (el) => !el.children.length && el.textContent?.trim() === item.emoji,
    )
    const undo: (() => void)[] = []
    els.forEach((el) => {
      el.classList.add('tapE')
      if (!st.current.me) el.classList.add('hint')
      el.setAttribute('role', 'button')
      el.setAttribute('aria-label', '나도 잃어버렸습니다')
      el.tabIndex = 0
      const click = () => hit(el)
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          hit(el)
        }
      }
      el.addEventListener('click', click)
      el.addEventListener('keydown', key)
      undo.push(() => {
        el.removeEventListener('click', click)
        el.removeEventListener('keydown', key)
      })
    })
    return () => undo.forEach((u) => u())
  }, [item.id, item.mine, item.emoji])

  const send = async (reason: ReportReason) => {
    if (reporting) return
    setReporting(true)
    try {
      const r = await report(item.id, reason)
      setDoneMsg(
        r.already
          ? { title: '이미 신고하셨습니다', body: '한 사람은 한 물건에 한 번만 신고할 수 있습니다.' }
          : { title: '신고했습니다', body: '확인해 보겠습니다. 한 사람은 한 물건에 한 번만 신고할 수 있습니다.' },
      )
      onReported(item.id, r.hidden)
    } catch (e) {
      setDoneMsg({ title: '신고하지 못했습니다', body: e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요' })
    } finally {
      setReporting(false)
      setPop('done')
    }
  }

  return (
    <>
      <Sticker
        key={item.id}
        item={item}
        onRoot={(el) => {
          card.current = el
        }}
      />
      <div className="acts" style={{ marginTop: 8 }}>
        <span className="metoo">
          <b>{count.toLocaleString()}</b>명이 같은 걸 잃어버렸습니다
        </span>
        {item.mine && <span className="owner">내 것</span>}
        <button className="more" aria-label="더 보기" onClick={() => setPop('menu')}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg>
        </button>
      </div>
      {item.mine && claim === 'ask' && (
        <ClaimConfirm busy={claimBusy} onYes={() => void claimMine()} onNo={() => setClaim(null)} />
      )}
      {!item.mine && claim === 'code' && <ClaimForm no={item.no} onDone={tear} />}
      {msg && <p className="err" role="alert">{msg}</p>}
      {me && !item.mine && <p className="hint">나도 눌렀습니다. 이모지를 한 번 더 누르면 취소됩니다.</p>}

      {pop === 'menu' && item.mine && (
        <Pop onClose={() => setPop(null)}>
          {img.failed ? (
            <button onClick={img.retry}>이미지를 만들지 못했습니다 · 다시 시도</button>
          ) : (
            <>
              <button
                disabled={!img.blob}
                onClick={() => {
                  setPop(null)
                  setPreview(true)
                }}
              >
                {img.blob ? '이미지 저장' : '이미지 준비 중…'}
              </button>
              <button
                disabled={!img.blob}
                onClick={() => {
                  if (!img.blob) return
                  setPop(null)
                  void shareBlob(img.blob, img.name).then((ok) => !ok && setPreview(true))
                }}
              >
                공유하기
              </button>
            </>
          )}
          <button
            onClick={() => {
              setPop(null)
              setClaim('ask')
            }}
          >
            찾아가기
          </button>
        </Pop>
      )}
      {pop === 'menu' && !item.mine && (
        <Pop onClose={() => setPop(null)}>
          <button
            onClick={() => {
              setPop(null)
              setClaim('code')
            }}
          >
            찾는 번호 입력하기
          </button>
          <button onClick={() => setPop('reasons')}>신고하기</button>
        </Pop>
      )}
      {preview && img.blob && <Preview blob={img.blob} name={img.name} onClose={() => setPreview(false)} />}
      {pop === 'reasons' && (
        <Pop onClose={() => setPop(null)}>
          <h4>신고 사유</h4>
          <p>신고가 들어오면 다시 검사하고, 문제가 있으면 바로 내립니다.</p>
          {REASONS.map(([code, label]) => (
            <button key={code} disabled={reporting} onClick={() => void send(code)}>{label}</button>
          ))}
        </Pop>
      )}
      {pop === 'done' && (
        <Pop onClose={() => setPop(null)}>
          <h4>{doneMsg.title}</h4>
          <p>{doneMsg.body}</p>
        </Pop>
      )}
    </>
  )
}
