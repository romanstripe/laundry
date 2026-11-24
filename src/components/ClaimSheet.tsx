import { useState } from 'react'
import { ClaimForm } from './ClaimForm'

/** 푸터의 "찾는 번호로 찾아가기": 보관 번호 + 찾는 번호 두 칸 */
export function ClaimSheet({ onClaimed, onClose }: { onClaimed: (id: string) => void; onClose: () => void }) {
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <>
        <p className="done">찾아갔어요. 선반에는 빈 옷걸이로 남아요.</p>
        <button className="go" onClick={onClose}>확인</button>
      </>
    )
  }
  return (
    <>
      <div className="q">Claim <small>찾는 번호로 찾아가기</small></div>
      <ClaimForm
        onDone={(id) => {
          onClaimed(id)
          setDone(true)
        }}
      />
      <button className="link" style={{ alignSelf: 'center' }} onClick={onClose}>닫기</button>
    </>
  )
}
