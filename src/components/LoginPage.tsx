import { useState, useEffect } from 'react'
import { useUserStore } from '@/services/user/user.store'
import { cn } from '@/lib/utils'
import { Delete } from 'lucide-react'

interface LoginPageProps {
  onLogin: () => void
}

// WhatsApp-style repeating pattern as inline SVG
const patternSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.08">
    <!-- Burger -->
    <path d="M25 30 C25 22 45 22 45 30" /><rect x="23" y="30" width="24" height="4" rx="2"/><rect x="25" y="34" width="20" height="3" rx="1.5"/><rect x="23" y="37" width="24" height="4" rx="2"/>
    <!-- Pizza slice -->
    <path d="M80 20 L95 50 L65 50 Z"/><circle cx="78" cy="38" r="1.5" fill="currentColor" opacity="0.06"/><circle cx="85" cy="42" r="1" fill="currentColor" opacity="0.06"/>
    <!-- Fries -->
    <rect x="130" y="28" width="20" height="16" rx="2"/><rect x="134" y="16" width="3" height="14" rx="1.5"/><rect x="140" y="14" width="3" height="16" rx="1.5"/><rect x="146" y="18" width="3" height="12" rx="1.5"/>
    <!-- Cup -->
    <path d="M175 22 L172 46 L192 46 L189 22 Z"/><path d="M170 22 L194 22"/>
    <!-- Star -->
    <path d="M30 80 L33 90 L43 90 L35 96 L38 106 L30 100 L22 106 L25 96 L17 90 L27 90 Z"/>
    <!-- Heart -->
    <path d="M90 75 C90 70 82 68 82 74 C82 80 90 86 90 86 C90 86 98 80 98 74 C98 68 90 70 90 75 Z"/>
    <!-- Donut -->
    <circle cx="155" cy="80" r="10"/><circle cx="155" cy="80" r="4"/>
    <!-- Drink -->
    <rect x="175" y="65" width="14" height="22" rx="2"/><path d="M179 65 C179 60 185 60 185 65"/>
    <!-- Cherry -->
    <circle cx="30" cy="130" r="5"/><circle cx="42" cy="126" r="5"/><path d="M32 126 C35 115 40 115 40 126"/>
    <!-- Ice cream -->
    <path d="M85 120 L90 140 L80 140 Z"/><circle cx="85" cy="116" r="5"/><circle cx="80" cy="120" r="4"/><circle cx="90" cy="120" r="4"/>
    <!-- Bone -->
    <circle cx="140" cy="130" r="3"/><circle cx="140" cy="146" r="3"/><rect x="138" y="130" width="4" height="16" rx="2"/><circle cx="136" cy="130" r="2"/><circle cx="144" cy="130" r="2"/><circle cx="136" cy="146" r="2"/><circle cx="144" cy="146" r="2"/>
    <!-- Smiley -->
    <circle cx="180" cy="130" r="10"/><circle cx="176" cy="127" r="1.5" fill="currentColor"/><circle cx="184" cy="127" r="1.5" fill="currentColor"/><path d="M175 133 C177 136 183 136 185 133"/>
    <!-- Dots pattern -->
    <circle cx="15" cy="170" r="2" fill="currentColor" opacity="0.04"/><circle cx="55" cy="165" r="1.5" fill="currentColor" opacity="0.04"/><circle cx="100" cy="175" r="2" fill="currentColor" opacity="0.04"/><circle cx="120" cy="168" r="1.5" fill="currentColor" opacity="0.04"/><circle cx="165" cy="172" r="2" fill="currentColor" opacity="0.04"/>
    <!-- Leaf -->
    <path d="M50 160 C55 150 65 155 60 165 C55 175 45 170 50 160 Z"/><path d="M55 160 L55 170"/>
    <!-- Fork -->
    <rect x="100" y="155" width="2" height="20" rx="1"/><rect x="96" y="155" width="2" height="10" rx="1"/><rect x="104" y="155" width="2" height="10" rx="1"/>
  </g>
</svg>`

const encodedPattern = `data:image/svg+xml,${encodeURIComponent(patternSvg)}`

export function LoginPage({ onLogin }: LoginPageProps) {
  const users = useUserStore((s) => s.users)
  const fetchUsers = useUserStore((s) => s.fetch)
  const login = useUserStore((s) => s.login)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchUsers() }, [])

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
    <div
      className="flex h-screen w-screen items-center justify-center relative overflow-hidden"
      dir="rtl"
      style={{ backgroundColor: 'oklch(0.145 0.01 260)' }}
    >
      {/* WhatsApp-style patterned background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${encodedPattern}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
          color: 'oklch(0.6 0.02 260)',
        }}
      />

      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/50" />

      {/* Content */}
      <div className="relative z-10 w-[380px] space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10 backdrop-blur-sm">
            <span className="text-3xl">🍔</span>
          </div>
          <h1 className="text-2xl font-black">فاست فود</h1>
          <p className="text-sm text-muted-foreground">سجل دخولك بالرقم السري</p>
        </div>

        {/* User Selection */}
        <div className="flex gap-3 justify-center">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => { setSelectedUser(user.id); setPin(''); setError('') }}
              className={cn(
                "flex flex-col items-center gap-2 px-6 py-4 rounded-2xl transition-all cursor-pointer border-2 backdrop-blur-sm",
                selectedUser === user.id
                  ? "bg-primary/15 border-primary text-primary shadow-lg shadow-primary/10"
                  : "bg-card/80 border-transparent hover:border-border hover:bg-card"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-lg font-black transition-all",
                selectedUser === user.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-secondary text-muted-foreground"
              )}>
                {user.name.charAt(0)}
              </div>
              <span className="text-sm font-bold">{user.name}</span>
              <span className="text-[10px] text-muted-foreground">{user.role === 'admin' ? 'مدير' : 'كاشير'}</span>
            </button>
          ))}
        </div>

        {/* PIN Display */}
        {selectedUser && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex justify-center gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all backdrop-blur-sm",
                    i < pin.length
                      ? "bg-primary border-primary shadow-md shadow-primary/25 scale-105"
                      : "bg-secondary/80 border-transparent"
                  )}
                >
                  {i < pin.length && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                </div>
              ))}
            </div>

            {error && (
              <p className="text-center text-sm text-destructive font-bold animate-pulse">{error}</p>
            )}

            {/* PIN Pad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
                if (key === '') return <div key="empty" />
                if (key === 'del') {
                  return (
                    <button
                      key="del"
                      onClick={handleDelete}
                      className="h-14 rounded-2xl bg-secondary/60 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center active:scale-95"
                    >
                      <Delete className="h-5 w-5" />
                    </button>
                  )
                }
                return (
                  <button
                    key={key}
                    onClick={() => handleDigit(key)}
                    className="h-14 rounded-2xl bg-card/70 backdrop-blur-sm border-2 border-transparent hover:border-primary/30 text-xl font-black transition-all cursor-pointer active:scale-95 active:bg-primary/10"
                  >
                    {key}
                  </button>
                )
              })}
            </div>

            {loading && (
              <p className="text-center text-sm text-muted-foreground animate-pulse">جاري التحقق...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
