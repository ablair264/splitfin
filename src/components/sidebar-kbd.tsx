export function SidebarKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto text-[10px] font-medium text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 rounded px-1.5 py-0.5 leading-none">
      {children}
    </kbd>
  )
}
