import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, report, toggleMetoo, type ReportReason } from '../lib/api'
import type { Item } from '../lib/types'
import { Sticker } from './Sticker'

const REASONS: [ReportReason, string][] = [
  ['abuse', '욕설·비하·혐오'],
  ['privacy', '개인정보가 들어 있어요'],
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
}

/** 카드 + "N명이 같은 걸 잃어버렸어요" 줄 + ⋯ 메뉴. 카드 위 이모지가 곧 "나도" 버튼이다. */
export function ItemSheet({ item, liked, metoo, onMetoo, onReported }: Props) {
  const [me, setMe] = useState(liked)
  const [count, setCount] = useState(metoo)
  const [msg, setMsg] = useState('')
  const [pop, setPop] = useState<null | 'menu' | 'reasons' | 'done'>(null)
  const [doneMsg, setDoneMsg] = useState<{ title: string; body: string }>({ title: '', body: '' })
  const [reporting, setReporting] = useState(false)

  const card = useRef<HTMLDivElement | null>(null)
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
      el.setAttribute('aria-label', '나도 이거 잃어버림')
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
          ? { title: '이미 신고하셨어요', body: '한 사람은 한 물건에 한 번만 신고할 수 있어요.' }
          : { title: '신고했어요', body: '확인해 볼게요. 한 사람은 한 물건에 한 번만 신고할 수 있어요.' },
      )
      onReported(item.id, r.hidden)
    } catch (e) {
      setDoneMsg({ title: '신고하지 못했어요', body: e instanceof ApiError ? e.message : '잠시 후 다시 해 주세요' })
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
          <b>{count.toLocaleString()}</b>명이 같은 걸 잃어버렸어요
        </span>
        {!item.mine && (
          <button className="more" aria-label="더 보기" onClick={() => setPop('menu')}>⋯</button>
        )}
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      {me && !item.mine && <p className="hint">나도 눌렀어요. 이모지를 한 번 더 누르면 취소돼요.</p>}

      {pop === 'menu' && (
        <Pop onClose={() => setPop(null)}>
          <button onClick={() => setPop('reasons')}>신고하기</button>
        </Pop>
      )}
      {pop === 'reasons' && (
        <Pop onClose={() => setPop(null)}>
          <h4>신고 사유</h4>
          <p>신고가 들어오면 다시 검사해서 문제가 있으면 바로 내려요.</p>
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
