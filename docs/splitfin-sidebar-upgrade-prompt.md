# SplitFin Sidebar Rebuild — Match Reference Design

## Project Root
`/Users/blair/Desktop/Development/Splitfin-New`

## Objective
Rebuild the sidebar (`src/components/app-sidebar.tsx`) to match the layout, structure, and features shown in the **reference design** at `reference/splitfin-sidebar.jsx` (attached). The current sidebar uses React Aria Components (Intent UI sidebar primitives), React Router, MynaUI icons, and a dark-first SplitFin theme with teal (#4daebc) as the primary colour.

The rebuilt sidebar must keep the existing React Aria / Intent UI primitives (`Sidebar`, `SidebarItem`, `SidebarDisclosure`, etc.) and React Router integration, but restructure the layout, add new features, replace all icons, and add motion animations to match the reference.

---

## Reference Design — Key Features to Implement

Study `reference/splitfin-sidebar.jsx` carefully. It defines the target layout. Here is a breakdown of every feature in the reference that must be implemented:

### Layout Structure (top to bottom)

1. **Header area**
   - Logo + "Splitfin" wordmark (left), collapse button (right)
   - Search trigger bar below: styled input-like button showing "Search..." with `⌘K` kbd hint
   - Clicking the search trigger opens the Command Palette overlay

2. **Primary nav** — Dashboard item (with `⌘D` keyboard shortcut hint)

3. **Pinned Favourites section** (only shows when items are pinned)
   - Section label "Pinned" with count badge
   - Users can pin/unpin items by hovering and clicking a pin icon
   - Pinned items show their badges (e.g. Invoices: 7 amber, Deliveries: 3 teal)
   - Pin state stored in local component state (persisted later)

4. **Divider line**

5. **Accordion sections** — Inventory, Shipping, Finance, Suppliers
   - Each section trigger shows: icon, title, optional badge count, chevron
   - Badges on triggers: Shipping (3 teal), Finance (7 amber)
   - Sub-items show: icon (indented), label, optional badge, pin icon on hover
   - Only one section open at a time (accordion behaviour)

6. **Tools section** — section label "Tools", then Image Management item

7. **Communication section** — section label "Communication", then Team Messages (with badge: 4 teal)

8. **Footer** — User menu button with avatar, name, role, chevron
   - Clicking opens a popup panel (not a dropdown) with Settings (⌘S), Notifications (badge: 3), and Log out

### Collapsed State (IconRail)

When collapsed, the sidebar becomes a narrow icon rail:
- Logo icon only (no wordmark)
- Each top-level item/section shown as an icon button
- Dividers between groups
- Active state: `bg-zinc-800 text-teal-400`
- Tooltips on hover showing label + badge count
- Notification dot on Messages icon when unread
- User avatar at bottom
- Expand button at very bottom

### Command Palette (⌘K)

- Full-screen overlay with search input
- Filterable list grouped by: Navigation, Quick Actions, Settings
- Navigation items: all sidebar destinations
- Quick Actions: Create Invoice, Add New Supplier, New Purchase Order
- Settings: Settings, Notifications
- Keyboard: `⌘K` / `Ctrl+K` toggles, `Escape` closes
- Styled with `zinc-900` bg, `zinc-700/50` border

### Visual Styling

Match these specific styles from the reference:
- Sidebar width: `280px` (expanded), `64px` / `w-16` (collapsed)
- Background: `zinc-950`
- Border: `border-r border-zinc-800/50`
- Nav items: `h-10`, `text-[13px]`, `font-medium`
- Active item: `bg-zinc-800/80 text-white`, icon `text-teal-400`
- Hover: `hover:text-zinc-200 hover:bg-zinc-800/40`
- Section triggers: `font-semibold text-zinc-300`
- Section labels: `text-[10px] font-semibold uppercase tracking-widest text-zinc-600`
- Dividers: `border-t border-zinc-800/60`
- Sub-items: `pl-11` indent
- Badge styles:
  - Accent (teal): `bg-teal-500/20 text-teal-400`
  - Warning (amber): `bg-amber-500/20 text-amber-400`
  - Default: `bg-zinc-700 text-zinc-300`
- User avatar: `bg-teal-600 ring-2 ring-teal-500/20`
- Font: DM Sans (already in the project theme)

---

## Icon Replacement — MynaUI → Lucide Animated

### Install Missing Animated Icons

Some icons already exist in `src/components/icons/`. Check first, then install any missing:

```bash
# Check which exist first, then install missing ones:
npx shadcn@latest add "https://lucide-animated.com/r/home.json"
npx shadcn@latest add "https://lucide-animated.com/r/pound-sterling.json"
npx shadcn@latest add "https://lucide-animated.com/r/boxes.json"
npx shadcn@latest add "https://lucide-animated.com/r/ship.json"
npx shadcn@latest add "https://lucide-animated.com/r/box.json"
npx shadcn@latest add "https://lucide-animated.com/r/mail-check.json"
npx shadcn@latest add "https://lucide-animated.com/r/truck.json"
npx shadcn@latest add "https://lucide-animated.com/r/clipboard-check.json"
npx shadcn@latest add "https://lucide-animated.com/r/hand-coins.json"
npx shadcn@latest add "https://lucide-animated.com/r/users.json"
npx shadcn@latest add "https://lucide-animated.com/r/gallery-thumbnails.json"
npx shadcn@latest add "https://lucide-animated.com/r/message-circle-more.json"
```

### Icon Mapping

Remove the entire `@mynaui/icons-react` import block and replace:

| Sidebar Item | Lucide Animated Component | Import Path |
|---|---|---|
| Dashboard | `HomeIcon` | `@/components/icons/home` |
| Invoices | `PoundSterlingIcon` | `@/components/icons/pound-sterling` |
| Inventory Management | `BoxesIcon` | `@/components/icons/boxes` |
| Shipping (trigger) | `ShipIcon` | `@/components/icons/ship` |
| Warehouse | `BoxIcon` | `@/components/icons/box` |
| Couriers | `MailCheckIcon` | `@/components/icons/mail-check` |
| Deliveries | `TruckIcon` | `@/components/icons/truck` |
| Finance (trigger) | `PoundSterlingIcon` | `@/components/icons/pound-sterling` |
| Purchase Orders | `HandCoinsIcon` | `@/components/icons/hand-coins` |
| Suppliers (trigger + sub-item) | `UsersIcon` | `@/components/icons/users` |
| Image Management | `GalleryThumbnailsIcon` | `@/components/icons/gallery-thumbnails` |
| Team Messages | `MessageCircleMoreIcon` | `@/components/icons/message-circle-more` |

**For icons without animated equivalents** (footer menu, Customers section, Settings, etc.), use static `lucide-react` icons:
```tsx
import { Settings, LogOut, HelpCircle, ChevronDown, ChevronRight, Users, MapPin, MessageSquare, UserPlus, ShoppingCart, Search, Star, Pin, PanelLeftClose, PanelLeft, Plus, Bell } from "lucide-react"
```

### Animated Icon Integration

Each lucide-animated icon exposes `startAnimation()` / `stopAnimation()` via ref. Create a wrapper:

```tsx
// src/components/sidebar-animated-icon.tsx
import { useRef, useCallback } from "react"

interface SidebarAnimatedIconProps {
  icon: React.ForwardRefExoticComponent<any>
  size?: number
  className?: string
}

export function SidebarAnimatedIcon({ icon: Icon, size = 18, className = "" }: SidebarAnimatedIconProps) {
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

If the icon's internal `<div>` wrapper breaks React Aria's `data-slot="icon"` styling, use a direct ref approach on the parent `SidebarItem` instead:
```tsx
const homeRef = useRef(null)
<SidebarItem
  onHoverStart={() => homeRef.current?.startAnimation()}
  onHoverEnd={() => homeRef.current?.stopAnimation()}
>
  <HomeIcon ref={homeRef} size={18} data-slot="icon" />
  <SidebarLabel>Dashboard</SidebarLabel>
</SidebarItem>
```

---

## Motion Animations

`motion` v12.33.0 is already installed (`motion/react`).

### Accordion Expand/Collapse

Wrap `SidebarDisclosurePanel` content with motion for smooth height animation:

```tsx
import { AnimatePresence, motion } from "motion/react"

<SidebarDisclosurePanel className={panelClass}>
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: "auto", opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    transition={{ duration: 0.15, ease: "easeOut" }}
  >
    {/* sub-items */}
  </motion.div>
</SidebarDisclosurePanel>
```

If this conflicts with React Aria's disclosure state, use CSS transitions instead:
```css
[data-slot="disclosure-panel"] {
  overflow: hidden;
  transition: height 150ms ease-out, opacity 150ms ease-out;
}
```

### Logo Crossfade (Expand/Collapse)

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={isCollapsed ? "icon" : "wordmark"}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.15 }}
  >
    {/* logo img */}
  </motion.div>
</AnimatePresence>
```

### Active Item Indicator

Animate a teal left-border indicator that slides between active items:

```tsx
{isActive && (
  <motion.div
    layoutId="sidebar-active-indicator"
    className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-400 rounded-full"
    transition={{ type: "spring", stiffness: 350, damping: 30 }}
  />
)}
```

### Sidebar Item Hover Scale

```tsx
<motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.1 }}>
  <SidebarItem ...>
```

### Reduced Motion Support

All motion must respect `prefers-reduced-motion`:

```tsx
import { useReducedMotion } from "motion/react"
const prefersReducedMotion = useReducedMotion()
// Use: transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
```

---

## New Components to Create

### `src/components/sidebar-badge.tsx`

```tsx
interface SidebarBadgeProps {
  count: number
  variant?: "accent" | "warning" | "default"
}

export function SidebarBadge({ count, variant = "default" }: SidebarBadgeProps) {
  if (!count) return null
  const styles = {
    default: "bg-zinc-700 text-zinc-300",
    accent: "bg-teal-500/20 text-teal-400",
    warning: "bg-amber-500/20 text-amber-400",
  }
  return (
    <span className={`ml-auto text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md ${styles[variant]}`}>
      {count > 99 ? "99+" : count}
    </span>
  )
}
```

### `src/components/sidebar-kbd.tsx`

```tsx
export function SidebarKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto text-[10px] font-medium text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 rounded px-1.5 py-0.5 leading-none">
      {children}
    </kbd>
  )
}
```

### `src/components/sidebar-search.tsx`

Search trigger button + Command Palette overlay. Match the reference design's `SearchTrigger` and `CommandPalette` components. The palette must:
- Open with `⌘K` / `Ctrl+K` globally
- Filter items by query
- Group into Navigation, Quick Actions, Settings
- Close on `Escape` or clicking outside
- Auto-focus the search input on open

### `src/components/sidebar-user-menu.tsx`

Popup panel (not React Aria Menu) matching the reference's `UserMenu` component:
- Positioned above the user button
- Shows: user name, role, company
- Menu items: Settings (⌘S), Notifications (with badge), Log out (red)
- Closes on click outside

### `src/components/sidebar-icon-rail.tsx`

Collapsed rail view matching the reference's `IconRail` component:
- Logo icon at top
- Icon buttons for each top-level item/section
- Dividers between groups
- Tooltips on hover with label + badge
- Notification dot on Messages
- User avatar and expand button at bottom

### `src/components/sidebar-animated-icon.tsx`

Animated icon wrapper (described above in Icon Integration section).

---

## Preserve These Existing Behaviours

- **React Router integration** — `useLocation`, `useNavigate`, all existing route paths
- **Admin-only sections** — `isAdmin` checks for Inventory, Shipping, Finance, Suppliers, Tools
- **Auto-expand based on route** — `SidebarDisclosureGroup` `defaultExpandedKeys` logic
- **`authService.logout()`** integration
- **`SidebarProvider` / `SidebarInset`** layout in `MasterLayout.tsx`
- **All existing route paths** — `/dashboard`, `/orders`, `/customers/*`, `/inventory/*`, `/shipping/*`, `/finance/*`, `/suppliers/*`, `/image-management`, `/messaging`, `/settings`
- **Tooltip behaviour** for collapsed rail items

---

## File Changes Summary

| File | Action |
|---|---|
| `src/components/icons/*.tsx` | Install missing animated icons via shadcn CLI |
| `src/components/sidebar-animated-icon.tsx` | **NEW** — Animated icon wrapper |
| `src/components/sidebar-badge.tsx` | **NEW** — Badge with accent/warning/default variants |
| `src/components/sidebar-kbd.tsx` | **NEW** — Keyboard shortcut hint |
| `src/components/sidebar-search.tsx` | **NEW** — Search trigger + Command Palette |
| `src/components/sidebar-user-menu.tsx` | **NEW** — Popup user menu panel |
| `src/components/sidebar-icon-rail.tsx` | **NEW** — Collapsed icon rail with tooltips |
| `src/components/app-sidebar.tsx` | **MAJOR REWRITE** — New layout matching reference design |
| `package.json` | Remove `@mynaui/icons-react` if no other files import from it |

---

## Implementation Order

1. Install all missing lucide-animated icons
2. Create the new utility components (`sidebar-badge`, `sidebar-kbd`, `sidebar-animated-icon`)
3. Create `sidebar-search.tsx` (Search trigger + Command Palette)
4. Create `sidebar-user-menu.tsx` (Popup user menu)
5. Create `sidebar-icon-rail.tsx` (Collapsed rail)
6. Rewrite `app-sidebar.tsx` — restructure the layout to match the reference:
   - Header with logo + collapse button + search trigger
   - Dashboard with ⌘D hint
   - Pinned favourites section (with pin/unpin logic)
   - Divider
   - Accordion sections with badges on triggers
   - Tools + Communication section labels
   - Footer user menu
7. Add motion animations (accordion, logo crossfade, active indicator, hover)
8. Replace all MynaUI icon imports with lucide-animated + lucide-react fallbacks
9. Test collapsed state renders the IconRail correctly
10. Verify all routes, admin checks, and logout still work

---

## Testing Checklist

- [ ] Sidebar layout matches the reference design visually
- [ ] All icons render (animated icons play on hover, stop on leave)
- [ ] Command Palette opens with ⌘K, filters items, closes with Escape
- [ ] Pinning/unpinning items works, pinned section shows/hides
- [ ] Accordion sections expand/collapse with smooth animation
- [ ] Badges display with correct teal/amber colours on triggers and sub-items
- [ ] Active item has teal icon colour and animated left indicator
- [ ] Collapsed rail shows icon buttons with tooltips + badges
- [ ] User menu opens as popup panel with Settings, Notifications, Log out
- [ ] Admin-only sections hidden for non-admin users
- [ ] All React Router navigation still works (every route path)
- [ ] `authService.logout()` still functions from user menu
- [ ] Logo crossfades between wordmark and icon on collapse/expand
- [ ] `prefers-reduced-motion` disables all motion animations
- [ ] No console errors or TypeScript warnings
- [ ] Build completes: `npm run build`
