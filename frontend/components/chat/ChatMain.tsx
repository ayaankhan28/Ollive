'use client'

import { WifiIcon, WifiOffIcon } from 'lucide-react'
import ChatWindow from './ChatWindow'
import ChatInput from './ChatInput'
import type { Message, Session } from '@/lib/types'

interface ChatMainProps {
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  isLoadingMessages: boolean
  isConnected: boolean
  sendChatMessage: (message: string) => void
  messagesEndRef: React.RefObject<HTMLDivElement>
}

export default function ChatMain({
  sessions,
  activeSessionId,
  messages,
  isStreaming,
  streamingContent,
  isLoadingMessages,
  isConnected,
  sendChatMessage,
  messagesEndRef,
}: ChatMainProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const sessionTitle = activeSession?.title || (activeSessionId ? 'Chat' : 'New Chat')

  return (
    <main className="flex-1 flex flex-col h-full min-w-0 bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e] flex-shrink-0 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[#888888] font-medium text-sm truncate">
            {sessionTitle}
          </h1>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isConnected ? (
            <>
              <WifiIcon size={13} className="text-[#22c55e]" />
              <span className="text-[#22c55e] text-xs font-medium">Connected</span>
            </>
          ) : (
            <>
              <WifiOffIcon size={13} className="text-[#ef4444]" />
              <span className="text-[#ef4444] text-xs font-medium">
                Reconnecting...
              </span>
            </>
          )}
        </div>
      </header>

      {/* Chat Window */}
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        isLoadingMessages={isLoadingMessages}
        messagesEndRef={messagesEndRef}
        onSuggestionClick={sendChatMessage}
      />

      {/* Input */}
      <ChatInput
        onSend={sendChatMessage}
        isStreaming={isStreaming}
        isConnected={isConnected}
      />
    </main>
  )
}
