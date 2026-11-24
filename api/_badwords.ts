// 금칙어 목록은 저장소에 두지 않는다. 환경변수 BADWORDS(쉼표로 구분)에서 읽는다.
//   - 로컬: .env.local 의 BADWORDS=단어1,단어2,...
//   - 배포: Vercel > Settings > Environment Variables 의 BADWORDS
// 비교 전에 글자·숫자만 남기고(공백·기호 제거) 소문자로 바꾸므로 띄어쓰기·기호 없이 적는다.
// 초성 줄임말(ㅅㅂ 등)도 같은 목록에 쓴다. 단어를 더하거나 빼는 건 환경변수만 고치고 재배포하면 된다.
// ('보지'·'자지'처럼 "보지 않았어요"와 겹치는 일상어는 넣지 않는 게 좋다.)
export function loadBadwords(): string[] {
  const raw = process.env.BADWORDS
  // 목록이 없으면 검열이 조용히 빠지는 것보다 맡기기를 막는 쪽이 안전하다 (drop.ts가 503 처리)
  if (!raw || !raw.trim()) throw new Error('BADWORDS 환경변수가 없습니다')
  return raw.split(',').map((w) => w.trim()).filter(Boolean)
}

// 자해·자살 관련 말: 막지 않고 "선반에 걸지 않고 안내 카드"를 보여 준다.
export const SELFHARM_WORDS: string[] = [
  '죽고싶', '죽고싶다', '죽어버리고싶', '죽을까', '죽을래', '자살', '자해', '목숨을끊', '극단적선택',
  '사라지고싶', '사라져버리고싶', '없어지고싶', '살기싫', '살고싶지않', '삶을끝',
  'suicide', 'killmyself', 'kms',
]

// 올리면 안 되는 이모지 (기본 글자만 비교한다 — 피부색·변형 선택자는 무시)
export const BLOCKED_EMOJI: string[] = ['🖕', '🔞', '🍆', '卐']
