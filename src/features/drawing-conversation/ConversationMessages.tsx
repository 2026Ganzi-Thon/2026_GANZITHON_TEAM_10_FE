import type { ReactNode, Ref } from 'react'
import { SheepProfile } from '@/components'
import supportArrow from './assets/support-arrow.svg'
import type { Conversation } from './conversationMock'
import styles from './DrawingConversation.module.css'

type Message = Conversation['messages'][number]

export const ConversationBubble = ({ role, text }: Message) => {
  if (role === 'support') {
    return (
      <div className={styles.supportNotice}>
        <p>{text}</p>
        <a href="tel:109">
          <span>조금 더 전문적인 상담 받기 (109)</span>
          <img src={supportArrow} alt="" />
        </a>
      </div>
    )
  }

  return (
    <div className={styles[role]}>
      {role === 'assistant' && <SheepProfile color="white" size={40} alt="AI" />}
      <p className={styles.bubble}>{text}</p>
    </div>
  )
}

type ConversationMessagesProps = {
  messages: Conversation['messages']
  ref?: Ref<HTMLDivElement>
  readOnly?: boolean
  children?: ReactNode
}

export const ConversationMessages = ({
  messages,
  ref,
  readOnly,
  children,
}: ConversationMessagesProps) => (
  <div
    className={styles.messages}
    ref={ref}
    role={readOnly ? 'region' : 'log'}
    aria-label="그림 대화"
    tabIndex={readOnly ? 0 : undefined}
  >
    {messages.map((message, index) => (
      <ConversationBubble key={index} {...message} />
    ))}
    {children}
  </div>
)
