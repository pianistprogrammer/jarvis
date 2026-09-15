export function toSpokenText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' I put the technical details on screen. ')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[*_#`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
