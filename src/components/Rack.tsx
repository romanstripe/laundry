import type { Item } from '../lib/types'
import { tagNo } from '../lib/pads'

const PER = 4

/** 옷걸이 레일: 한 줄에 4개. 누르면 전표(사연)가 뜬다. */
export function Rack({ items, onPick }: { items: Item[]; onPick: (it: Item) => void }) {
  const rows: Item[][] = []
  for (let i = 0; i < items.length; i += PER) rows.push(items.slice(i, i + PER))
  return (
    <div className="rack">
      {rows.map((row, r) => (
        <div className="rail" key={r}>
          <div className="hangers">
            {row.map((it, j) => {
              const i = r * PER + j
              const cls = 'hg' + (it.mine ? ' mine' : '') + (it.gone ? ' gone' : '')
              const tk = it.gone ? '주인이 찾아감' : it.mine ? `내 것 · ${it.no}` : tagNo(it.pad, it.no)
              return (
                <button
                  key={it.id}
                  className={cls}
                  style={{ transform: `rotate(${(((i * 37) % 5) - 2) * 1.2}deg)` }}
                  aria-label={it.gone ? '주인이 찾아간 물건' : '사연 보기'}
                  disabled={it.gone}
                  onClick={() => onPick(it)}
                >
                  <span className="hook" />
                  <span className="wire" />
                  <span className="emo">{it.emoji}</span>
                  <span className={'tk ' + (it.gone || it.mine ? '' : 't' + it.pad)}>{tk}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
