const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const isEmojiGrapheme = (g: string) =>
  g.length <= 20 && (/^\p{Regional_Indicator}{2}$/u.test(g) || /\p{Extended_Pictographic}/u.test(g))

/** 입력칸에 들어온 글자 중 이모지만 남기고, 여러 개면 마지막 하나만. (이모지 아닌 글자는 지움) */
export function lastEmoji(value: string): string {
  const gs = [...seg.segment(value)].map((x) => x.segment).filter(isEmojiGrapheme)
  return gs.length ? gs[gs.length - 1] : ''
}
