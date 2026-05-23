import { Bell, Moon, User } from 'lucide-react'
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
