'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TraceDetail, TraceOut } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_INGESTION_URL || 'http://localhost:8001'

function fmtMs(ms: number | null): string {
  if (ms == null) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

const SPAN_STYLE: Record<string, { badge: string; label: string }> = {
  trace:      { badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'ROOT' },
  generation: { badge: 'bg-blue-500/10   text-blue-400   border-blue-500/20',   label: 'LLM' },
  tool:       { badge: 'bg-amber-500/10  text-amber-400  border-amber-500/20',  label: 'TOOL' },
  span:       { badge: 'bg-green-500/10  text-green-400  border-green-500/20',  label: 'SPAN' },
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

function TreeRow({
  trace, depth, activeId, isNew,
}: {
  trace: TraceOut | TraceDetail; depth: number; activeId: string; isNew?: boolean
}) {
  const isActive = trace.trace_id === activeId
  const statusColor = trace.status === 'success' ? '#4ade80' : trace.status === 'error' ? '#f87171' : '#fbbf24'

  return (
    <Link
      href={`/dashboard/traces/${trace.trace_id}`}
      className={[
        'flex items-center gap-2 py-[7px] rounded-[6px] group transition-colors',
        isActive ? 'bg-white/[0.07] text-[#e0e0e0]' : 'text-[#555] hover:text-[#999] hover:bg-white/[0.03]',
        isNew ? 'animate-[fadeSlideIn_0.3s_ease-out]' : '',
      ].join(' ')}
      style={{ paddingLeft: `${10 + depth * 18}px`, paddingRight: '10px' }}
    >
      {depth > 0 && <span className="shrink-0 text-[#2a2a2a] mr-0.5 font-mono text-[10px]">—</span>}
      <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: statusColor }} />
      <span className={`text-[11px] font-mono truncate flex-1 ${isActive ? 'text-[#ccc]' : ''}`}>
        {trace.name || `${trace.span_type}.${trace.provider}`}
      </span>
      <SpanBadge type={trace.span_type} />
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

interface SseEvent {
  trace_id: string; name: string; span_type: string
  provider: string; model: string; status: string
  latency_ms: number | null; total_tokens: number | null
  estimated_cost_usd: number | null; input_preview: string | null
  started_at: string | null; parent_trace_id: string | null
  sequence: number; session_id: string | null
}

function sseToTraceOut(ev: SseEvent): TraceOut {
  return {
    id: ev.trace_id, trace_id: ev.trace_id, name: ev.name,
    span_type: ev.span_type as any, parent_trace_id: ev.parent_trace_id,
    sequence: ev.sequence ?? 0, provider: ev.provider, model: ev.model,
    status: ev.status as any, session_id: null, user_id: null,
    conversation_id: null, started_at: ev.started_at, completed_at: null,
    latency_ms: ev.latency_ms, first_token_latency_ms: null,
    temperature: null, max_tokens: null, prompt_tokens: null, completion_tokens: null,
    total_tokens: ev.total_tokens, estimated_cost_usd: ev.estimated_cost_usd,
    input_preview: ev.input_preview, output_preview: null,
    error_type: null, error_message: null,
    created_at: ev.started_at ?? new Date().toISOString(),
  }
}

interface Props {
  initialRoot: TraceDetail
  activeId: string
}

export default function LiveSpanTree({ initialRoot, activeId }: Props) {
  const [root, setRoot] = useState<TraceDetail>(initialRoot)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/v1/events/traces`)

    es.onmessage = (e) => {
      try {
        const ev: SseEvent = JSON.parse(e.data)
        // Only care about child spans of our root
        if (ev.parent_trace_id !== root.trace_id) return
        setRoot((prev) => {
          if (prev.children.some((c) => c.trace_id === ev.trace_id)) return prev
          setNewIds((s) => new Set([...s, ev.trace_id]))
          return {
            ...prev,
            children: [...prev.children, sseToTraceOut(ev)]
              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
          }
        })
      } catch {}
    }

    return () => es.close()
  }, [root.trace_id])

  return (
    <div>
      <TreeRow trace={root} depth={0} activeId={activeId} />
      {root.children.map((child) => (
        <TreeRow
          key={child.trace_id}
          trace={child}
          depth={1}
          activeId={activeId}
          isNew={newIds.has(child.trace_id)}
        />
      ))}
    </div>
  )
}
