// Silent print — the one Electron-only capability the backend needs.
// Prints an HTML string on a hidden window via the OS print driver (CUPS/Windows).
// CUPS renders everything as pixels — Arabic, fonts, RTL all just work.
import { BrowserWindow } from 'electron'

export async function silentPrint(html: string, deviceName?: string | null, copies = 1, paperWidth: string = '80mm'): Promise<{ ok: boolean; error?: string }> {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return { ok: false, error: 'لا توجد نافذة للطباعة' }

  // Thermal paper is 80mm, but the XP-80 driver's printable area is 72mm.
  const paperMm = paperWidth === '58mm' ? 48 : 72
  const widthPx = Math.round(paperMm * 96 / 25.4)
  const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true }, width: widthPx, height: 200 })

  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await printWin.webContents.executeJavaScript('document.fonts.ready')
    await new Promise(r => setTimeout(r, 300))

    const availablePrinters = await printWin.webContents.getPrintersAsync()
    const selectedPrinter = deviceName
      ? availablePrinters.find((printer) => printer.name === deviceName)
      : availablePrinters.find((printer) => printer.isDefault)
    if (deviceName && !selectedPrinter) {
      const availableNames = availablePrinters.map((printer) => printer.displayName || printer.name).join('، ')
      return {
        ok: false,
        error: `الطابعة «${deviceName}» غير متاحة حالياً. الطابعات الظاهرة: ${availableNames || 'لا توجد طابعات'}`,
      }
    }
    if (!deviceName && !selectedPrinter) {
      return { ok: false, error: 'لا توجد طابعة افتراضية متاحة حالياً.' }
    }

    const measurement: { height: number; text: string; width: number } = await printWin.webContents.executeJavaScript(`(() => {
      const ticket = document.querySelector('.ticket') || document.body
      const rect = ticket.getBoundingClientRect()
      return {
        height: Math.ceil(rect.height),
        width: Math.ceil(rect.width),
        text: (ticket.textContent || '').replace(/\\s+/g, ' ').trim()
      }
    })()`)

    const MICRONS_PER_PX = 25_400 / 96
    const widthMicrons = paperMm * 1000
    const heightMicrons = Math.max(20_000, Math.ceil(measurement.height * MICRONS_PER_PX))

    console.log(`[print] preview: ${measurement.text}`)
    console.log(`[print] ticket=${measurement.width}x${measurement.height}px page=${widthMicrons}x${heightMicrons}µm printer=${selectedPrinter?.name || deviceName || '(default)'}`)

    for (let i = 0; i < Math.max(1, copies); i++) {
      await new Promise<void>((resolve, reject) => {
        printWin.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: selectedPrinter?.name,
          pageSize: { width: widthMicrons, height: heightMicrons } as any,
          margins: { marginType: 'none' } as any,
          scaleFactor: 100,
        }, (success: boolean, failureReason: string) => {
          if (success) resolve()
          else reject(new Error(failureReason === 'cancelled' ? 'أُلغيت الطباعة' : String(failureReason || 'فشلت الطباعة')))
        })
      })
    }
    return { ok: true }
  } catch (err: any) {
    console.log(`[print] error: ${err.message}`)
    return { ok: false, error: err?.message || 'فشلت الطباعة' }
  } finally {
    if (!printWin.isDestroyed()) printWin.close()
  }
}
