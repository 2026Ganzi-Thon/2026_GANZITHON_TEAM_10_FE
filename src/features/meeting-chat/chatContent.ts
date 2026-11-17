import { badWords } from 'badwords-ko/src/badwords.ko.config.json'

export const phaseLabels = {
  INTRO: '자기소개',
  DRAWING: '그림 그리기',
  SHARING: '그림 이야기',
  CLOSING: '마무리',
}

export const phasePrompts = {
  INTRO: '안녕하세요! 오늘 나와 닮은 동물로 가볍게 자기소개해 주세요.',
  DRAWING:
    '이제 그림을 그려볼 시간이에요! 잘 그리려고 노력하지 않아도 괜찮아요. 10분 동안 나만의 그림을 완성해 보세요. 모든 참여자가 그림을 공유하면 다음 단계로 넘어가요.',
  SHARING:
    '이제 각자 완성한 그림을 함께 나눠볼까요? 🎨\n\n그림을 그리면서 어떤 생각이나 감정이 떠올랐나요? 그림에 담고 싶었던 이야기나 특별히 마음이 가는 부분이 있다면 자유롭게 들려주세요. 꼭 멋지게 설명하지 않아도 괜찮아요. 각자의 방식으로 편안하게 이야기해 주세요. 다른 사람의 그림을 평가하거나 의미를 단정하기보다는, 서로의 생각과 감정을 존중하며 이야기에 귀 기울여 주세요.\n\n그럼 서로의 그림 속 이야기를 들어볼까요?',
  CLOSING:
    '이제 오늘의 모임을 마무리할 시간이에요.\n서로의 그림과 이야기를 나누면서 가장 마음에 남았던 순간은 무엇인가요? 짧은 한 문장으로 남겨도 좋고, 떠오르는 말이 없다면 건너뛰어도 괜찮아요. 함께해 주셔서 감사해요. 오늘 나눈 이야기들이 각자의 마음을 돌아보는 작은 계기가 되었기를 바라요.',
}

const allowedWords = ['시발점', '시바견', '자살', '자해']
const words = [...new Set([...badWords, 'ㅅㅂ', '개자식'].map((word) => word.trim()))]
  .filter((word) => word && !allowedWords.includes(word))
  .sort((a, b) => b.length - a.length)
const escapePattern = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const separators = '[._·\u200B-\u200D\uFEFF-]{0,3}'
const profanity = new RegExp(
  [
    ...allowedWords.map(escapePattern),
    ...words.map((word) => [...word].map(escapePattern).join(separators)),
  ].join('|'),
  'giu',
)

export const maskMeetingText = (text: string) =>
  text.replace(profanity, (word) =>
    allowedWords.includes(word) ? word : word.replace(/[^\s\p{P}\p{Cf}]/gu, '*'),
  )
