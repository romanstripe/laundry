import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// FIREBASE_SERVICE_ACCOUNT = 서비스 계정 JSON 통째로. 한 번만 초기화한다.
function init() {
  const existing = getApps()[0]
  if (existing) return existing

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 없습니다')

  const sa = JSON.parse(raw)
  // 환경변수에 넣다가 줄바꿈이 "\\n" 글자로 깨진 경우를 복구
  if (typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n')
  }
  return initializeApp({ credential: cert(sa) })
}

// Firestore 데이터베이스 ID. 콘솔에서 "(default)"가 아닌 이름으로 만들었으면 FIRESTORE_DATABASE_ID에 적는다.
const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim()
export const db = databaseId && databaseId !== '(default)' ? getFirestore(init(), databaseId) : getFirestore(init())
