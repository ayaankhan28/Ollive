import type {
  MetricsResponse,
  SessionListResponse,
  SummaryResponse,
  TraceDetail,
  TraceListResponse,
} from './types'

// Server Components run inside Docker → need the internal service hostname.
// Browser (client components) → use the public-facing localhost URL.
function getBase(): string {
  if (typeof window === 'undefined') {
    // SSR / server component path (runs in Node inside Docker)
    return process.env.INGESTION_URL || process.env.NEXT_PUBLIC_INGESTION_URL || 'http://localhost:8001'
  }
  // Browser path
  return process.env.NEXT_PUBLIC_INGESTION_URL || 'http://localhost:8001'
}

async function get<T>(path: string): Promise<T> {
  const base = getBase()
  const res = await fetch(`${base}/api/v1${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export async function getSummary(): Promise<SummaryResponse> {
  return get('/analytics/summary')
}

export async function getTraces(params: {
  page?: number
  limit?: number
  session_id?: string
  user_id?: string
  status?: string
  provider?: string
} = {}): Promise<TraceListResponse> {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.session_id) q.set('session_id', params.session_id)
  if (params.user_id) q.set('user_id', params.user_id)
  if (params.status) q.set('status', params.status)
  if (params.provider) q.set('provider', params.provider)
  return get(`/analytics/traces?${q}`)
}

export async function getTrace(traceId: string): Promise<TraceDetail> {
  return get(`/analytics/traces/${traceId}`)
}

export async function getMetrics(hours = 24): Promise<MetricsResponse> {
  return get(`/analytics/metrics?hours=${hours}`)
}

export async function getSessions(page = 1, limit = 20): Promise<SessionListResponse> {
  return get(`/analytics/sessions?page=${page}&limit=${limit}`)
}
