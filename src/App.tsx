import { useCallback, useEffect, useRef, useState } from 'react'
import { DropSheet } from './components/DropSheet'
import { Rack } from './components/Rack'
import { Sticker } from './components/Sticker'
import { getMe } from './lib/api'
import { FAKE_TOTAL, MAX_FAKE_PAGES, fetchPage } from './lib/fakeData'
import type { Item } from './lib/types'

type View = { kind: 'item'; item: Item } | { kind: 'drop'; n: number }

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [view, setView] = useState<View | null>(null)
  const [open, setOpen] = useState(false)
  const [slots, setSlots] = useState<number | null>(null) // 남은 칸 (모르면 null)
  const [total, setTotal] = useState(FAKE_TOTAL)
  const page = useRef(0)
  const loading = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const dropN = useRef(0) // 맡기기 시트를 열 때마다 새로 시작하려고 쓰는 key

  const more = useCallback(async () => {
    if (loading.current || page.current >= MAX_FAKE_PAGES) return
    loading.current = true
    const next = await fetchPage(page.current)
    page.current += 1
    setItems((prev) => [...prev, ...next])
    loading.current = false
  }, [])

  // 바닥에 닿으면 다음 page (무한 스크롤). items가 바뀔 때마다 다시 걸어서 화면이 안 찼으면 계속 채운다.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && void more(), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, more])

  // 남은 칸: GET /api/me. 실패하면(예: api 없이 vite만 켠 경우) 모른 채로 둔다.
  useEffect(() => {
    getMe().then((m) => setSlots(m.left)).catch(() => setSlots(null))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const dropped = (item: Item) => {
    // 선반은 1분 캐시라, 방금 맡긴 건 프론트에서 바로 맨 앞에 끼워 넣는다.
    setItems((prev) => [item, ...prev])
    setSlots((s) => (s === null ? s : Math.max(0, s - 1)))
    setTotal((t) => t + 1)
  }

  return (
    <>
      <div className="wrap">
        <div className="sign">
          <svg className="pic" viewBox="0 0 64 80" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M24 12a8 8 0 1 1 11 7.4c-2 .9-3 2.4-3 4.6v2" />
            <circle cx="32" cy="33" r="1.5" fill="currentColor" stroke="none" />
            <path d="M8 52a16 12 0 0 1 32 0z" fill="currentColor" />
            <path d="M24 52v16a4 4 0 0 1-8 0" />
            <path d="M44 74V58a3 3 0 0 1 6 0v-6a3 3 0 0 1 6 0v6l3-3a3 3 0 0 1 4 4l-7 10v5z" fill="currentColor" strokeWidth="2" />
          </svg>
          <h1>Lost &amp;<br />Found</h1>
          <p className="kr">올해 두고 간 것을 보관합니다. 번호표가 붙은 물건을 누르면 사연을 볼 수 있습니다. 12월 31일 자정 이후 남은 물건은 일괄 처분합니다.</p>
        </div>

        <Rack
          items={items}
          onPick={(item) => {
            setView({ kind: 'item', item })
            setOpen(true)
          }}
        />
        <div className="sentinel" ref={sentinel} />
        <p className="foot">ITEMS ON HOLD <span>{total.toLocaleString()}</span> · 1 PERSON = 3 ITEMS</p>
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
              <>
                <Sticker key={view.item.id} item={view.item} />
                <div className="acts" style={{ marginTop: 8 }}>
                  <span className="metoo">
                    <b>{view.item.metoo.toLocaleString()}</b>명이 같은 걸 잃어버렸어요
                  </span>
                </div>
              </>
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
