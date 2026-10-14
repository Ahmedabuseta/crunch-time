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
2. Set a **PIN** for the phone, then flip **تشغيل الخادم** on.
3. Copy the address the card shows:
   - **Wi-Fi (inside the shop)** — `http://192.168.x.x:4317`
   - **Tailscale (from anywhere)** — `http://100.x.y.z:4317`, shown once
     Tailscale is installed and signed in on the PC.

   Install [Tailscale](https://tailscale.com) (free tier) on **both** the PC and
   the phone, sign both in to the same account, and the remote address works
   from any network. The server already listens on `0.0.0.0`, so nothing else
   needs changing on the PC.

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
