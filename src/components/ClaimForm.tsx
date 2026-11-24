import { useState } from 'react'
import { ApiError, claimByCode } from '../lib/api'

/** 확인 단계는 alert/confirm 대신 페이지 안 버튼으로 한다. */
export function ClaimConfirm({
  busy,
  onYes,
  onNo,
}: {
  busy: boolean
  onYes: () => void
  onNo: () => void
}) {
  return (
    <div className="claimbox">
      <p className="hint" style={{ color: 'var(--fg)' }}>
        정말 찾아갈까요? 사연이 지워지고 빈 옷걸이만 남아요. 되돌릴 수 없어요.
      </p>
      <div className="acts">
        <button className="btn dark" disabled={busy} onClick={onYes}>{busy ? '찾아가는 중…' : '네, 찾아갈게요'}</button>
        <button className="btn" disabled={busy} onClick={onNo}>취소</button>
      </div>
    </div>
  )
}

/** 다른 폰에서 찾는 번호로 찾아가기. no를 주면 번호 칸 없이 코드만 받는다. */
export function ClaimForm({ no, onDone }: { no?: number; onDone: (id: string) => void }) {
  const [noText, setNoText] = useState(no ? String(no) : '')
  const [code, setCode] = useState('')
  const [bad, setBad] = useState<'no' | 'code' | null>(null)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const normCode = code.replace(/[^A-Z0-9]/g, '')
  const noNum = Number(noText)

  const ask = () => {
    setErr('')
    if (!no && !(Number.isInteger(noNum) && noNum >= 100 && noNum <= 99999)) {
      setBad('no')
      setErr('보관 번호를 확인해 주세요')
      return
    }
    if (normCode.length !== 6) {
      setBad('code')
      setErr('찾는 번호는 6자리예요')
      return
    }
    setBad(null)
    setConfirm(true)
  }

  const go = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await claimByCode(no ?? noNum, code)
      onDone(r.id)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '잠시 후 다시 해 주세요')
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="claimbox">
      {!no && (
        <input
          className={'cdin' + (bad === 'no' ? ' bad' : '')}
          inputMode="numeric"
          maxLength={5}
          placeholder="보관 번호 (예: 484)"
          autoComplete="off"
          value={noText}
          onChange={(e) => {
            setNoText(e.target.value.replace(/\D/g, ''))
            setBad(null)
          }}
        />
      )}
      <div className="row">
        <input
          className={'cdin' + (bad === 'code' ? ' bad' : '')}
          maxLength={7}
          placeholder="찾는 번호 (예: K7Q-2MX)"
          autoComplete="off"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
            setBad(null)
            setConfirm(false)
          }}
        />
        {!confirm && <button className="btn dark" onClick={ask}>찾아가기</button>}
      </div>
      <p className="hint">맡길 때 받은 찾는 번호를 넣으면 이 폰에서도 찾아갈 수 있어요. 5번 틀리면 24시간 잠겨요.</p>
      {err && <p className="err" role="alert">{err}</p>}
      {confirm && <ClaimConfirm busy={busy} onYes={() => void go()} onNo={() => setConfirm(false)} />}
    </div>
  )
}
