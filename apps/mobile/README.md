# كرنش تايم — تطبيق المالك (Crunch Time owner app)

The phone app for the shop's **owners (2–3 people)**. It drives the Crunch Time
desktop app's remote POS server, so the owner can watch orders, take a sale,
run the drawer and close the day — from inside the shop or, with Tailscale,
from anywhere.

Built on [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/)
with [BNA UI](https://ui.ahmedbna.com) components, the same Tajawal font and the
same colour palette as the till.

## Before you start: turn the server on

1. On the shop PC, open **الإعدادات → النظام → الخادم البعيد**.
2. Press **توليد رقم سري تلقائي** — no need to invent one.
3. Flip **تشغيل الخادم** on.
4. Press **إظهار كود الربط** and leave the QR on screen.

Then, in the app, tap **امسح كود الربط** and point the camera at it. That's the
whole setup — the address and the code travel in the QR, and the code is
single-use with a 10-minute life. (Typing the address and PIN by hand still
works as a fallback.)

## Getting in from outside the shop

The PC can publish the POS through **Tailscale Funnel**, which gives a real
HTTPS URL with no app on the phone and no Cloudflare account:

1. On the PC card, press **تثبيت Tailscale** (or install it yourself) and then
   **تسجيل الدخول**. Sign-in opens a browser — that step is always manual,
   it is your Tailscale account.
2. In the Tailscale admin console, enable **HTTPS certificates** and the
   **Funnel** node attribute for your tailnet (one-time, per tailnet).
3. Press **تشغيل الوصول من أي مكان**. The card shows the public URL, e.g.
   `https://shop.tailnet-name.ts.net`, and the pairing QR now carries it.

Funnel runs with `--bg`, so it is **permanent**: it is registered with the
Tailscale service and survives reboots until you press
**إيقاف الوصول من أي مكان**. It only listens on 443/8443/10000, so the PC
proxies that to the server's own port.

> A Funnel URL is **public**. The PIN is the only gate, so use the generated
> one, and note the server also applies a global lockout after repeated
> failures. If you would rather stay off the public internet, use the
> Tailscale address instead (both are shown on the card).

## Run the app

```bash
cd apps/mobile
npm install
npx expo start
```

Press `a` for Android, `i` for iOS, or `w` for web. On first launch you get the
onboarding, then a screen asking for the **server address** and the **PIN**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | `expo start` — dev server + QR code |
| `npm run android` / `ios` / `web` | Start on a specific platform |
| `npm test` | Unit tests for the plain-TS `lib/` modules (vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

A device or emulator is needed for the screens themselves; `typecheck`,
`test` and `npx expo export -p android` verify the rest in CI.

## What's in here

```
app/
├── _layout.tsx        Root: ThemeProvider + SessionProvider + Tajawal + RTL
├── index.tsx          Gate: onboarding → setup → app
├── onboarding.tsx     Four-step intro (BNA Onboarding)
├── setup.tsx          Server address + owner PIN
└── (app)/             Tabs: الطلبات · طلب جديد · التقارير · المزيد
    ├── board.tsx      Live order board (/orders + /ws)
    ├── new.tsx        Menu → options → cart → checkout
    ├── order/[id].tsx Detail: status, driver, refund, print
    ├── shift.tsx      Open/close shift, drawer movements
    ├── reports.tsx    Z report + today's summary + charts
    └── settings.tsx   Server, theme, sign out
api/                   Typed client for the POS server (types, endpoints)
lib/                   http core, storage, session, formatting, order feed
components/ui|charts/  BNA UI components — ours to edit
theme/                 colors.ts (the till palette), globals.ts
```

## Notes

- **Remote-first.** The address is whatever route reaches the PC — shop Wi-Fi or
  Tailscale. Nothing is hard-coded to a LAN IP.
- **One PIN.** All phone users are owners; changing the PIN on the PC signs every
  phone out immediately.
- **Money is whole pounds** on both sides, and totals come from the server's tax
  rate and the zone's delivery fee.
- **Retries are safe.** Every order POST carries an idempotency key, so a dropped
  connection never rings up a second sale.
- **Offline.** There is no offline queue; the board shows "غير متصل" and retries.

## Theming

Colours come from `useColor` (`theme/colors.ts` — the till's oklch tokens
converted to sRGB), sizing from `theme/globals.ts`. Text is Tajawal everywhere:
`components/ui/text.tsx` and `components/ui/input.tsx` inject the face by weight,
so editing those two files changes the font across the app.

BNA UI copies source into the project rather than installing a dependency, so
everything under `components/` is ours to edit. Re-running
`npx bna-ui add <component> -y` keeps existing files.
