import { useEffect } from 'react'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Shield, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UsersPage() {
  const users = useUserStore((s) => s.users)
  const fetch = useUserStore((s) => s.fetch)
  const remove = useUserStore((s) => s.remove)

  useEffect(() => { fetch() }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المستخدمين</h2>
        <Button size="sm" className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> إضافة مستخدم</Button>
      </div>
      <div className="flex-1 p-5 space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-4 border-2 rounded-xl bg-card p-4">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", u.role === 'admin' ? "bg-primary/10" : "bg-secondary")}>
              {u.role === 'admin' ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">{u.name}</p>
              <p className="text-xs text-muted-foreground">{u.role === 'admin' ? 'مدير' : 'كاشير'}</p>
            </div>
            <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", u.role === 'admin' ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
              {u.role === 'admin' ? 'مدير' : 'كاشير'}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => remove(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}
