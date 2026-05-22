import Link from 'next/link'
import { getTrace } from '@/lib/api'
import { TraceOut, StreamEvent } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

// ── helpers ────────────────────────────────────────────────────────────────

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

// ── Span type styling ──────────────────────────────────────────────────────

const SPAN_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  trace:      { dot: '#7c3aed', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'ROOT' },
  generation: { dot: '#3b82f6', badge: 'bg-blue-500/10   text-blue-400   border-blue-500/20',   label: 'LLM' },
  tool:       { dot: '#f59e0b', badge: 'bg-amber-500/10  text-amber-400  border-amber-500/20',  label: 'TOOL' },
  span:       { dot: '#22c55e', badge: 'bg-green-500/10  text-green-400  border-green-500/20',  label: 'SPAN' },
}
const spanStyle = (t: string) => SPAN_STYLE[t] ?? SPAN_STYLE.span

// ── Span tree node ─────────────────────────────────────────────────────────

function SpanRow({
  trace,
  depth = 0,
  isLast = false,
  active = false,
}: {
  trace: TraceOut
  depth?: number
  isLast?: boolean
  active?: boolean
}) {
  const st = spanStyle(trace.span_type)
  const statusColor = trace.status === 'success' ? '#4ade80' : trace.status === 'error' ? '#f87171' : '#fbbf24'

  return (
    <Link
      href={`/dashboard/traces/${trace.trace_id}`}
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-[6px] group transition-colors',
        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
      ].join(' ')}
      style={{ paddingLeft: `${12 + depth * 20}px` }}
    >
      {/* Tree connector */}
      {depth > 0 && (
        <div className="shrink-0 flex items-center" style={{ marginLeft: `-${20}px`, width: '20px' }}>
          <div className="w-3 h-px bg-[#2a2a2a]" />
        </div>
      )}

      {/* Status dot */}
      <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: statusColor }} />

      {/* Span name */}
      <span className={`text-[11px] font-mono ${active ? 'text-[#ccc]' : 'text-[#666] group-hover:text-[#999]'}`}>
        {trace.name || `${trace.span_type}.${trace.provider}`}
      </span>

      {/* Type badge */}
      <span className={`text-[9px] px-1.5 py-0.5 rounded-[4px] border font-medium shrink-0 ${st.badge}`}>
        {st.label}
      </span>

      <div className="flex-1" />

      {/* Latency */}
      <span className="text-[10px] font-mono text-[#444]">{fmtMs(trace.latency_ms)}</span>

      {/* Tokens */}
      {trace.total_tokens != null && (
        <span className="text-[10px] font-mono text-[#444]">{trace.total_tokens}t</span>
      )}

      {/* Cost */}
      {trace.estimated_cost_usd != null && trace.estimated_cost_usd > 0 && (
        <span className="text-[10px] font-mono text-[#555]">${trace.estimated_cost_usd.toFixed(5)}</span>
      )}
    </Link>
  )
}

// ── Side panel row ─────────────────────────────────────────────────────────

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-[#161616] last:border-0">
      <span className="text-[11px] text-[#444] w-32 shrink-0">{label}</span>
      <span className="text-[11px] text-[#777]">{value}</span>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4 mb-3">
      <div className="text-[10px] font-medium text-[#444] uppercase tracking-[0.07em] mb-2.5">{title}</div>
      {children}
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-[#555]">{label}</span>
      <span className="text-[11px] font-mono text-[#888]">{value ?? '—'}</span>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function TraceDetailPage({ params }: { params: { id: string } }) {
  let trace = null
  try { trace = await getTrace(params.id) }
  catch { notFound() }
  if (!trace) notFound()

  const st = spanStyle(trace.span_type)
  const statusColor = trace.status === 'success' ? '#4ade80' : trace.status === 'error' ? '#f87171' : '#fbbf24'
  const throughput = trace.latency_ms && trace.completion_tokens
    ? `${((trace.completion_tokens / trace.latency_ms) * 1000).toFixed(1)} t/s` : null

  return (
    <div className="flex h-full">

      {/* ── Left: Span tree ──────────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 border-r border-[#1a1a1a] flex flex-col bg-[#0d0d0d]">
        {/* Header */}
        <div className="px-3 py-3 border-b border-[#1a1a1a] flex items-center gap-2">
          <Link href="/dashboard/traces" className="text-[#333] hover:text-[#666]">
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
          <span className="text-[11px] font-mono text-[#555] truncate">{trace.trace_id.slice(0, 18)}…</span>
        </div>

        {/* Search box */}
        <div className="px-3 py-2 border-b border-[#161616]">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-[5px] px-2.5 py-1.5 text-[10px] text-[#333]">
            Search spans…
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Root span */}
          <SpanRow trace={trace} depth={0} active />

          {/* Children */}
          {trace.children.map((child, i) => (
            <SpanRow
              key={child.trace_id}
              trace={child}
              depth={1}
              isLast={i === trace.children.length - 1}
            />
          ))}
        </div>

        {/* Footer summary */}
        <div className="border-t border-[#1a1a1a] px-3 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-[#444]">
            {1 + trace.children.length} span{trace.children.length !== 0 ? 's' : ''}
          </span>
          <span className="text-[10px] font-mono text-[#555]">{fmtMs(trace.latency_ms)}</span>
        </div>
      </div>

      {/* ── Right: Detail panel ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1a1a1a] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: statusColor }} />
            <span className={`text-[10px] px-2 py-0.5 rounded-[4px] border font-medium ${st.badge}`}>{st.label}</span>
            <span className="text-[12px] text-[#ccc] font-medium">{trace.name || trace.trace_id}</span>
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-[#444]">{fmtDate(trace.created_at)}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Stat cards row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <InfoCard title="Timing">
              <KV label="Total" value={fmtMs(trace.latency_ms)} />
              <KV label="First token" value={fmtMs(trace.first_token_latency_ms)} />
              {throughput && <KV label="Throughput" value={throughput} />}
            </InfoCard>
            <InfoCard title="Usage">
              <KV label="Prompt" value={trace.prompt_tokens} />
              <KV label="Completion" value={trace.completion_tokens} />
              <KV label="Total" value={trace.total_tokens} />
              <KV label="Cost" value={trace.estimated_cost_usd != null ? `$${trace.estimated_cost_usd.toFixed(6)}` : null} />
            </InfoCard>
            <InfoCard title="Model">
              <KV label="Provider" value={<span className="capitalize">{trace.provider}</span>} />
              <KV label="Model" value={trace.model} />
              <KV label="Max tokens" value={trace.max_tokens} />
            </InfoCard>
          </div>

          {/* Error */}
          {trace.error_type && (
            <div className="mb-4 bg-red-500/5 border border-red-500/15 rounded-[8px] p-4">
              <div className="text-[11px] font-medium text-red-400 mb-1">{trace.error_type}</div>
              {trace.error_message && (
                <pre className="text-[10px] font-mono text-red-300/60 whitespace-pre-wrap">{trace.error_message}</pre>
              )}
            </div>
          )}

          {/* I/O Previews */}
          {(trace.input_preview || trace.output_preview) && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {trace.input_preview && (
                <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4">
                  <div className="text-[10px] text-[#444] uppercase tracking-[0.07em] mb-2">Input</div>
                  <p className="text-[11px] text-[#666] leading-relaxed line-clamp-6">{trace.input_preview}</p>
                </div>
              )}
              {trace.output_preview && (
                <div className="bg-[#edeae5] border border-[#ddd] rounded-[10px] p-4">
                  <div className="text-[10px] text-[#999] uppercase tracking-[0.07em] mb-2">Output</div>
                  <p className="text-[11px] text-[#555] leading-relaxed line-clamp-6">{trace.output_preview}</p>
                </div>
              )}
            </div>
          )}

          {/* Child spans detail (only for root) */}
          {trace.children.length > 0 && (
            <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4 mb-4">
              <div className="text-[10px] text-[#444] uppercase tracking-[0.07em] mb-3">
                Execution Timeline
                <span className="ml-2 text-[#333]">({trace.children.length} child spans)</span>
              </div>
              <div className="space-y-1">
                {trace.children.map((child, i) => {
                  const cst = spanStyle(child.span_type)
                  const cStatusColor = child.status === 'success' ? '#4ade80' : child.status === 'error' ? '#f87171' : '#fbbf24'
                  return (
                    <Link
                      key={child.trace_id}
                      href={`/dashboard/traces/${child.trace_id}`}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-[6px] hover:bg-white/[0.03] group"
                    >
                      <span className="text-[10px] font-mono text-[#333] w-4 shrink-0">{i + 1}</span>
                      <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: cStatusColor }} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-[3px] border font-medium shrink-0 ${cst.badge}`}>{cst.label}</span>
                      <span className="text-[11px] font-mono text-[#666] group-hover:text-[#999] flex-1 truncate">
                        {child.name || child.model}
                      </span>
                      {child.input_preview && (
                        <span className="text-[10px] text-[#444] truncate max-w-[120px]">{child.input_preview.slice(0, 40)}</span>
                      )}
                      <span className="text-[10px] font-mono text-[#444] shrink-0">{fmtMs(child.latency_ms)}</span>
                      {child.total_tokens != null && (
                        <span className="text-[10px] font-mono text-[#333] shrink-0">{child.total_tokens}t</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stream events */}
          {trace.stream_events.length > 0 && (
            <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-4 mb-4">
              <div className="text-[10px] text-[#444] uppercase tracking-[0.07em] mb-3">
                Stream Events <span className="text-[#333]">({trace.stream_events.length})</span>
              </div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {trace.stream_events.slice(0, 20).map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 text-[10px] py-0.5">
                    <span className="font-mono text-[#333] w-5 tabular-nums text-right shrink-0">#{ev.sequence_number}</span>
                    <span className={`shrink-0 w-10 ${ev.event_type === 'chunk' ? 'text-blue-400/60' : 'text-[#444]'}`}>{ev.event_type}</span>
                    <span className="font-mono text-[#333] w-16 shrink-0">{ev.latency_from_start_ms != null ? `+${ev.latency_from_start_ms}ms` : ''}</span>
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
            <div className="text-[10px] text-[#444] uppercase tracking-[0.07em] mb-2">Context</div>
            <Meta label="Trace ID"   value={<span className="font-mono text-[10px]">{trace.trace_id}</span>} />
            {trace.parent_trace_id && <Meta label="Parent ID" value={<Link href={`/dashboard/traces/${trace.parent_trace_id}`} className="font-mono text-[10px] text-purple-400/70 hover:text-purple-400">{trace.parent_trace_id}</Link>} />}
            {trace.session_id && <Meta label="Session" value={<span className="font-mono text-[10px]">{trace.session_id}</span>} />}
            {trace.user_id && <Meta label="User" value={<span className="font-mono text-[10px]">{trace.user_id}</span>} />}
            <Meta label="Started"    value={fmtDate(trace.started_at)} />
            <Meta label="Completed"  value={fmtDate(trace.completed_at)} />
          </div>
        </div>
      </div>
    </div>
  )
}
