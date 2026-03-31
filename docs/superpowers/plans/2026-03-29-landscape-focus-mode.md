# Landscape Focus Mode Standardization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize landscape focus mode across apps so primary display elements scale with viewport width using `vw`-based `clamp()`, and no dead space appears on sides or bottom.

**Architecture:** Each app gets a `@media (orientation: landscape) and (pointer: coarse)` block that (1) removes `max-width`, (2) tightens padding, (3) overrides primary display font sizes with `clamp(min, Xvw, max)` calibrated to fill the screen on a typical landscape mobile (iPhone 14: 844×390px). Pattern is taken from the Timer app's countdown display which already does this correctly.

**Tech Stack:** CSS Modules, no JS changes

---

## Reference Pattern (Timer countdown — already correct)

```css
@media (orientation: landscape) and (pointer: coarse) {
  .app {
    max-width: 100%;
    padding: 0.5rem 1.5rem 1rem;
  }
  /* Primary display scales with vw */
  .primaryDisplay {
    font-size: clamp(4rem, 20vw, 10rem);
  }
  /* Secondary values scale proportionally */
  .secondary {
    font-size: clamp(1.2rem, 4vw, 2rem);
  }
  /* Reduce vertical margins */
  .section {
    margin-bottom: 0.5rem;
  }
}
```

**vw calibration reference (iPhone 14 landscape = 844px wide):**
| vw value | px on 844px |
|----------|-------------|
| 10vw | 84px ≈ 5.3rem |
| 13vw | 110px ≈ 6.9rem |
| 15vw | 127px ≈ 7.9rem |
| 20vw | 169px ≈ 10.6rem |
| 22vw | 186px ≈ 11.6rem |

---

## Task 1: TunerApp — replace fixed `7rem` note name with vw-based clamp

**Files:**
- Modify: `src/pages/TunerApp/TunerApp.module.css`

The landscape block currently overrides `.noteName` with a fixed `7rem`. This doesn't scale on narrower or wider devices. The `.value` class is also fixed at `1.5rem`.

Current landscape block (lines ~226–259):
```css
@media (orientation: landscape) and (pointer: coarse) {
  .app { padding-top: 0.5rem; padding-bottom: 0.75rem; }
  .controls { margin-bottom: 0.5rem; }
  .noteName { font-size: 7rem; }           /* ← fixed, doesn't scale */
  .noteDisplay { margin-bottom: 0.5rem; }
  .tuningBar { margin-bottom: 0.5rem; }
  .notePicker { margin-bottom: 0.5rem; }
  .value { font-size: 1.5rem; }            /* ← fixed, doesn't scale */
  .row { margin-bottom: 0.3rem; }
}
```

- [ ] **Step 1: Update the landscape block in `TunerApp.module.css`**

Replace the entire landscape block with:

```css
@media (orientation: landscape) and (pointer: coarse) {
  .app {
    max-width: 100%;
    padding-top: 0.5rem;
    padding-bottom: 0.75rem;
  }

  .controls {
    margin-bottom: 0.5rem;
  }

  .noteName {
    font-size: clamp(3.5rem, 15vw, 9rem);
  }

  .noteDisplay {
    margin-bottom: 0.5rem;
  }

  .tuningBar {
    margin-bottom: 0.5rem;
  }

  .notePicker {
    margin-bottom: 0.5rem;
  }

  .value {
    font-size: clamp(1.2rem, 5vw, 2.5rem);
  }

  .row {
    margin-bottom: 0.3rem;
  }
}
```

- [ ] **Step 2: Verify in browser**

Open `/tuner` on a mobile device (or DevTools responsive mode at ~844×390). Rotate to landscape. Confirm:
- Note name is large and fills reasonable width (roughly 7–8rem equivalent)
- Cents and freq values are proportionally sized
- No horizontal overflow
- No dead space left/right

- [ ] **Step 3: Commit**

```bash
git add src/pages/TunerApp/TunerApp.module.css
git commit -m "Tuner: landscape note name and values scale with vw"
```

---

## Task 2: MetronomeApp — bigger BPM in landscape, remove max-width

**Files:**
- Modify: `src/pages/MetronomeApp/MetronomeApp.module.css`

The base `.bpmInput` already uses `clamp(4rem, 18vw, 7rem)` — good. But in landscape the `7rem` max cap prevents it from getting bigger, and the `.app` still has `max-width: 620px` since there's no landscape `.app` override. The existing landscape block only adjusts margins.

Current landscape block (lines ~153–161):
```css
@media (orientation: landscape) and (pointer: coarse) {
  .controlRow { margin-bottom: 0.5rem; }
  .bpmLabel { margin-top: -0.6em; }
}
```

- [ ] **Step 1: Update the landscape block in `MetronomeApp.module.css`**

```css
@media (orientation: landscape) and (pointer: coarse) {
  .app {
    max-width: 100%;
    padding: 0.5rem 1.5rem 1rem;
  }

  .bpmInput {
    font-size: clamp(5rem, 22vw, 12rem);
  }

  .timeSigNum {
    font-size: clamp(1.2rem, 3.5vw, 1.8rem);
  }

  .bpmRow {
    margin-bottom: 1rem;
  }

  .timeSig {
    margin-bottom: 1rem;
  }

  .controlRow {
    margin-bottom: 0.5rem;
  }

  .bpmLabel {
    margin-top: -0.6em;
  }
}
```

- [ ] **Step 2: Verify in browser**

Open `/metronome` in DevTools landscape (844×390). Confirm:
- BPM number is larger than portrait
- No `max-width` gap on sides
- Beat dots and controls visible without scrolling

- [ ] **Step 3: Commit**

```bash
git add src/pages/MetronomeApp/MetronomeApp.module.css
git commit -m "Metronome: landscape BPM scales with vw, remove max-width gap"
```

---

## Task 3: CountApp — add landscape focus mode

**Files:**
- Modify: `src/pages/CountApp/CountApp.module.css`

CountApp has no landscape block at all. The count display currently uses `clamp(3.5rem, 14vw, 6rem)` — fine for portrait, but 6rem max means it stays small in landscape. We want it much bigger in landscape, and the control buttons (clear/presets) should be hidden so the number fills the screen.

Look at `src/pages/CountApp/CountApp.module.css` to confirm class names before editing:
- `.app` — container
- `.countRow` — row containing `−` button, `.display`, `+` button
- `.display` — the big count number (`clamp(3.5rem, 14vw, 6rem)`)
- `.btnRowClear` — row with the clear/preset buttons
- `.adjBtn` — `−` / `+` buttons

- [ ] **Step 1: Add landscape block to `CountApp.module.css`**

Append to the end of the file:

```css
@media (orientation: landscape) and (pointer: coarse) {
  .app {
    max-width: 100%;
    padding: 0.5rem 1.5rem 1rem;
    justify-content: center;
  }

  .display {
    font-size: clamp(5rem, 22vw, 14rem);
  }

  .adjBtn {
    font-size: clamp(1.5rem, 5vw, 3rem);
  }

  .btnRowClear {
    display: none;
  }
}
```

- [ ] **Step 2: Verify in browser**

Open `/count` in DevTools landscape (844×390). Confirm:
- Count number is large and centered
- `−` / `+` buttons scale proportionally
- Clear/preset buttons are hidden
- No horizontal overflow or dead space

- [ ] **Step 3: Commit**

```bash
git add src/pages/CountApp/CountApp.module.css
git commit -m "Count: add landscape focus mode with vw-scaled display"
```

---

## Task 4: Audit remaining apps — verify no dead space

**Files:**
- Read: `src/pages/GolfApp/GolfApp.module.css`
- Read: `src/pages/ListApp/ListApp.module.css`
- Read: `src/pages/DrawApp/DrawApp.module.css`
- Read: `src/pages/ColorApp/ColorApp.module.css`

These all have `max-width: 100%` in their landscape blocks already. This task confirms they're correct and identifies any that need font scaling added.

- [ ] **Step 1: Check each app's landscape block**

For each app, verify the landscape block includes `max-width: 100%` (or equivalent). From the explore:

| App | Has `max-width: 100%` in landscape? | Has vw font scaling? |
|-----|--------------------------------------|----------------------|
| GolfApp | ✓ (line 586) | ✗ — score display uses fixed rem |
| ListApp | ✓ (line 290) | ✗ — text list, acceptable |
| DrawApp | ✓ (line 357) | ✗ — canvas, not applicable |
| ColorApp | ✓ (line 865) | ✓ (many clamp() rules) |

- [ ] **Step 2: Add vw scaling to GolfApp score display**

Read `src/pages/GolfApp/GolfApp.module.css`, find the class used for the hole score display (likely something like `.scoreDisplay` or `.holeScore`), and add a landscape font-size override with `clamp()`.

Check the class name by searching:
```bash
grep -n "font-size.*clamp\|font-size.*rem\|font-display\|font-size.*[4-9]rem" src/pages/GolfApp/GolfApp.module.css
```

Then add to the existing landscape block in `GolfApp.module.css`:
```css
  /* Add inside existing @media (orientation: landscape) and (pointer: coarse) block */
  .<primaryScoreClass> {
    font-size: clamp(3rem, 15vw, 9rem);
  }
```

Replace `<primaryScoreClass>` with the actual class name found above.

- [ ] **Step 3: Commit if GolfApp needed changes, skip if not**

```bash
git add src/pages/GolfApp/GolfApp.module.css
git commit -m "Golf: landscape score display scales with vw"
```

---

## Self-Review

**Spec coverage:**
- ✓ Font scales with vw in landscape: Tasks 1–3 + Task 4
- ✓ No dead space on sides: all tasks include `max-width: 100%`
- ✓ No dead space on bottom: padding-bottom reduced to `1rem` in all landscape blocks
- ✓ Pattern taken from Timer countdown: all clamp values follow same structure

**Placeholder scan:**
- Task 4 Step 2 requires looking up the GolfApp class name at runtime — the grep command is provided to do this inline. Not a placeholder; it's a runtime lookup instruction.

**Type consistency:** CSS only, no types.
