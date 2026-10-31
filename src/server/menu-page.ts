// Public digital menu served by the desktop's own HTTP server.
//
// The page is a static shell that pulls the live catalogue from
// `/public/menu` and refreshes itself, so editing a product/category/price in
// the desktop app is reflected without any export step or rebuild.
export const MENU_PAGE_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f7f4ee">
<title>المنيو</title>
<style>
  :root {
    --bg: #f7f4ee; --ink: #1c1a17; --muted: #6b6a66;
    --card: #fffdf9; --line: #e6e0d4; --accent: #a9854f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: "Tajawal", "Segoe UI", Tahoma, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header {
    max-width: 1020px; margin: 0 auto; padding: 44px 22px 22px;
    border-bottom: 1px solid var(--line);
  }
  .eyebrow { margin: 0 0 6px; font-size: 11px; font-weight: 800; letter-spacing: .32em; color: var(--accent); }
  h1 { margin: 0; font-size: clamp(26px, 5vw, 42px); font-weight: 900; letter-spacing: -.02em; }
  .status { margin: 10px 0 0; font-size: 11px; font-weight: 700; color: var(--muted); }
  main { max-width: 1020px; margin: 0 auto; padding: 10px 22px 48px; }
  .category { padding: 30px 0 6px; }
  .category + .category { border-top: 1px solid var(--line); }
  .cat-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
  .cat-head h2 { margin: 0; font-size: 19px; font-weight: 900; }
  .cat-head .emoji { font-size: 20px; }
  .cat-head .rule { flex: 1; height: 1px; background: var(--line); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .item {
    background: var(--card); border: 1px solid var(--line); border-radius: 16px;
    padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;
  }
  .item-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .item-name { font-size: 15px; font-weight: 800; line-height: 1.35; }
  .item-emoji { font-size: 18px; line-height: 1; }
  .price {
    flex-shrink: 0; font-size: 13px; font-weight: 900; color: var(--accent);
    background: rgba(169,133,79,.1); border-radius: 999px; padding: 4px 10px;
  }
  .desc { margin: 0; font-size: 12px; line-height: 1.6; color: var(--muted); }
  .empty { padding: 70px 0; text-align: center; color: var(--muted); font-size: 13px; font-weight: 700; }
  footer {
    max-width: 1020px; margin: 0 auto; padding: 18px 22px 40px;
    border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; font-weight: 600;
    display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  }
  @media print {
    body { background: #fff; }
    .status, footer { display: none; }
    .item { break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <p class="eyebrow">MENU</p>
  <h1 id="restaurant">المنيو</h1>
  <p class="status" id="status">جارٍ تحميل المنيو…</p>
</header>
<main id="menu"><div class="empty">جارٍ التحميل…</div></main>
<footer>
  <span>الأسعار قابلة للتغيير · يتم التحديث تلقائيًا</span>
  <span id="updated"></span>
</footer>
<script>
(function () {
  var currency = 'ج.م';
  var refreshMs = 30000;
  var root = document.getElementById('menu');
  var statusEl = document.getElementById('status');
  var updatedEl = document.getElementById('updated');

  function money(n) {
    return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render(data) {
    currency = data.currency || currency;
    document.getElementById('restaurant').textContent = data.restaurant || 'المنيو';
    document.title = data.restaurant || 'المنيو';

    var categories = Array.isArray(data.categories) ? data.categories : [];
    if (!categories.length) {
      root.innerHTML = '<div class="empty">لا توجد أصناف متاحة حاليًا</div>';
      return;
    }
    root.innerHTML = categories.map(function (cat) {
      var items = (cat.products || []).map(function (item) {
        return '<article class="item">' +
          '<div class="item-top">' +
            '<div class="item-name">' + (item.emoji ? esc(item.emoji) + ' ' : '') + esc(item.name) + '</div>' +
            '<span class="price">' + money(item.price) + ' ' + esc(currency) + '</span>' +
          '</div>' +
          (item.description ? '<p class="desc">' + esc(item.description) + '</p>' : '') +
        '</article>';
      }).join('');
      return '<section class="category">' +
        '<div class="cat-head">' +
          (cat.emoji ? '<span class="emoji">' + esc(cat.emoji) + '</span>' : '') +
          '<h2>' + esc(cat.name) + '</h2><span class="rule"></span>' +
        '</div>' +
        '<div class="grid">' + items + '</div>' +
      '</section>';
    }).join('');
    root.dataset.loaded = '1';
  }

  function load() {
    fetch('/public/menu', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('http'); return res.json(); })
      .then(function (data) {
        render(data);
        var now = new Date();
        var time = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        statusEl.textContent = 'آخر تحديث ' + time;
        updatedEl.textContent = data.generatedAt ? 'المنيو محدّث لحظيًا' : '';
      })
      .catch(function () {
        statusEl.textContent = 'تعذّر تحميل المنيو — تأكد من اتصالك بنفس الشبكة';
        if (!root.dataset.loaded) root.innerHTML = '<div class="empty">تعذّر تحميل المنيو</div>';
      });
  }

  load();
  setInterval(load, refreshMs);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') load();
  });
})();
</script>
</body>
</html>`
