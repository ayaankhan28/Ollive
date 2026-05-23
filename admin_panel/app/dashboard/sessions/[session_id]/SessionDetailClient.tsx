'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSessionDetail } from '@/lib/api'
import { ArrowLeft } from 'lucide-react'
import LiveSessionDetail from '@/components/LiveSessionDetail'

export default function SessionDetailClient() {
  const { session_id } = useParams<{ session_id: string }>()
  const router = useRouter()

  const [data, setData] = useState<Awaited<ReturnType<typeof getSessionDetail>> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)

    getSessionDetail(session_id)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) router.replace('/dashboard/sessions') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [session_id, router])

  const shortId = `${session_id.slice(0, 8)}…${session_id.slice(-4)}`

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[11px] font-mono text-[#333]">Loading…</span>
      </div>
    )
  }

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

      {/* Live turn list */}
      <div className="flex-1 overflow-y-auto p-5">
        <LiveSessionDetail initialTurns={data?.turns ?? []} sessionId={session_id} />
      </div>
    </div>
  )
}
