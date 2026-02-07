# SplitFin Sidebar Upgrade — Lucide Animated Icons + Motion Animations

## Project Root
`/Users/blair/Desktop/Development/Splitfin-New`

## Objective
Upgrade the existing sidebar (`src/components/app-sidebar.tsx`) to replace all MynaUI icons with lucide-animated icons and add motion animations for accordions, transitions, and hover states. The sidebar currently uses React Aria Components (Intent UI sidebar primitives), React Router, and has a dark-first SplitFin theme with teal (#4daebc) as the primary colour.

---

## 1. Install Missing Lucide Animated Icons

Some icons already exist in `src/components/icons/`. Run these commands to install the ones that are missing:

```bash
npx shadcn@latest add "https://lucide-animated.com/r/clipboard-check.json"
npx shadcn@latest add "https://lucide-animated.com/r/hand-coins.json"
npx shadcn@latest add "https://lucide-animated.com/r/users.json"
npx shadcn@latest add "https://lucide-animated.com/r/gallery-thumbnails.json"
npx shadcn@latest add "https://lucide-animated.com/r/message-circle-more.json"
```

**Already installed** (verify they exist in `src/components/icons/`):
- `home.tsx` → Dashboard
- `pound-sterling.tsx` → Invoices
- `boxes.tsx` → Inventory Management
- `ship.tsx` → Shipping section trigger
- `box.tsx` → Warehouse
- `mail-check.tsx` → Couriers
- `truck.tsx` → Deliveries

Check each file exists before skipping. If any are missing, install them:
```bash
npx shadcn@latest add "https://lucide-animated.com/r/home.json"
npx shadcn@latest add "https://lucide-animated.com/r/pound-sterling.json"
npx shadcn@latest add "https://lucide-animated.com/r/boxes.json"
npx shadcn@latest add "https://lucide-animated.com/r/ship.json"
npx shadcn@latest add "https://lucide-animated.com/r/box.json"
npx shadcn@latest add "https://lucide-animated.com/r/mail-check.json"
npx shadcn@latest add "https://lucide-animated.com/r/truck.json"
```

---

## 2. Icon Mapping — Replace MynaUI with Lucide Animated

Remove the entire `@mynaui/icons-react` import block from `app-sidebar.tsx` and replace with lucide-animated imports:

| Sidebar Item | MynaUI Icon | Lucide Animated Component | Import Path |
|---|---|---|---|
| Dashboard | `Home` | `HomeIcon` | `@/components/icons/home` |
| Invoices | `FileText` | `PoundSterlingIcon` | `@/components/icons/pound-sterling` |
| Inventory Management | `Box` | `BoxesIcon` | `@/components/icons/boxes` |
| Shipping (section trigger) | `Truck` | `ShipIcon` | `@/components/icons/ship` |
| Warehouse | `Building` | `BoxIcon` | `@/components/icons/box` |
| Couriers | `Send` | `MailCheckIcon` | `@/components/icons/mail-check` |
| Deliveries | `Package` | `TruckIcon` | `@/components/icons/truck` |
| Finance (section trigger) | `Dollar` | `PoundSterlingIcon` | `@/components/icons/pound-sterling` |
| Purchase Orders | `Clipboard` | `HandCoinsIcon` | `@/components/icons/hand-coins` |
| Suppliers (section trigger + sub-item) | `User` / `Users` | `UsersIcon` | `@/components/icons/users` |
| Image Management | `Image` | `GalleryThumbnailsIcon` | `@/components/icons/gallery-thumbnails` |
| Team Messages | `MessageDots` | `MessageCircleMoreIcon` | `@/components/icons/message-circle-more` |
| Finance > Invoices | `FileText` | `PoundSterlingIcon` | `@/components/icons/pound-sterling` |
| Finance > Purchase Orders | `Clipboard` | `HandCoinsIcon` | `@/components/icons/hand-coins` |
| Inventory > Inventory Mgmt | `Box` | `BoxesIcon` | `@/components/icons/boxes` |

**For icons that DON'T have animated equivalents** (used in footer menu, Customers section, Settings, etc.), keep using static lucide-react icons as a fallback:
```tsx
import { Settings, LogOut, HelpCircle, ChevronDown, Users, MapPin, MessageSquare, UserPlus, ShoppingCart } from "lucide-react"
```

These cover: Settings (Cog), Help & Support (QuestionCircle), Logout, ChevronsUpDown, Customers sub-items (Users, MapPin, ChatDots), Add Supplier (UserPlus), Orders (Cart).

---

## 3. Lucide Animated Icon Integration Pattern

Each lucide-animated icon is a `forwardRef` component that exposes `startAnimation()` and `stopAnimation()` via a ref. They accept `size` and `className` props. They are wrapped in a `<div>` that handles mouse enter/leave by default.

### Usage Pattern in Sidebar Items

Create a wrapper component that makes lucide-animated icons compatible with the sidebar's `data-slot="icon"` pattern:

```tsx
// src/components/sidebar-icon.tsx
import { useRef, useCallback } from "react"
import type { ReactElement } from "react"

interface SidebarAnimatedIconProps {
  icon: React.ForwardRefExoticComponent<any>
  size?: number
  className?: string
  isActive?: boolean
}

/**
 * Wraps a lucide-animated icon for sidebar use.
 * Plays animation on hover. Active items get a persistent teal colour.
 */
export function SidebarAnimatedIcon({ 
  icon: Icon, 
  size = 20, 
  className = "",
  isActive = false 
}: SidebarAnimatedIconProps) {
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null)

  const handleMouseEnter = useCallback(() => {
    iconRef.current?.startAnimation()
  }, [])

  const handleMouseLeave = useCallback(() => {
    iconRef.current?.stopAnimation()
  }, [])

  return (
    <Icon
      ref={iconRef}
      size={size}
      data-slot="icon"
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  )
}
```

**Important**: The lucide-animated icons render a `<div>` wrapper internally. You may need to adjust the sidebar item layout to account for this. Test that `data-slot="icon"` styling still applies correctly — if it doesn't, apply it to the parent wrapper or adjust the icon component to forward the data attribute.

### Alternative: Direct Ref Approach

If the wrapper approach doesn't work well with React Aria's slot system, use the icons directly with refs:

```tsx
const homeRef = useRef<HomeIconHandle>(null)

<SidebarItem
  onHoverStart={() => homeRef.current?.startAnimation()}
  onHoverEnd={() => homeRef.current?.stopAnimation()}
>
  <HomeIcon ref={homeRef} size={20} data-slot="icon" />
  <SidebarLabel>Dashboard</SidebarLabel>
</SidebarItem>
```

---

## 4. Motion Animations

`motion` v12.33.0 is already installed (`motion/react`). Use it for these animations:

### 4a. Accordion Section Expand/Collapse

The sidebar uses React Aria's `<DisclosurePanel>` for expandable sections. Wrap the panel content with motion for smooth height animation:

```tsx
import { AnimatePresence, motion } from "motion/react"

// Inside each SidebarDisclosurePanel, animate the content:
<SidebarDisclosurePanel className={panelClass}>
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: "auto", opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    transition={{ duration: 0.15, ease: "easeOut" }}
  >
    {/* sub-items here */}
  </motion.div>
</SidebarDisclosurePanel>
```

**Note**: React Aria's DisclosurePanel may already handle show/hide. If wrapping with motion causes conflicts, instead apply CSS transitions via classes:
```css
[data-slot="disclosure-panel"] {
  overflow: hidden;
  transition: height 150ms ease-out, opacity 150ms ease-out;
}
```

Test both approaches and use whichever works cleanly with React Aria's disclosure state management.

### 4b. Sidebar Collapse/Expand Rail Transition

The sidebar already transitions between expanded (17rem) and collapsed (3.25rem) via the Intent UI sidebar primitives. Enhance the logo crossfade and content transitions:

```tsx
// Logo area - crossfade between wordmark and icon
<motion.div
  key={isCollapsed ? "icon" : "wordmark"}
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.15 }}
>
  {/* logo img */}
</motion.div>
```

For sidebar labels, fade them out when collapsing:
```tsx
<AnimatePresence>
  {!isCollapsed && (
    <motion.span
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: "auto" }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.15 }}
    >
      <SidebarLabel>{label}</SidebarLabel>
    </motion.span>
  )}
</AnimatePresence>
```

### 4c. Icon Hover Animation

The lucide-animated icons handle their own animation on hover by default. For additional polish, add a subtle scale on hover to sidebar items:

```tsx
<motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.1 }}>
  <SidebarItem ...>
```

### 4d. Active Item Indicator

Animate the active state border-left indicator:

```tsx
{isActive && (
  <motion.div
    layoutId="sidebar-active-indicator"
    className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-full"
    transition={{ type: "spring", stiffness: 350, damping: 30 }}
  />
)}
```

This creates a smooth sliding indicator between active items using motion's `layoutId`.

---

## 5. Badge Colours — Theme Alignment

The theme defines these notification colours:
- **Warning (amber)**: `--warning: #f59e0b` (light) / `--warning: #fbbf24` (dark)
- **Primary (teal)**: `--primary: #4daebc`
- **Success (green)**: `--success: #10b981` / `--success: #22c55e`

Apply badge counts to these sidebar items (when you add badge support):

| Item | Badge Colour | Use Case |
|---|---|---|
| Invoices | `bg-warning/20 text-warning` | Pending invoices count |
| Deliveries | `bg-primary/20 text-primary` | Active deliveries count |
| Team Messages | `bg-primary/20 text-primary` | Unread message count |

Badge component pattern:
```tsx
function SidebarBadge({ count, variant = "primary" }: { count: number; variant?: "warning" | "primary" }) {
  if (count === 0) return null
  const styles = {
    warning: "bg-warning/20 text-warning",
    primary: "bg-primary/20 text-primary",
  }
  return (
    <span className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded-full ${styles[variant]}`}>
      {count > 99 ? "99+" : count}
    </span>
  )
}
```

---

## 6. Accessibility

### Reduced Motion
All motion animations must respect `prefers-reduced-motion`:

```tsx
import { useReducedMotion } from "motion/react"

// In sidebar component:
const prefersReducedMotion = useReducedMotion()

// Use throughout:
transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
```

The theme CSS already has this media query for CSS animations:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Keyboard Navigation
- Maintain all existing keyboard navigation from React Aria components
- Icon animations should NOT trigger on keyboard focus (only mouse hover)
- Active indicator animation should work with both mouse and keyboard navigation

---

## 7. Preserve Existing Functionality

Do NOT change:
- React Router integration (`useLocation`, `useNavigate`, route paths)
- Admin-only conditional sections (`isAdmin` checks)
- `SidebarDisclosureGroup` auto-expand based on current route (`defaultExpandedKeys`)
- Footer user menu (Menu/MenuTrigger/MenuContent from React Aria)
- `SidebarRail` collapsed state
- `authService.logout()` integration
- Logo switching logic (expanded vs collapsed, light vs dark)
- Tooltip behaviour for collapsed rail items
- `SidebarProvider` / `SidebarInset` layout in MasterLayout.tsx

---

## 8. File Changes Summary

| File | Action |
|---|---|
| `src/components/icons/*.tsx` | Install missing animated icons via shadcn CLI |
| `src/components/sidebar-icon.tsx` | **NEW** — Animated icon wrapper for sidebar |
| `src/components/sidebar-badge.tsx` | **NEW** — Badge component with theme colours |
| `src/components/app-sidebar.tsx` | **MODIFY** — Replace MynaUI imports, add motion animations |
| `package.json` | Verify `motion` is installed, can remove `@mynaui/icons-react` if no other files use it |

---

## 9. Testing Checklist

After making changes, verify:

- [ ] All sidebar icons render correctly in both expanded and collapsed states
- [ ] Animated icons play animation on hover and stop on mouse leave
- [ ] Accordion sections expand/collapse smoothly (no layout jump)
- [ ] Active item indicator highlights the correct route
- [ ] Badge counts display with correct amber/teal colours
- [ ] Collapsed rail tooltips still show item labels
- [ ] Admin-only sections still hidden for non-admin users
- [ ] User footer menu still opens and functions (settings, logout)
- [ ] Logo switches between wordmark and icon on collapse
- [ ] No console errors or React warnings
- [ ] `prefers-reduced-motion` disables all motion animations
- [ ] Build completes without TypeScript errors (`npm run build`)

---

## 10. Reference Design

A reference sidebar design was created at `/mnt/user-data/outputs/splitfin-sidebar.jsx` with features including command palette (⌘K), pinnable favourites, badge counts, and tooltip system. These are aspirational features for later phases — **this upgrade focuses only on icon replacement, motion animations, and badge colour alignment**. Do not implement command palette or favourites pinning in this phase.
