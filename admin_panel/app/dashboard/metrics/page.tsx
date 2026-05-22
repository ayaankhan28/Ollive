'use client'

import { useEffect, useState } from 'react'
import { getMetrics } from '@/lib/api'
import { MetricsResponse } from '@/lib/types'
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const RANGES = [
  { label: '6h',  value: 6 },
  { label: '24h', value: 24 },
  { label: '2d',  value: 48 },
  { label: '7d',  value: 168 },
]

function fmtHour(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false })
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#141414', border: '1px solid #1e1e1e', borderRadius: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' },
  labelStyle: { color: '#555' },
}

function MetricChart({
  data, color, label, unit = '', formatY,
  light = false,
}: {
  data: { timestamp: string; value: number }[]
  color: string; label: string; unit?: string
  formatY?: (v: number) => string
  light?: boolean
}) {
  const chartData = data.map((d) => ({ ...d, ts: fmtHour(d.timestamp) }))
  const max = Math.max(...data.map((d) => d.value), 1)
  const latest = data[data.length - 1]?.value ?? 0

  return (
    <div className={`${light ? 'bg-[#edeae5] cream-grid' : 'bg-[#141414] border border-[#1a1a1a]'} rounded-[10px] p-5`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className={`text-[11px] font-medium mb-1.5 ${light ? 'text-[#888]' : 'text-[#555]'}`}>{label}</div>
          <div className={`stat-num text-[28px] ${light ? 'text-[#2a2a2a]' : 'text-[#ccc]'}`}>
            {formatY ? formatY(latest) : `${Math.round(latest)}${unit}`}
          </div>
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className={`h-28 flex items-center justify-center text-[11px] ${light ? 'text-[#aaa]' : 'text-[#333]'}`}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 8, right: 0, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={light ? 0.25 : 0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={light ? 'rgba(0,0,0,0.06)' : '#1a1a1a'} />
            <XAxis dataKey="ts" tick={{ fill: light ? '#aaa' : '#333', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: light ? '#aaa' : '#333', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} tickFormatter={formatY ?? ((v) => `${v}`)} domain={[0, max * 1.2]} />
            <Tooltip {...TOOLTIP_STYLE} itemStyle={{ color }} formatter={(v: number) => [formatY ? formatY(v) : `${v}${unit}`, label]} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#g-${label})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function MetricsPage() {
  const [hours, setHours] = useState(24)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    getMetrics(hours)
      .then(setMetrics)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [hours])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a1a] shrink-0">
        <div>
          <h1 className="text-[13px] font-medium text-[#ccc]">Metrics</h1>
          <p className="text-[11px] text-[#444] mt-0.5">Time-series performance data</p>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setHours(value)}
              className={[
                'px-2.5 py-1.5 rounded-[5px] text-[11px] font-mono transition-colors',
                hours === value
                  ? 'bg-[#1e1e1e] text-[#ccc] border border-[#2a2a2a]'
                  : 'text-[#444] hover:text-[#777]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {error && (
          <div className="bg-[#141414] border border-[#1a1a1a] rounded-[10px] p-5 text-center mb-4">
            <p className="text-[12px] text-[#444]">Could not load metrics — is the ingestion backend running?</p>
          </div>
        )}

        {loading && !metrics ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-48 rounded-[10px]" />
            ))}
          </div>
        ) : metrics ? (
          <>
            {/* Top row: requests (cream) + latency (dark) */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <MetricChart
                data={metrics.requests}
                label="Requests / hour"
                color="#7c3aed"
                unit=" req"
                light
              />
              <MetricChart
                data={metrics.latency}
                label="Avg latency"
                color="#3b82f6"
                formatY={(v) => `${Math.round(v)}ms`}
              />
            </div>
            {/* Bottom row */}
            <div className="grid grid-cols-2 gap-4">
              <MetricChart
                data={metrics.tokens}
                label="Tokens / hour"
                color="#22c55e"
                formatY={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v))}
              />
              <MetricChart
                data={metrics.errors}
                label="Errors / hour"
                color="#ef4444"
                unit=" err"
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
