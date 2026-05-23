'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSummary, getTraces, getErrorRate } from '@/lib/api'
import { Trace, ErrorRatePoint, SummaryResponse } from '@/lib/types'
import { Clock3, Minus } from 'lucide-react'
import LiveTraceFeed from '@/components/LiveTraceFeed'
import ErrorRateChart from '@/components/ErrorRateChart'

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 0): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(dec)
}

function fmtMs(ms: number | null): string {
  if (!ms) return '0ms'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

function fmtTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function statusColor(s: Trace['status']) {
  return s === 'success' ? '#4ade80' : s === 'error' ? '#f87171' : s === 'cancelled' ? '#fbbf24' : '#93c5fd'
}

// ── Range selector (client pill) — rendered server-side as static markup ──

const RANGES = ['24h', '7d', '30d', '90d']

function RangeSelector() {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-[#333] mr-1.5">range</span>
      {RANGES.map((r, i) => (
        <button
          key={r}
          className={[
            'px-2.5 py-1 rounded-[5px] text-[11px] font-mono transition-colors',
            i === 0
              ? 'bg-[#1e1e1e] text-[#ccc] border border-[#2a2a2a]'
              : 'text-[#444] hover:text-[#888]',
          ].join(' ')}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

// ── Stat column ────────────────────────────────────────────────────────────

function StatCol({
  label, value, sub, last = false,
}: { label: string; value: string; sub?: string; last?: boolean }) {
  return (
    <div className={`px-5 py-4 ${!last ? 'border-r border-[#1a1a1a]' : ''}`}>
      <div className="text-[11px] text-[#444] mb-2 tracking-[-0.01em]">{label}</div>
      <div className="stat-num text-[28px] text-[#e0e0e0]">{value}</div>
      {sub && <div className="text-[10px] text-[#333] mt-1 font-mono">{sub}</div>}
    </div>
  )
}

// ── Dot scatter — visualises traces spread across 24h ─────────────────────

function TraceDots({ traces }: { traces: Trace[] }) {
  // Build 24 hourly buckets
  const now = Date.now()
  const buckets: Array<{ success: number; error: number }> = Array.from({ length: 24 }, () => ({ success: 0, error: 0 }))
  traces.forEach((t) => {
    if (!t.created_at) return
    const hoursAgo = Math.floor((now - new Date(t.created_at).getTime()) / 3_600_000)
    const idx = 23 - Math.min(hoursAgo, 23)
    if (t.status === 'error') buckets[idx].error++
    else buckets[idx].success++
  })

  return (
    <div className="flex items-end gap-1.5 h-12">
      {buckets.map((b, i) => {
        const total = b.success + b.error
        const hasError = b.error > 0
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1 justify-end">
            {total > 0 && (
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${Math.min(total * 10, 40)}px`,
                  background: hasError ? 'rgba(239,68,68,0.5)' : 'rgba(74,222,128,0.35)',
                  minHeight: '4px',
                }}
                title={`${total} trace${total > 1 ? 's' : ''}`}
              />
            )}
            {total === 0 && (
              <div className="w-full h-[3px] rounded-full bg-[#2a2a2a]" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Recent trace row ───────────────────────────────────────────────────────

function TraceRow({ trace }: { trace: Trace }) {
  const dot = statusColor(trace.status)
  return (
    <Link
      href={`/dashboard/traces/${trace.trace_id}`}
      className="flex items-center gap-3 py-2 px-3 -mx-3 rounded-[6px] hover:bg-black/[0.06] transition-colors group"
    >
      <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: dot }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#555] truncate">{trace.trace_id.slice(0, 12)}…</span>
          <span className="text-[10px] text-[#888] capitalize">{trace.provider}</span>
          <span className="text-[10px] text-[#666] font-mono truncate hidden sm:block">{trace.model.split('-').slice(-2).join('-')}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {trace.total_tokens && (
          <span className="text-[10px] font-mono text-[#777]">{trace.total_tokens}tok</span>
        )}
        <span className="text-[10px] font-mono text-[#777]">{fmtMs(trace.latency_ms)}</span>
        <span className="text-[10px] text-[#555]">{fmtTime(trace.created_at)}</span>
      </div>
    </Link>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [recentTraces, setRecentTraces] = useState<Trace[]>([])
  const [errorRateData, setErrorRateData] = useState<ErrorRatePoint[]>([])
  const [hasError, setHasError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getSummary(), getTraces({ limit: 20 }), getErrorRate(24)])
      .then(([s, t, e]) => {
        setSummary(s)
        setRecentTraces(t.traces)
        setErrorRateData(e.data)
      })
      .catch(() => setHasError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[13px] text-[#555]">Loading…</div>
        </div>
      </div>
    )
  }

  if (hasError || !summary) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[13px] text-[#555] mb-1">Could not reach ingestion backend</div>
            <div className="text-[11px] text-[#333]">Make sure the service is running on port 8001</div>
          </div>
        </div>
      </div>
    )
  }

  const successPct = (summary.success_rate * 100).toFixed(1)
  const costPerTrace = summary.total_traces > 0 && summary.total_cost_usd > 0
    ? `$${(summary.total_cost_usd / summary.total_traces).toFixed(5)}`
    : '$0.00'

  return (
    <div className="flex flex-col h-full">

      {/* ── Stat bar ── */}
      <div className="flex border-b border-[#1a1a1a] shrink-0">
        <div className="flex-1 grid grid-cols-5">
          <StatCol label="Traces · 24h" value={fmt(summary.traces_last_24h)} sub={`${fmt(summary.total_traces)} all time`} />
          <StatCol label="Success rate" value={`${successPct}%`} sub={`${fmt(summary.failed_traces)} failed`} />
          <StatCol label="P95 latency"  value={summary.p95_latency_ms ? `${summary.p95_latency_ms}ms` : '—'} sub={summary.avg_latency_ms ? `avg ${Math.round(summary.avg_latency_ms)}ms` : undefined} />
          <StatCol label="Total tokens"  value={fmt(summary.total_tokens)} sub={`${summary.by_provider.length} provider${summary.by_provider.length !== 1 ? 's' : ''}`} />
          <StatCol label="Cost / trace"  value={costPerTrace} sub={`$${summary.total_cost_usd.toFixed(4)} total`} last />
        </div>
        {/* Range picker */}
        <div className="px-4 flex items-center border-l border-[#1a1a1a]">
          <RangeSelector />
        </div>
      </div>

      {/* ── Main body ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left column */}
        <div className="flex-1 flex flex-col p-4 gap-4 min-w-0">

          {/* ── CREAM main panel ── */}
          <div className="bg-[#edeae5] rounded-[12px] flex-1 min-h-0 flex flex-col p-5 overflow-hidden cream-grid">
            {/* Panel header */}
            <div className="flex items-start justify-between mb-4 shrink-0">
              <div>
                <div className="text-[11px] text-[#888] mb-2 font-medium tracking-[-0.01em]">
                  Trace reliability · 24 hours
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="stat-num text-[48px] text-[#2a2a2a] leading-none">{fmt(summary.traces_last_24h)}</span>
                  <span className="text-[20px] font-mono font-light text-[#999]">{successPct}%</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[#888] pt-1">
                <span className="flex items-center gap-1.5"><span className="w-[6px] h-[6px] rounded-full bg-emerald-400/70 inline-block" />success</span>
                <span className="flex items-center gap-1.5"><span className="w-[6px] h-[6px] rounded-full bg-red-400/70 inline-block" />error</span>
              </div>
            </div>

            {/* Content or empty */}
            {recentTraces.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px w-12 bg-[#ccc]" />
                  <span className="text-[11px] text-[#aaa]">Awaiting first trace</span>
                  <div className="h-px w-12 bg-[#ccc]" />
                </div>
                <p className="text-[11px] text-[#bbb]">Send a message in the chatbot to generate traces</p>
              </div>
            ) : (
              <>
                {/* Trace list */}
                <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 pr-1">
                  {recentTraces.map((t) => <TraceRow key={t.trace_id} trace={t} />)}
                </div>
                {/* Dot chart at bottom */}
                <div className="mt-4 shrink-0">
                  <TraceDots traces={recentTraces} />
                  <div className="flex justify-between mt-2">
                    {['24h ago', '18h', '12h', '6h', 'now'].map((l) => (
                      <span key={l} className="text-[9px] font-mono text-[#aaa]">{l}</span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Bottom 3 dark panels ── */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* Token density */}
            <div className="bg-[#141414] border border-[#1a1a1a] rounded-[10px] p-4">
              <div className="text-[11px] text-[#555] mb-1">Token density · last 7d</div>
              <div className="text-[10px] text-[#333] mb-3">
                {summary.total_tokens === 0 ? 'no tokens recorded' : `${fmt(summary.total_tokens)} total`}
              </div>
              <div className="flex items-end gap-1 h-10">
                {summary.by_provider.map((p) => {
                  const pct = summary.total_tokens > 0 ? ((p.total_tokens ?? 0) / summary.total_tokens) * 100 : 0
                  return (
                    <div key={p.provider} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-[#7c3aed]/40 rounded-sm"
                        style={{ height: `${Math.max(pct * 0.36, 4)}px` }}
                        title={`${p.provider}: ${fmt(p.total_tokens ?? 0)} tokens`}
                      />
                      <span className="text-[9px] font-mono text-[#444] capitalize">{p.provider.slice(0, 4)}</span>
                    </div>
                  )
                })}
                {summary.by_provider.length === 0 && (
                  <div className="w-full h-8 flex items-center justify-center">
                    <Minus className="w-3 h-3 text-[#2a2a2a]" />
                  </div>
                )}
              </div>
            </div>

            {/* P95 gauge */}
            <div className="bg-[#141414] border border-[#1a1a1a] rounded-[10px] p-4">
              <div className="text-[11px] text-[#555] mb-1">P95 latency · 24h</div>
              <div className="flex items-center justify-center h-16 relative">
                {/* Simple ring */}
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#1e1e1e" strokeWidth="4" />
                  <circle
                    cx="28" cy="28" r="22" fill="none"
                    stroke={summary.p95_latency_ms && summary.p95_latency_ms > 3000 ? '#f87171' : '#4ade80'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 22}`}
                    strokeDashoffset={`${2 * Math.PI * 22 * (1 - Math.min((summary.p95_latency_ms ?? 0) / 5000, 1))}`}
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="stat-num text-[16px] text-[#ccc]">{summary.p95_latency_ms ?? 0}</div>
                  <div className="text-[9px] text-[#444] font-mono">ms</div>
                </div>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[#333] mt-1">
                <span>P50: {summary.avg_latency_ms ? `${Math.round(summary.avg_latency_ms)}ms` : '—'}</span>
                <span>0 fail</span>
              </div>
            </div>

            {/* Error rate chart */}
            <div className="bg-[#141414] border border-[#1a1a1a] rounded-[10px] p-4">
              <div className="text-[11px] text-[#555] mb-1">Error rate · 24h</div>
              <div className="text-[10px] text-[#333] mb-3">
                {errorRateData.length === 0
                  ? 'no data'
                  : `${summary.failed_traces} errors · ${(summary.success_rate * 100).toFixed(1)}% success`}
              </div>
              <ErrorRateChart data={errorRateData} />
            </div>
          </div>
        </div>

        {/* ── Right: live SSE feed ── */}
        <div className="w-[260px] shrink-0 border-l border-[#1a1a1a] p-3">
          <LiveTraceFeed />
        </div>
      </div>
    </div>
  )
}
