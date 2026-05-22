'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_INGESTION_URL || 'http://localhost:8001'

interface LiveEvent {
  trace_id: string
  name: string
  span_type: string
  provider: string
  status: string
  latency_ms: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  parent_trace_id: string | null
  ts: number  // local timestamp when received
}

const SPAN_COLOR: Record<string, string> = {
  trace:      'text-purple-400',
  generation: 'text-blue-400',
  tool:       'text-amber-400',
}
const STATUS_DOT: Record<string, string> = {
  success:   'bg-emerald-400',
  error:     'bg-red-400',
  pending:   'bg-blue-400',
  cancelled: 'bg-yellow-400',
}

function fmtMs(ms: number | null): string {
  if (!ms) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

export default function LiveTraceFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/v1/events/traces`)
    esRef.current = es

    es.addEventListener('connected', () => setConnected(true))

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setEvents((prev) => [{ ...data, ts: Date.now() }, ...prev].slice(0, 30))
      } catch {}
    }

    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      setConnected(false)
    }
  }, [])

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-[10px] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <span className="text-[11px] font-medium text-[#888]">Live Feed</span>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-[#333]'}`} />
          <span className="text-[10px] text-[#444]">{connected ? 'live' : 'connecting…'}</span>
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-[11px] text-[#333]">
            Waiting for traces…
          </div>
        ) : (
          <div>
            {events.map((ev, i) => (
              <Link
                key={`${ev.trace_id}-${i}`}
                href={`/dashboard/traces/${ev.trace_id}`}
                className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-white/[0.02] border-b border-[#141414] last:border-0 group transition-colors"
              >
                <div className={`w-[5px] h-[5px] rounded-full mt-[4px] shrink-0 ${STATUS_DOT[ev.status] ?? 'bg-[#444]'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium ${SPAN_COLOR[ev.span_type] ?? 'text-[#666]'}`}>
                      {ev.span_type.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-[#666] truncate group-hover:text-[#888]">
                      {ev.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[#444] capitalize">{ev.provider}</span>
                    {ev.latency_ms && (
                      <span className="text-[10px] font-mono text-[#444]">{fmtMs(ev.latency_ms)}</span>
                    )}
                    {ev.total_tokens && (
                      <span className="text-[10px] font-mono text-[#333]">{ev.total_tokens}t</span>
                    )}
                  </div>
                </div>
                <span className="text-[9px] text-[#333] shrink-0 mt-0.5">
                  {new Date(ev.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
