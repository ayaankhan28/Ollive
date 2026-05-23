'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getTraces } from '@/lib/api'
import { Trace, TraceListResponse } from '@/lib/types'

function fmtMs(ms: number | null): string {
  if (!ms) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function StatusBadge({ status }: { status: Trace['status'] }) {
  const styles: Record<string, string> = {
    success:   'badge badge-success',
    error:     'badge badge-error',
    cancelled: 'badge badge-cancelled',
    pending:   'badge badge-pending',
  }
  return <span className={styles[status] ?? styles.pending}>● {status}</span>
}

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

const STATUSES = ['', 'success', 'error', 'cancelled']

export default function TracesPage() {
  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') ?? 1)
  const status = searchParams.get('status') ?? undefined
  const provider = searchParams.get('provider') ?? undefined

  const [data, setData] = useState<TraceListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    getTraces({ page, limit: 30, status, provider })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page, status, provider])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a1a] shrink-0">
        <div>
          <h1 className="text-[13px] font-medium text-[#ccc]">Traces</h1>
          <p className="text-[11px] text-[#444] mt-0.5">Every agent turn captured by the SDK</p>
        </div>
        {data && (
          <span className="text-[11px] font-mono text-[#444] bg-[#141414] border border-[#1e1e1e] px-2.5 py-1 rounded-[6px]">
            {data.total} total
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-[#161616] shrink-0">
        <span className="text-[10px] text-[#333] mr-1">status</span>
        {STATUSES.map((s) => (
          <Link
            key={s || 'all'}
            href={s ? `/dashboard/traces?status=${s}` : '/dashboard/traces'}
            className={[
              'px-2.5 py-1 rounded-[5px] text-[11px] transition-colors',
              (status === s || (!s && !status))
                ? 'bg-[#1e1e1e] text-[#ccc] border border-[#2a2a2a]'
                : 'text-[#444] hover:text-[#888]',
            ].join(' ')}
          >
            {s || 'all'}
          </Link>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-[#444]">Loading…</div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-[#444]">Could not load traces</div>
        ) : !data || data.traces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <div className="text-[12px] text-[#444]">No traces yet</div>
            <div className="text-[11px] text-[#333]">Send a message in the chatbot to generate traces</div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0a0a0a]">
              <tr className="border-b border-[#1a1a1a]">
                {['Time', 'Name', 'Provider / Model', 'Status', 'Latency', 'TTFT', 'Tokens', 'Cost'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium text-[#444] uppercase tracking-[0.06em] whitespace-nowrap">{h}</th>
                ))}
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.traces.map((t) => (
                <tr key={t.trace_id} className="border-b border-[#141414] hover:bg-white/[0.015] transition-colors group">
                  <td className="px-5 py-3 text-[11px] font-mono text-[#555] whitespace-nowrap">{fmtDate(t.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <SpanBadge type={t.span_type} />
                      <span className="text-[11px] font-mono text-[#888]">{t.name || `${t.span_type}.${t.provider}`}</span>
                    </div>
                    {t.input_preview && (
                      <div className="text-[10px] text-[#444] mt-0.5 truncate max-w-[180px]">{t.input_preview.slice(0, 60)}</div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-[11px] text-[#777] capitalize">{t.provider}</div>
                    <div className="text-[10px] font-mono text-[#444]">{t.model}</div>
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-5 py-3 text-[11px] font-mono text-[#888] tabular-nums">{fmtMs(t.latency_ms)}</td>
                  <td className="px-5 py-3 text-[11px] font-mono text-[#555] tabular-nums">{fmtMs(t.first_token_latency_ms)}</td>
                  <td className="px-5 py-3 text-[11px] font-mono text-[#888] tabular-nums">{t.total_tokens ?? '—'}</td>
                  <td className="px-5 py-3 text-[11px] font-mono text-[#666] tabular-nums">
                    {t.estimated_cost_usd != null ? `$${t.estimated_cost_usd.toFixed(5)}` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/traces/${t.trace_id}`} className="text-[11px] text-[#333] group-hover:text-[#7c3aed] transition-colors font-mono">
                      view →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1a1a1a] shrink-0">
          <span className="text-[11px] text-[#444] font-mono">
            {((page - 1) * 30) + 1}–{Math.min(page * 30, data.total)} of {data.total}
          </span>
          <div className="flex gap-1.5">
            {page > 1 && (
              <Link href={`/dashboard/traces?page=${page - 1}${status ? `&status=${status}` : ''}`}
                className="px-3 py-1.5 text-[11px] border border-[#1e1e1e] text-[#555] hover:text-[#888] rounded-[5px] transition-colors">
                ← prev
              </Link>
            )}
            {data.total > page * 30 && (
              <Link href={`/dashboard/traces?page=${page + 1}${status ? `&status=${status}` : ''}`}
                className="px-3 py-1.5 text-[11px] border border-[#1e1e1e] text-[#555] hover:text-[#888] rounded-[5px] transition-colors">
                next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
