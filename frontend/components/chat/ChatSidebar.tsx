'use client'

import { useState, useRef, useEffect } from 'react'
import {
  PlusIcon,
  MessageSquareIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react'
import { cn, truncate } from '@/lib/utils'
import type { Session, User } from '@/lib/types'

interface ChatSidebarProps {
  user: User | null
  sessions: Session[]
  activeSessionId: string | null
  isLoadingSessions: boolean
  selectSession: (id: string) => void
  startNewChat: () => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
}

function SessionSkeleton() {
  return (
    <div className="space-y-1 px-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg">
          <div className="skeleton h-4 w-4 rounded flex-shrink-0" />
          <div
            className="skeleton h-3 rounded flex-grow"
            style={{ width: `${60 + i * 8}%`, opacity: 1 - i * 0.12 }}
          />
        </div>
      ))}
    </div>
  )
}

interface SessionItemProps {
  session: Session
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitle(session.title)
    setIsEditing(true)
  }

  const handleConfirmEdit = () => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditTitle(session.title)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConfirmEdit()
    if (e.key === 'Escape') handleCancelEdit()
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer',
        'transition-all duration-150 select-none',
        isActive
          ? 'bg-[#1f1535] border border-[#6d28d9]/40 text-white'
          : 'hover:bg-[#1a1a1a] text-[#cccccc] hover:text-white border border-transparent'
      )}
      onClick={!isEditing ? onSelect : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#7c3aed] rounded-r-full" />
      )}

      {/* Icon */}
      <MessageSquareIcon
        size={14}
        className={cn(
          'flex-shrink-0 transition-colors',
          isActive
            ? 'text-[#8b5cf6]'
            : 'text-[#666666] group-hover:text-[#888888]'
        )}
      />

      {/* Title / Edit Input */}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleCancelEdit}
          className="flex-1 bg-transparent text-sm text-white outline-none border-b border-[#7c3aed] min-w-0 py-0.5"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 text-sm truncate min-w-0">
          {truncate(session.title, 28)}
        </span>
      )}

      {/* Action buttons */}
      {isEditing ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              handleConfirmEdit()
            }}
            className="p-0.5 rounded text-[#7c3aed] hover:text-[#a78bfa] transition-colors"
          >
            <CheckIcon size={12} />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              handleCancelEdit()
            }}
            className="p-0.5 rounded text-[#666666] hover:text-[#999999] transition-colors"
          >
            <XIcon size={12} />
          </button>
        </div>
      ) : (
        (isHovered || isActive) && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleStartEdit}
              className="p-1 rounded text-[#666666] hover:text-[#aaaaaa] hover:bg-[#2a2a2a] transition-colors"
              title="Rename"
            >
              <PencilIcon size={11} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1 rounded text-[#666666] hover:text-[#ef4444] hover:bg-[#2a2a2a] transition-colors"
              title="Delete"
            >
              <TrashIcon size={11} />
            </button>
          </div>
        )
      )}
    </div>
  )
}

export default function ChatSidebar({
  user,
  sessions,
  activeSessionId,
  isLoadingSessions,
  selectSession,
  startNewChat,
  deleteSession,
  renameSession,
}: ChatSidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 bg-[#0f0f0f] border-r border-[#1e1e1e] flex flex-col h-full">
      {/* Header / Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-[#1e1e1e]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-900/30">
          <ZapIcon size={14} className="text-white" />
        </div>
        <span className="text-white font-semibold text-base tracking-tight">
          Ollive
        </span>
      </div>

      {/* New Chat Button */}
      <div className="px-3 py-3">
        <button
          onClick={startNewChat}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg',
            'bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6]',
            'text-white text-sm font-medium',
            'transition-all duration-150',
            'shadow-lg shadow-purple-900/20',
            'border border-[#8b5cf6]/30'
          )}
        >
          <PlusIcon size={15} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {isLoadingSessions ? (
          <SessionSkeleton />
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquareIcon
              size={24}
              className="mx-auto mb-2 text-[#333333]"
            />
            <p className="text-xs text-[#555555]">No conversations yet</p>
            <p className="text-xs text-[#444444] mt-1">Start a new chat above</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={activeSessionId === session.id}
                onSelect={() => selectSession(session.id)}
                onDelete={() => deleteSession(session.id)}
                onRename={(title) => renameSession(session.id, title)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer — user info */}
      <div className="px-4 py-3 border-t border-[#1e1e1e]">
        {user ? (
          <p className="text-[#444444] text-xs truncate" title={user.email}>
            {user.email}
          </p>
        ) : (
          <p className="text-[#333333] text-xs text-center">
            Powered by Claude &amp; Gemini
          </p>
        )}
      </div>
    </aside>
  )
}
