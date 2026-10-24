import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const outDir = path.dirname(fileURLToPath(import.meta.url))
const url = 'https://crunchtime-tanta.vercel.app/'
const qrPng = path.join(outDir, 'qr-crunchtime.png')

fs.mkdirSync(outDir, { recursive: true })

await QRCode.toFile(qrPng, url, {
  width: 1800,
  margin: 4,
  errorCorrectionLevel: 'H',
  color: { dark: '#000000', light: '#FFFFFF' },
})
console.log(`wrote ${qrPng}`)

const sharedPattern = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%23A9854F' stroke-width='1'%3E%3Cpath d='M90 8 172 90 90 172 8 90Z'/%3E%3Cpath d='M90 30 150 90 90 150 30 90Z'/%3E%3Cpath d='M30 30 150 150M150 30 30 150'/%3E%3Ccircle cx='90' cy='90' r='26'/%3E%3C/g%3E%3C/svg%3E")`

const a4Html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>Crunch Time — QR</title>
<style>
  @page { size: 2480px 3508px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 2480px; height: 3508px; }
  body { background: #F4ECDD; color: #1F2A26; font-family: "Noto Naskh Arabic", serif; -webkit-font-smoothing: antialiased; }
  .page { position: relative; width: 2480px; height: 3508px; padding: 90px 150px 70px; display: flex; flex-direction: column; align-items: center; overflow: hidden; background: radial-gradient(120% 75% at 50% 0%, #FCF8F0 0%, #F4ECDD 52%, #EEE3D0 100%); }
  .pattern { position: absolute; inset: 0; opacity: .12; mix-blend-mode: multiply; background-image: ${sharedPattern}; background-size: 180px 180px; pointer-events: none; }
  .frame { position: absolute; inset: 30px; border: 1px solid rgba(169,133,79,.58); pointer-events: none; }
  .frame::before { content: ''; position: absolute; inset: 10px; border: 1px solid rgba(169,133,79,.22); }
  .corner { position: absolute; width: 18px; height: 18px; background: #F7F1E5; border: 1px solid #A9854F; transform: rotate(45deg); }
  .tl { top: -9px; left: -9px; } .tr { top: -9px; right: -9px; }
  .bl { bottom: -9px; left: -9px; } .br { bottom: -9px; right: -9px; }
  .content { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; width: 100%; }
  .logo { width: 250px; height: 250px; border-radius: 50%; padding: 6px; border: 1px solid rgba(169,133,79,.8); background: #F9F3E7; overflow: hidden; margin-bottom: 18px; }
  .logo img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; transform: scale(1.07); display: block; }
  .brand-ar { font-family: "Noto Kufi Arabic", sans-serif; font-weight: 900; font-size: 104px; line-height: 1.02; margin: 0; letter-spacing: -1px; }
  .brand-en { font-family: "Noto Serif", serif; font-size: 32px; letter-spacing: 12px; color: #A9854F; margin-top: 6px; text-transform: uppercase; }
  .ornament { display: flex; align-items: center; gap: 20px; width: 62%; margin: 30px 0 24px; }
  .ornament .line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(169,133,79,.8), transparent); }
  .ornament svg { width: 30px; height: 30px; }
  h1 { font-family: "Noto Kufi Arabic", sans-serif; font-weight: 800; font-size: 72px; margin: 0; }
  .en { font-family: "Noto Serif", serif; font-size: 20px; letter-spacing: 5px; color: #A9854F; text-transform: uppercase; margin-top: 8px; }
  .sub { font-family: "Noto Naskh Arabic", serif; font-size: 31px; color: #5E6B5D; margin: 20px 0 34px; }
  .qr-panel { background: #FFFFFF; border: 1px solid rgba(169,133,79,.65); border-radius: 16px; padding: 36px; box-shadow: 0 1px 0 rgba(31,42,38,.05); }
  .qr-panel img { width: 1180px; height: 1180px; display: block; }
  .url { margin-top: 30px; font-family: "Noto Serif", serif; font-size: 27px; letter-spacing: 1px; color: #1F2A26; direction: ltr; }
  .url span { color: #A9854F; }
  .footer { margin-top: auto; position: relative; z-index: 2; text-align: center; }
  .footer-rule { width: 1200px; height: 1px; background: linear-gradient(to right, transparent, rgba(169,133,79,.75), transparent); margin-bottom: 16px; }
  .footer-main { font-family: "Noto Kufi Arabic", sans-serif; font-size: 19px; color: #5E6B5D; }
  .footer-main span { color: #A9854F; margin: 0 12px; }
  .footer-thanks { font-family: "Noto Naskh Arabic", serif; font-size: 28px; color: #A9854F; margin-top: 5px; }
</style>
</head>
<body>
  <div class="page">
    <div class="pattern"></div>
    <div class="frame"><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span></div>
    <div class="content">
      <div class="logo"><img src="../../build/logo-master.png" alt="Crunch Time"></div>
      <h2 class="brand-ar">كرانش تايم</h2>
      <div class="brand-en">CRUNCH TIME</div>
      <div class="ornament"><span class="line"></span><svg viewBox="0 0 24 24"><path d="M12 0l2.35 7.65L22 12l-7.65 2.35L12 22l-2.35-7.65L2 12l7.65-2.35z" fill="#A9854F"/></svg><span class="line"></span></div>
      <h1>المنيو الإلكتروني</h1>
      <div class="en">DIGITAL MENU</div>
      <div class="sub">امسح الكود لفتح المنيو الإلكتروني</div>
      <div class="qr-panel"><img src="qr-crunchtime.png" alt="QR code"></div>
      <div class="url">https://<span>crunchtime-tanta.vercel.app/</span></div>
    </div>
    <div class="footer">
      <div class="footer-rule"></div>
      <div class="footer-main">طنطا <span>·</span> شارع بطرس مع المؤيد <span>·</span> ت: 3277993</div>
      <div class="footer-thanks">شكراً لزيارتكم <span>·</span> THANK YOU</div>
    </div>
  </div>
</body>
</html>`

const thermalHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>Crunch Time — QR slip</title>
<style>
  @page { size: 576px 900px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 576px; height: 900px; background: #FFFFFF; }
  body { color: #000000; font-family: "Noto Naskh Arabic", serif; -webkit-font-smoothing: antialiased; }
  .slip { width: 576px; height: 900px; padding: 26px 30px 22px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .brand { font-family: "Noto Serif", serif; font-size: 37px; font-weight: 700; letter-spacing: 5px; line-height: 1; }
  .brand-ar { font-family: "Noto Kufi Arabic", sans-serif; font-size: 30px; font-weight: 800; margin-top: 6px; }
  .rule { width: 100%; border-top: 2px solid #000; margin: 16px 0 14px; }
  .scan-ar { font-family: "Noto Kufi Arabic", sans-serif; font-size: 27px; font-weight: 700; }
  .scan-en { font-family: "Noto Serif", serif; font-size: 13px; letter-spacing: 3px; margin-top: 4px; text-transform: uppercase; }
  .qr { margin: 18px 0 12px; }
  .qr img { width: 420px; height: 420px; display: block; }
  .url { font-family: "Noto Serif", serif; font-size: 18px; direction: ltr; letter-spacing: .4px; }
  .rule2 { width: 100%; border-top: 1px solid #000; margin: 15px 0 11px; }
  .contact { font-family: "Noto Kufi Arabic", sans-serif; font-size: 15px; line-height: 1.6; }
  .thanks { font-family: "Noto Naskh Arabic", serif; font-size: 18px; margin-top: 5px; }
</style>
</head>
<body>
  <div class="slip">
    <div class="brand">CRUNCH TIME</div>
    <div class="brand-ar">كرانش تايم</div>
    <div class="rule"></div>
    <div class="scan-ar">المنيو الإلكتروني</div>
    <div class="scan-en">SCAN FOR THE DIGITAL MENU</div>
    <div class="qr"><img src="qr-crunchtime.png" alt="QR code"></div>
    <div class="url">crunchtime-tanta.vercel.app</div>
    <div class="rule2"></div>
    <div class="contact">طنطا · شارع بطرس مع المؤيد<br>ت: 3277993</div>
    <div class="thanks">شكراً لزيارتكم</div>
  </div>
</body>
</html>`

const a4HtmlPath = path.join(outDir, 'qr-sign-a4.html')
const thermalHtmlPath = path.join(outDir, 'qr-thermal-80mm.html')
const a4Png = path.join(outDir, 'qr-sign-a4.png')
const thermalPng = path.join(outDir, 'qr-thermal-80mm.png')
const a4Pdf = path.join(outDir, 'qr-sign-a4.pdf')
const thermalPdf = path.join(outDir, 'qr-thermal-80mm.pdf')

fs.writeFileSync(a4HtmlPath, a4Html, 'utf-8')
fs.writeFileSync(thermalHtmlPath, thermalHtml, 'utf-8')

const chrome = process.env.CHROME_BIN || '/usr/bin/chromium'
const render = (htmlPath, pngPath, width, height) => {
  execFileSync(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--virtual-time-budget=5000',
    '--run-all-compositor-stages-before-draw',
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'inherit' })
}

render(a4HtmlPath, a4Png, 2480, 3508)
render(thermalHtmlPath, thermalPng, 576, 900)
console.log(`wrote ${a4Png}`)
console.log(`wrote ${thermalPng}`)

execFileSync('python3', ['-c', `
from PIL import Image
Image.open('${a4Png}').convert('RGB').save('${a4Pdf}', resolution=300)
Image.open('${thermalPng}').convert('RGB').save('${thermalPdf}', resolution=203)
`], { stdio: 'inherit' })
console.log(`wrote ${a4Pdf}`)
console.log(`wrote ${thermalPdf}`)

if (process.argv.includes('--print')) {
  execFileSync('lp', ['-d', 'XPrinter-80TS', '-o', 'fit-to-page', thermalPdf], { stdio: 'inherit' })
  console.log('sent thermal slip to XPrinter-80TS')
}
