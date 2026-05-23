export interface StreamEvent {
  event_type: string
  sequence_number: number
  content: string | null
  latency_from_start_ms: number | null
  timestamp: string
}

export interface Trace {
  id: string
  trace_id: string
  name: string | null
  span_type: 'trace' | 'generation' | 'tool' | 'span'
  parent_trace_id: string | null
  sequence: number
  provider: string
  model: string
  status: 'pending' | 'success' | 'error' | 'cancelled'
  session_id: string | null
  user_id: string | null
  conversation_id: string | null
  started_at: string | null
  completed_at: string | null
  latency_ms: number | null
  first_token_latency_ms: number | null
  temperature: number | null
  max_tokens: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  input_preview: string | null
  output_preview: string | null
  error_type: string | null
  error_message: string | null
  created_at: string
}

export interface TraceDetail extends Trace {
  stream_events: StreamEvent[]
  children: Trace[]
}

export interface TraceListResponse {
  traces: Trace[]
  total: number
  page: number
  limit: number
}

export interface ProviderBreakdown {
  provider: string
  count: number
  total_tokens: number | null
  total_cost_usd: number | null
}

export interface StatusBreakdown {
  status: string
  count: number
}

export interface SummaryResponse {
  total_traces: number
  successful_traces: number
  failed_traces: number
  success_rate: number
  total_tokens: number
  total_cost_usd: number
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  traces_last_24h: number
  traces_last_7d: number
  by_provider: ProviderBreakdown[]
  by_status: StatusBreakdown[]
}

export interface TimeSeriesPoint {
  timestamp: string
  value: number
}

export interface MetricsResponse {
  latency: TimeSeriesPoint[]
  tokens: TimeSeriesPoint[]
  requests: TimeSeriesPoint[]
  errors: TimeSeriesPoint[]
}

export interface ErrorRatePoint {
  timestamp: string
  errors: number
  total: number
  error_rate: number
}

export interface ErrorRateResponse {
  data: ErrorRatePoint[]
  hours: number
}

export interface SessionAnalytics {
  session_id: string
  trace_count: number
  total_tokens: number
  total_cost_usd: number
  avg_latency_ms: number
  last_trace_at: string | null
}

export interface SessionListResponse {
  sessions: SessionAnalytics[]
  total: number
}

export interface SessionDetailResponse {
  session_id: string
  turns: TraceDetail[]      // root agent-turns, oldest first, each with .children
  total_turns: number
  total_tokens: number
  total_cost_usd: number
}
