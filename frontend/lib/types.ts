export interface User {
  id: string
  name: string
  email: string
  created_at: string
}

export interface Session {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id?: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export type WSMessageType =
  | { type: 'session_info'; session_id: string; title: string }
  | { type: 'session_title'; session_id: string; title: string }
  | { type: 'chunk'; content: string }
  | { type: 'done'; session_id: string }
  | { type: 'error'; error: string }
