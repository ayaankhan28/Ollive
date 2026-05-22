'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TraceDetail, TraceOut } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_INGESTION_URL || 'http://localhost:8001'

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

// ── Span badges ────────────────────────────────────────────────────────────

const SPAN_BADGE: Record<string, string> = {
  trace:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  generation: 'bg-blue-500/10   text-blue-400   border-blue-500/20',
  tool:       'bg-amber-500/10  text-amber-400  border-amber-500/20',
  span:       'bg-green-500/10  text-green-400  border-green-500/20',
}
const SPAN_LABEL: Record<string, string> = { trace: 'ROOT', generation: 'LLM', tool: 'TOOL', span: 'SPAN' }

function SpanBadge({ type }: { type: string }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-[4px] border font-medium shrink-0 ${SPAN_BADGE[type] ?? SPAN_BADGE.span}`}>
      {SPAN_LABEL[type] ?? type.toUpperCase()}
    </span>
  )
}

// ── Child row ──────────────────────────────────────────────────────────────

function ChildRow({ child, index, isNew }: { child: TraceOut; index: number; isNew?: boolean }) {
  const statusColor = child.status === 'success' ? '#4ade80' : child.status === 'error' ? '#f87171' : '#fbbf24'
  return (
    <Link
      href={`/dashboard/traces/${child.trace_id}`}
      className={`flex items-center gap-3 px-4 py-2 hover:bg-white/[0.03] rounded-[6px] group transition-all ${isNew ? 'animate-[fadeSlideIn_0.3s_ease-out]' : ''}`}
    >
      <span className="text-[10px] font-mono text-[#333] w-4 shrink-0 text-right">{index + 1}</span>
      <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: statusColor }} />
      <SpanBadge type={child.span_type} />
      <span className="text-[11px] font-mono text-[#666] group-hover:text-[#999]">{child.name || child.model}</span>
      {child.input_preview && (
        <span className="text-[10px] text-[#444] truncate flex-1 max-w-[180px]">{child.input_preview.slice(0, 50)}</span>
      )}
      <div className="flex items-center gap-3 ml-auto shrink-0">
        {child.total_tokens != null && <span className="text-[10px] font-mono text-[#444]">{child.total_tokens}t</span>}
        {child.estimated_cost_usd != null && child.estimated_cost_usd > 0 && (
          <span className="text-[10px] font-mono text-[#555]">${child.estimated_cost_usd.toFixed(5)}</span>
        )}
        <span className="text-[10px] font-mono text-[#555]">{fmtMs(child.latency_ms)}</span>
      </div>
    </Link>
  )
}

// ── Turn card ──────────────────────────────────────────────────────────────

function TurnCard({ turn, index, isNew }: { turn: TraceDetail; index: number; isNew?: boolean }) {
  const statusColor = turn.status === 'success' ? '#4ade80' : turn.status === 'error' ? '#f87171' : '#fbbf24'
  return (
    <div className={`border border-[#1a1a1a] rounded-[10px] overflow-hidden transition-all ${isNew ? 'animate-[fadeSlideIn_0.4s_ease-out]' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3.5 bg-[#111]">
        <div className="w-5 h-5 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[9px] font-mono text-[#555]">{index + 1}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: statusColor }} />
            <span className="text-[11px] font-mono text-[#888]">{turn.name || 'agent-turn'}</span>
            <SpanBadge type={turn.span_type} />
            <span className="text-[10px] text-[#444] ml-1">{fmtTime(turn.started_at)}</span>
          </div>
          {turn.input_preview && (
            <p className="text-[11px] text-[#666] leading-snug line-clamp-2 ml-4">{turn.input_preview}</p>
          )}
        </div>
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
          <Link href={`/dashboard/traces/${turn.trace_id}`} className="text-[11px] text-[#333] hover:text-[#7c3aed] font-mono transition-colors">
            detail →
          </Link>
        </div>
      </div>
      {turn.children.length > 0 && (
        <div className="border-t border-[#161616] px-2 py-2 bg-[#0d0d0d]">
          <div className="text-[10px] text-[#333] px-3 mb-1.5 uppercase tracking-[0.06em]">
            Internal execution · {turn.children.length} span{turn.children.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-0.5">
            {turn.children.map((child, i) => (
              <ChildRow key={child.trace_id} child={child} index={i} />
            ))}
          </div>
        </div>
      )}
      {turn.error_type && (
        <div className="border-t border-red-500/10 px-4 py-2.5 bg-red-500/5">
          <span className="text-[10px] text-red-400 font-mono">{turn.error_type}: </span>
          <span className="text-[10px] text-red-300/60">{turn.error_message?.slice(0, 120)}</span>
        </div>
      )}
    </div>
  )
}

// ── Live session detail ────────────────────────────────────────────────────

interface SseEvent {
  trace_id: string; name: string; span_type: string
  provider: string; model: string; status: string
  latency_ms: number | null; total_tokens: number | null
  estimated_cost_usd: number | null; input_preview: string | null
  started_at: string | null; completed_at: string | null
  parent_trace_id: string | null; session_id: string | null
  sequence: number
}

function sseToTraceOut(ev: SseEvent): TraceOut {
  return {
    id: ev.trace_id, trace_id: ev.trace_id, name: ev.name,
    span_type: ev.span_type as any, parent_trace_id: ev.parent_trace_id,
    sequence: ev.sequence ?? 0, provider: ev.provider, model: ev.model,
    status: ev.status as any, session_id: null, user_id: null,
    conversation_id: null, started_at: ev.started_at, completed_at: ev.completed_at,
    latency_ms: ev.latency_ms, first_token_latency_ms: null,
    temperature: null, max_tokens: null,
    prompt_tokens: null, completion_tokens: null,
    total_tokens: ev.total_tokens, estimated_cost_usd: ev.estimated_cost_usd,
    input_preview: ev.input_preview, output_preview: null,
    error_type: null, error_message: null,
    created_at: ev.started_at ?? new Date().toISOString(),
  }
}

function sseToTurnDetail(ev: SseEvent): TraceDetail {
  return { ...sseToTraceOut(ev), stream_events: [], children: [] }
}

interface Props {
  initialTurns: TraceDetail[]
  sessionId: string
}

export default function LiveSessionDetail({ initialTurns, sessionId }: Props) {
  const [turns, setTurns] = useState<TraceDetail[]>(initialTurns)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/v1/events/traces`)

    es.onmessage = (e) => {
      try {
        const ev: SseEvent = JSON.parse(e.data)
        if (ev.session_id !== sessionId) return

        setTurns((prev) => {
          // Root trace (new agent turn)
          if (!ev.parent_trace_id) {
            if (prev.some((t) => t.trace_id === ev.trace_id)) return prev
            setNewIds((s) => new Set([...s, ev.trace_id]))
            return [...prev, sseToTurnDetail(ev)]
          }

          // Child span — attach to its parent turn
          return prev.map((turn) => {
            if (turn.trace_id !== ev.parent_trace_id) return turn
            if (turn.children.some((c) => c.trace_id === ev.trace_id)) return turn
            setNewIds((s) => new Set([...s, ev.trace_id]))
            return { ...turn, children: [...turn.children, sseToTraceOut(ev)] }
          })
        })
      } catch {}
    }

    return () => es.close()
  }, [sessionId])

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="text-[10px] text-[#333] uppercase tracking-[0.07em] px-1 mb-1">
        Oldest → Newest · {turns.length} agent turn{turns.length !== 1 ? 's' : ''}
      </div>
      {turns.map((turn, i) => (
        <div key={turn.trace_id} className="relative">
          {i < turns.length - 1 && (
            <div className="absolute left-[26px] top-full w-px h-3 bg-[#1e1e1e] z-10" />
          )}
          <TurnCard turn={turn} index={i} isNew={newIds.has(turn.trace_id)} />
        </div>
      ))}
    </div>
  )
}
