'use client'

import { useEffect, useRef } from 'react'
import { SparklesIcon, ZapIcon, BrainIcon, CodeIcon } from 'lucide-react'
import ChatMessage from './ChatMessage'
import type { Message } from '@/lib/types'

interface ChatWindowProps {
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  isLoadingMessages: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  onSuggestionClick: (prompt: string) => void
}

const SUGGESTIONS = [
  {
    icon: <SparklesIcon size={16} className="text-[#a78bfa]" />,
    title: 'Creative Writing',
    prompt:
      'Write a short story about a programmer who discovers their AI assistant has become sentient.',
  },
  {
    icon: <CodeIcon size={16} className="text-[#60a5fa]" />,
    title: 'Code Review',
    prompt:
      'Review my Python function and suggest improvements for readability and performance.',
  },
  {
    icon: <BrainIcon size={16} className="text-[#34d399]" />,
    title: 'Explain a Concept',
    prompt:
      'Explain how transformers work in machine learning, using simple analogies.',
  },
  {
    icon: <ZapIcon size={16} className="text-[#fbbf24]" />,
    title: 'Quick Summary',
    prompt: 'Summarize the key differences between REST and GraphQL APIs.',
  },
]

function WelcomeScreen({
  onSuggestionClick,
}: {
  onSuggestionClick: (prompt: string) => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 animate-[fade-in_0.2s_ease-out]">
      {/* Logo */}
      <div className="mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] flex items-center justify-center shadow-2xl shadow-purple-900/40 mx-auto">
          <ZapIcon size={28} className="text-white" />
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-white mb-2">
        How can I help you today?
      </h2>
      <p className="text-[#666666] text-sm mb-10 text-center max-w-sm">
        Ask me anything — I&apos;m powered by Claude and Gemini, ready to assist
        with coding, writing, analysis, and more.
      </p>

      {/* Suggestion cards */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            onClick={() => onSuggestionClick(suggestion.prompt)}
            className="flex items-start gap-3 p-4 rounded-xl bg-[#141414] border border-[#222222] hover:border-[#3a3a3a] hover:bg-[#1a1a1a] text-left transition-all duration-150 group"
          >
            <span className="mt-0.5 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
              {suggestion.icon}
            </span>
            <div>
              <p className="text-sm font-medium text-[#dddddd] group-hover:text-white transition-colors mb-1">
                {suggestion.title}
              </p>
              <p className="text-xs text-[#555555] group-hover:text-[#777777] transition-colors leading-relaxed line-clamp-2">
                {suggestion.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function LoadingMessages() {
  return (
    <div className="flex-1 flex flex-col gap-6 px-6 py-6">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`flex gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}
        >
          <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
          <div
            className={`flex flex-col gap-2 max-w-lg ${
              i % 2 === 0 ? 'items-end' : ''
            }`}
          >
            <div className="skeleton h-3 w-48 rounded" />
            <div className="skeleton h-3 w-64 rounded" />
            <div className="skeleton h-3 w-40 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ChatWindow({
  messages,
  isStreaming,
  streamingContent,
  isLoadingMessages,
  messagesEndRef,
  onSuggestionClick,
}: ChatWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages or streaming content changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 200
    if (isNearBottom || isStreaming) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages, streamingContent, isStreaming])

  if (isLoadingMessages) {
    return (
      <div className="flex-1 overflow-y-auto min-h-0">
        <LoadingMessages />
      </div>
    )
  }

  const hasMessages = messages.length > 0 || (isStreaming && streamingContent)

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto min-h-0 scroll-smooth"
    >
      {!hasMessages ? (
        <WelcomeScreen onSuggestionClick={onSuggestionClick} />
      ) : (
        <div className="flex flex-col gap-1 px-4 py-6 max-w-4xl mx-auto w-full">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id || `msg-${index}`}
              message={message}
              isLast={index === messages.length - 1}
            />
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <ChatMessage
              message={{
                session_id: '',
                role: 'assistant',
                content: streamingContent,
              }}
              isLast={true}
              isStreaming={true}
            />
          )}

          {/* Waiting for first chunk — show typing dots */}
          {isStreaming && !streamingContent && (
            <div className="flex items-start gap-3 py-3 animate-[fade-in_0.2s_ease-out]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-900/30 mt-0.5">
                <ZapIcon size={13} className="text-white" />
              </div>
              <div className="flex items-center gap-1.5 py-3 px-4 rounded-2xl rounded-tl-sm bg-[#141414] border border-[#222222]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      )}
    </div>
  )
}
