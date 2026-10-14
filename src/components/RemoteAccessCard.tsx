import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Wifi, Smartphone, QrCode, Download, LogIn, Globe, Power, RefreshCw, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import type { FunnelStatus, RemoteStatus, TailscaleStatus } from '../ipc/renderer.d'

const inputClass = 'w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none'

/** `crunchtime://pair?u=…&c=…` — mirrored by the phone's parser. */
export function buildPairPayload(url: string, code: string): string {
  return `crunchtime://pair?u=${encodeURIComponent(url)}&c=${encodeURIComponent(code)}`
}

export function RemoteAccessCard() {
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [ts, setTs] = useState<TailscaleStatus | null>(null)
  const [funnel, setFunnel] = useState<FunnelStatus | null>(null)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [freshPin, setFreshPin] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [pairQr, setPairQr] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshRemote = useCallback(async () => {
    try {
      setRemote(await window.api.remote.get())
    } catch {
      /* ignore */
    }
  }, [])

  const refreshTailscale = useCallback(async () => {
    const [status, funnelStatus] = await Promise.allSettled([
      window.api.tailscale.status(),
      window.api.tailscale.funnelStatus(),
    ])
    if (status.status === 'fulfilled') setTs(status.value)
    if (funnelStatus.status === 'fulfilled') setFunnel(funnelStatus.value)
  }, [])

  useEffect(() => {
    void refreshRemote()
    void refreshTailscale()
    return () => {
      if (tick.current) clearInterval(tick.current)
    }
  }, [refreshRemote, refreshTailscale])

  /** The address the QR should carry: the public one when Funnel is on. */
  const pairingUrl = () => {
    if (funnel?.enabled && funnel.url) return funnel.url
    const t = ts?.ipv4
    if (t) return `http://${t}:${remote?.port ?? 4317}`
    const first = remote?.remote?.[0] ?? remote?.lan?.[0] ?? remote?.addresses?.[0]
    return first ? `http://${first}` : ''
  }

  const showPairing = async () => {
    setBusy(true)
    try {
      const res = await window.api.remote.pairCode()
      if (!res.ok || !res.code) {
        toast({ title: 'تعذّر إنشاء كود الربط', description: res.error || 'حدّد الرقم السري الأول', variant: 'error', duration: 6500 })
        return
      }
      const url = pairingUrl()
      if (!url) {
        toast({ title: 'الخادم مش شغال', description: 'شغّل الخادم الأول عشان نطلع عنوان للربط', variant: 'error', duration: 6500 })
        return
      }
      setPairCode(res.code)
      setPairQr(await QRCode.toDataURL(buildPairPayload(url, res.code), { width: 240, margin: 1 }))
      const expires = res.expiresAt ? new Date(res.expiresAt).getTime() : Date.now() + 10 * 60_000
      setSecondsLeft(Math.max(0, Math.round((expires - Date.now()) / 1000)))
      if (tick.current) clearInterval(tick.current)
      tick.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (tick.current) clearInterval(tick.current)
            setPairQr('')
            setPairCode('')
            return 0
          }
          return s - 1
        })
      }, 1000)
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async () => {
    if (!remote) return
    const res = await window.api.remote.set({ enabled: !remote.enabled })
    if (res.status) setRemote(res.status)
    if (!res.ok) {
      toast({ title: 'تعذّر تشغيل الخادم', description: res.error || '', variant: 'error', duration: 6500 })
    }
  }

  const handleSavePort = async (port: number) => {
    if (!remote || port === remote.port) return
    if (!port || port < 1024 || port > 65535) {
      toast({ title: 'منفذ غير صالح', description: 'من 1024 إلى 65535', variant: 'error' })
      return
    }
    const res = await window.api.remote.set({ port })
    if (res.status) setRemote(res.status)
    if (!res.ok) toast({ title: 'تعذّر حفظ المنفذ', description: res.error || '', variant: 'error' })
  }

  const handleGeneratePin = async () => {
    setBusy(true)
    try {
      const res = await window.api.remote.generatePin()
      if (res.status) setRemote(res.status)
      if (res.ok && res.pin) {
        setFreshPin(res.pin)
        toast({ title: 'تم توليد رقم سري جديد', description: 'كل الموبايلات اللي داخلة اتعمل لها خروج', variant: 'success' })
      } else {
        toast({ title: 'تعذّر توليد الرقم السري', description: res.error || '', variant: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleSavePin = async () => {
    if (pin.length < 4) {
      toast({ title: 'الرقم السري قصير', description: '4 أرقام على الأقل', variant: 'warning' })
      return
    }
    if (pin !== pin2) {
      toast({ title: 'الرقمين مش زي بعض', variant: 'warning' })
      return
    }
    const res = await window.api.remote.setPin(pin)
    if (res.status) setRemote(res.status)
    if (res.ok) {
      setPin('')
      setPin2('')
      toast({ title: 'تم حفظ الرقم السري', description: 'كل الموبايلات اتعمل لها خروج', variant: 'success' })
    } else {
      toast({ title: 'تعذّر حفظ الرقم السري', description: res.error || '', variant: 'error' })
    }
  }

  const handleInstall = async () => {
    setBusy(true)
    try {
      const res = await window.api.tailscale.install()
      toast({
        title: res.ok ? 'خطوة التنزيل' : 'تعذّر التثبيت',
        description: [res.message, res.error].filter(Boolean).join(' — '),
        variant: res.ok ? 'success' : 'error',
        duration: 9000,
      })
      await refreshTailscale()
    } finally {
      setBusy(false)
    }
  }

  const handleSignIn = async () => {
    setBusy(true)
    try {
      const res = await window.api.tailscale.up()
      toast({
        title: res.ok ? 'تم تسجيل الدخول' : 'سجّل الدخول يدوياً',
        description: [res.message, res.error].filter(Boolean).join(' — '),
        variant: res.ok ? 'success' : 'warning',
        duration: 9000,
      })
      await refreshTailscale()
    } finally {
      setBusy(false)
    }
  }

  const handleFunnel = async (enable: boolean) => {
    setBusy(true)
    try {
      const res = enable
        ? await window.api.tailscale.funnelEnable(remote?.port ?? 4317, 443)
        : await window.api.tailscale.funnelDisable(443)
      toast({
        title: res.ok ? 'تم' : 'تعذّر التنفيذ',
        description: [res.message, res.error].filter(Boolean).join(' — '),
        variant: res.ok ? 'success' : 'error',
        duration: 12000,
      })
      await refreshTailscale()
      await refreshRemote()
    } finally {
      setBusy(false)
    }
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be blocked */
    }
  }

  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <div className="border-2 rounded-2xl bg-card p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-sm">الخادم البعيد (تطبيق الهاتف)</h3>
        {remote && (
          <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-bold', remote.running ? 'bg-green-500/10 text-green-500' : 'bg-secondary text-muted-foreground')}>
            {remote.running ? 'يعمل' : 'متوقف'}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        شغّل الخادم، وبعدين اعرض كود الربط وامسحه بالموبايل بكاميرا التطبيق — مش محتاج تكتب عنوان ولا رقم سري.
      </p>

      {remote && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleToggle()}
              className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer border-2 transition-all',
                remote.enabled ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-secondary/60 text-muted-foreground border-transparent')}
            >
              <span className={cn('w-8 h-5 rounded-full relative transition-colors', remote.enabled ? 'bg-green-500' : 'bg-secondary')}>
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', remote.enabled ? 'right-0.5' : 'left-0.5')} />
              </span>
              تشغيل الخادم
            </button>
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/60 text-xs font-bold">
              <span className="text-muted-foreground">المنفذ</span>
              <input
                key={remote.port}
                type="number"
                dir="ltr"
                min={1024}
                max={65535}
                defaultValue={remote.port}
                onBlur={(e) => void handleSavePort(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded-lg bg-secondary text-sm text-center border-0 focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
          </div>

          {remote.error && <p className="text-xs font-bold text-destructive">{remote.error}</p>}

          {/* ── Pairing ─────────────────────────────────────── */}
          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold">ربط الموبايل</span>
                {pairCode && <span className="text-[10px] font-mono bg-secondary rounded-full px-2 py-0.5">{mmss}</span>}
              </div>
              <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void showPairing()}>
                {pairQr ? 'كود جديد' : 'إظهار كود الربط'}
              </Button>
            </div>

            {pairQr ? (
              <div className="flex items-center gap-4 bg-secondary/40 rounded-2xl p-3">
                <img src={pairQr} alt="كود الربط" className="w-[180px] h-[180px] rounded-xl bg-white p-1 shrink-0" />
                <div className="space-y-1.5 min-w-0">
                  <p className="text-xs font-bold">افتح التطبيق → «امسح كود الربط»</p>
                  <p className="text-[11px] text-muted-foreground break-all" dir="ltr">{pairingUrl()}</p>
                  <p className="text-[11px] text-muted-foreground">الكود يستخدم مرة واحدة ودلوقتي شغال {mmss}.</p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                الكود يشتغل مرة واحدة ومدته 10 دقايق. {!remote.hasPin && 'حدّد الرقم السري الأول.'}
              </p>
            )}
          </div>

          {/* ── PIN ─────────────────────────────────────────── */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold">الرقم السري للهاتف</span>
            </div>
            {freshPin && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-green-400">الرقم الجديد:</span>
                <span className="font-mono text-base font-black tracking-widest text-green-400" dir="ltr">{freshPin}</span>
                <span className="text-[10px] text-muted-foreground">بتظهر مرة واحدة بس — امسك الكود أو سجّلها</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => void handleGeneratePin()}>
                توليد رقم سري تلقائي
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="password" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="أو اكتب رقم سري بنفسك" className={inputClass} />
              <input type="password" dir="ltr" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="تأكيد الرقم" className={inputClass} />
            </div>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void handleSavePin()} disabled={!pin || !pin2}>
              حفظ الرقم السري
            </Button>
          </div>

          {/* ── Tailscale / Funnel ──────────────────────────── */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-bold">الوصول من أي مكان (Tailscale)</span>
              {ts && (
                <span className={cn('text-[10px] rounded-full px-2 py-0.5 font-bold',
                  ts.online ? 'bg-green-500/10 text-green-500' : 'bg-secondary text-muted-foreground')}>
                  {ts.online ? 'جاهز' : ts.installed ? 'مسجّلش دخول' : 'مش متثبّت'}
                </span>
              )}
              <Button size="sm" variant="ghost" className="rounded-xl h-6 px-2 ml-auto" onClick={() => void refreshTailscale()}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            {ts ? (
              <>
                {ts.ipv4 && <p className="text-[11px] text-muted-foreground" dir="ltr">{ts.ipv4}{ts.dnsName ? ` · ${ts.dnsName}` : ''}</p>}
                {ts.error && <p className="text-[11px] text-amber-400">{ts.error}</p>}

                <div className="flex flex-wrap gap-2">
                  {!ts.installed && (
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={busy} onClick={() => void handleInstall()}>
                      <Download className="h-3.5 w-3.5" /> تثبيت Tailscale
                    </Button>
                  )}
                  {ts.installed && !ts.online && (
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={busy} onClick={() => void handleSignIn()}>
                      <LogIn className="h-3.5 w-3.5" /> تسجيل الدخول
                    </Button>
                  )}
                  {ts.online && !funnel?.enabled && (
                    <Button size="sm" className="rounded-xl gap-1.5" disabled={busy || !remote.enabled} onClick={() => void handleFunnel(true)}>
                      <Globe className="h-3.5 w-3.5" /> تشغيل الوصول من أي مكان
                    </Button>
                  )}
                  {funnel?.enabled && (
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-destructive border-destructive/30" disabled={busy} onClick={() => void handleFunnel(false)}>
                      <Power className="h-3.5 w-3.5" /> إيقاف الوصول من أي مكان
                    </Button>
                  )}
                </div>

                {funnel?.enabled && funnel.url && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-green-400">الرابط العام — يشتغل من أي شبكة بدون أي تطبيق تاني</p>
                    <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2">
                      <span className="font-mono text-xs flex-1 break-all" dir="ltr">{funnel.url}</span>
                      <button onClick={() => void copyUrl(funnel.url as string)} className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
                        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      الرابط شغال على طول (مربوط بخدمة Tailscale) ويفضل شغال بعد إعادة تشغيل الجهاز. ده رابط عام على الإنترنت — الرقم السري هو الحماية الوحيدة، فخليه قوي.
                    </p>
                  </div>
                )}

                {funnel && !funnel.enabled && funnel.error && (
                  <p className="text-[11px] text-amber-400">لازم تفعّل HTTPS و Funnel للشبكة من لوحة Tailscale الأول.</p>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
