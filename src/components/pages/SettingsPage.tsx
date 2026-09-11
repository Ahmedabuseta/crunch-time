import { Button } from '@/components/ui/button'
import { Database, Cloud, Shield } from 'lucide-react'

export function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b">
        <h2 className="text-base font-black">الإعدادات</h2>
      </div>
      <div className="flex-1 p-5 space-y-4">
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">النسخ الاحتياطي</h3>
          </div>
          <p className="text-xs text-muted-foreground">آخر نسخة: لا توجد</p>
          <Button size="sm" className="rounded-xl">نسخ احتياطي الآن</Button>
        </div>
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-400" />
            <h3 className="font-bold text-sm">المزامنة</h3>
          </div>
          <p className="text-xs text-muted-foreground">غير متصل</p>
          <Button size="sm" variant="outline" className="rounded-xl">إعداد المزامنة</Button>
        </div>
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            <h3 className="font-bold text-sm">الأمان</h3>
          </div>
          <p className="text-xs text-muted-foreground">PIN-based authentication active</p>
        </div>
      </div>
    </div>
  )
}
