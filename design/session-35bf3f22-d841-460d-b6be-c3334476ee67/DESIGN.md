# CourseForge — DESIGN.md

> Visual design system for the CourseForge LMS SaaS marketing website. This is a replacement
> visual world built from the former "DeepSeek iDesign" placeholder.

## Direction Contract

- **THESIS:** An LMS landing page that proves CourseForge's mechanism — the no-code dashboard — by
  showing it live in the hero viewport, making the builder tangible immediately. Refuses the
  generic "education stock-photo + gradient overlay" rut.
- **OWN-WORLD:** Blue (#2563eb) + violet (#7c3aed) as the committed primary gradient, emerald
  (#10b981) for growth/success states, Syne as the display face, system stack as body. 1240px
  content width, 16–24px card radii, clean white surfaces with generous whitespace.
- **STORY:** A creator lands, sees the dashboard in action, understands the value, and starts
  building immediately. The page speaks to creators, not enterprise buyers.
- **FIRST VIEWPORT:** Eyebrow badge → H1 "Turn your expertise into income" → subhead + dual CTA
  (primary gradient button + outline) → laptop dashboard mockup on the right.
- **FORM:** Committed blue-primary SaaS with emerald accent, clean surfaces, dashboard-centric
  visual language, zigzag feature layouts to avoid card-stack uniformity.

## Color System

| Role | Token | Value | Usage |
|---|---|---|---|
| Primary | `--ipw-color-primary` | `#2563eb` | Primary buttons, links, key accents |
| Primary hover | `--ipw-color-primary-hover` | `#1d4ed8` | Button/link hover states |
| Secondary | `--ipw-color-secondary` | `#7c3aed` | Gradient endpoint, decorative |
| Accent | `--ipw-color-accent` | `#10b981` | Success, checkmarks, feature highlights |
| Background | `--ipw-color-bg` | `#ffffff` | Page background |
| Surface | `--ipw-color-surface` | `#f9fafb` | Cards, device frames |
| Text | `--ipw-color-text` | `#111827` | Primary body text |
| Muted | `--ipw-color-muted` | `#6b7280` | Secondary text, borders |
| Border | `--ipw-color-border` | `#e5e7eb` | Card outlines, dividers |

### Gradients

- `--ipw-gradient-primary`: `135deg #2563eb → #1d4ed8` — primary buttons
- `--ipw-gradient-hero`: `135deg #2563eb → #7c3aed` — CTA buttons, hero elements
- `--ipw-gradient-accent`: `135deg #10b981 → #059669` — (available for growth indicators)

## Typography

| Token | Face | Usage |
|---|---|---|
| `--ipw-font-display` | **Syne** (Google Fonts) + system fallback | Headings, hero, section titles |
| `--ipw-font-body` | System stack (SF Pro, Segoe UI, Roboto, …) | Body copy, forms, buttons |

### Scale

| Token | Size | Usage |
|---|---|---|
| `--ipw-font-size-xs` | 0.75rem | Badges, labels |
| `--ipw-font-size-sm` | 0.875rem | Nav links, captions |
| `--ipw-font-size-base` | 1rem | Body text |
| `--ipw-font-size-lg` | 1.125rem | Subheadings, feature descriptions |
| `--ipw-font-size-xl` | 1.25rem | Section intros |
| `--ipw-font-size-2xl` | 1.5rem | Feature icons text, step titles |
| `--ipw-font-size-3xl` | 1.875rem | Step headings |
| `--ipw-font-size-4xl` | 2.25rem | Section headings, CTA titles |
| `--ipw-font-size-5xl` | 3rem | Hero H1 |

Display headings use Syne at 700–800 weight. Body uses system stack at 400–500 weight.

## Layout

- **Content width:** `--ipw-content-width: 1240px` (max), `--ipw-page-padding: 32px` (horizontal gutter)
- **Section spacing:** `--ipw-section-space: 100px` (desktop), `--ipw-section-space-sm: 72px` (first section, mobile)
- **Narrow max-width:** `--ipw-max-width-narrow: 720px` (section intros, body copy)
- **Card radius:** `--ipw-card-radius: 16px` (standard), `--ipw-card-radius-lg: 24px` (hero devices, CTA)

## Components

### Buttons

- **Primary (`.btn-primary`):** Solid `--ipw-color-primary` background. Hover: darken + subtle lift (`card-shadow-lg` + `translateY(-1px)`).
- **CTA (`.btn-cta`):** `--ipw-gradient-hero` background. Hover: elevate shadow + lift.
- **Outline (`.btn-outline`):** Transparent background, `--ipw-color-border` border. Hover: surface fill + shadow.
- **Radius:** `--ipw-button-radius: 10px`, height 44px, padding 12×28px (28px horizontal).
- **Large (`.btn-lg`):** Padding 16×36px, font 1.05rem.

### Cards

- **Surface:** `--ipw-card-bg` (white), `--ipw-card-border`, `--ipw-card-shadow` (default) or `--ipw-card-shadow-xl` (elevated/parent).
- **Radius:** 16px standard, 24px large.
- **No border-left accents, no zero-offset colored halos.** Shadows carry offset + soft blur only.

### Pricing Cards

- 3-tier grid: Starter (outline), Growth (popular — gradient border accent), Business.
- Popular variant: `border-color: var(--ipw-color-primary)`, `--ipw-card-shadow-xl`, floating "Most Popular" badge.

### Badges

- Primary: `--ipw-color-primary` filled, 999px radius, 0.75rem font.

## Layout Patterns

- **Hero:** 2-column grid (text : dashboard mockup). Zigzag not needed — dashboard is always on the right.
- **Features:** Zigzag — alternating image-left / image-right to avoid uniform card stacks. Each feature has an icon circle (gradient) + text, with a framed SVG illustration on the alternating side.
- **Steps:** 3 equal columns, centered numbered circles (gradient), short description.
- **Trust bar:** Compact horizontal row of labeled values — **not** the hero-metric template.

## Responsive

| Breakpoint | Changes |
|---|---|
| ≤900px | Hero → 1 column (illustration below), h1 scales down |
| ≤768px | Features stack (image above content), steps → vertical, pricing → 1 column, footer → 2 columns |
| ≤480px | Nav hidden (mobile menu needed in prod), hero CTAs stack, trust bar gap tightens, footer → 1 column |

## Motion

- **One authored moment:** Subtle `translateY(-1px)` + shadow lift on primary/CTA button hover — the only entrance animation. No scattered transitions, no gradient-text animation.
- `prefers-reduced-motion: reduce` respected (scroll-behavior auto).

## Accessibility Notes

- Body text `#111827` on `#ffffff` → ~14:1 contrast.
- Muted text `#6b7280` on `#ffffff` → ~4.5:1 (borderline AAA).
- Primary button `#2563eb` on white text → well above 4.5:1.
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`.

## Surface Brief

- **Mode:** Persuade (marketing landing page)
- **Audience:** Course creators, educators, coaches, knowledge entrepreneurs
- **Goal:** Drive 14-day free trial sign-ups and demo requests
- **Constraints:** Self-contained iDesign HTML/CSS, no build step, Google Fonts dependency acceptable
