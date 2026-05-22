'use client'

import { ChevronDown } from 'lucide-react'
import ChatWindow from './ChatWindow'
import ChatInput from './ChatInput'
import { cn } from '@/lib/utils'
import type { Message, Session, ToolCall } from '@/lib/types'

interface ChatMainProps {
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  toolCalls: ToolCall[]
  isLoadingMessages: boolean
  isConnected: boolean
  sendChatMessage: (message: string) => void
  stopGeneration: () => void
  messagesEndRef: React.RefObject<HTMLDivElement>
}

export default function ChatMain({
  sessions,
  activeSessionId,
  messages,
  isStreaming,
  streamingContent,
  toolCalls,
  isLoadingMessages,
  isConnected,
  sendChatMessage,
  stopGeneration,
  messagesEndRef,
}: ChatMainProps) {
  const hasMessages = messages.length > 0 || (isStreaming && !!streamingContent) || toolCalls.length > 0

  return (
    <main className="flex-1 flex flex-col h-full min-w-0 bg-[#0d0d0d]">
      {/* Minimal top bar */}
      <header className="flex items-center justify-between px-5 py-3 flex-shrink-0 h-12">
        <button className="flex items-center gap-1 hover:bg-white/5 px-2 py-1 rounded-lg transition-colors group">
          <span className="text-white font-semibold text-sm tracking-tight">Ollive</span>
          <ChevronDown
            size={13}
            className="text-white/40 group-hover:text-white/60 transition-colors mt-px"
          />
        </button>

        <div
          className={cn(
            'w-2 h-2 rounded-full transition-colors duration-1000',
            isConnected ? 'bg-emerald-500/50' : 'bg-red-500/50'
          )}
          title={isConnected ? 'Connected' : 'Reconnecting…'}
        />
      </header>

      {/* Message/welcome area */}
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        toolCalls={toolCalls}
        isLoadingMessages={isLoadingMessages}
        messagesEndRef={messagesEndRef}
        onSuggestionClick={sendChatMessage}
        onSend={sendChatMessage}
        onStop={stopGeneration}
        isConnected={isConnected}
      />

      {/* Bottom input — only rendered when conversation has started */}
      {hasMessages && (
        <ChatInput
          onSend={sendChatMessage}
          onStop={stopGeneration}
          isStreaming={isStreaming}
          isConnected={isConnected}
        />
      )}
    </main>
  )
}
