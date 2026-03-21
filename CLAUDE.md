# benapps — Claude Context

Personal collection of single-purpose mini-apps. React 18 + TypeScript + Vite + React Router v6. No backend, no state management library. Dark mode default; light mode via `data-theme="light"` on `<html>`.

---

## Design system

### CSS variables (`src/styles/global.css`)
```
--bg        background
--fg        foreground / primary text
--muted     secondary text, idle button text (#999 dark / #7d7d7d light)
--dim       tertiary text, disabled borders (#616161 dark / #aeaeae light)
--rule      dividers (#2a2a2a dark / #d0d0d0 light)
--font-display  Playfair Display 900 — big numbers, headings
--font-mono     Courier Prime — labels, values, all UI text (body default)
```
Never hardcode colors. Always use these variables.

### Typography
- **Display numbers / headings**: `font-family: var(--font-display); font-weight: 900`
- **Labels**: `font-size: 0.6rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted)` (or `--dim` for quieter labels)

### Buttons — two tiers
**`ActionButton` component** (primary actions): fills on hover — `background: var(--fg); color: var(--bg)`

**Inline app buttons** (secondary/control): color-only hover — `background: none; border: 1px solid var(--dim); color: var(--muted)` → hover: `border-color: var(--muted); color: var(--fg)`. Active/selected state: `border-color: var(--fg); color: var(--fg)`.

All button transitions: `transition: border-color 0.15s, color 0.15s` (add `background 0.15s` when background changes).

### Layout
```css
.app {
  max-width: 620px;
  margin: 0 auto;
  padding: 1.5rem 2rem 4rem;   /* bottom 4–5rem depending on app */
  min-height: 100vh;
}
```

---

## File & folder conventions
```
src/pages/MyApp/
  index.tsx          # default export; all state/logic lives here
  MyApp.module.css   # page-scoped styles

src/components/MyComponent/
  index.tsx          # typed Props interface, default export
  MyComponent.module.css
```
- CSS Modules throughout — camelCase class names
- No barrel index files for components; import by path: `import Foo from './components/Foo'`

---

## State management
- `useState` — simple or few independent values
- `useReducer` — 4+ related state fields or 4+ action types. Pattern: define `State` type, typed `Action` union, `initial` const, and `reducer` function above the component.
- `useRef` — values that change during events but must not trigger re-renders (drag state, animation frame refs, audio nodes)

---

## Shared components

| Component | Usage |
|-----------|-------|
| `AppHeader` | Every app gets one: `<AppHeader title="appname" />` (lowercase) |
| `DragNumber` | Draggable number input — `value`, `min`, `max`, `onChange`, optional `className`, `pixelsPerUnit` (default 1.5), `step` |
| `RangeSlider` | Styled range input with touch support |
| `ActionButton` | Primary action button with fill-on-hover |
| `BackLink` | Back navigation (rendered in Layout's top bar) |
| `DropZone` | File drag-and-drop target |
| `StatusMessage` | Transient feedback messages |

---

## UX patterns

**Copy-on-click**: click a value → copy to clipboard → show "copied" in place of value for ~1.2s via `setTimeout`.

**Drag-to-adjust numbers**: use `DragNumber`; `ns-resize` cursor, `setPointerCapture` on `pointerdown`, `pixelsPerUnit` tunes sensitivity.

**Vertical sliders**: `writing-mode: vertical-lr; direction: rtl` gives bottom=min, top=max orientation.

**Touch support**: `touch-action: none` on draggable/swipeable elements; always prefer pointer events over separate mouse/touch handlers.

**No number input spinners**: `-moz-appearance: textfield` + `-webkit-appearance: none` on `::webkit-inner-spin-button` / `::webkit-outer-spin-button`.

**Transitions**: always `0.15s` for color/border/opacity. No layout/size transitions.

---

## Adding a new app

1. Create `src/pages/NewApp/index.tsx` + `NewApp.module.css`
2. Add route in `src/App.tsx` (inside the `children` array of the Layout route):
   ```tsx
   { path: '/newapp', element: <NewApp /> }
   ```
3. Add entry to `apps` array in `src/pages/Landing/index.tsx`:
   ```ts
   { path: '/newapp', name: 'newapp' }
   ```
4. Use `<AppHeader title="newapp" />` (lowercase, matches the landing name)
5. Follow the `.app` container pattern in CSS

---

## Current apps
`/list` `/count` `/text` `/image` `/audio` `/color` `/decibels` `/tuner` `/metronome` `/timer` `/location` `/dice`
