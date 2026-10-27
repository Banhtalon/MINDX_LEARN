---
name: MindX Learn High-Contrast Educational System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#44474d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777e'
  outline-variant: '#c4c6cd'
  surface-tint: '#4d6079'
  primary: '#000c1e'
  on-primary: '#ffffff'
  primary-container: '#0f233a'
  on-primary-container: '#788ba6'
  inverse-primary: '#b5c8e6'
  secondary: '#3755c3'
  on-secondary: '#ffffff'
  secondary-container: '#708cfd'
  on-secondary-container: '#00217a'
  tertiary: '#000f08'
  on-tertiary: '#ffffff'
  tertiary-container: '#00281b'
  on-tertiary-container: '#3a9976'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d3e4ff'
  primary-fixed-dim: '#b5c8e6'
  on-primary-fixed: '#071c33'
  on-primary-fixed-variant: '#354861'
  secondary-fixed: '#dde1ff'
  secondary-fixed-dim: '#b8c4ff'
  on-secondary-fixed: '#001453'
  on-secondary-fixed-variant: '#173bab'
  tertiary-fixed: '#97f5cc'
  tertiary-fixed-dim: '#7bd8b1'
  on-tertiary-fixed: '#002115'
  on-tertiary-fixed-variant: '#00513a'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Public Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Public Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: 0em
  title-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Public Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Public Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Public Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an authoritative, highly legible, and rigorous digital environment engineered specifically for structured learning, technical problem solving, and academic management. The visual tone is decisive, direct, and distraction-free—deliberately rejecting decorative gradients, blurry atmospheric glows, and ambiguous low-contrast states.

Drawing inspiration from technical Swiss editorial typography and high-density academic administrative tools, the style relies on crisp structural lines, bold functional hierarchy, and uncompromising contrast. It instills absolute confidence, mental clarity, and systematic focus for students, educators, and administrative leaders across desktop workstations and mobile study viewports.

## Colors

The palette is engineered around high WCAG AAA compliance, solid color fills, and immediate semantic discernibility. 

### Core Palette
- **Deep Academic Navy (`#0F233A` / `#0B1C30`)**: The foundational anchor used for primary headings, essential navigational shells, deep structural headers, and highest-priority typography.
- **Royal Blue Interactive (`#1E40AF` / `#1D4ED8`)**: The dedicated interactive action color for primary buttons, active tabs, focused link states, and interactive checkpoints.
- **Pure Canvas (`#FFFFFF`)**: Pure clinical white dedicated to card faces, input interiors, and readouts.
- **Chalk Surface (`#F8F9FF` / `#F8FAFC`)**: Canvas base layer providing distinction between surrounding layout architecture and pure white active components.
- **Structural Slate Border (`#CBD5E1`)**: Crisp definition line separating cards, table rows, and grid modules. Elevated strokes and focus borders deepen to `#94A3B8` or `#0F233A`.

### Role-Based High-Contrast Badges
- **Student (Học sinh)**: Deep Royal Blue (`#1D4ED8`) with `#EFF4FF` / `#FFFFFF`.
- **Instructor (Giảng viên)**: Deep Pine Green (`#047857`) with `#ECFDF5` / `#FFFFFF`.
- **Administrator (Quản trị viên)**: Imperial Violet (`#6D28D9`) or Crimson Flag (`#B91C1C`) with `#F5F3FF` / `#FFFFFF`.

## Typography

The typography leverages **Public Sans**, an open, institutional, and highly legible grotesque typeface designed for clarity across varying densities and viewports.

## Elevation & Depth

This system intentionally eliminates blurred drop shadows, multi-tier ambient spreads, and semi-transparent glass surfaces. Depth is established through **Structural Contrast, Crisp Borders, and Tonal Stacking**:
1. **Base Ground (Level 0)**: Canvas rendered in `#F8F9FF`.
2. **Surface Layer (Level 1)**: Component cards, panels, and data tables rendered in `#FFFFFF`, outlined by a solid `1.5px` border in `#CBD5E1`.
3. **Elevated & Modal Layer (Level 2)**: Flyouts, dropdowns, and dialogs remain `#FFFFFF` framed by a high-contrast `2px` border in `#0F233A` with a crisp hard-edge offset block shadow (`box-shadow: 4px 4px 0px #0F233A`).
4. **Active Focus Layer**: Interactive surfaces receive a direct `2px solid #1E40AF` focus outline.

## Shapes

- Form inputs, cards, and structured action buttons utilize `0.25rem` (4px) to `0.375rem` (6px) radii.
- Modals, large course panels, and content groupings use `rounded-lg` (`0.5rem` / 8px).
