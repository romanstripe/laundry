import { BLOCKED_EMOJI, SELFHARM_WORDS, loadBadwords } from './_badwords.js'

export type ModerationResult = 'ok' | 'blocked' | 'selfharm'

// OpenAI는 영어 기준이라 한국어에서 오탐이 난다. flagged 대신 카테고리 점수가 이 값 이상일 때만 막는다.
const BLOCK_SCORE = 0.8

/** 글자·숫자만 남기고(공백·기호·이모지 제거) 소문자로. 띄어쓰기·특수문자로 피해 가는 걸 막는다. */
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** 같은 글에서 숫자까지 지운 것("씨1발"). 비교는 둘 다 한다. */
const forms = (s: string) => {
  const a = squash(s)
  return [a, a.replace(/\p{N}/gu, '')]
}

// NFKC가 초성(ㅅㅂ)을 다른 코드로 바꾸므로 목록도 같은 방식으로 정리해서 비교한다
// 금칙어는 환경변수에서 읽고(처음 한 번만 정리) 없으면 throw — 검열 없이 올라가지 않게
let badCache: { raw: string; list: string[] } | null = null
function bad(): string[] {
  const raw = process.env.BADWORDS ?? ''
  if (!badCache || badCache.raw !== raw) badCache = { raw, list: loadBadwords().map(squash) }
  return badCache.list
}
const SELF = SELFHARM_WORDS.map(squash)

const hasAny = (texts: string[], words: string[]) => texts.some((t) => words.some((w) => t.includes(w)))

// 한글 숫자말("공일공")을 숫자로 바꿔서 전화번호를 찾는다
const HANGUL_DIGIT: Record<string, string> = { 공: '0', 영: '0', 일: '1', 이: '2', 삼: '3', 사: '4', 오: '5', 육: '6', 륙: '6',칠: '7', 팔: '8', 구: '9' }

function hasPersonalInfo(story: string): boolean {
  const t = story.normalize('NFKC')
  // 전화번호: 010-1234-5678 변형, 지역번호(하이픈 있는 것만 — 날짜·금액 오탐 방지)
  const digits = t.replace(/[공영일이삼사오육륙칠팔구]/g, (c) => HANGUL_DIGIT[c])
  if (/01[016789][\s.\-_·,/~]{0,3}\d{3,4}[\s.\-_·,/~]{0,3}\d{4}/.test(digits)) return true
  if (/\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/.test(t)) return true
  // 숫자 사이에 글자를 끼워 숨긴 경우("010 일이삼사 ...")는 한글 숫자 변환으로 이미 잡힌다

  // 이메일 (골뱅이·dot 같은 말로 쓴 것 포함)
  if (/[a-z0-9._%+-]+\s*(@|골뱅이|\(at\)|\[at\])\s*[a-z0-9-]+\s*(\.|점|\(dot\)|\[dot\])\s*[a-z]{2,}/i.test(t)) return true

  // 주민등록번호 모양
  if (/\d{6}\s*[-~]?\s*[1-8]\d{6}/.test(t)) return true

  // URL
  if (/(https?:\/\/|www\.)\S+/i.test(t)) return true
  if (/\b[a-z0-9-]{2,}\.(com|net|kr|co\.kr|org|io|me|xyz|gg|ly|app|dev|link|site|shop|blog)\b/i.test(t)) return true

  // 카톡·인스타 아이디 유도 ("@아이디", "카톡 아이디", "dm 주세요")
  if (/@\s*[\w가-힣._]{2,}/.test(t)) return true
  const sns = /(카톡|카카오|오픈채팅|오픈카톡|인스타|insta|telegram|텔레그램|라인|디엠|\bdm\b)/i
  const ask = /(아이디|\bid\b|친추|친구추가|추가해|연락\s*(주|해|처)|문의|쪽지|주세요|줘요)/i
  if (sns.test(t) && ask.test(t)) return true

  return false
}

function hasBlockedEmoji(emoji: string): boolean {
  // 변형 선택자·피부색·ZWJ를 지운 기본 글자로 비교
  const base = emoji.replace(/[\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}‍]/gu, '')
  return BLOCKED_EMOJI.some((b) => base.includes(b))
}

/** 네트워크 없이 하는 검사만. 테스트와 비용 절약(걸리면 OpenAI를 부르지 않음)을 위해 따로 둔다. */
export function localCheck(story: string, emoji: string): ModerationResult {
  const f = forms(story)
  if (hasAny(f, SELF)) return 'selfharm' // 막는 게 아니라 안내
  if (hasBlockedEmoji(emoji)) return 'blocked'
  if (hasAny(f, bad())) return 'blocked'
  if (hasPersonalInfo(story)) return 'blocked'
  return 'ok'
}

interface OpenAiResult {
  categories: Record<string, boolean>
  category_scores: Record<string, number>
}

async function openAi(story: string): Promise<OpenAiResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY 환경변수가 없습니다')
  const r = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: story }),
    signal: AbortSignal.timeout(6000),
  })
  if (!r.ok) throw new Error(`OpenAI moderation ${r.status}`)
  const data = (await r.json()) as { results?: OpenAiResult[] }
  const res = data.results?.[0]
  if (!res?.category_scores) throw new Error('OpenAI moderation: 응답 모양이 이상함')
  return res
}

/**
 * 결과: 'ok' | 'blocked' | 'selfharm'
 * 검열 API가 실패하면 throw — drop.ts가 저장하지 않고 503을 돌려준다. (검열 없이 올라가는 일이 없게)
 */
export async function moderate(story: string, emoji: string): Promise<ModerationResult> {
  const local = localCheck(story, emoji)
  if (local !== 'ok') return local

  const res = await openAi(story)

  // self-harm 카테고리는 OpenAI가 flagged로 본 것만 안내 카드로 (막지 않는다)
  const selfharm = Object.entries(res.categories).some(([k, v]) => k.startsWith('self-harm') && v)
  if (selfharm) return 'selfharm'

  const worst = Object.entries(res.category_scores)
    .filter(([k]) => !k.startsWith('self-harm'))
    .reduce((m, [, s]) => Math.max(m, s), 0)
  return worst >= BLOCK_SCORE ? 'blocked' : 'ok'
}
