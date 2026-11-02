import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, ExternalLink, QrCode, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { menuUrlFor } from '@/lib/remote-url'
import type { FunnelStatus, RemoteStatus, TailscaleStatus } from '../ipc/renderer.d'

/**
 * Public QR menu card: the QR opens `/m` on the desktop's own server, which
 * renders the live catalogue. No export or republish step — edits in the app
 * appear on the next poll (30s) or reload.
 */
export function MenuQrCard() {
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [ts, setTs] = useState<TailscaleStatus | null>(null)
  const [funnel, setFunnel] = useState<FunnelStatus | null>(null)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedApi, setCopiedApi] = useState(false)

  const refresh = useCallback(async () => {
    const [remoteStatus, tailscaleStatus, funnelStatus] = await Promise.allSettled([
      window.api.remote.get(),
      window.api.tailscale.status(),
      window.api.tailscale.funnelStatus(),
    ])
    if (remoteStatus.status === 'fulfilled') setRemote(remoteStatus.value)
    if (tailscaleStatus.status === 'fulfilled') setTs(tailscaleStatus.value)
    if (funnelStatus.status === 'fulfilled') setFunnel(funnelStatus.value)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const menuUrl = menuUrlFor(remote, ts, funnel)
  const apiUrl = menuUrl ? menuUrl.replace(/\/m$/, '/public/menu') : ''

  useEffect(() => {
    if (!menuUrl) { setQr(''); return }
    let cancelled = false
    QRCode.toDataURL(menuUrl, {
      width: 280,
      margin: 1,
      color: { dark: '#1c1a17', light: '#ffffff' },
    }).then((data) => { if (!cancelled) setQr(data) }).catch(() => { if (!cancelled) setQr('') })
    return () => { cancelled = true }
  }, [menuUrl])

  const copy = async () => {
    if (!menuUrl) return
    try {
      await navigator.clipboard.writeText(menuUrl)
      setCopied(true)
      toast({ title: 'تم نسخ رابط المنيو', variant: 'success' })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast({ title: 'تعذّر نسخ الرابط', variant: 'error' })
    }
  }

  const copyApi = async () => {
    if (!apiUrl) return
    try {
      await navigator.clipboard.writeText(apiUrl)
      setCopiedApi(true)
      toast({ title: 'تم نسخ رابط API للموقع', description: 'حطه في إعدادات موقع Vercel باسم VITE_MENU_API_URL', variant: 'success' })
      setTimeout(() => setCopiedApi(false), 1800)
    } catch {
      toast({ title: 'تعذّر نسخ الرابط', variant: 'error' })
    }
  }

  return (
    <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5 text-amber-400" />
          <h3 className="font-bold text-sm">منيو الباركود (المنيو الإلكتروني)</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground" title="تحديث الحالة" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        الزبون يمسح الكود فيفتح منيو الجهاز نفسه. أي تعديل في الأقسام أو المنتجات أو الأسعار
        بيظهر تلقائيًا — الصفحة بتحدّث نفسها كل 30 ثانية. وموقع Vercel بيقرأ نفس البيانات
        من رابط الـAPI تحت.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="h-40 w-40 shrink-0 rounded-2xl bg-white border border-border flex items-center justify-center overflow-hidden">
          {qr ? (
            <img src={qr} alt="QR المنيو الإلكتروني" className="h-36 w-36" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <QrCode className="h-9 w-9 opacity-40" />
              <span className="text-[10px] font-bold">شغّل الخادم أولًا</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {menuUrl ? (
            <p dir="ltr" className="text-[11px] font-mono font-bold break-all rounded-lg bg-secondary/50 px-2.5 py-1.5">{menuUrl}</p>
          ) : (
            <p className="text-[11px] font-bold text-amber-400">
              مفيش عنوان متاح — شغّل الخادم من كارت «الريموت» قبل طباعة الكود.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="rounded-xl gap-1.5" disabled={!menuUrl} onClick={() => window.open(menuUrl, '_blank')}>
              <ExternalLink className="h-3.5 w-3.5" /> فتح المنيو
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={!menuUrl} onClick={() => void copy()}>
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'تم النسخ' : 'نسخ الرابط'}
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={!apiUrl} onClick={() => void copyApi()}>
              {copiedApi ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedApi ? 'تم نسخ API' : 'نسخ رابط API'}
            </Button>
            {qr && (
              <a
                href={qr}
                download="menu-qr.png"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-xl gap-1.5')}
              >
                <Download className="h-3.5 w-3.5" /> تنزيل الكود
              </a>
            )}
          </div>

          {remote && !remote.running && (
            <p className="text-[10px] font-bold text-red-400">
              الخادم متوقف حاليًا — الكود مش هيفتح لحد ما تشغّله من كارت الريموت.
            </p>
          )}
          {remote?.running && !funnel?.enabled && (
            <p className="text-[10px] font-medium text-muted-foreground">
              الرابط الحالي شغّال على شبكة المحل. للمشاركة برّه المحل فعّل Tailscale Funnel من كارت الريموت —
              موقع Vercel محتاج رابط عام (https) عشان يقدر يقرأ المنيو.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
