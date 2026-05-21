'use client'

import { useChat } from '@/hooks/useChat'
import ChatSidebar from './ChatSidebar'
import ChatMain from './ChatMain'

export default function ChatInterface() {
  const chat = useChat()

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <ChatSidebar
        user={chat.user}
        sessions={chat.sessions}
        activeSessionId={chat.activeSessionId}
        isLoadingSessions={chat.isLoadingSessions}
        selectSession={chat.selectSession}
        startNewChat={chat.startNewChat}
        deleteSession={chat.deleteSession}
        renameSession={chat.renameSession}
      />
      <ChatMain
        sessions={chat.sessions}
        activeSessionId={chat.activeSessionId}
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        streamingContent={chat.streamingContent}
        isLoadingMessages={chat.isLoadingMessages}
        isConnected={chat.isConnected}
        sendChatMessage={chat.sendChatMessage}
        messagesEndRef={chat.messagesEndRef}
      />
    </div>
  )
}
