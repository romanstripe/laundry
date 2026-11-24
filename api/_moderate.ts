export type ModerationResult = 'ok' | 'blocked' | 'selfharm'

/**
 * 2단계에서 구현한다 (금칙어 · 개인정보 · OpenAI moderation · emoji 차단 목록).
 * 지금은 자리만 있다 — 이 상태로는 검열 없이 통과하니 2단계 전에는 배포하지 말 것.
 * 검열 API가 실패하면 throw 해서 drop.ts가 503으로 막는다.
 */
export async function moderate(_story: string, _emoji: string): Promise<ModerationResult> {
  return 'ok'
}
