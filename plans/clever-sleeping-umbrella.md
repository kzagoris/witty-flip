# Plan: Improve UI Hover States, Cursors, and Animations

## Context

The app's current interactions are minimal — simple color changes on buttons, basic shadow on card hover, underline on FAQ triggers, and only 4 CSS animations (`fade-in`, `slide-up`, `accordion-up/down`). The spec calls for a "Bold and colorful" design with "Micro-animations: Upload pulse, slide-in file icon, smooth progress bar, success celebration, download button bounce." This plan adds polished hover cursors, richer hover effects, and the spec's micro-animations across the UI.

## Design Principles

- **GPU-friendly**: Animate only `transform` and `opacity` (except existing `box-shadow` on cards)
- **Accessible**: Use `motion-safe:` Tailwind variant so `prefers-reduced-motion` users see no animation
- **Subtle**: Card scale max 1.02, button lift max 1px, bounce amplitude 4px — enhance, don't distract

---

## Step 1: New Keyframe Animations — `app/styles/globals.css`

Add inside the existing `@theme { ... }` block, after the current `--animate-*` tokens and `@keyframes`:

**New tokens:**
```css
--animate-pulse-border: pulse-border 2s ease-in-out infinite;
--animate-slide-in-right: slide-in-right 0.3s cubic-bezier(0.22, 1, 0.36, 1);
--animate-bounce-in: bounce-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
--animate-bounce-subtle: bounce-subtle 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
--animate-celebrate: celebrate 0.6s cubic-bezier(0.22, 1, 0.36, 1);
--animate-shimmer: shimmer 1.5s ease-in-out infinite;
--animate-shake: shake 0.5s cubic-bezier(0.22, 1, 0.36, 1);
```

**New keyframes:** `pulse-border`, `slide-in-right`, `bounce-in`, `bounce-subtle`, `celebrate`, `shimmer`, `shake`

---

## Step 2: Button Tactile Effects — `app/components/ui/button.tsx`

**Base class** (line 7):
- `transition-colors` → `transition-all duration-150`
- Add `motion-safe:active:scale-[0.98]` (press feedback)

**`default` variant** (line 11): Add `hover:shadow-md motion-safe:hover:-translate-y-px`
**`destructive` variant** (line 12): Add `hover:shadow-md motion-safe:hover:-translate-y-px`

Other variants (outline, secondary, ghost, link) keep existing behavior — lift/shadow would be inconsistent for flat buttons.

---

## Step 3: Home ConversionCard Hover — `app/components/home/ConversionCard.tsx`

**Card** (line 10):
- Add `cursor-pointer`
- `transition-shadow` → `transition-all duration-200`
- Add `motion-safe:hover:scale-[1.02]`
- Add `border-l-4 border-l-transparent hover:border-l-[var(--card-accent)]`
- Inline style: `{ '--card-accent': conversion.formatColor }`

**ArrowRight** (line 20): Add `transition-transform duration-200 group-hover:translate-x-0.5`

---

## Step 4: Related Conversion Cards — `app/components/conversion/RelatedConversions.tsx`

Same treatment as Step 3:
- Link (line 19): Add `group` class
- Card (line 20): `cursor-pointer`, `transition-all duration-200`, `motion-safe:hover:scale-[1.02]`, colored left border via `--card-accent`
- ArrowRight (line 30): `transition-transform duration-200 group-hover:translate-x-0.5`

---

## Step 5: FAQ Accordion Polish — `app/components/ui/accordion.tsx`

**AccordionTrigger** (line 24):
- Remove `hover:underline`
- Add `cursor-pointer rounded-md px-2 hover:bg-muted/50`
- Keep existing `transition-all` and chevron rotation

This replaces the text underline with a subtle background highlight on hover — more modern and accessible.

---

## Step 6: Upload Area Animations — `app/components/conversion/FileUploader.tsx`

**Idle icon** (line 92): Add `motion-safe:animate-pulse-border` when not dragging — gentle opacity pulse drawing attention to the upload area

**File icon on drag** (line 96): Add `motion-safe:animate-slide-in-right` — file icon slides in from the left when user drags over the area

---

## Step 7: Download Success Celebration — `app/components/conversion/DownloadSection.tsx`

**Card** (line 49): `animate-fade-in` → `motion-safe:animate-celebrate` — satisfying scale-up entrance
**Checkmark icon container** (line 51): Add `motion-safe:animate-bounce-in`
**Download button** (line 64): Add `motion-safe:animate-bounce-subtle` — gentle bounce after card entrance (0.3s delay built into the token)

---

## Step 8: Progress Bar Shimmer — `app/components/ui/progress.tsx`

Change `ProgressPrimitive.Indicator` from self-closing to wrapping tag, add a shimmer child:
```tsx
<ProgressPrimitive.Indicator className="relative h-full w-full flex-1 overflow-hidden bg-primary transition-all duration-500 ease-in-out" ...>
  <div className="absolute inset-0 motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
</ProgressPrimitive.Indicator>
```

---

## Step 9: Payment Button Lift — `app/components/conversion/PaymentPrompt.tsx`

**Pay button** (line 61): Add `hover:shadow-md motion-safe:hover:-translate-y-px` (matching the default button treatment but for the custom amber color)

---

## Step 10: Error Shake — `app/components/conversion/ErrorCard.tsx`

**Wrapper** (line 13): `animate-fade-in` → `motion-safe:animate-shake` — brief shake draws attention to the error

---

## Implementation Order

1. `globals.css` (foundation — all animations defined here)
2. `button.tsx` (global button effects)
3. `accordion.tsx` (FAQ hover)
4. `progress.tsx` (shimmer)
5. `ConversionCard.tsx` + `RelatedConversions.tsx` (card hovers)
6. `FileUploader.tsx` (upload animations)
7. `DownloadSection.tsx` (success celebration)
8. `PaymentPrompt.tsx` (button lift)
9. `ErrorCard.tsx` (error shake)

## Verification

1. `npm run dev` — visually check each state on a conversion page and home page
2. Browser DevTools → Rendering → "Emulate prefers-reduced-motion: reduce" — confirm all animations disabled
3. `npm run type-check` — verify no TS errors from inline style type assertions
4. `npm run lint` — clean lint
5. Test hover cursor on: conversion cards, FAQ questions, "All Conversions" dropdown, buttons, upload area, related conversions
6. Test animations: upload idle pulse, drag file icon slide-in, progress shimmer, success celebrate+bounce, error shake
