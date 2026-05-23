'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSessionDetail } from '@/lib/api'
import { SessionDetailResponse } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import LiveSessionDetail from '@/components/LiveSessionDetail'

export default function SessionDetailPage() {
  const { session_id } = useParams<{ session_id: string }>()
  const [data, setData] = useState<SessionDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    getSessionDetail(session_id)
      .then(setData)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [session_id])

  const shortId = `${session_id.slice(0, 8)}…${session_id.slice(-4)}`

  if (loading) return (
    <div className="flex items-center justify-center h-full text-[12px] text-[#444]">Loading session…</div>
  )

  if (notFound) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-[13px] text-[#555]">Session not found</div>
      <Link href="/dashboard/sessions" className="text-[11px] text-[#444] hover:text-[#777]">← back to sessions</Link>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 overflow-y-auto p-5">
        <LiveSessionDetail initialTurns={data?.turns ?? []} sessionId={session_id} />
      </div>
    </div>
  )
}
