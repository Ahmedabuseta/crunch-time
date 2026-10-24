import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const outDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(outDir, '..', '..')
const dbPath = path.join(os.homedir(), '.config/fastfood-cashier/fastfood.db')
const db = new Database(dbPath, { readonly: true })

const rows = db.prepare(`
  SELECT c.id AS category_id, c.name AS category, c.sort_order,
         p.id, p.name, p.description, p.price
  FROM categories c
  JOIN products p ON p.category_id = c.id
  WHERE c.active = 1 AND p.active = 1
  ORDER BY c.sort_order, p.price, p.name
`).all()

const en = {
  chicken_crepe: 'CHICKEN CREPE',
  mixes: 'MIXES',
  meat_crepe: 'MEAT CREPE',
  buckets: 'POTATO BUCKET',
  syrian: 'SYRIAN',
  potato_crepe: 'POTATO CREPE',
  breakfast: 'BREAKFAST',
  drinks: 'DRINKS',
  sweets: 'SWEETS',
  treat: 'TREATS',
}

const cleanDesc = (desc, name) => {
  let d = String(desc || '').replace(/\s+/g, ' ').trim()
  d = d.replace(/\s*-\s*/g, ' · ')
  d = d.replace(/·\s*·/g, '·').replace(/\s*·\s*/g, ' · ').trim()
  if (d.startsWith(`${name} · `)) d = d.slice(name.length + 3)
  if (!d || d === name || d === 'بطاطس') return ''
  return d
}

const cats = []
for (const row of rows) {
  let cat = cats.find(c => c.id === row.category_id)
  if (!cat) {
    cat = { id: row.category_id, name: row.category, sort: row.sort_order, items: [] }
    cats.push(cat)
  }
  cat.items.push({
    id: row.id,
    name: row.name,
    desc: cleanDesc(row.description, row.name),
    price: Number(row.price),
  })
}
for (const cat of cats) cat.items.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'ar'))

const page1Ids = new Set(['chicken_crepe', 'mixes', 'meat_crepe'])
const pages = [
  {
    className: 'page1',
    title: 'الأطباق الرئيسية',
    titleEn: 'MAIN DISHES',
    cats: cats.filter(c => page1Ids.has(c.id)),
  },
  {
    className: 'page2',
    title: 'الأطباق الجانبية',
    titleEn: 'SIDES & MORE',
    cats: cats.filter(c => !page1Ids.has(c.id)),
  },
].filter(page => page.cats.length > 0)

let num = 1
for (const page of pages) {
  page.index = pages.indexOf(page) + 1
  for (const cat of page.cats) cat.number = String(num++).padStart(2, '0')
}

const priceFmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
const countLabel = n => n === 1 ? 'صنف واحد' : n === 2 ? 'صنفان' : n <= 10 ? `${n} أصناف` : `${n} صنفاً`

const itemHtml = item => `
  <div class="item">
    <div class="item-line">
      <span class="item-name">${item.name}</span>
      <span class="leader"></span>
      <span class="item-price"><span class="num">${priceFmt(item.price)}</span><small>ج.م</small></span>
    </div>
    ${item.desc ? `<div class="item-desc">${item.desc}</div>` : ''}
  </div>`

const cardHtml = (cat, pageClass, isLast) => {
  const twoCols = pageClass === 'page1' && cat.items.length > 6
  const split = Math.ceil(cat.items.length / 2)
  const body = twoCols
    ? `<div class="card-body two">
         <div class="col">${cat.items.slice(0, split).map(itemHtml).join('')}</div>
         <div class="col">${cat.items.slice(split).map(itemHtml).join('')}</div>
       </div>`
    : `<div class="card-body one">${cat.items.map(itemHtml).join('')}</div>`
  const imageFile = path.join(repoRoot, 'public', 'cat-bg', `${cat.id}.jpg`)
  const imagePosition = {
    chicken_crepe: 'center 58%',
    mixes: 'center 55%',
    meat_crepe: 'center 55%',
    buckets: 'center 55%',
    syrian: 'center 78%',
    potato_crepe: 'center 55%',
    breakfast: 'center 55%',
  }[cat.id] || 'center 55%'
  const image = fs.existsSync(imageFile)
    ? `<img src="../../public/cat-bg/${cat.id}.jpg" alt="" style="object-position:${imagePosition}">`
    : ''
  const compact = pageClass === 'page2' && isLast ? ' compact' : ''
  return `
  <section class="card${compact}">
    <div class="banner">
      ${image}
      <div class="banner-shade"></div>
      <div class="banner-content">
        <div class="banner-title">
          <h2>${cat.name}</h2>
          <span class="en">${en[cat.id] || cat.id.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
        <div class="banner-meta">
          <span class="cat-num">${cat.number}</span>
          <span class="cat-count">${countLabel(cat.items.length)}</span>
        </div>
      </div>
    </div>
    ${body}
  </section>`
}

const logoFile = path.join(repoRoot, 'build', 'logo-master.png')
const logo = fs.existsSync(logoFile)
  ? '<img src="../../build/logo-master.png" alt="Crunch Time">'
  : '<span class="logo-fallback">CT</span>'

const pageHtml = page => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>Crunch Time — Menu ${page.index}</title>
<style>
  :root {
    --ink: #1F2A26;
    --cream: #F4ECDD;
    --gold: #A9854F;
    --terracotta: #A94E37;
    --muted: #6F7468;
    --sage: #5E6B5D;
  }
  @page { size: 2480px 3508px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 2480px; height: 3508px; }
  body {
    background: var(--cream);
    color: var(--ink);
    font-family: "Noto Naskh Arabic", serif;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    position: relative;
    width: 2480px;
    height: 3508px;
    padding: 58px 88px 44px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: radial-gradient(120% 75% at 50% 0%, #FCF8F0 0%, #F4ECDD 52%, #EEE3D0 100%);
  }
  .pattern {
    position: absolute;
    inset: 0;
    opacity: .12;
    mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cg fill='none' stroke='%23A9854F' stroke-width='1'%3E%3Cpath d='M90 8 172 90 90 172 8 90Z'/%3E%3Cpath d='M90 30 150 90 90 150 30 90Z'/%3E%3Cpath d='M30 30 150 150M150 30 30 150'/%3E%3Ccircle cx='90' cy='90' r='26'/%3E%3C/g%3E%3C/svg%3E");
    background-size: 180px 180px;
    pointer-events: none;
  }
  .frame {
    position: absolute;
    inset: 28px;
    border: 1px solid rgba(169,133,79,.58);
    pointer-events: none;
  }
  .frame::before {
    content: '';
    position: absolute;
    inset: 9px;
    border: 1px solid rgba(169,133,79,.22);
  }
  .corner {
    position: absolute;
    width: 16px;
    height: 16px;
    background: #F7F1E5;
    border: 1px solid var(--gold);
    transform: rotate(45deg);
  }
  .tl { top: -8px; left: -8px; }
  .tr { top: -8px; right: -8px; }
  .bl { bottom: -8px; left: -8px; }
  .br { bottom: -8px; right: -8px; }

  .masthead {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(169,133,79,.55);
    flex: none;
  }
  .brand { display: flex; align-items: center; gap: 26px; min-width: 0; }
  .logo {
    width: 200px;
    height: 200px;
    border-radius: 50%;
    padding: 5px;
    border: 1px solid rgba(169,133,79,.78);
    background: #F9F3E7;
    flex: none;
    overflow: hidden;
  }
  .logo img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    transform: scale(1.07);
    display: block;
  }
  .logo-fallback {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Noto Serif", serif;
    font-size: 48px;
    color: var(--gold);
  }
  .brand-text { min-width: 0; }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: "Noto Serif", serif;
    font-size: 15px;
    letter-spacing: 4px;
    color: var(--gold);
    text-transform: uppercase;
  }
  .diamond { width: 6px; height: 6px; background: var(--gold); transform: rotate(45deg); }
  .brand-text h1 {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-weight: 900;
    font-size: 80px;
    line-height: 1.02;
    letter-spacing: -1px;
    margin: 4px 0 2px;
    color: var(--ink);
  }
  .brand-sub {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-size: 16px;
    letter-spacing: 1.5px;
    color: var(--muted);
  }
  .brand-sub span { color: var(--gold); margin: 0 7px; }
  .page-badge {
    width: 96px;
    height: 96px;
    border: 1px solid var(--gold);
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: none;
    color: var(--gold);
  }
  .page-badge .num { font-family: "Noto Serif", serif; font-size: 30px; line-height: 1; }
  .page-badge .of { font-family: "Noto Kufi Arabic", sans-serif; font-size: 11px; color: var(--muted); margin-top: 4px; }

  .page-title {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 18px 0 14px;
    flex: none;
  }
  .page-title h2 {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-weight: 700;
    font-size: 30px;
    margin: 0;
    color: var(--ink);
    white-space: nowrap;
  }
  .page-title .en {
    font-family: "Noto Serif", serif;
    font-size: 12px;
    letter-spacing: 2.5px;
    color: var(--gold);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .page-title .line {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, rgba(169,133,79,.55), transparent);
  }

  .cards {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-height: 0;
  }
  .cards.page1 .card { flex: 1; min-height: 0; }
  .cards.page2 .card { flex: 1; min-height: 0; }
  .cards.page2 .card.compact { flex: 0 0 auto; }
  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(169,133,79,.42);
    border-radius: 10px;
    overflow: hidden;
    background: rgba(255,251,244,.72);
    min-height: 0;
  }

  .banner {
    position: relative;
    flex: none;
    height: 280px;
    overflow: hidden;
    background: linear-gradient(135deg, #2A332D, #1F2A26);
    border-bottom: 1px solid rgba(169,133,79,.45);
  }
  .cards.page2 .banner { height: 250px; }
  .banner img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: saturate(.92) contrast(1.02) brightness(.9);
  }
  .banner-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(18,24,21,.88) 0%, rgba(18,24,21,.32) 55%, rgba(18,24,21,.04) 100%);
  }
  .banner-content {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 18px 26px;
  }
  .banner-title h2 {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-weight: 700;
    font-size: 44px;
    line-height: 1.05;
    margin: 0;
    color: #FBF6EC;
    white-space: nowrap;
  }
  .banner-title .en {
    font-family: "Noto Serif", serif;
    font-size: 14px;
    letter-spacing: 2.5px;
    color: #E2C98F;
    margin-top: 3px;
    text-transform: uppercase;
  }
  .banner-meta { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .cat-num {
    width: 44px;
    height: 44px;
    border: 1px solid #D8B66E;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Noto Serif", serif;
    font-size: 17px;
    color: #F4E3B8;
  }
  .cat-count { font-family: "Noto Kufi Arabic", sans-serif; font-size: 12px; color: #E2C98F; }

  .card-body { padding: 12px 26px 18px; flex: 1; min-height: 0; }
  .card-body.two { display: flex; gap: 42px; }
  .card-body.two .col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .cards.page1 .card-body.two .col,
  .cards.page1 .card-body.one { justify-content: space-between; }
  .cards.page1 .card-body.one { display: flex; flex-direction: column; }
  .cards.page2 .card-body { display: flex; flex-direction: column; justify-content: space-between; }

  .item { padding: 11px 0 10px; }
  .item-line { display: flex; align-items: baseline; }
  .item-name {
    font-family: "Noto Naskh Arabic", serif;
    font-weight: 600;
    font-size: 32px;
    line-height: 1.2;
    color: var(--ink);
    white-space: nowrap;
  }
  .leader {
    flex: 1;
    border-bottom: 1px dotted rgba(169,133,79,.55);
    margin: 0 12px;
    transform: translateY(-6px);
  }
  .item-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-family: "Noto Kufi Arabic", sans-serif;
    font-weight: 600;
    font-size: 29px;
    color: var(--terracotta);
    white-space: nowrap;
  }
  .item-price .num { font-weight: 600; }
  .item-price small {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-weight: 400;
    font-size: 16px;
    color: var(--gold);
  }
  .item-desc {
    font-family: "Noto Naskh Arabic", serif;
    font-size: 19px;
    line-height: 1.35;
    color: var(--muted);
    margin-top: 1px;
    max-width: 96%;
  }
  .cards.page1 .card-body.two .item { padding: 9px 0 8px; }
  .cards.page1 .card-body.two .item-name { font-size: 30px; }
  .cards.page1 .card-body.two .item-price { font-size: 27px; }
  .cards.page1 .card-body.two .item-desc { font-size: 18px; }
  .cards.page1 .card-body.one .item { padding: 14px 0 12px; }
  .cards.page2 .card-body .item { padding: 13px 0 12px; }

  .footer {
    position: relative;
    z-index: 2;
    flex: none;
    margin-top: 14px;
    padding-top: 12px;
    text-align: center;
  }
  .footer-rule {
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(169,133,79,.78), transparent);
    margin-bottom: 10px;
  }
  .footer-contact {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-size: 16px;
    color: var(--sage);
    margin-bottom: 5px;
  }
  .footer-contact span { color: var(--gold); margin: 0 9px; }
  .footer-main {
    font-family: "Noto Kufi Arabic", sans-serif;
    font-size: 16px;
    letter-spacing: 2.5px;
    color: var(--sage);
  }
  .footer-main span { color: var(--gold); margin: 0 11px; }
  .footer-thanks {
    font-family: "Noto Naskh Arabic", serif;
    font-size: 24px;
    color: var(--gold);
    margin-top: 3px;
  }
</style>
</head>
<body class="${page.className}">
  <div class="page">
    <div class="pattern"></div>
    <div class="frame">
      <span class="corner tl"></span><span class="corner tr"></span>
      <span class="corner bl"></span><span class="corner br"></span>
    </div>

    <header class="masthead">
      <div class="brand">
        <div class="logo">${logo}</div>
        <div class="brand-text">
          <div class="eyebrow">MENU <span class="diamond"></span> قائمة الطعام</div>
          <h1>كرانش تايم</h1>
          <div class="brand-sub">CRUNCH TIME <span>·</span> كريب وميكسات</div>
        </div>
      </div>
      <div class="page-badge">
        <span class="num">${String(page.index).padStart(2, '0')}</span>
        <span class="of">/ ${String(pages.length).padStart(2, '0')}</span>
      </div>
    </header>

    <div class="page-title">
      <h2>${page.title}</h2>
      <span class="en">${page.titleEn}</span>
      <i class="line"></i>
    </div>

    <main class="cards ${page.className}">
      ${page.cats.map((cat, i) => cardHtml(cat, page.className, i === page.cats.length - 1)).join('')}
    </main>

    <footer class="footer">
      <div class="footer-rule"></div>
      <div class="footer-contact">طنطا <span>·</span> شارع بطرس مع المؤيد <span>·</span> ت: 3277993</div>
      <div class="footer-main">الأسعار بالجنيه المصري <span>·</span> ALL PRICES IN EGP</div>
      <div class="footer-thanks">شكراً لزيارتكم <span>·</span> THANK YOU</div>
    </footer>
  </div>
</body>
</html>`

const chrome = process.env.CHROME_BIN || '/usr/bin/chromium'
const pngs = []

console.log(`categories: ${cats.length}, items: ${rows.length}, pages: ${pages.length}`)
for (const page of pages) {
  const htmlPath = path.join(outDir, `menu-page-${page.index}.html`)
  const pngPath = path.join(outDir, `menu-page-${page.index}.png`)
  fs.writeFileSync(htmlPath, pageHtml(page), 'utf-8')
  execFileSync(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    '--window-size=2480,3508',
    '--virtual-time-budget=6000',
    '--run-all-compositor-stages-before-draw',
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'inherit' })
  pngs.push(pngPath)
  console.log(`page ${page.index}: ${page.cats.map(c => `${c.name} (${c.items.length})`).join(' | ')}`)
  console.log(`wrote ${pngPath}`)
}

// Two-page A4 PDF for printing.
const pdfPath = path.join(outDir, 'menu-2pages.pdf')
execFileSync('python3', ['-c', `
from PIL import Image
imgs = [Image.open(p).convert('RGB') for p in ${JSON.stringify(pngs)}]
imgs[0].save('${pdfPath}', save_all=True, append_images=imgs[1:], resolution=300)
`], { stdio: 'inherit' })
console.log(`wrote ${pdfPath}`)

db.close()
