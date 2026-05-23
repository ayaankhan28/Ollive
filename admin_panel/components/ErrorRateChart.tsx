'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { ErrorRatePoint } from '@/lib/types'

interface Props {
  data: ErrorRatePoint[]
}

function fmtHour(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ErrorRatePoint
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-[6px] px-3 py-2 text-[10px] font-mono">
      <div className="text-[#555] mb-1">{fmtHour(d.timestamp)}</div>
      <div className="text-[#f87171]">{d.error_rate.toFixed(1)}% error rate</div>
      <div className="text-[#666]">{d.errors} errors / {d.total} total</div>
    </div>
  )
}

export default function ErrorRateChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-10">
        <span className="text-[10px] font-mono text-[#333]">no data</span>
      </div>
    )
  }

  const displayData = data.map((d) => ({ ...d, label: fmtHour(d.timestamp) }))
  const maxRate = Math.max(...data.map((d) => d.error_rate), 5)

  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={displayData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 8, fill: '#444', fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, maxRate]}
          tick={{ fontSize: 8, fill: '#444', fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={5} stroke="#2a2a2a" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="error_rate"
          stroke="#f87171"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: '#f87171' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
