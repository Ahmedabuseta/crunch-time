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

  useEffect(() => { fetchUsers() }, [])

  const handleDigit = (d: string) => {
    if (pin.length < 6) {
      const newPin = pin + d
      setPin(newPin)
      setError('')
    }
  }

  const handleDelete = () => {
    setPin(pin.slice(0, -1))
    setError('')
  }

  const handleSubmit = async () => {
    if (!selectedUser || pin.length < 4) return
    setLoading(true)
    const result = await login(selectedUser, pin)
    setLoading(false)
    if (result.ok) {
      onLogin()
    } else {
      setError(result.error || 'خطأ')
      setPin('')
    }
  }

  // Auto-submit when PIN reaches 4+ digits
  useEffect(() => {
    if (pin.length >= 4 && selectedUser) {
      handleSubmit()
    }
  }, [pin])

  return (
    <div className="flex h-screen w-screen bg-background items-center justify-center" dir="rtl">
      <div className="w-[380px] space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10">
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
                "flex flex-col items-center gap-2 px-6 py-4 rounded-2xl transition-all cursor-pointer border-2",
                selectedUser === user.id
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-transparent hover:border-border"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-lg font-black",
                selectedUser === user.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
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
                    "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                    i < pin.length
                      ? "bg-primary border-primary"
                      : "bg-secondary border-transparent"
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
            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
                if (key === '') return <div key="empty" />
                if (key === 'del') {
                  return (
                    <button
                      key="del"
                      onClick={handleDelete}
                      className="h-14 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Delete className="h-5 w-5" />
                    </button>
                  )
                }
                return (
                  <button
                    key={key}
                    onClick={() => handleDigit(key)}
                    className="h-14 rounded-xl bg-card border-2 border-transparent hover:border-primary/30 text-xl font-black transition-all cursor-pointer active:scale-95"
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
