import Link from 'next/link'
import { getSessions } from '@/lib/api'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const page = Number(searchParams.page ?? 1)
  let data = null
  let error = false

  try {
    data = await getSessions(page, 20)
  } catch {
    error = true
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a1a] shrink-0">
        <div>
          <h1 className="text-[13px] font-medium text-[#ccc]">Sessions</h1>
          <p className="text-[11px] text-[#444] mt-0.5">Click a session to see every agent turn and its internal span hierarchy</p>
        </div>
        {data && (
          <span className="text-[11px] font-mono text-[#444] bg-[#141414] border border-[#1e1e1e] px-2.5 py-1 rounded-[6px]">
            {data.total} sessions
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-[#444]">Could not load sessions</div>
        ) : !data || data.sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <div className="text-[12px] text-[#444]">No sessions yet</div>
            <div className="text-[11px] text-[#333]">Start chatting and session traces will appear here</div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0a0a0a]">
              <tr className="border-b border-[#1a1a1a]">
                {['Session', 'Turns', 'Tokens', 'Avg latency', 'Total cost', 'Last active'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium text-[#444] uppercase tracking-[0.06em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr
                  key={s.session_id}
                  className="border-b border-[#141414] hover:bg-white/[0.02] transition-colors group cursor-pointer"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/dashboard/sessions/${s.session_id}`}
                      className="flex items-center gap-2"
                    >
                      <div className="w-[6px] h-[6px] rounded-full bg-emerald-400/60 shrink-0" />
                      <span className="font-mono text-[11px] text-[#666] group-hover:text-[#999] transition-colors">
                        {s.session_id.slice(0, 8)}…{s.session_id.slice(-4)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] font-mono text-[#777] tabular-nums">{s.trace_count}</td>
                  <td className="px-5 py-3.5 text-[11px] font-mono text-[#777] tabular-nums">{fmtTokens(s.total_tokens)}</td>
                  <td className="px-5 py-3.5 text-[11px] font-mono text-[#777] tabular-nums">
                    {s.avg_latency_ms ? `${Math.round(s.avg_latency_ms)}ms` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-[11px] font-mono text-[#666] tabular-nums">
                    ${s.total_cost_usd.toFixed(4)}
                  </td>
                  <td className="px-5 py-3.5 text-[11px] text-[#444]">{fmtDate(s.last_trace_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1a1a1a] shrink-0">
          <span className="text-[11px] text-[#444] font-mono">page {page} of {Math.ceil(data.total / 20)}</span>
          <div className="flex gap-1.5">
            {page > 1 && (
              <Link href={`/dashboard/sessions?page=${page - 1}`} className="px-3 py-1.5 text-[11px] border border-[#1e1e1e] text-[#555] hover:text-[#888] rounded-[5px]">← prev</Link>
            )}
            {data.total > page * 20 && (
              <Link href={`/dashboard/sessions?page=${page + 1}`} className="px-3 py-1.5 text-[11px] border border-[#1e1e1e] text-[#555] hover:text-[#888] rounded-[5px]">next →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
