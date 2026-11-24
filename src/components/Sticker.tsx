import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { Item } from '../lib/types'
import { PADHF, ord } from '../lib/pads'
import { ampm, dateStr, hhmm, kst, p2 } from '../lib/time'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MO = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.']

/** 시안 v4의 sticker(): 보관 번호·이모지·사연·createdAt(KST)으로 전표 12종 중 하나를 그린다. */
export function Sticker({ item, onRoot }: { item: Item; onRoot?: (el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [hf, hs] = PADHF[item.pad] ?? PADHF[1]

  // 시안의 dress()+fit(): 손글씨 폰트가 올라온 뒤, 사연이 칸을 넘치면 글자를 조금씩 줄인다.
  useEffect(() => {
    let dead = false
    const st = ref.current?.querySelector<HTMLElement>('.story')
    if (!st) return
    const fit = () => {
      const k = +getComputedStyle(st).getPropertyValue('--hs') || 1
      let f = Math.round(26 * k)
      st.style.fontSize = ''
      while (st.scrollHeight > st.clientHeight + 1 && f > 18) {
        f -= 1
        st.style.fontSize = f + 'px'
      }
    }
    document.fonts
      .load(`20px '${hf}'`)
      .catch(() => {})
      .then(() => {
        if (!dead) requestAnimationFrame(() => !dead && fit())
      })
    return () => {
      dead = true
    }
  }, [hf, item.story, item.pad])

  const t = kst(item.createdAt)
  const n = item.no
  const e = item.emoji
  const S = (
    <div className="ruled">
      <p className="story">{item.story}</p>
    </div>
  )
  const style = { '--hf': `'${hf}','Pretendard Variable',Pretendard,sans-serif`, '--hs': hs } as CSSProperties
  const root = (cls: string, children: ReactNode) => (
    <div
      className={cls}
      style={style}
      ref={(el) => {
        ref.current = el
        onRoot?.(el)
      }}
    >
      {children}
    </div>
  )

  switch (item.pad) {
    case 2:
      return root(
        'chk p2 bag',
        <>
          <div className="head">
            <div className="form">
              Form<br />LF-26
              <div className="mark"><span>{e}</span></div>
            </div>
            <div className="patch">
              <small>Lost &amp; Found</small>
              <span className="eye" />
              <span className="sn">{n}</span>
            </div>
            <div className="side">
              <div>Lost and<br />Found</div>
              <div>No. pcs. <span style={{ fontFamily: 'var(--hf)', fontSize: 18, color: 'var(--ink)' }}>1</span></div>
            </div>
          </div>
          <div className="line">Lost &amp; Found Lines</div>
          <div className="fr">Lost at <b>{hhmm(t)}</b></div>
          <div className="fr">Claimed by <span className="hand" style={{ opacity: 0 }}>—</span></div>
          <div className="cols"><span>Route</span><span>Junction points</span></div>
          <div style={{ position: 'relative' }}>
            {S}
            <div className="stamp">Received<br />{dateStr(t, '.')}</div>
          </div>
          <div className="bot">
            <span className="ser">Claim<br />check</span>
            <span className="bign">C-<em>{n}</em></span>
          </div>
        </>,
      )

    case 3:
      return root(
        'chk p3 prk',
        <>
          <div className="big">{n}<span className="seal"><span>{e}</span></span></div>
          <div className="tio">LOST ON<span className="u">{dateStr(t, '.')}</span>LOST AT<span className="u">{hhmm(t)}</span></div>
          <div className="cut" />
          <div className="stubn">1-{n}</div>
          <div className="rcp">Receipt for Lost Things</div>
          {S}
          <div className="amt">PIECES:<span className="u">1</span>DATE:<span className="u">{dateStr(t, '.')}</span></div>
        </>,
      )

    case 4:
      return root(
        'chk p4 seat',
        <>
          <div className="band tb">
            <span className="em">{e}</span>
            <span className="lt">L</span>
            <span className="hole h1" />
            <span className="hole h2" />
          </div>
          <div className="body">
            <div className="dots">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
            {S}
            <div className="grid">
              {MONTHS.map((m, k) => (
                <div key={m} className={k === t.m - 1 ? 'on' : ''}>
                  <span>{m}</span><span className="r" /><span>{m}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="band bb">
            Please keep this story in sight. Take it with you if you leave.<b>L.F.{n} 26</b>
          </div>
        </>,
      )

    case 5:
      return root(
        'chk p5 bus',
        <>
          <div className="t1">Lost &amp; Found Seoul</div>
          <div className="t2">Items and Stories Service</div>
          <div className="hdr"><span>Fee<br />Won</span><span>Kind</span><span>Line</span><span>Time</span></div>
          <div className="vals"><span>{p2(t.h)}</span><span>*</span><span>*</span><span>{p2(t.min)}</span></div>
          <div className="mid">
            {S}
            <div className="chev"><span>{e}</span></div>
          </div>
          <div className="ftr"><span>Year</span><span>Clerk</span><span>Date</span><span>Number</span></div>
          <div className="fv"><span>{t.y % 100}</span><span>1</span><span>{t.m}·{t.d}</span><span>{n}</span></div>
        </>,
      )

    case 6:
      return root(
        'chk p6 lic',
        <>
          <div className="h">2026 Lost<br />(Non-refundable)</div>
          <div className="opts">
            <ul>
              <li><span className="bx"><span className="ck">✓</span></span>Lost this year</li>
              <li><span className="bx" />Found again</li>
              <li><span className="bx" />Complimentary</li>
            </ul>
            <span className="e">{e}</span>
          </div>
          {S}
          <div className="num">{n}</div>
        </>,
      )

    case 7:
      return root(
        'chk p7 ph',
        <>
          <div className="top">
            <span className="logo">{e}</span>
            <div>
              <div className="nm">Lost &amp; Found</div>
              <div className="ad">Year-end Counter, Seoul<br />Open until 12.31.26</div>
            </div>
          </div>
          <div className="pt">Anonymous</div>
          <div className="dir">Take one story per day.</div>
          <div className="meta">No: {n} · Date {dateStr(t, '.')} · No refills</div>
          <div className="warn">
            <b>NOTE:</b> <i>do not exceed recommended dosage.</i>
            {S}
          </div>
        </>,
      )

    case 8:
      return root(
        'chk p8 rx',
        <div className="in">
          <div className="top">
            <span className="sq">{e}</span>
            <div>
              <div className="t1">Someone's<br />Lost &amp; Found strength</div>
              <div className="t2">REMINDER</div>
            </div>
          </div>
          <div className="row"><span className="chip">RX#: {n}</span><span className="dr">Date {dateStr(t, '.')}</span></div>
          {S}
          <div className="bar g">Refills: none — it's gone, and that's ok</div>
          <div className="bar y">Expires: 12.31.26 midnight</div>
        </div>,
      )

    case 9:
      return root(
        'chk p9 hn',
        <>
          <div className="h">LOST NOTE</div>
          <div className="r">
            <div>to: <span className="emo">{e}</span></div>
            <div>date:<span className="v">{dateStr(t, '-')}</span></div>
          </div>
          <div className="nl">note:</div>
          {S}
          <div className="ad">N. {n} · LOST &amp; FOUND SEOUL</div>
        </>,
      )

    case 10:
      return root(
        'chk p10 kc',
        <>
          <div className="lb">Lost item {ord(n)}</div>
          <div className="bx"><span className="emo">{e}</span><span className="hand">someone's</span></div>
          <div className="lb ln">Left here on:</div>
          <div className="val">{dateStr(t, '.')}</div>
          <div className="lb ln">Why it mattered:</div>
          {S}
          <div className="mk">✦</div>
        </>,
      )

    case 11: {
      // 이모지가 올라가는 칸 = 맡긴 시각(KST 0~23시)
      const H = (k: number) =>
        Array.from({ length: 12 }, (_, j) => {
          const on = k * 12 + j === t.h
          return (
            <span key={j} className={on ? 'on' : ''}>
              <span>{j + 1}</span>
              {on && <i>{e}</i>}
            </span>
          )
        })
      return root(
        'chk p11 ts',
        <>
          <div className="h">Lost &amp; Found Radio<br />January 1 – December 31 2026<br />Seoul</div>
          {S}
          <div className="stamp">{MO[t.m - 1]} {t.d} {t.y}</div>
          <div className="hrs">
            <span>AM</span>{H(0)}<span /><span />{H(1)}<span>PM</span>
          </div>
        </>,
      )
    }

    case 12: {
      const [ap, clock] = ampm(t)
      return root(
        'chk p12 sb',
        <>
          <div className="in">A collection of things lost,<br />written by hand, kept for one year.</div>
          <div className="bar" />
          <div className="ow">Someone's</div>
          <div className="tt">LOST &amp; FOUND</div>
          <div className="yr">2026</div>
          <div className="bar" />
          <div className="sp">1 item · 1 story · No. {n}</div>
          {S}
          <div className="bar" style={{ marginTop: 8 }} />
          <div className="btm">
            <span className="pr"><b><small>{ap}</small> {clock}</b></span>
            <span className="emo">{e}</span>
          </div>
        </>,
      )
    }

    default:
      return root(
        'chk p1',
        <>
          <div className="ttl">Lost Check</div>
          <div className="box">
            <div><small>Item</small><span className="emo">{e}</span></div>
            <div><small>From</small><span className="hand">—</span></div>
            <div><small>Time</small><span className="hand">{hhmm(t)}</span></div>
            <div><small>Check number</small><span className="serial">{n}</span></div>
          </div>
          {S}
          <div className="perf" />
          <div className="stub">
            <span className="logo"><i>L</i>lost &amp; found</span>
            <span>Received {dateStr(t, '.')}</span>
            <span className="serial">{n}</span>
          </div>
        </>,
      )
  }
}
