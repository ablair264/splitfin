import { useState, useRef, useEffect } from "react";

// --- Icon components ---
const icons = {
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  ),
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  ),
  inventory: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
  ),
  shipping: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="21" cy="18" r="2"/></svg>
  ),
  warehouse: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/></svg>
  ),
  courier: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
  ),
  delivery: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
  finance: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  ),
  invoice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
  ),
  purchaseOrder: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15l2 2 4-4"/></svg>
  ),
  suppliers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  supplierAdd: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
  ),
  image: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
  ),
  messages: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
  ),
  starOutline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
  ),
  pin: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
  ),
  collapse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
  ),
  expand: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
  ),
};

// --- Tooltip for collapsed rail ---
function Tooltip({ children, label, badge }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setCoords({ top: r.top + r.height / 2, left: r.right + 12 });
    }
    setShow(true);
  };
  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} className="relative">
      {children}
      {show && (
        <div className="fixed z-50 pointer-events-none" style={{ top: coords.top, left: coords.left, transform: "translateY(-50%)" }}>
          <div className="bg-zinc-800 border border-zinc-700/50 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-2.5">
            {label}
            {badge && (
              <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${badge.variant === "warning" ? "bg-amber-500/20 text-amber-400" : "bg-teal-500/20 text-teal-400"}`}>
                {badge.count}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ count, variant = "default" }) {
  if (!count) return null;
  const c = { default: "bg-zinc-700 text-zinc-300", accent: "bg-teal-500/20 text-teal-400", warning: "bg-amber-500/20 text-amber-400" };
  return <span className={`ml-auto text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md ${c[variant]}`}>{count}</span>;
}

function Kbd({ children }) {
  return <kbd className="ml-auto text-[10px] font-medium text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 rounded px-1.5 py-0.5 leading-none">{children}</kbd>;
}

function NavItem({ icon, label, active, badge, badgeVariant, kbd: kbdText, indent, onClick, pinned, onPin }) {
  return (
    <button onClick={onClick} className={`group flex items-center gap-3 w-full rounded-lg text-left text-[13px] font-medium ${indent ? "pl-11 pr-3 h-10" : "px-3 h-10"} ${active ? "bg-zinc-800/80 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"}`}>
      {icon && <span className={`flex-shrink-0 ${active ? "text-teal-400" : "text-zinc-500 group-hover:text-zinc-400"}`}>{icon}</span>}
      <span className="truncate">{label}</span>
      {badge && <Badge count={badge} variant={badgeVariant} />}
      {kbdText && <Kbd>{kbdText}</Kbd>}
      {onPin && (
        <span onClick={(e) => { e.stopPropagation(); onPin(); }} className={`ml-auto opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-teal-400 cursor-pointer ${pinned ? "!opacity-100 text-teal-400/60 hover:text-teal-400" : ""}`} role="button" aria-label={pinned ? "Unpin" : "Pin"}>
          {icons.pin}
        </span>
      )}
    </button>
  );
}

function Section({ icon, title, children, defaultOpen = false, badge, badgeVariant }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="group flex items-center gap-3 w-full rounded-lg px-3 h-10 text-left text-[13px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800/40">
        <span className="flex-shrink-0 text-zinc-500 group-hover:text-zinc-400">{icon}</span>
        <span className="truncate">{title}</span>
        {badge && <Badge count={badge} variant={badgeVariant} />}
        <span className={`ml-auto text-zinc-600 ${open ? "" : "-rotate-90"}`}>{icons.chevronDown}</span>
      </button>
      {open && <div className="mt-0.5 space-y-0.5 pb-1">{children}</div>}
    </div>
  );
}

function SectionLabel({ label, action }) {
  return (
    <div className="flex items-center justify-between px-3 pt-6 pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{label}</span>
      {action}
    </div>
  );
}

function Divider() {
  return <div className="mx-3 my-4 border-t border-zinc-800/60" />;
}

function SearchTrigger({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 w-full rounded-lg px-3 h-10 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 border border-zinc-800/60 bg-zinc-900/40">
      {icons.search}<span>Search...</span><Kbd>⌘K</Kbd>
    </button>
  );
}

function CommandPalette({ isOpen, onClose }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  useEffect(() => { if (isOpen && inputRef.current) inputRef.current.focus(); }, [isOpen]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); isOpen ? onClose() : onClose("toggle"); }
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const items = [
    { s: "Navigation", l: "Dashboard", i: icons.dashboard },
    { s: "Navigation", l: "Inventory Management", i: icons.inventory },
    { s: "Navigation", l: "Warehouse", i: icons.warehouse },
    { s: "Navigation", l: "Couriers", i: icons.courier },
    { s: "Navigation", l: "Deliveries", i: icons.delivery },
    { s: "Navigation", l: "Invoices", i: icons.invoice },
    { s: "Navigation", l: "Purchase Orders", i: icons.purchaseOrder },
    { s: "Navigation", l: "Supplier Management", i: icons.suppliers },
    { s: "Navigation", l: "Image Management", i: icons.image },
    { s: "Navigation", l: "Team Messages", i: icons.messages },
    { s: "Quick Actions", l: "Create Invoice", i: icons.plus },
    { s: "Quick Actions", l: "Add New Supplier", i: icons.plus },
    { s: "Quick Actions", l: "New Purchase Order", i: icons.plus },
    { s: "Settings", l: "Settings", i: icons.settings },
    { s: "Settings", l: "Notifications", i: icons.bell },
  ];
  const filtered = query ? items.filter((x) => x.l.toLowerCase().includes(query.toLowerCase())) : items;
  const grouped = filtered.reduce((a, x) => { (a[x.s] ??= []).push(x); return a; }, {});
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800">
          <span className="text-zinc-500">{icons.search}</span>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages, actions, settings..." className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none" />
          <kbd className="text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {!Object.keys(grouped).length && <div className="px-3 py-8 text-center text-sm text-zinc-500">No results found</div>}
          {Object.entries(grouped).map(([sec, its]) => (
            <div key={sec} className="mb-1">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{sec}</div>
              {its.map((x, i) => (
                <button key={`${x.l}-${i}`} className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={onClose}>
                  <span className="text-zinc-500">{x.i}</span>{x.l}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserMenu({ isOpen }) {
  if (!isOpen) return null;
  return (
    <div className="absolute bottom-[72px] left-3 right-3 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden z-40">
      <div className="px-4 py-4 border-b border-zinc-800">
        <div className="text-sm font-semibold text-white">Sammie</div>
        <div className="text-xs text-zinc-500 mt-1">Admin · SplitFin Ltd</div>
      </div>
      <div className="p-2 space-y-0.5">
        <button className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[13px] text-zinc-400 hover:text-white hover:bg-zinc-800/60">{icons.settings}<span>Settings</span><Kbd>⌘S</Kbd></button>
        <button className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[13px] text-zinc-400 hover:text-white hover:bg-zinc-800/60">{icons.bell}<span>Notifications</span><Badge count={3} variant="accent" /></button>
      </div>
      <div className="border-t border-zinc-800 p-2">
        <button className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[13px] text-red-400/70 hover:text-red-400 hover:bg-zinc-800/60">{icons.logout}<span>Log out</span></button>
      </div>
    </div>
  );
}

function IconRail({ sections, activeSection, onSelect, activeItem, onExpand }) {
  const items = [
    { id: "dashboard", icon: icons.dashboard, label: "Dashboard" },
    { id: "favourites", icon: icons.starOutline, label: "Favourites" },
    { id: "d0", divider: true },
    ...sections.map((s) => ({ id: s.id, icon: s.icon, label: s.title, badge: s.badge })),
    { id: "d1", divider: true },
    { id: "images", icon: icons.image, label: "Image Management" },
    { id: "messages", icon: icons.messages, label: "Team Messages", badge: { count: 4, variant: "accent" }, hasDot: true },
  ];
  return (
    <div className="flex flex-col items-center w-16 bg-zinc-950 border-r border-zinc-800/50 py-5 gap-2">
      <div className="flex items-center justify-center size-10 mb-5">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <path d="M8 6C8 6 14 6 16 12C18 18 24 18 24 18" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round"/>
          <path d="M8 14C8 14 14 14 16 20C18 26 24 26 24 26" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
        </svg>
      </div>
      {items.map((item) => {
        if (item.divider) return <div key={item.id} className="w-6 my-2 border-t border-zinc-800/60" />;
        const isActive = activeSection === item.id || activeItem === item.id;
        return (
          <Tooltip key={item.id} label={item.label} badge={item.badge}>
            <button onClick={() => onSelect(item.id)} className={`relative flex items-center justify-center size-10 rounded-lg ${isActive ? "bg-zinc-800 text-teal-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"}`} aria-label={item.label}>
              {item.icon}
              {item.hasDot && <span className="absolute top-1 right-1 size-2 bg-teal-400 rounded-full ring-2 ring-zinc-950" />}
            </button>
          </Tooltip>
        );
      })}
      <div className="flex-1" />
      <Tooltip label="Sammie · Admin">
        <div className="size-10 rounded-full bg-teal-600 flex items-center justify-center text-[13px] font-semibold text-white ring-2 ring-teal-500/20 mb-2 cursor-pointer hover:ring-teal-500/40">S</div>
      </Tooltip>
      <Tooltip label="Expand sidebar">
        <button onClick={onExpand} className="flex items-center justify-center size-10 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50" aria-label="Expand sidebar">{icons.expand}</button>
      </Tooltip>
    </div>
  );
}

export default function SplitFinSidebar() {
  const [activeItem, setActiveItem] = useState("dashboard");
  const [commandOpen, setCommandOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pinnedItems, setPinnedItems] = useState(["invoices", "inventory"]);
  const togglePin = (id) => setPinnedItems((p) => p.includes(id) ? p.filter((i) => i !== id) : [...p, id]);
  const handleCmd = (a) => a === "toggle" ? setCommandOpen(true) : setCommandOpen(false);

  const sections = [
    { id: "inventory", title: "Inventory", icon: icons.inventory },
    { id: "shipping", title: "Shipping", icon: icons.shipping, badge: { count: 3, variant: "accent" } },
    { id: "finance", title: "Finance", icon: icons.finance, badge: { count: 7, variant: "warning" } },
    { id: "suppliers", title: "Suppliers", icon: icons.suppliers },
  ];
  const [activeSection, setActiveSection] = useState("inventory");

  const nav = {
    dashboard: { label: "Dashboard", icon: icons.dashboard },
    inventory: { label: "Inventory Management", icon: icons.inventory },
    warehouse: { label: "Warehouse", icon: icons.warehouse },
    couriers: { label: "Couriers", icon: icons.courier },
    deliveries: { label: "Deliveries", icon: icons.delivery },
    invoices: { label: "Invoices", icon: icons.invoice },
    purchaseOrders: { label: "Purchase Orders", icon: icons.purchaseOrder },
    supplierMgmt: { label: "Supplier Management", icon: icons.suppliers },
    supplierAdd: { label: "Add New Supplier", icon: icons.supplierAdd },
    images: { label: "Image Management", icon: icons.image },
    messages: { label: "Team Messages", icon: icons.messages },
  };

  const MainContent = () => (
    <main className="flex-1 bg-zinc-950 p-10">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-white mb-3 text-balance">{nav[activeItem]?.label || "Dashboard"}</h1>
        <p className="text-zinc-500 text-sm text-pretty leading-relaxed">
          {collapsed
            ? "Sidebar collapsed — hover icons for tooltips with labels and badge counts."
            : "Navigate using the sidebar. Try ⌘K for command palette, hover items to pin them, or collapse the sidebar."
          }
        </p>
        <div className="mt-10 grid grid-cols-2 gap-5">
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-6">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">Pending Invoices</div>
            <div className="text-2xl font-semibold text-amber-400 tabular-nums">7</div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-6">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">In Transit</div>
            <div className="text-2xl font-semibold text-teal-400 tabular-nums">3</div>
          </div>
        </div>
      </div>
    </main>
  );

  if (collapsed) {
    return (
      <div className="flex h-dvh" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />
        <IconRail sections={sections} activeSection={activeSection} activeItem={activeItem} onExpand={() => setCollapsed(false)} onSelect={(id) => {
          if (["dashboard","images","messages"].includes(id)) setActiveItem(id);
          else if (id === "favourites") setCollapsed(false);
          else { setActiveSection(id); setCollapsed(false); }
        }} />
        <MainContent />
        <CommandPalette isOpen={commandOpen} onClose={handleCmd} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />
      <aside className="relative flex flex-col w-[280px] bg-zinc-950 border-r border-zinc-800/50 overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M8 6C8 6 14 6 16 12C18 18 24 18 24 18" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round"/>
                <path d="M8 14C8 14 14 14 16 20C18 26 24 26 24 26" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
              </svg>
              <span className="text-base font-semibold text-white tracking-tight">Splitfin</span>
            </div>
            <button onClick={() => setCollapsed(true)} className="text-zinc-600 hover:text-zinc-400 p-1.5 rounded-lg hover:bg-zinc-800/50" aria-label="Collapse sidebar">{icons.collapse}</button>
          </div>
          <SearchTrigger onClick={() => setCommandOpen(true)} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          <NavItem icon={icons.dashboard} label="Dashboard" active={activeItem === "dashboard"} onClick={() => setActiveItem("dashboard")} kbd="⌘D" />

          {pinnedItems.length > 0 && (
            <>
              <SectionLabel label="Pinned" action={<span className="text-zinc-600 text-[10px] tabular-nums">{pinnedItems.length}</span>} />
              <div className="space-y-0.5">
                {pinnedItems.map((id) => { const item = nav[id]; if (!item) return null; return (
                  <NavItem key={id} icon={item.icon} label={item.label} active={activeItem === id} onClick={() => setActiveItem(id)} badge={id === "invoices" ? 7 : id === "deliveries" ? 3 : null} badgeVariant={id === "invoices" ? "warning" : "accent"} pinned onPin={() => togglePin(id)} />
                ); })}
              </div>
            </>
          )}

          <Divider />

          <div className="space-y-1">
            <Section icon={icons.inventory} title="Inventory" defaultOpen>
              <NavItem indent icon={icons.inventory} label="Inventory Management" active={activeItem === "inventory"} onClick={() => setActiveItem("inventory")} onPin={() => togglePin("inventory")} pinned={pinnedItems.includes("inventory")} />
            </Section>

            <Section icon={icons.shipping} title="Shipping" badge={3} badgeVariant="accent">
              <NavItem indent icon={icons.warehouse} label="Warehouse" active={activeItem === "warehouse"} onClick={() => setActiveItem("warehouse")} onPin={() => togglePin("warehouse")} pinned={pinnedItems.includes("warehouse")} />
              <NavItem indent icon={icons.courier} label="Couriers" active={activeItem === "couriers"} onClick={() => setActiveItem("couriers")} onPin={() => togglePin("couriers")} pinned={pinnedItems.includes("couriers")} />
              <NavItem indent icon={icons.delivery} label="Deliveries" active={activeItem === "deliveries"} onClick={() => setActiveItem("deliveries")} badge={3} badgeVariant="accent" onPin={() => togglePin("deliveries")} pinned={pinnedItems.includes("deliveries")} />
            </Section>

            <Section icon={icons.finance} title="Finance" badge={7} badgeVariant="warning">
              <NavItem indent icon={icons.invoice} label="Invoices" active={activeItem === "invoices"} onClick={() => setActiveItem("invoices")} badge={7} badgeVariant="warning" onPin={() => togglePin("invoices")} pinned={pinnedItems.includes("invoices")} />
              <NavItem indent icon={icons.purchaseOrder} label="Purchase Orders" active={activeItem === "purchaseOrders"} onClick={() => setActiveItem("purchaseOrders")} onPin={() => togglePin("purchaseOrders")} pinned={pinnedItems.includes("purchaseOrders")} />
            </Section>

            <Section icon={icons.suppliers} title="Suppliers">
              <NavItem indent icon={icons.suppliers} label="Supplier Management" active={activeItem === "supplierMgmt"} onClick={() => setActiveItem("supplierMgmt")} onPin={() => togglePin("supplierMgmt")} pinned={pinnedItems.includes("supplierMgmt")} />
              <NavItem indent icon={icons.supplierAdd} label="Add New Supplier" active={activeItem === "supplierAdd"} onClick={() => setActiveItem("supplierAdd")} />
            </Section>
          </div>

          <SectionLabel label="Tools" />
          <NavItem icon={icons.image} label="Image Management" active={activeItem === "images"} onClick={() => setActiveItem("images")} />

          <SectionLabel label="Communication" />
          <NavItem icon={icons.messages} label="Team Messages" active={activeItem === "messages"} onClick={() => setActiveItem("messages")} badge={4} badgeVariant="accent" />
        </nav>

        {/* User */}
        <div className="relative px-3 pb-4 pt-3 border-t border-zinc-800/50">
          <UserMenu isOpen={userMenuOpen} />
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-3 w-full rounded-lg px-3 py-3 hover:bg-zinc-800/40">
            <div className="size-9 rounded-full bg-teal-600 flex items-center justify-center text-[13px] font-semibold text-white ring-2 ring-teal-500/20">S</div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-[13px] font-medium text-white truncate">Sammie</div>
              <div className="text-[11px] text-zinc-500 truncate">Admin</div>
            </div>
            <span className="text-zinc-600">{icons.chevronRight}</span>
          </button>
        </div>
      </aside>

      <MainContent />
      <CommandPalette isOpen={commandOpen} onClose={handleCmd} />
      {userMenuOpen && <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />}
    </div>
  );
}
