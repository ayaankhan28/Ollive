import Link from 'next/link'
import { getSessionDetail } from '@/lib/api'
import { TraceDetail, TraceOut } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

// ── helpers ────────────────────────────────────────────────────────────────

function fmtMs(ms: number | null): string {
  if (!ms) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

function fmtTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ── Span type badges ───────────────────────────────────────────────────────

const SPAN_BADGE: Record<string, string> = {
  trace:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  generation: 'bg-blue-500/10   text-blue-400   border-blue-500/20',
  tool:       'bg-amber-500/10  text-amber-400  border-amber-500/20',
  span:       'bg-green-500/10  text-green-400  border-green-500/20',
}
const SPAN_LABEL: Record<string, string> = {
  trace: 'ROOT', generation: 'LLM', tool: 'TOOL', span: 'SPAN',
}

function SpanBadge({ type }: { type: string }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-[4px] border font-medium shrink-0 ${SPAN_BADGE[type] ?? SPAN_BADGE.span}`}>
      {SPAN_LABEL[type] ?? type.toUpperCase()}
    </span>
  )
}

// ── Child span row (inside an agent turn) ─────────────────────────────────

function ChildSpanRow({ child, index }: { child: TraceOut; index: number }) {
  const statusColor = child.status === 'success' ? '#4ade80' : child.status === 'error' ? '#f87171' : '#fbbf24'
  return (
    <Link
      href={`/dashboard/traces/${child.trace_id}`}
      className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.03] rounded-[6px] group"
    >
      <span className="text-[10px] font-mono text-[#333] w-4 shrink-0 text-right">{index + 1}</span>
      <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: statusColor }} />
      <SpanBadge type={child.span_type} />
      <span className="text-[11px] font-mono text-[#666] group-hover:text-[#999]">
        {child.name || child.model}
      </span>
      {child.input_preview && (
        <span className="text-[10px] text-[#444] truncate flex-1 max-w-[200px]">
          {child.input_preview.slice(0, 50)}
        </span>
      )}
      <div className="flex items-center gap-3 ml-auto shrink-0">
        {child.total_tokens != null && (
          <span className="text-[10px] font-mono text-[#444]">{child.total_tokens}t</span>
        )}
        {child.estimated_cost_usd != null && child.estimated_cost_usd > 0 && (
          <span className="text-[10px] font-mono text-[#555]">${child.estimated_cost_usd.toFixed(5)}</span>
        )}
        <span className="text-[10px] font-mono text-[#555]">{fmtMs(child.latency_ms)}</span>
      </div>
    </Link>
  )
}

// ── Agent turn card ────────────────────────────────────────────────────────

function TurnCard({ turn, index }: { turn: TraceDetail; index: number }) {
  const statusColor = turn.status === 'success' ? '#4ade80' : turn.status === 'error' ? '#f87171' : '#fbbf24'

  return (
    <div className="border border-[#1a1a1a] rounded-[10px] overflow-hidden">
      {/* Turn header */}
      <div className="flex items-start gap-3 px-4 py-3.5 bg-[#111]">
        {/* Turn number */}
        <div className="w-5 h-5 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[9px] font-mono text-[#555]">{index + 1}</span>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: statusColor }} />
            <span className="text-[11px] font-mono text-[#888]">{turn.name || 'agent-turn'}</span>
            <SpanBadge type={turn.span_type} />
            <span className="text-[10px] text-[#444] ml-1">{fmtTime(turn.started_at)}</span>
          </div>
          {turn.input_preview && (
            <p className="text-[11px] text-[#666] leading-snug line-clamp-2 ml-4">
              {turn.input_preview}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0 text-right">
          <div>
            <div className="text-[10px] text-[#333]">latency</div>
            <div className="text-[11px] font-mono text-[#777]">{fmtMs(turn.latency_ms)}</div>
          </div>
          {turn.total_tokens != null && (
            <div>
              <div className="text-[10px] text-[#333]">tokens</div>
              <div className="text-[11px] font-mono text-[#777]">{turn.total_tokens}</div>
            </div>
          )}
          {turn.estimated_cost_usd != null && turn.estimated_cost_usd > 0 && (
            <div>
              <div className="text-[10px] text-[#333]">cost</div>
              <div className="text-[11px] font-mono text-[#666]">${turn.estimated_cost_usd.toFixed(5)}</div>
            </div>
          )}
          <Link
            href={`/dashboard/traces/${turn.trace_id}`}
            className="text-[11px] text-[#333] hover:text-[#7c3aed] font-mono transition-colors"
          >
            detail →
          </Link>
        </div>
      </div>

      {/* Child spans — always visible */}
      {turn.children.length > 0 && (
        <div className="border-t border-[#161616] px-2 py-2 bg-[#0d0d0d]">
          <div className="text-[10px] text-[#333] px-3 mb-1.5 uppercase tracking-[0.06em]">
            Internal execution · {turn.children.length} span{turn.children.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-0.5">
            {turn.children.map((child, i) => (
              <ChildSpanRow key={child.trace_id} child={child} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {turn.error_type && (
        <div className="border-t border-red-500/10 px-4 py-2.5 bg-red-500/5">
          <span className="text-[10px] text-red-400 font-mono">{turn.error_type}: </span>
          <span className="text-[10px] text-red-300/60">{turn.error_message?.slice(0, 120)}</span>
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ session_id: string }>
}) {
  const { session_id } = await params

  let data = null
  try {
    data = await getSessionDetail(session_id)
  } catch {
    notFound()
  }

  const shortId = `${session_id.slice(0, 8)}…${session_id.slice(-4)}`

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1a1a1a] shrink-0">
        <Link href="/dashboard/sessions" className="text-[#333] hover:text-[#666] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="w-[6px] h-[6px] rounded-full bg-emerald-400/60" />
          <span className="text-[12px] font-mono text-[#777]">{shortId}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-[11px] text-[#444]">
          <span>{data?.total_turns ?? 0} turns</span>
          <span className="font-mono">{data?.total_tokens?.toLocaleString() ?? 0} tokens</span>
          <span className="font-mono text-[#555]">${data?.total_cost_usd.toFixed(4) ?? '0.0000'} total</span>
        </div>
      </div>

      {/* Turn list */}
      <div className="flex-1 overflow-y-auto p-5">
        {!data || data.turns.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-[#444]">
            No traces found for this session
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {/* Timeline connector hint */}
            <div className="flex items-center gap-2 px-1 mb-1">
              <div className="text-[10px] text-[#333] uppercase tracking-[0.07em]">
                Oldest → Newest · {data.total_turns} agent turn{data.total_turns !== 1 ? 's' : ''}
              </div>
            </div>

            {data.turns.map((turn, i) => (
              <div key={turn.trace_id} className="relative">
                {/* Vertical connector between turns */}
                {i < data.turns.length - 1 && (
                  <div className="absolute left-[26px] top-full w-px h-3 bg-[#1e1e1e] z-10" />
                )}
                <TurnCard turn={turn} index={i} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
