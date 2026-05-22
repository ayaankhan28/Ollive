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

export interface ToolCall {
  id: string          // unique per call
  tool_name: string
  tool_input: Record<string, unknown>
  tool_result?: string
  status: 'running' | 'done'
  started_at: string
  completed_at?: string
}

export type WSMessageType =
  | { type: 'session_info'; session_id: string; title: string }
  | { type: 'session_title'; session_id: string; title: string }
  | { type: 'chunk'; content: string }
  | { type: 'done'; session_id: string }
  | { type: 'stopped'; session_id: string }
  | { type: 'error'; error: string }
  | { type: 'tool_start'; tool_name: string; tool_input: Record<string, unknown> }
  | { type: 'tool_end'; tool_name: string; tool_result: string }
