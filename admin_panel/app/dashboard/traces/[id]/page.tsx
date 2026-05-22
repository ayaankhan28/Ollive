import Link from 'next/link'
import { getTrace } from '@/lib/api'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-[#161616] last:border-0">
      <span className="text-[11px] text-[#444] w-36 shrink-0">{label}</span>
      <span className="text-[11px] text-[#888]">{value}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4">
      <div className="text-[11px] font-medium text-[#555] uppercase tracking-[0.06em] mb-3">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-[#555]">{label}</span>
      <span className="text-[11px] font-mono text-[#888]">{value}</span>
    </div>
  )
}

export default async function TraceDetailPage({ params }: { params: { id: string } }) {
  let trace = null
  try { trace = await getTrace(params.id) }
  catch { notFound() }
  if (!trace) notFound()

  const statusColor = trace.status === 'success' ? '#4ade80' : trace.status === 'error' ? '#f87171' : '#fbbf24'
  const throughput = trace.latency_ms && trace.completion_tokens
    ? `${((trace.completion_tokens / trace.latency_ms) * 1000).toFixed(1)} t/s` : '—'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1a1a1a] shrink-0">
        <Link href="/dashboard/traces" className="text-[#333] hover:text-[#666] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="w-[6px] h-[6px] rounded-full" style={{ background: statusColor }} />
          <span className="text-[12px] font-mono text-[#888]">{trace.trace_id}</span>
        </div>
        <span className="text-[11px]" style={{ color: statusColor }}>{trace.status}</span>
        <div className="flex-1" />
        <span className="text-[11px] text-[#444]">{fmtDate(trace.created_at)}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Card title="Timing">
            <Row label="Total latency" value={fmtMs(trace.latency_ms)} />
            <Row label="First token" value={fmtMs(trace.first_token_latency_ms)} />
            <Row label="Throughput" value={throughput} />
          </Card>
          <Card title="Usage">
            <Row label="Prompt tokens" value={trace.prompt_tokens ?? '—'} />
            <Row label="Completion" value={trace.completion_tokens ?? '—'} />
            <Row label="Total" value={trace.total_tokens ?? '—'} />
            <Row label="Est. cost" value={trace.estimated_cost_usd != null ? `$${trace.estimated_cost_usd.toFixed(6)}` : '—'} />
          </Card>
          <Card title="Model">
            <Row label="Provider" value={<span className="capitalize">{trace.provider}</span>} />
            <Row label="Model" value={trace.model} />
            <Row label="Max tokens" value={trace.max_tokens ?? '—'} />
            {trace.temperature != null && <Row label="Temperature" value={trace.temperature} />}
          </Card>
        </div>

        {/* Error banner */}
        {trace.error_type && (
          <div className="mb-4 bg-red-500/5 border border-red-500/15 rounded-[8px] p-4">
            <div className="text-[11px] font-medium text-red-400 mb-1">{trace.error_type}</div>
            {trace.error_message && <pre className="text-[10px] font-mono text-red-300/60 whitespace-pre-wrap">{trace.error_message}</pre>}
          </div>
        )}

        {/* Previews */}
        {(trace.input_preview || trace.output_preview) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {trace.input_preview && (
              <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4">
                <div className="text-[11px] font-medium text-[#444] uppercase tracking-[0.06em] mb-2">Input</div>
                <p className="text-[11px] text-[#666] leading-relaxed line-clamp-6">{trace.input_preview}</p>
              </div>
            )}
            {trace.output_preview && (
              <div className="bg-[#edeae5] border border-[#ddd] rounded-[10px] p-4">
                <div className="text-[11px] font-medium text-[#999] uppercase tracking-[0.06em] mb-2">Output</div>
                <p className="text-[11px] text-[#555] leading-relaxed line-clamp-6">{trace.output_preview}</p>
              </div>
            )}
          </div>
        )}

        {/* Stream timeline */}
        {trace.stream_events.length > 0 && (
          <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-medium text-[#444] uppercase tracking-[0.06em]">Stream Timeline</div>
              <span className="text-[10px] font-mono text-[#333]">{trace.stream_events.length} events</span>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {trace.stream_events.slice(0, 20).map((ev, i) => (
                <div key={i} className="flex items-start gap-3 py-1 text-[10px]">
                  <span className="font-mono text-[#333] w-6 shrink-0 tabular-nums text-right">#{ev.sequence_number}</span>
                  <span className={`shrink-0 w-12 ${ev.event_type === 'chunk' ? 'text-blue-400/70' : ev.event_type === 'end' ? 'text-green-400/70' : 'text-[#444]'}`}>{ev.event_type}</span>
                  <span className="font-mono text-[#333] w-16 shrink-0 tabular-nums">
                    {ev.latency_from_start_ms != null ? `+${ev.latency_from_start_ms}ms` : ''}
                  </span>
                  {ev.content && <span className="text-[#555] truncate">{ev.content.slice(0, 60)}</span>}
                </div>
              ))}
              {trace.stream_events.length > 20 && (
                <div className="text-[10px] text-[#333] pt-1 font-mono">… {trace.stream_events.length - 20} more</div>
              )}
            </div>
          </div>
        )}

        {/* Context */}
        <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4">
          <div className="text-[11px] font-medium text-[#444] uppercase tracking-[0.06em] mb-2">Context</div>
          <Meta label="Trace ID" value={<span className="font-mono">{trace.trace_id}</span>} />
          {trace.session_id && <Meta label="Session" value={<Link href="/dashboard/sessions" className="font-mono text-purple-400/70 hover:text-purple-400">{trace.session_id}</Link>} />}
          {trace.user_id && <Meta label="User" value={<span className="font-mono">{trace.user_id}</span>} />}
          <Meta label="Started" value={fmtDate(trace.started_at)} />
          <Meta label="Completed" value={fmtDate(trace.completed_at)} />
        </div>
      </div>
    </div>
  )
}
