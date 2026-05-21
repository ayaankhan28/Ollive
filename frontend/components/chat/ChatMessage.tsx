'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ZapIcon, UserIcon } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import type { Message } from '@/lib/types'

interface ChatMessageProps {
  message: Message
  isLast?: boolean
  isStreaming?: boolean
}

export default function ChatMessage({
  message,
  isLast,
  isStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end items-end gap-2 py-1 animate-[fade-in_0.2s_ease-out]">
        <div className="flex flex-col items-end max-w-[75%] gap-1">
          <span className="text-[10px] text-[#555555] px-1">You</span>
          {message.created_at && (
            <span className="text-[10px] text-[#444444] px-1">
              {formatTime(message.created_at)}
            </span>
          )}
          <div
            className={cn(
              'px-4 py-3 rounded-2xl rounded-br-sm',
              'bg-gradient-to-br from-[#5b21b6] to-[#4c1d95]',
              'border border-[#6d28d9]/40',
              'text-white text-sm leading-relaxed',
              'shadow-lg shadow-purple-900/20',
              'whitespace-pre-wrap break-words'
            )}
          >
            {message.content}
          </div>
        </div>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333333] flex items-center justify-center flex-shrink-0 mb-8">
          <UserIcon size={14} className="text-[#888888]" />
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3 py-1 animate-[fade-in_0.2s_ease-out]">
      {/* AI avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-900/30 mt-0.5">
        <ZapIcon size={13} className="text-white" />
      </div>

      <div className="flex flex-col min-w-0 max-w-[85%] gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#555555]">Ollive</span>
          {isStreaming ? (
            <span className="text-[10px] text-[#7c3aed]">typing...</span>
          ) : message.created_at ? (
            <span className="text-[10px] text-[#444444]">
              {formatTime(message.created_at)}
            </span>
          ) : null}
        </div>

        <div
          className={cn(
            'px-4 py-3 rounded-2xl rounded-tl-sm',
            'bg-[#141414] border border-[#222222]',
            'text-sm leading-relaxed',
            isStreaming && isLast ? 'streaming-cursor' : ''
          )}
        >
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
