'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CreditCard,
  HelpCircle,
  LayoutGrid,
  MessageSquare,
  Settings,
  Zap,
} from 'lucide-react'
import { clsx } from 'clsx'

const nav = [
  { href: '/dashboard',          label: 'Overview',    icon: Activity,      dot: true },
  { href: '/dashboard/traces',   label: 'Traces',      icon: Zap },
  { href: '/dashboard/traces?status=error', label: 'Failures', icon: AlertTriangle },
  { href: '/dashboard/metrics',  label: 'Metrics',     icon: BarChart3 },
]

const workspace = [
  { href: '/dashboard/sessions', label: 'Sessions',    icon: MessageSquare },
  { href: '#',                   label: 'Settings',    icon: Settings },
  { href: '#',                   label: 'Help',        icon: HelpCircle },
]

function NavItem({ href, label, icon: Icon, dot, badge }: {
  href: string; label: string; icon: React.ElementType; dot?: boolean; badge?: string
}) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && !href.includes('?') && pathname.startsWith(href))

  return (
    <Link
      href={href}
      className={clsx(
        'group flex items-center justify-between px-2.5 py-[7px] rounded-[6px] text-sm transition-colors',
        active
          ? 'bg-white/[0.06] text-[#f0f0f0]'
          : 'text-[#555] hover:text-[#aaa] hover:bg-white/[0.03]'
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={clsx('w-[14px] h-[14px] shrink-0', active ? 'text-[#888]' : 'text-[#444]')} />
        <span className="font-[400] tracking-[-0.01em]">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {dot && <span className="w-[6px] h-[6px] rounded-full bg-emerald-400" />}
        {badge && (
          <span className="text-[10px] text-[#444] bg-white/[0.06] px-1.5 py-0.5 rounded-[4px] font-mono">{badge}</span>
        )}
      </div>
    </Link>
  )
}

export default function Sidebar() {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-r border-[#1a1a1a] bg-[#0d0d0d] select-none">

      {/* Org header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-[5px] bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center shrink-0">
            <span className="text-[9px] font-mono font-medium text-[#888]">ob</span>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-[#ccc] truncate leading-none">observe-me</div>
            <div className="text-[10px] text-[#444] mt-0.5 leading-none">production</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ChevronDown className="w-3 h-3 text-[#444]" />
          <LayoutGrid className="w-3 h-3 text-[#444]" />
        </div>
      </div>

      {/* Primary nav */}
      <nav className="px-2 pt-3 pb-1 space-y-0.5">
        {nav.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Workspace section */}
      <div className="mt-5 px-4 mb-1.5">
        <span className="text-[10px] font-medium text-[#333] uppercase tracking-[0.08em]">Workspace</span>
      </div>
      <nav className="px-2 space-y-0.5">
        {workspace.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User footer */}
      <div className="border-t border-[#1a1a1a] px-3 py-2.5">
        <button className="w-full flex items-center justify-between group">
          <div className="flex items-center gap-2">
            <div className="w-[22px] h-[22px] rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-black">AK</span>
            </div>
            <div className="text-left">
              <div className="text-[11px] font-medium text-[#bbb] leading-none">Ayaan Khan</div>
              <div className="text-[10px] text-[#444] mt-0.5 leading-none">owner</div>
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-[#444] group-hover:text-[#666] transition-colors" />
        </button>
      </div>
    </aside>
  )
}
