import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './_firebase.js'
import { ipKey, sha256 } from './_util.js'
import { limitIp } from './_shared.js'
import { HttpError, fail, itemIdOf } from './_http.js'

const FAIL_LIMIT = 20 // 비밀번호 틀린 횟수 (IP당 1시간)
const LIST_MAX = 100
const REASON_LABEL: Record<string, string> = {
  abuse: '욕설·비하·혐오',
  privacy: '개인정보',
  selfharm: '자해·위험',
  sexual: '성적인 내용',
  spam: '광고·도배',
  other: '기타',
}

const same = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)))

/** Basic Auth. 아이디는 아무거나, 비밀번호만 ADMIN_PASSWORD와 맞으면 통과. 틀리면 401(+브라우저 로그인 창). */
async function authorize(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw || pw.length < 12) throw new HttpError(404, 'off', '') // 설정이 없거나 약하면 페이지가 없는 척한다

  // 이미 많이 틀린 IP는 비밀번호를 확인하지도 않고 막는다 (맞는 값을 찍어도 소용없게)
  const ref = db.doc(`ipCount/admin_${ipKey(req)}`)
  const used = ((await ref.get()).get('count') as number | undefined) ?? 0
  if (used >= FAIL_LIMIT) throw new HttpError(429, 'rate', '잠시 후 다시 시도해 주세요')

  const h = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (h.startsWith('Basic ')) {
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8')
    const given = decoded.slice(decoded.indexOf(':') + 1)
    if (same(given, pw)) return true
  }
  await limitIp(req, 'admin', FAIL_LIMIT, '잠시 후 다시 시도해 주세요') // 틀린 시도만 센다
  res.setHeader('WWW-Authenticate', 'Basic realm="admin", charset="UTF-8"')
  res.status(401).send('Unauthorized')
  return false
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const kst = (ms: number) => new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })

/** 한국시간 오늘 0시 */
function todayStart(): Timestamp {
  const DAY = 86_400_000
  const kstNow = Date.now() + 9 * 3600_000
  return Timestamp.fromMillis(Math.floor(kstNow / DAY) * DAY - 9 * 3600_000)
}

/**
 * 지표. 이 서비스는 방문 기록을 남기지 않아서(로그인도 없음) "활동한 기기"만 센다 — 맡기기·나도·신고 중 하나라도 한 기기.
 * 기기 = DB에 저장된 devKey(해시). 구경만 한 사람은 잡히지 않는다.
 * 신규 = 첫 활동이 오늘인 기기, 기존 = 오늘 활동했지만 첫 활동은 그 전인 기기.
 * 컬렉션을 한 번 훑어서(필요한 필드만) 계산한다 — 사연이 아주 많아지면 읽기 비용이 늘 수 있다.
 */
async function stats() {
  const since = todayStart()
  const [items, metoo, reports, total, today, pending, hidden] = await Promise.all([
    db.collection('items').select('devKey', 'createdAt').get(),
    db.collection('metoo').select('devKey', 'createdAt').get(),
    db.collection('reports').select('createdAt').get(),
    db.collection('items').count().get(),
    db.collection('items').where('createdAt', '>=', since).count().get(),
    db.collection('items').where('reports', '>', 0).count().get(),
    db.collection('items').where('hidden', '==', true).count().get(),
  ])
  // 기간: 오늘 / 최근 7일 / 최근 30일 (오늘 포함, 한국시간 날짜 기준) / 전체
  const DAY = 86_400_000
  const starts = [since.toMillis(), since.toMillis() - 6 * DAY, since.toMillis() - 29 * DAY, 0]
  const cols = starts.map(() => ({
    devs: new Set<string>(),
    items: 0,
    metoo: 0,
    reports: 0,
  }))
  const first = new Map<string, number>()
  const see = (dk: unknown, at: unknown, kind: 'items' | 'metoo' | 'reports') => {
    if (!(at instanceof Timestamp)) return
    const ms = at.toMillis()
    starts.forEach((s, i) => {
      if (ms >= s) {
        cols[i][kind]++
        if (typeof dk === 'string') cols[i].devs.add(dk)
      }
    })
    if (typeof dk === 'string' && ms < (first.get(dk) ?? Infinity)) first.set(dk, ms)
  }
  items.docs.forEach((d) => see(d.get('devKey'), d.get('createdAt'), 'items'))
  metoo.docs.forEach((d) => see(d.get('devKey'), d.get('createdAt'), 'metoo'))
  reports.docs.forEach((d) => see(d.id.split('_')[1], d.get('createdAt'), 'reports')) // 문서 ID = {itemId}_{devKey}
  const table = cols.map((c, i) => {
    let fresh = 0
    c.devs.forEach((dk) => {
      if ((first.get(dk) ?? 0) >= starts[i]) fresh++ // 첫 활동이 이 기간 안 = 신규
    })
    return { active: c.devs.size, fresh, old: c.devs.size - fresh, items: c.items, metoo: c.metoo, reports: c.reports }
  })
  return {
    table,
    items: total.data().count,
    today: today.data().count,
    pending: pending.data().count,
    hidden: hidden.data().count,
  }
}

async function page(all: boolean): Promise<string> {
  const base = db.collection('items')
  const q = all
    ? base.orderBy('createdAt', 'desc').limit(LIST_MAX * 2)
    : base.where('reports', '>', 0).orderBy('reports', 'desc').limit(LIST_MAX)
  const [snap, st] = await Promise.all([q.get(), stats()])
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const n = (d.get('reports') as number | undefined) ?? 0
      const reasons: Record<string, number> = {}
      if (n > 0) {
        const rs = await db.collection('reports').where('itemId', '==', d.id).get()
        rs.docs.forEach((r) => {
          const k = r.get('reason') as string
          reasons[k] = (reasons[k] ?? 0) + 1
        })
      }
      const chips = Object.entries(reasons)
        .map(([k, c]) => `<span class="chip">${esc(REASON_LABEL[k] ?? k)} ${c}</span>`)
        .join('')
      const created = d.get('createdAt') as Timestamp | undefined
      const ms = created ? created.toMillis() : 0
      const hid = d.get('hidden') === true
      const no = String(d.get('no'))
      const emoji = String(d.get('emoji') ?? '')
      const story = String(d.get('story') ?? '')
      const text = esc((no + ' ' + emoji + ' ' + story).toLowerCase())
      return `<article data-reports="${n}" data-created="${ms}" data-hidden="${hid ? 1 : 0}" data-text="${text}">
  <header><b class="no">${esc(no)}</b><span class="emo">${esc(emoji)}</span>
    ${n > 0 ? `<span class="rp">신고 ${n}</span>` : ''}
    ${n > 0 || hid ? `<button class="sm" data-act="restore" data-id="${esc(d.id)}">신고 지우고 복구</button>` : ''}
    ${hid ? '<span class="tag hid">숨김</span>' : ''}
    ${d.get('gone') === true ? '<span class="tag">찾아감</span>' : ''}
    <button class="x" data-act="delete" data-id="${esc(d.id)}" data-no="${esc(no)}" aria-label="삭제" title="삭제"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
  <p>${esc(story)}</p>
  <div>${chips}</div>
  <footer><time>${ms ? esc(kst(ms)) : ''}</time></footer>
</article>`
    }),
  )
  const row = (label: string, v: number[], strong = false) =>
    `<tr${strong ? ' class="s"' : ''}><td>${label}</td>${v.map((n) => `<td>${n.toLocaleString('ko-KR')}</td>`).join('')}</tr>`
  const stat = (v: number, label: string, hot = false) =>
    `<div class="stat${hot ? ' hot' : ''}"><b>${v.toLocaleString('ko-KR')}</b><span>${label}</span></div>`
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>admin</title>
<style>
:root{--bg:#E4E7E9;--sign:#121416;--signink:#F7FCFF;--fg:#1C2023;--muted:#68717A;--line:#C3CBC8;
  --ticket:#EFD6DA;--ticket-ink:#7A2E3B;--accent:#4E4766;--accent-soft:#D9D5E4;
  --font:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
*{box-sizing:border-box;scrollbar-width:none}
::-webkit-scrollbar{display:none}
body{margin:0;padding:0 16px;color:var(--fg);font:15px/1.5 var(--font);
  background:var(--bg) linear-gradient(180deg,#EEF0F2,var(--bg) 40%,#DDE1E4);background-attachment:fixed}
.wrap{max-width:560px;margin:0 auto;padding-block:20px 60px;display:flex;flex-direction:column;gap:14px}
.sign{background:linear-gradient(180deg,#1C1F22,var(--sign) 30%);border-radius:6px;padding:14px 18px;color:var(--signink);
  box-shadow:0 0 0 3px #2A2E32,0 18px 30px -14px rgba(0,0,0,.55);display:flex;align-items:baseline;gap:10px}
.sign h1{font:700 30px/1 var(--font);margin:0;text-shadow:0 0 4px rgba(225,245,255,.9),0 0 14px rgba(190,225,255,.55),0 0 28px rgba(170,215,255,.3)}
.sign span{font-size:13px;color:#EEF6FC;text-shadow:0 0 6px rgba(200,230,255,.45)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.stat{background:#fff;border:1px solid var(--fg);border-top-width:2px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;gap:2px}
.stat b{font-size:20px;line-height:1.1}.stat span{font-size:11px;color:var(--muted)}
.stat.hot{color:var(--ticket-ink);border-color:var(--ticket-ink)}.stat.hot span{color:var(--ticket-ink)}
.note{font-size:11px;line-height:1.5;color:var(--muted);margin:10px 0 0}
.card{background:#fff;border:1px solid var(--fg);border-top-width:2px;padding:6px 14px 12px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{font:700 12px var(--font);color:var(--muted);text-align:right;padding:10px 4px 8px;letter-spacing:.04em}
th:nth-child(2){color:var(--accent)}
td{text-align:right;padding:9px 4px;border-top:1px solid #E1E5E7;font-size:15px}
td:first-child,th:first-child{text-align:left;color:var(--muted);font-size:13px;white-space:nowrap}
td:nth-child(2){background:var(--accent-soft);color:var(--accent);font-weight:700;padding-right:8px}
tr.s td{font-weight:700;color:var(--fg)}tr.s td:first-child{color:var(--fg)}
tr.s td:nth-child(2){color:var(--accent)}
.tabs{display:flex;gap:6px}
.tabs a{flex:1;text-align:center;padding:13px 8px;background:#fff;border:1px solid var(--fg);color:var(--fg);text-decoration:none;font-weight:700;font-size:15px}
.tabs a.on{background:var(--fg);color:#fff}
.bar{display:flex;gap:6px;flex-wrap:wrap}
input,select{font:inherit;font-size:15px;padding:12px;border:1px solid var(--fg);background:#fff;color:var(--fg);border-radius:0;outline:0}
input:focus,select:focus{box-shadow:0 0 0 1px var(--fg)}
input{flex:1 1 100%}select{flex:1}
.cnt{font-size:12px;color:var(--muted);margin:0}
article{background:#fff;border:1px solid var(--fg);border-top-width:2px;padding:12px;margin:0 0 10px}
article[data-hidden="1"]{border-color:var(--ticket-ink)}
header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.no{background:var(--ticket);color:var(--ticket-ink);padding:1px 7px;transform:rotate(-2deg);letter-spacing:.06em}
.emo{font-size:20px}time{color:var(--muted);font-size:12px}
.n{color:var(--ticket-ink);font-weight:700}.tag{background:var(--accent-soft);color:var(--accent);padding:0 6px;font-size:12px}
.tag.hid{background:var(--ticket-ink);color:#fff}
.chip{display:inline-block;background:var(--accent-soft);color:var(--accent);padding:1px 8px;margin:2px 4px 2px 0;font-size:12px}
p{white-space:pre-wrap;word-break:break-all;margin:8px 0}
footer{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
button{border:0;background:var(--fg);color:#fff;cursor:pointer;font:700 13px var(--font);border-radius:0}
button:disabled{opacity:.5;cursor:default}
button.sm{padding:6px 10px}
.rp{background:#C8323B;color:#fff;font:700 13px var(--font);padding:6px 10px}
button.x{margin-left:auto;width:28px;height:28px;padding:0;display:grid;place-items:center;background:none;color:var(--muted);box-shadow:inset 0 0 0 1px var(--line)}
button.x svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
button.x:hover{background:var(--ticket-ink);color:#fff;box-shadow:none}
.empty{text-align:center;color:var(--muted);padding:24px 0}
</style></head><body><div class="wrap">
<div class="sign"><h1>ADMIN</h1><span>분실물 보관소 관리</span></div>
<div class="stats">
${stat(st.table[0].active, '오늘 활동 기기')}${stat(st.pending, '신고된 사연', st.pending > 0)}${stat(st.hidden, '숨김')}${stat(st.items, '전체 사연')}
</div>
<section class="card">
<table>
<thead><tr><th></th><th>오늘</th><th>7일</th><th>30일</th><th>전체</th></tr></thead>
<tbody>
${row('활동 기기', st.table.map((t) => t.active), true)}
${row('└ 신규', st.table.map((t) => t.fresh))}
${row('└ 기존', st.table.map((t) => t.old))}
${row('맡긴 사연', st.table.map((t) => t.items), true)}
${row('나도', st.table.map((t) => t.metoo))}
${row('신고', st.table.map((t) => t.reports))}
</tbody></table>
<p class="note">방문 기록은 없어서 맡기기·나도·신고 중 하나라도 한 기기만 집계돼요. 신규 = 그 기간에 첫 활동을 한 기기. 한국시간 날짜 기준, 7일·30일은 오늘 포함. 삭제된 사연의 활동은 빠집니다.</p>
</section>
<div class="tabs"><a href="/admin"${all ? '' : ' class="on"'}>신고된 것</a><a href="/admin?all=1"${all ? ' class="on"' : ''}>전체(최근 ${LIST_MAX * 2}개)</a></div>
<div class="bar">
  <input id="q" type="search" placeholder="번호·이모지·사연 검색" autocomplete="off">
  <select id="sort"><option value="reports">신고 많은 순</option><option value="new">최신 순</option><option value="old">오래된 순</option></select>
  <select id="flt"><option value="">전체</option><option value="hid">숨김만</option><option value="vis">노출 중만</option></select>
</div>
<p class="cnt" id="cnt"></p>
<div id="list">${rows.join('')}</div>
<p class="empty" id="none" hidden>표시할 사연이 없습니다.</p>
</div>
<script>
const list = document.getElementById('list'), q = document.getElementById('q'), sort = document.getElementById('sort'),
  flt = document.getElementById('flt'), cnt = document.getElementById('cnt'), none = document.getElementById('none')
const cards = [...list.children]
if (${all ? 'true' : 'false'}) sort.value = 'new'
function apply() {
  const t = q.value.trim().toLowerCase(), by = sort.value, f = flt.value
  const num = (c, k) => Number(c.dataset[k])
  cards.sort((a, b) => by === 'old' ? num(a, 'created') - num(b, 'created')
    : by === 'new' ? num(b, 'created') - num(a, 'created')
    : num(b, 'reports') - num(a, 'reports') || num(b, 'created') - num(a, 'created'))
  let shown = 0
  for (const c of cards) {
    const ok = (!t || c.dataset.text.includes(t)) && (!f || (f === 'hid') === (c.dataset.hidden === '1'))
    c.hidden = !ok; if (ok) shown++
    list.appendChild(c)
  }
  cnt.textContent = shown + '건 표시 / 불러온 ' + cards.length + '건'
  none.hidden = shown > 0
}
for (const el of [q, sort, flt]) el.addEventListener('input', apply)
apply()
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return
  if (b.dataset.act === 'delete' && !confirm(b.dataset.no + '번 사연을 완전히 삭제할까요? 되돌릴 수 없습니다.')) return
  b.disabled = true
  const r = await fetch('/admin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin': '1' },
    body: JSON.stringify({ action: b.dataset.act, id: b.dataset.id }) })
  if (r.ok) location.reload(); else { alert('실패: ' + r.status); b.disabled = false }
})
</script></body></html>`
}

async function act(action: unknown, rawId: unknown) {
  const id = itemIdOf(rawId)
  if (action !== 'restore' && action !== 'delete') throw new HttpError(400, 'bad_action', '잘못된 요청입니다')
  const reports = await db.collection('reports').where('itemId', '==', id).get()
  const batch = db.batch()
  reports.docs.forEach((r) => batch.delete(r.ref))
  if (action === 'restore') {
    batch.update(db.doc(`items/${id}`), { hidden: false, reports: 0 })
  } else {
    // 번호(numbers/…)는 지우지 않는다 — 같은 번호가 다시 나오지 않게
    batch.delete(db.doc(`items/${id}`))
  }
  await batch.commit()
}

/**
 * GET  /admin  (vercel.json이 /api/admin으로 보낸다) — 신고된 사연 목록 + 지표 (HTML). ?all=1 이면 최근 사연 전체.
 * POST /admin  body: { action: 'restore' | 'delete', id }
 * 모든 요청이 Basic Auth(ADMIN_PASSWORD)를 거친다. 링크는 어디에도 없다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  try {
    if (!(await authorize(req, res))) return
    if (req.method === 'POST') {
      // 다른 사이트의 폼으로는 직접 만든 헤더를 못 붙인다 → 몰래 보낸 요청 차단
      if (req.headers['x-admin'] !== '1') throw new HttpError(403, 'csrf', '허용되지 않는 요청입니다')
      const body = (typeof req.body === 'object' && req.body) || {}
      await act(body.action, body.id)
      return res.status(200).json({ ok: true })
    }
    if (req.method !== 'GET') throw new HttpError(405, 'method', '허용되지 않는 요청입니다')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
    )
    return res.status(200).send(await page(req.query.all === '1'))
  } catch (e) {
    if (e instanceof HttpError && e.code === 'off') return res.status(404).send('Not Found')
    return fail(res, e, 'admin failed')
  }
}
