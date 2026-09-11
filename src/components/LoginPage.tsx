import { useState, useEffect } from 'react'
import { useUserStore } from '@/services/user/user.store'
import { cn } from '@/lib/utils'
import { Delete } from 'lucide-react'

interface LoginPageProps {
  onLogin: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const users = useUserStore((s) => s.users)
  const fetchUsers = useUserStore((s) => s.fetch)
  const login = useUserStore((s) => s.login)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { fetchUsers(); setTimeout(() => setMounted(true), 50) }, [])

  const handleDigit = (d: string) => {
    if (pin.length < 4) {
      setPin(pin + d)
      setError('')
    }
  }

  const handleDelete = () => { setPin(pin.slice(0, -1)); setError('') }

  const handleSubmit = async () => {
    if (!selectedUser || pin.length < 4) return
    setLoading(true)
    const result = await login(selectedUser, pin)
    setLoading(false)
    if (result.ok) { onLogin() }
    else { setError(result.error || 'خطأ'); setPin('') }
  }

  useEffect(() => { if (pin.length >= 4 && selectedUser) handleSubmit() }, [pin])

  return (
    <div className="relative flex h-screen w-screen bg-background overflow-hidden" dir="rtl">
      {/* ═══ Decorative Background Shapes ═══ */}
      {/* Large circle — top right */}
      <div className={cn("absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-primary/5 transition-all duration-[2s]", mounted ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
      {/* Medium circle — bottom left */}
      <div className={cn("absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full bg-primary/8 transition-all duration-[1.5s] delay-300", mounted ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
      {/* Small circle — center right */}
      <div className={cn("absolute top-1/3 right-1/4 w-4 h-4 rounded-full bg-primary/20 transition-all duration-1000 delay-500", mounted ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
      {/* Tiny dots */}
      <div className={cn("absolute top-1/4 left-1/3 w-2 h-2 rounded-full bg-primary/15 transition-all duration-700 delay-700", mounted ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
      <div className={cn("absolute bottom-1/3 right-1/3 w-3 h-3 rounded-full bg-primary/10 transition-all duration-700 delay-900", mounted ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
      {/* Rounded rectangle — left */}
      <div className={cn("absolute top-1/2 -left-10 w-[180px] h-[60px] rounded-[40px] bg-primary/5 rotate-12 transition-all duration-[1.8s] delay-200", mounted ? "translate-x-0 opacity-100" : "-translate-x-20 opacity-0")} />
      {/* Pill shape — bottom right */}
      <div className={cn("absolute bottom-24 right-16 w-[120px] h-[40px] rounded-full bg-primary/5 -rotate-6 transition-all duration-[1.5s] delay-400", mounted ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0")} />

      {/* ═══ SVG Decorative Elements ═══ */}
      {/* Burger SVG — floating top left */}
      <svg className={cn("absolute top-16 left-16 w-20 h-20 transition-all duration-1000 delay-300", mounted ? "opacity-100 translate-y-0 rotate-0" : "opacity-0 -translate-y-8 -rotate-12")} viewBox="0 0 80 80" fill="none">
        <rect x="10" y="35" width="60" height="10" rx="5" fill="currentColor" className="text-primary/10" />
        <rect x="8" y="45" width="64" height="6" rx="3" fill="currentColor" className="text-primary/8" />
        <rect x="10" y="51" width="60" height="8" rx="4" fill="currentColor" className="text-primary/12" />
        <path d="M15 35 C15 18 65 18 65 35" fill="currentColor" className="text-primary/15" />
      </svg>

      {/* Pizza SVG — floating bottom right */}
      <svg className={cn("absolute bottom-32 right-32 w-16 h-16 transition-all duration-1000 delay-500", mounted ? "opacity-100 translate-y-0 rotate-0" : "opacity-0 translate-y-8 rotate-12")} viewBox="0 0 64 64" fill="none">
        <path d="M32 4 L58 56 L6 56 Z" fill="currentColor" className="text-primary/10" />
        <circle cx="26" cy="38" r="3" fill="currentColor" className="text-primary/15" />
        <circle cx="38" cy="42" r="2.5" fill="currentColor" className="text-primary/12" />
        <circle cx="32" cy="30" r="2" fill="currentColor" className="text-primary/10" />
      </svg>

      {/* Fries SVG — floating center left */}
      <svg className={cn("absolute top-1/2 left-8 w-12 h-16 transition-all duration-1000 delay-700", mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8")} viewBox="0 0 48 64" fill="none">
        <rect x="8" y="24" width="32" height="28" rx="4" fill="currentColor" className="text-primary/8" />
        <rect x="14" y="8" width="4" height="20" rx="2" fill="currentColor" className="text-primary/12" />
        <rect x="22" y="4" width="4" height="24" rx="2" fill="currentColor" className="text-primary/10" />
        <rect x="30" y="10" width="4" height="18" rx="2" fill="currentColor" className="text-primary/12" />
      </svg>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-[420px] space-y-8">
          {/* Hero / Welcome */}
          <div className={cn("text-center space-y-4 transition-all duration-700", mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6")}>
            {/* Logo mark — layered shapes for contrast */}
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute w-24 h-24 rounded-[28px] bg-primary/10 rotate-6 transition-transform duration-[2s] hover:rotate-12" />
              <div className="relative w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center backdrop-blur-sm">
                <span className="text-4xl drop-shadow-sm">🍔</span>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black tracking-tight">فاست فود</h1>
              <p className="text-base text-muted-foreground font-medium">!أهلاً وسهلاً</p>
              <p className="text-sm text-muted-foreground/70">نقطة البيع الذكية — سجّل دخولك للبدء</p>
            </div>
          </div>

          {/* User Selection */}
          <div className={cn("flex gap-4 justify-center transition-all duration-700 delay-200", mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6")}>
            {users.map((user, i) => (
              <button
                key={user.id}
                onClick={() => { setSelectedUser(user.id); setPin(''); setError('') }}
                style={{ animationDelay: `${0.3 + i * 0.1}s` }}
                className={cn(
                  "flex flex-col items-center gap-3 px-8 py-5 rounded-3xl transition-all cursor-pointer border-2 group relative overflow-hidden",
                  selectedUser === user.id
                    ? "bg-primary/10 border-primary shadow-lg shadow-primary/10"
                    : "bg-card border-transparent hover:border-border hover:shadow-md"
                )}
              >
                {/* Background shape on selected */}
                {selectedUser === user.id && (
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-3xl" />
                )}
                <div className={cn(
                  "relative w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black transition-all",
                  selectedUser === user.id
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-110"
                    : "bg-secondary text-muted-foreground group-hover:bg-secondary/80"
                )}>
                  {user.name.charAt(0)}
                </div>
                <div className="relative text-center">
                  <p className="text-sm font-bold">{user.name}</p>
                  <p className={cn("text-[10px] font-medium mt-0.5", selectedUser === user.id ? "text-primary" : "text-muted-foreground")}>
                    {user.role === 'admin' ? 'مدير النظام' : 'كاشير'}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* PIN Section */}
          {selectedUser && (
            <div className="space-y-5 animate-slide-up">
              {/* PIN Dots */}
              <div className="flex justify-center gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all duration-200",
                      i < pin.length
                        ? "bg-primary border-primary shadow-md shadow-primary/25 scale-105"
                        : "bg-secondary/60 border-transparent"
                    )}
                  >
                    {i < pin.length && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground animate-scale-in" />
                    )}
                  </div>
                ))}
              </div>

              {/* Hint */}
              <p className="text-center text-xs text-muted-foreground">أدخل الرمز السري المكوّن من 4 أرقام</p>

              {/* Error */}
              {error && (
                <div className="mx-auto max-w-[280px] bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2 text-center animate-scale-in">
                  <p className="text-sm text-destructive font-bold">{error}</p>
                </div>
              )}

              {/* PIN Pad */}
              <div className="grid grid-cols-3 gap-3 max-w-[300px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
                  if (key === '') return <div key="empty" />
                  if (key === 'del') {
                    return (
                      <button
                        key="del"
                        onClick={handleDelete}
                        className="h-14 rounded-2xl bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all cursor-pointer flex items-center justify-center active:scale-95"
                      >
                        <Delete className="h-5 w-5" />
                      </button>
                    )
                  }
                  return (
                    <button
                      key={key}
                      onClick={() => handleDigit(key)}
                      className="h-14 rounded-2xl bg-card border-2 border-transparent hover:border-primary/30 hover:bg-primary/5 text-xl font-black transition-all cursor-pointer active:scale-95 active:bg-primary/10"
                    >
                      {key}
                    </button>
                  )
                })}
              </div>

              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center gap-2 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Side Panel — Branding ═══ */}
      <div className={cn("hidden lg:flex w-[360px] shrink-0 flex-col items-center justify-center bg-card border-r transition-all duration-1000 delay-300", mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8")}>
        <div className="space-y-8 px-8">
          {/* Large decorative shapes */}
          <div className="relative">
            <div className="w-32 h-32 rounded-[36px] bg-primary/10 rotate-12" />
            <div className="absolute top-4 right-4 w-24 h-24 rounded-3xl bg-primary/15 -rotate-6 flex items-center justify-center">
              <span className="text-5xl">🍔</span>
            </div>
            <div className="absolute -bottom-2 -left-2 w-10 h-10 rounded-xl bg-primary/20 rotate-45" />
          </div>

          {/* Info cards — shape contrast */}
          <div className="space-y-3">
            <div className="bg-secondary/60 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg">⚡</div>
              <div>
                <p className="text-sm font-bold">سريع وذكي</p>
                <p className="text-[10px] text-muted-foreground">إدارة الطلبات بلمسة واحدة</p>
              </div>
            </div>
            <div className="bg-secondary/60 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-lg">📊</div>
              <div>
                <p className="text-sm font-bold">تقارير شاملة</p>
                <p className="text-[10px] text-muted-foreground">متابعة المبيعات والأرباح</p>
              </div>
            </div>
            <div className="bg-secondary/60 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-lg">🔒</div>
              <div>
                <p className="text-sm font-bold">آمن وموثوق</p>
                <p className="text-[10px] text-muted-foreground">حماية بالرقم السري</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
