'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useWebSocket } from './useWebSocket'
import {
  createOrGetUser,
  getSessions,
  getSessionMessages,
  deleteSession as apiDeleteSession,
  updateSessionTitle as apiUpdateSessionTitle,
} from '@/lib/api'
import { generateUUID } from '@/lib/utils'
import type { WSMessageType, Message } from '@/lib/types'

const CLIENT_ID_KEY = 'ollive_client_id'
const USER_STORAGE_KEY = 'ollive_user'

const DEFAULT_USER_NAME = 'Guest'
const DEFAULT_USER_EMAIL = 'guest@ollive.app'

export function useChat() {
  const store = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Stable client ID — persisted to localStorage
  const [clientId] = useState<string>(() => {
    if (typeof window === 'undefined') return generateUUID()
    const saved = localStorage.getItem(CLIENT_ID_KEY)
    if (saved) return saved
    const newId = generateUUID()
    localStorage.setItem(CLIENT_ID_KEY, newId)
    return newId
  })

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback(
    (data: unknown) => {
      const msg = data as WSMessageType

      switch (msg.type) {
        case 'session_info': {
          const { session_id, title } = msg
          const currentStore = useChatStore.getState()

          // Set active session if this is a new one
          if (currentStore.activeSessionId !== session_id) {
            currentStore.setActiveSession(session_id)
          }

          // Update or add session in the list
          const existing = currentStore.sessions.find((s) => s.id === session_id)
          if (existing) {
            currentStore.updateSessionTitle(session_id, title)
          } else {
            // New session — add it to the top
            currentStore.addSession({
              id: session_id,
              user_id: currentStore.user?.id || '',
              title,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          }
          break
        }

        case 'session_title': {
          // Title was auto-generated — update in sidebar
          const { session_id, title } = msg
          useChatStore.getState().updateSessionTitle(session_id, title)
          break
        }

        case 'chunk': {
          store.appendStreamingContent(msg.content)
          scrollToBottom()
          break
        }

        case 'done': {
          // Finalize the streaming message
          const finalContent = useChatStore.getState().streamingContent
          if (finalContent) {
            const sessionId =
              msg.session_id ||
              useChatStore.getState().activeSessionId ||
              ''
            const assistantMessage: Message = {
              session_id: sessionId,
              role: 'assistant',
              content: finalContent,
              created_at: new Date().toISOString(),
            }
            useChatStore.getState().addMessage(assistantMessage)
          }
          useChatStore.getState().clearStreamingContent()
          useChatStore.getState().setIsStreaming(false)
          useChatStore.getState().clearToolCalls()
          scrollToBottom()

          // Re-sort sessions: bubble active to top
          const state = useChatStore.getState()
          const updatedSessions = [...state.sessions]
          const sessionIdx = updatedSessions.findIndex(
            (s) => s.id === msg.session_id
          )
          if (sessionIdx > 0) {
            const [session] = updatedSessions.splice(sessionIdx, 1)
            session.updated_at = new Date().toISOString()
            updatedSessions.unshift(session)
            useChatStore.getState().setSessions(updatedSessions)
          }
          break
        }

        case 'tool_start': {
          const { tool_name, tool_input } = msg
          useChatStore.getState().addToolCall({
            id: `${tool_name}-${Date.now()}`,
            tool_name,
            tool_input,
            status: 'running',
            started_at: new Date().toISOString(),
          })
          scrollToBottom()
          break
        }

        case 'tool_end': {
          const { tool_name, tool_result } = msg
          useChatStore.getState().completeToolCall(tool_name, tool_result)
          scrollToBottom()
          break
        }

        case 'error': {
          console.error('WS error from server:', msg.error)
          useChatStore.getState().clearStreamingContent()
          useChatStore.getState().setIsStreaming(false)
          useChatStore.getState().clearToolCalls()
          break
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollToBottom]
  )

  const { sendMessage, isConnected } = useWebSocket({
    clientId,
    onMessage: handleWsMessage,
  })

  // Initialize user on mount
  useEffect(() => {
    async function initUser() {
      if (typeof window === 'undefined') return

      // Try to restore from localStorage
      try {
        const savedRaw = localStorage.getItem(USER_STORAGE_KEY)
        if (savedRaw) {
          const saved = JSON.parse(savedRaw)
          if (saved?.id && saved?.email) {
            const user = await createOrGetUser(saved.name, saved.email)
            store.setUser(user)
            // Re-save with fresh data from server
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
            await loadSessions(user.id)
            return
          }
        }
      } catch (err) {
        console.error('Failed to restore user session:', err)
      }

      // Create a new guest user
      try {
        const user = await createOrGetUser(DEFAULT_USER_NAME, DEFAULT_USER_EMAIL)
        store.setUser(user)
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
        await loadSessions(user.id)
      } catch (err) {
        console.error('Failed to create user:', err)
      }
    }

    initUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSessions = useCallback(
    async (userId: string) => {
      store.setIsLoadingSessions(true)
      try {
        const sessions = await getSessions(userId)
        store.setSessions(sessions)
      } catch (err) {
        console.error('Failed to load sessions:', err)
      } finally {
        store.setIsLoadingSessions(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const selectSession = useCallback(
    async (sessionId: string) => {
      const currentActiveId = useChatStore.getState().activeSessionId
      if (currentActiveId === sessionId) return

      store.setActiveSession(sessionId)
      store.setMessages([])
      store.clearStreamingContent()
      store.setIsStreaming(false)
      store.setIsLoadingMessages(true)

      try {
        const userId = useChatStore.getState().user?.id || ''
        const messages = await getSessionMessages(sessionId, userId)
        store.setMessages(messages)
        scrollToBottom()
      } catch (err) {
        console.error('Failed to load messages:', err)
      } finally {
        store.setIsLoadingMessages(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollToBottom]
  )

  const startNewChat = useCallback(() => {
    store.setActiveSession(null)
    store.setMessages([])
    store.clearStreamingContent()
    store.setIsStreaming(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendChatMessage = useCallback(
    (message: string) => {
      const currentStore = useChatStore.getState()
      if (!message.trim() || currentStore.isStreaming || !currentStore.user) return

      const userId = currentStore.user.id
      const sessionId = currentStore.activeSessionId

      // Optimistically add user message to UI
      const userMessage: Message = {
        session_id: sessionId || '',
        role: 'user',
        content: message.trim(),
        created_at: new Date().toISOString(),
      }
      store.addMessage(userMessage)
      store.setIsStreaming(true)
      store.clearStreamingContent()
      scrollToBottom()

      // Send via WebSocket
      sendMessage({
        type: 'chat',
        message: message.trim(),
        session_id: sessionId,
        user_id: userId,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendMessage, scrollToBottom]
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const userId = useChatStore.getState().user?.id || ''
        await apiDeleteSession(sessionId, userId)
        store.removeSession(sessionId)
      } catch (err) {
        console.error('Failed to delete session:', err)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const renameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      if (!newTitle.trim()) return
      try {
        const userId = useChatStore.getState().user?.id || ''
        const updated = await apiUpdateSessionTitle(sessionId, newTitle.trim(), userId)
        store.updateSessionTitle(sessionId, updated.title)
      } catch (err) {
        console.error('Failed to rename session:', err)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return {
    // State
    user: store.user,
    sessions: store.sessions,
    activeSessionId: store.activeSessionId,
    messages: store.messages,
    isStreaming: store.isStreaming,
    streamingContent: store.streamingContent,
    toolCalls: store.toolCalls,
    isLoadingSessions: store.isLoadingSessions,
    isLoadingMessages: store.isLoadingMessages,
    isConnected,

    // Actions
    selectSession,
    startNewChat,
    sendChatMessage,
    deleteSession,
    renameSession,

    // Refs
    messagesEndRef,
  }
}
