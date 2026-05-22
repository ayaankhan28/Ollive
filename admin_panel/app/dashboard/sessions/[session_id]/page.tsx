import Link from 'next/link'
import { getSessionDetail } from '@/lib/api'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import LiveSessionDetail from '@/components/LiveSessionDetail'

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

      {/* Live turn list — client component subscribes to SSE and appends new turns/spans */}
      <div className="flex-1 overflow-y-auto p-5">
        {!data || data.turns.length === 0 ? (
          <LiveSessionDetail initialTurns={[]} sessionId={session_id} />
        ) : (
          <LiveSessionDetail initialTurns={data.turns} sessionId={session_id} />
        )}
      </div>
    </div>
  )
}
