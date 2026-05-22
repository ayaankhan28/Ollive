import { Bell, Moon, Search, Settings2, User } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

function TopBar() {
  return (
    <header className="h-[44px] shrink-0 flex items-center border-b border-[#1a1a1a] px-4 gap-4 bg-[#0a0a0a]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="text-[#ccc] font-medium">Overview</span>
        <span className="text-[#333]">/</span>
        <span className="text-[#444]">prod/us-east-1</span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="flex items-center gap-2 bg-[#111] border border-[#1e1e1e] rounded-[7px] px-3 py-1.5 w-56 cursor-text">
        <Search className="w-3 h-3 text-[#444] shrink-0" />
        <span className="text-[11px] text-[#333] flex-1">Search traces, sessions…</span>
        <kbd className="text-[10px] text-[#333] bg-[#1a1a1a] border border-[#252525] rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#444] hover:text-[#888] hover:bg-white/[0.04] transition-colors">
          <Bell className="w-[14px] h-[14px]" />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#444] hover:text-[#888] hover:bg-white/[0.04] transition-colors">
          <Moon className="w-[14px] h-[14px]" />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#444] hover:text-[#888] hover:bg-white/[0.04] transition-colors">
          <User className="w-[14px] h-[14px]" />
        </button>
      </div>
    </header>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
