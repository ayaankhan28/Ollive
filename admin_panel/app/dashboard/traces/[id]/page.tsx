import Link from 'next/link'
import { getTrace } from '@/lib/api'
import { TraceDetail, TraceOut } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import LiveSpanTree from '@/components/LiveSpanTree'

// ── helpers ────────────────────────────────────────────────────────────────

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ── Span type styling ──────────────────────────────────────────────────────

const SPAN_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  trace:      { dot: '#7c3aed', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'ROOT' },
  generation: { dot: '#3b82f6', badge: 'bg-blue-500/10   text-blue-400   border-blue-500/20',   label: 'LLM' },
  tool:       { dot: '#f59e0b', badge: 'bg-amber-500/10  text-amber-400  border-amber-500/20',  label: 'TOOL' },
  span:       { dot: '#22c55e', badge: 'bg-green-500/10  text-green-400  border-green-500/20',  label: 'SPAN' },
}
const ss = (t: string) => SPAN_STYLE[t] ?? SPAN_STYLE.span

function SpanBadge({ type }: { type: string }) {
  const s = ss(type)
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-[4px] border font-medium shrink-0 ${s.badge}`}>
      {s.label}
    </span>
  )
}

// ── Left panel: span tree ──────────────────────────────────────────────────
// Always shows the full root hierarchy; highlights the active trace_id.

function TreeRow({
  trace,
  depth,
  activeId,
}: {
  trace: TraceOut | TraceDetail
  depth: number
  activeId: string
}) {
  const isActive = trace.trace_id === activeId
  const statusColor = trace.status === 'success' ? '#4ade80' : trace.status === 'error' ? '#f87171' : '#fbbf24'

  return (
    <Link
      href={`/dashboard/traces/${trace.trace_id}`}
      className={[
        'flex items-center gap-2 py-[7px] rounded-[6px] group transition-colors',
        isActive
          ? 'bg-white/[0.07] text-[#e0e0e0]'
          : 'text-[#555] hover:text-[#999] hover:bg-white/[0.03]',
      ].join(' ')}
      style={{ paddingLeft: `${10 + depth * 18}px`, paddingRight: '10px' }}
    >
      {/* Tree connector line */}
      {depth > 0 && (
        <span className="shrink-0 text-[#2a2a2a] mr-0.5 font-mono text-[10px]">—</span>
      )}

      {/* Status dot */}
      <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: statusColor }} />

      {/* Name */}
      <span className={`text-[11px] font-mono truncate flex-1 ${isActive ? 'text-[#ccc]' : ''}`}>
        {trace.name || `${trace.span_type}.${trace.provider}`}
      </span>

      {/* Type badge */}
      <SpanBadge type={trace.span_type} />

      {/* Quick stats (only if active or hover) */}
      <div className={`flex items-center gap-1.5 ml-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <span className="text-[9px] font-mono text-[#555]">{fmtMs(trace.latency_ms)}</span>
        {trace.total_tokens != null && (
          <span className="text-[9px] font-mono text-[#444]">{trace.total_tokens}t</span>
        )}
        {trace.estimated_cost_usd != null && trace.estimated_cost_usd > 0 && (
          <span className="text-[9px] font-mono text-[#444]">${trace.estimated_cost_usd.toFixed(4)}</span>
        )}
      </div>
    </Link>
  )
}

function SpanTree({
  root,
  activeId,
}: {
  root: TraceDetail
  activeId: string
}) {
  return (
    <div>
      <TreeRow trace={root} depth={0} activeId={activeId} />
      {root.children.map((child) => (
        <TreeRow key={child.trace_id} trace={child} depth={1} activeId={activeId} />
      ))}
    </div>
  )
}

// ── Right panel detail sections ────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] p-5 mb-4">
      <div className="text-[10px] font-medium text-[#444] uppercase tracking-[0.07em] mb-3">{title}</div>
      {children}
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#141414] last:border-0">
      <span className="text-[12px] text-[#555]">{label}</span>
      <span className="text-[12px] font-mono text-[#888]">{value ?? '—'}</span>
    </div>
  )
}

function CtxRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-[#141414] last:border-0">
      <span className="text-[12px] text-[#444] w-24 shrink-0">{label}</span>
      <span className="text-[11px] font-mono text-[#666] break-all">{value}</span>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function TraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Load the requested trace
  let trace: TraceDetail | null = null
  try { trace = await getTrace(id) }
  catch { notFound() }
  if (!trace) notFound()

  // If this is a child span, load the root to display the full tree.
  // If it's already a root (no parent), use it directly.
  let rootTrace: TraceDetail = trace
  if (trace.parent_trace_id) {
    try { rootTrace = await getTrace(trace.parent_trace_id) }
    catch { /* fallback: show single node */ }
  }

  const activeId = id
  const statusColor = trace.status === 'success' ? '#4ade80' : trace.status === 'error' ? '#f87171' : '#fbbf24'
  const spanStyle = ss(trace.span_type)

  const throughput = trace.latency_ms && trace.completion_tokens
    ? `${((trace.completion_tokens / trace.latency_ms) * 1000).toFixed(1)} t/s` : null

  // Back link — go to parent if child span, otherwise back to traces list
  const backHref = trace.parent_trace_id
    ? `/dashboard/traces/${trace.parent_trace_id}`
    : (trace.session_id ? `/dashboard/sessions/${trace.session_id}` : '/dashboard/traces')

  return (
    <div className="flex h-full">

      {/* ── LEFT: full span tree ──────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 border-r border-[#1a1a1a] flex flex-col bg-[#0d0d0d]">
        {/* Back */}
        <div className="px-3 py-3 border-b border-[#1a1a1a] flex items-center gap-2">
          <Link href={backHref} className="text-[#333] hover:text-[#666] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
          <span className="text-[11px] font-mono text-[#444] truncate">
            {rootTrace.trace_id.slice(0, 14)}…
          </span>
        </div>

        {/* Search placeholder */}
        <div className="px-3 py-2 border-b border-[#161616]">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-[5px] px-2.5 py-1.5 text-[10px] text-[#333]">
            Search spans…
          </div>
        </div>

        {/* Live span tree — new child spans slide in via SSE */}
        <div className="flex-1 overflow-y-auto py-2 px-1">
          <LiveSpanTree initialRoot={rootTrace} activeId={activeId} />
        </div>

        {/* Footer */}
        <div className="border-t border-[#1a1a1a] px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-[#444]">
            {1 + rootTrace.children.length} span{rootTrace.children.length !== 0 ? 's' : ''}
          </span>
          <span className="text-[10px] font-mono text-[#555]">{fmtMs(rootTrace.latency_ms)} total</span>
        </div>
      </div>

      {/* ── RIGHT: selected span detail ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1a1a1a] shrink-0">
          <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: statusColor }} />
          <SpanBadge type={trace.span_type} />
          <span className="text-[13px] text-[#ccc] font-medium font-mono">
            {trace.name || `${trace.span_type}.${trace.provider}`}
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-[#444]">{fmtDate(trace.created_at)}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* Timing + Usage + Model */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card title="Timing">
              <KV label="Total"       value={fmtMs(trace.latency_ms)} />
              <KV label="First token" value={fmtMs(trace.first_token_latency_ms)} />
              {throughput && <KV label="Throughput" value={throughput} />}
            </Card>
            <Card title="Usage">
              <KV label="Prompt"     value={trace.prompt_tokens} />
              <KV label="Completion" value={trace.completion_tokens} />
              <KV label="Total"      value={trace.total_tokens} />
              <KV label="Cost"       value={trace.estimated_cost_usd != null ? `$${trace.estimated_cost_usd.toFixed(6)}` : null} />
            </Card>
            <Card title="Model">
              <KV label="Provider"   value={<span className="capitalize">{trace.provider}</span>} />
              <KV label="Model"      value={trace.model} />
              <KV label="Max tokens" value={trace.max_tokens} />
            </Card>
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

          {/* Input */}
          {trace.input_preview && (
            <Card title="Input">
              <p className="text-[12px] text-[#777] leading-relaxed">{trace.input_preview}</p>
            </Card>
          )}

          {/* Output */}
          {trace.output_preview && (
            <div className="bg-[#edeae5] border border-[#ddd] rounded-[10px] p-5 mb-4">
              <div className="text-[10px] font-medium text-[#999] uppercase tracking-[0.07em] mb-2">Output</div>
              <p className="text-[12px] text-[#555] leading-relaxed">{trace.output_preview}</p>
            </div>
          )}

          {/* Execution timeline (only for root spans with children) */}
          {trace.children.length > 0 && (
            <Card title={`Execution Timeline (${trace.children.length} child span${trace.children.length !== 1 ? 's' : ''})`}>
              <div className="space-y-1">
                {trace.children.map((child, i) => {
                  const cst = ss(child.span_type)
                  const cStatusColor = child.status === 'success' ? '#4ade80' : child.status === 'error' ? '#f87171' : '#fbbf24'
                  const isChildActive = child.trace_id === activeId
                  return (
                    <Link
                      key={child.trace_id}
                      href={`/dashboard/traces/${child.trace_id}`}
                      className={`flex items-center gap-3 px-3 py-2 rounded-[6px] group transition-colors ${isChildActive ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}
                    >
                      <span className="text-[10px] font-mono text-[#333] w-4 tabular-nums text-right shrink-0">{i + 1}</span>
                      <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: cStatusColor }} />
                      <SpanBadge type={child.span_type} />
                      <span className="text-[11px] font-mono text-[#666] group-hover:text-[#999] flex-1 truncate">
                        {child.name || child.model}
                      </span>
                      {child.input_preview && (
                        <span className="text-[10px] text-[#444] truncate max-w-[140px]">{child.input_preview.slice(0, 40)}</span>
                      )}
                      <span className="text-[10px] font-mono text-[#555] shrink-0">{fmtMs(child.latency_ms)}</span>
                      {child.total_tokens != null && (
                        <span className="text-[10px] font-mono text-[#444] shrink-0">{child.total_tokens}t</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Stream events */}
          {trace.stream_events.length > 0 && (
            <Card title={`Stream Events (${trace.stream_events.length})`}>
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
            </Card>
          )}

          {/* Context */}
          <Card title="Context">
            <CtxRow label="Trace ID"  value={trace.trace_id} />
            {trace.parent_trace_id && (
              <CtxRow label="Parent ID" value={
                <Link href={`/dashboard/traces/${trace.parent_trace_id}`} className="text-purple-400/70 hover:text-purple-400 transition-colors">
                  {trace.parent_trace_id}
                </Link>
              } />
            )}
            {trace.session_id && (
              <CtxRow label="Session" value={
                <Link href={`/dashboard/sessions/${trace.session_id}`} className="text-blue-400/60 hover:text-blue-400 transition-colors">
                  {trace.session_id}
                </Link>
              } />
            )}
            {trace.user_id && <CtxRow label="User" value={trace.user_id} />}
            <CtxRow label="Started"   value={fmtDate(trace.started_at)} />
            <CtxRow label="Completed" value={fmtDate(trace.completed_at)} />
          </Card>
        </div>
      </div>
    </div>
  )
}
