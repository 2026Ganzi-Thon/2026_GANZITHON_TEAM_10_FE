import type { ReactNode, Ref } from 'react'
import { SheepProfile } from '@/components'
import type { Conversation } from './conversationMock'
import styles from './DrawingConversation.module.css'

type Message = Conversation['messages'][number]

export const ConversationBubble = ({ role, text }: Message) => (
  <div className={styles[role]}>
    {role === 'assistant' && <SheepProfile color="white" size={40} alt="AI" />}
    <p className={styles.bubble}>{text}</p>
  </div>
)

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
