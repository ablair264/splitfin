interface SidebarBadgeProps {
  count: number
  variant?: "accent" | "warning" | "default"
}

const styles = {
  default: "bg-zinc-700 text-zinc-300",
  accent: "bg-teal-500/20 text-teal-400",
  warning: "bg-amber-500/20 text-amber-400",
}

export function SidebarBadge({ count, variant = "default" }: SidebarBadgeProps) {
  if (!count) return null
  return (
    <span className={`ml-auto text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md ${styles[variant]}`}>
      {count > 99 ? "99+" : count}
    </span>
  )
}
