import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClaimSheet } from './components/ClaimSheet'
import { DropSheet } from './components/DropSheet'
import { Rack } from './components/Rack'
import { ItemSheet } from './components/ItemSheet'
import { getMe, getMine, getShelf } from './lib/api'
import { CLOSE_AT } from './lib/time'
import type { Item } from './lib/types'

type View = { kind: 'item'; item: Item } | { kind: 'drop'; n: number } | { kind: 'claim'; n: number }

/** 검은 라이트박스 간판 */
function Sign({ children }: { children: ReactNode }) {
  return (
    <div className="sign">
      <svg className="pic" viewBox="0 0 64 80" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 12a8 8 0 1 1 11 7.4c-2 .9-3 2.4-3 4.6v2" />
        <circle cx="32" cy="33" r="1.5" fill="currentColor" stroke="none" />
        <path d="M8 52a16 12 0 0 1 32 0z" fill="currentColor" />
        <path d="M24 52v16a4 4 0 0 1-8 0" />
        <path d="M44 74V58a3 3 0 0 1 6 0v-6a3 3 0 0 1 6 0v6l3-3a3 3 0 0 1 4 4l-7 10v5z" fill="currentColor" strokeWidth="2" />
      </svg>
      <h1>Lost &amp;<br />Found</h1>
      <p className="kr">{children}</p>
    </div>
  )
}

/** 한국시간 2027-01-01 00:00 이후: 선반 대신 이 화면만 보여 준다 (api 호출도 하지 않는다) */
function Closed() {
  return (
    <div className="wrap">
      <Sign>
        문을 닫았습니다.
        <br />
        2026년 분실물은 모두 처분했습니다.
      </Sign>
    </div>
  )
}

export default function App() {
  const [closed, setClosed] = useState(() => Date.now() >= CLOSE_AT)
  // 화면을 켜 둔 채로 자정이 지나도 바뀌도록 가끔 시각을 본다
  useEffect(() => {
    if (closed) return
    const t = setInterval(() => {
      if (Date.now() >= CLOSE_AT) setClosed(true)
    }, 15_000)
    return () => clearInterval(t)
  }, [closed])
  return closed ? <Closed /> : <Shelf />
}

function Shelf() {
  const [shelf, setShelf] = useState<Item[]>([]) // /api/shelf에서 받은 것 (모두에게 같은 1분 캐시)
  const [mine, setMine] = useState<Item[]>([]) // /api/mine + 방금 맡긴 것 (사람마다 다름)
  const [mineKnown, setMineKnown] = useState(false) // /api/mine 응답을 받았는지 (링크가 깜빡 보였다 사라지지 않게)
  const [done, setDone] = useState(false) // 선반 끝까지 받음
  const [ready, setReady] = useState(false) // 첫 페이지를 받음
  const [failed, setFailed] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [liked, setLiked] = useState<Set<string>>(new Set()) // 내가 "나도"를 누른 물건 (서버가 알려 줌)
  const [counts, setCounts] = useState<Record<string, number>>({}) // 누른 뒤 서버가 돌려준 최신 "나도" 수 (선반 캐시보다 새 값)
  const [view, setView] = useState<View | null>(null)
  const [open, setOpen] = useState(false)
  const [slots, setSlots] = useState<number | null>(null) // 남은 칸 (모르면 null)
  const cursor = useRef<number | null | undefined>(undefined) // undefined: 첫 페이지 전, null: 끝
  const loading = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const dropN = useRef(0) // 맡기기 시트를 열 때마다 새로 시작하려고 쓰는 key

  const more = useCallback(async () => {
    if (loading.current || cursor.current === null) return
    loading.current = true
    setFailed(false)
    try {
      const r = await getShelf(cursor.current)
      cursor.current = r.next
      setShelf((prev) => {
        const have = new Set(prev.map((i) => i.id))
        return [...prev, ...r.items.filter((i) => !have.has(i.id))]
      })
      if (r.total !== undefined) setTotal(r.total)
      if (r.next === null) setDone(true)
      setReady(true)
    } catch {
      setFailed(true)
    } finally {
      loading.current = false
    }
  }, [])

  // 바닥에 닿으면 다음 page (무한 스크롤). 화면이 안 찼으면 shelf가 바뀔 때마다 다시 걸어서 계속 채운다.
  // 실패했을 땐 걸지 않는다 (버튼으로 다시 시도).
  useEffect(() => {
    const el = sentinel.current
    if (!el || failed || done) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && void more(), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shelf.length, failed, done, more])

  // 내 물건·남은 칸은 캐시되는 선반과 따로 받아서 합친다. 실패해도 선반은 그대로 보인다.
  useEffect(() => {
    getMine()
      .then((r) => {
        setMine(r.items)
        setLiked(new Set(r.liked))
      })
      .catch(() => {})
      .finally(() => setMineKnown(true))
    getMe().then((m) => setSlots(m.left)).catch(() => setSlots(null))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 선반 + 내 물건. 선반은 1분 캐시라 방금 맡긴 건 아직 없을 수 있어서, 내 물건 중 선반에 없고
  // 지금까지 불러온 범위(가장 오래된 것보다 새로운 것)에 들어오는 건 끼워 넣는다.
  const items = useMemo(() => {
    const mineIds = new Set(mine.map((m) => m.id))
    const base = shelf.map((i) => (mineIds.has(i.id) ? { ...i, mine: true } : i))
    const have = new Set(base.map((i) => i.id))
    const oldest = done ? 0 : base.length ? base[base.length - 1].createdAt : Infinity
    const extra = mine.filter((m) => !have.has(m.id) && m.createdAt >= oldest).map((m) => ({ ...m, mine: true }))
    return [...base, ...extra].sort((a, b) => b.createdAt - a.createdAt)
  }, [shelf, mine, done])

  const metooDone = (id: string, on: boolean, n: number) => {
    setLiked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    setCounts((prev) => ({ ...prev, [id]: n }))
  }

  // 신고로 숨겨진 건 선반에서 흔적 없이 뺀다 (시트는 그대로 두고, 닫으면 사라져 있다)
  const reported = (id: string, hidden: boolean) => {
    if (!hidden) return
    setShelf((prev) => prev.filter((i) => i.id !== id))
    setMine((prev) => prev.filter((i) => i.id !== id))
  }

  // 찾아간 물건: 사연을 지우고 선반에는 흐린 빈 옷걸이("주인이 찾아감")로 남긴다. 칸이 하나 돌아온다.
  const claimed = (id: string) => {
    setShelf((prev) => prev.map((i) => (i.id === id ? { ...i, gone: true, story: '', metoo: 0 } : i)))
    setMine((prev) => prev.filter((i) => i.id !== id))
    getMe().then((m) => setSlots(m.left)).catch(() => {})
  }

  const dropped = (item: Item) => {
    setMine((prev) => [item, ...prev])
    setSlots((s) => (s === null ? s : Math.max(0, s - 1)))
    setTotal((t) => (t === null ? t : t + 1))
  }

  return (
    <>
      <div className="wrap">
        <Sign>올해 두고 간 것을 보관합니다. 번호표가 붙은 물건을 누르면 사연을 볼 수 있습니다. 12월 31일 자정 이후 남은 물건은 일괄 처분합니다.</Sign>

        <Rack
          items={items}
          onPick={(item) => {
            setView({ kind: 'item', item })
            setOpen(true)
          }}
        />
        <div className="sentinel" ref={sentinel} />
        {ready && items.length === 0 && (
          <p className="note">아직 걸린 물건이 없어요.<br />첫 물건을 맡겨 보세요.</p>
        )}
        {failed && (
          <div className="note">
            선반을 불러오지 못했어요.
            <button onClick={() => void more()}>다시 시도</button>
          </div>
        )}
        <p className="foot">ITEMS ON HOLD <span>{total === null ? '—' : total.toLocaleString()}</span> · 1 PERSON = 3 ITEMS</p>
        {/* 이 폰에 내가 맡긴 물건이 있으면 카드의 [찾아가기]로 충분해서 숨긴다. 다른 폰(맡긴 물건이 없는 기기)에서만 보인다. */}
        {mineKnown && mine.length === 0 && (
          <p className="foot foot2">
            <button
              className="link"
              onClick={() => {
                setView({ kind: 'claim', n: ++dropN.current })
                setOpen(true)
              }}
            >
              다른 폰에서 맡긴 물건 찾아가기
            </button>
          </p>
        )}
      </div>

      <button
        className="cta"
        onClick={() => {
          setView({ kind: 'drop', n: ++dropN.current })
          setOpen(true)
        }}
      >
        <span>물건 맡기기</span>
        <small>남은 칸 {slots ?? '-'}/3</small>
      </button>

      <div className={open ? 'open' : ''}>
        <div className="dim" onClick={() => setOpen(false)} />
        <div className="sheet" role="dialog" aria-modal="true" aria-hidden={!open}>
          <div className="in">
            {view?.kind === 'item' && (
              <ItemSheet
                key={view.item.id}
                item={view.item}
                liked={liked.has(view.item.id)}
                metoo={counts[view.item.id] ?? view.item.metoo}
                onMetoo={metooDone}
                onReported={reported}
                onClaimed={(id) => {
                  claimed(id)
                  setOpen(false)
                }}
              />
            )}
            {view?.kind === 'claim' && (
              <ClaimSheet key={view.n} onClaimed={claimed} onClose={() => setOpen(false)} />
            )}
            {view?.kind === 'drop' && (
              <DropSheet key={view.n} slotsLeft={slots} onDropped={dropped} onClose={() => setOpen(false)} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
