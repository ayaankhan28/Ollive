'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { SendHorizonal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  isStreaming: boolean
  isConnected: boolean
}

export default function ChatInput({
  onSend,
  isStreaming,
  isConnected,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const MAX_ROWS = 5
  const LINE_HEIGHT = 24 // approximate px per row
  const BASE_HEIGHT = 24 // single row height in px

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const scrollHeight = el.scrollHeight
    const maxHeight = LINE_HEIGHT * MAX_ROWS
    el.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    el.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming || !isConnected) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = `${BASE_HEIGHT}px`
    }
  }, [value, isStreaming, isConnected, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const canSend = value.trim().length > 0 && !isStreaming && isConnected

  return (
    <div className="flex-shrink-0 border-t border-[#1e1e1e] bg-[#0a0a0a] px-4 py-4">
      <div className="max-w-4xl mx-auto">
        {/* Streaming indicator */}
        {isStreaming && (
          <p className="text-[#7c3aed] text-xs mb-2 text-center animate-[fade-in_0.2s_ease-out]">
            Ollive is responding...
          </p>
        )}

        <div
          className={cn(
            'flex items-end gap-3 rounded-2xl px-4 py-3',
            'bg-[#141414] border transition-all duration-150',
            isStreaming
              ? 'border-[#7c3aed]/40 shadow-lg shadow-purple-900/10'
              : 'border-[#2a2a2a] hover:border-[#3a3a3a] focus-within:border-[#7c3aed]/60 focus-within:shadow-lg focus-within:shadow-purple-900/10'
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            data-chat-input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? 'Ollive is responding...'
                : isConnected
                ? 'Message Ollive... (Enter to send, Shift+Enter for newline)'
                : 'Connecting to server...'
            }
            disabled={isStreaming || !isConnected}
            rows={1}
            className={cn(
              'flex-1 bg-transparent text-white text-sm leading-6 resize-none',
              'placeholder-[#444444] outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{ minHeight: `${BASE_HEIGHT}px` }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Send message (Enter)"
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
              'transition-all duration-150',
              canSend
                ? 'bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] text-white shadow-lg shadow-purple-900/30 hover:scale-105'
                : 'bg-[#1f1f1f] text-[#444444] cursor-not-allowed'
            )}
          >
            <SendHorizonal size={15} />
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-[#333333] text-[11px] text-center mt-2">
          Ollive can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}
