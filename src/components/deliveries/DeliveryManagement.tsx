import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { warehouseService, type PackageListItem } from "@/services/warehouseService";
import { trackingService, type TrackingInfo } from "@/services/trackingService";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Search, Package, Calendar, User, Hash, RefreshCw, Menu,
} from "lucide-react";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { google: any; }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";

const MAP_STYLES = [
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#1a2332" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#2c3e50" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#34495e" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#34495e" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#34495e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#95a5a6" }] },
];

const DEFAULT_CENTER = { lat: 53.8008, lng: -1.5491 };

type FilterStatus = "all" | "delivery_booked" | "shipped" | "delivered";

const STATUS_COLORS: Record<string, string> = {
  delivered: "#22c55e",
  shipped: "#3b82f6",
  in_transit: "#3b82f6",
  delivery_booked: "#a855f7",
  packed: "#f59e0b",
  sent_to_packing: "#06b6d4",
  not_shipped: "#6b7280",
};

export default function DeliveryManagement() {
  usePageTitle("Delivery Management");
  const navigate = useNavigate();

  const [deliveries, setDeliveries] = useState<PackageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Load deliveries
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await warehouseService.list({
          warehouse_status: "delivery_booked,shipped,delivered",
          sort_by: "delivery_booked_at",
          sort_order: "desc",
          limit: 200,
        });
        setDeliveries(result.data);
      } catch (err) {
        console.error("Failed to load deliveries:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load Google Maps
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    const loadMaps = () => {
      if (window.google?.maps) { initMap(); return; }
      if (document.querySelector('script[src*="maps.googleapis.com"]')) return;
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
      script.async = true;
      script.onload = () => initMap();
      document.head.appendChild(script);
    };
    const tid = setTimeout(loadMaps, 100);
    return () => clearTimeout(tid);
  }, []);

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER, zoom: 6,
      disableDefaultUI: false, zoomControl: true, mapTypeControl: false,
      streetViewControl: false, fullscreenControl: true, styles: MAP_STYLES,
    });
    const iw = new window.google.maps.InfoWindow({ maxWidth: 500 });
    mapInstanceRef.current = map;
    infoWindowRef.current = iw;
    setMapReady(true);
  }, []);

  // Place markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !window.google?.maps || deliveries.length === 0) return;

    markersRef.current.forEach((m: { setMap: (v: null) => void }) => m.setMap(null));
    markersRef.current = [];

    const geocoder = new window.google.maps.Geocoder();
    const bounds = new window.google.maps.LatLngBounds();
    let placed = 0;

    deliveries.forEach((pkg) => {
      const addr = [pkg.shipping_address, pkg.shipping_city, pkg.shipping_state, pkg.shipping_code, pkg.shipping_country]
        .filter(Boolean).join(", ");
      if (!addr) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geocoder.geocode({ address: addr }, (results: any, status: any) => {
        if (status === "OK" && results?.[0]) {
          const pos = results[0].geometry.location;
          const marker = new window.google.maps.Marker({
            position: pos, map,
            title: pkg.packing_number,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE, scale: 10,
              fillColor: STATUS_COLORS[pkg.warehouse_status] || "#6b7280",
              fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2,
            },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          marker.addListener("click", () => handleMarkerClick(pkg, marker));
          markersRef.current.push(marker);
          bounds.extend(pos);
          placed++;
          if (placed === Math.min(deliveries.length, 50)) map.fitBounds(bounds);
        }
      });
    });
  }, [deliveries, mapReady]);

  // Navigation helpers for info window
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).navigateToOrder = (id: string) => {
      if (id && id !== "undefined") navigate(`/view-order/${id}`);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).closeInfoWindow = () => infoWindowRef.current?.close();
  }, [navigate]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMarkerClick = async (pkg: PackageListItem, marker: any) => {
    const iw = infoWindowRef.current;
    const map = mapInstanceRef.current;
    if (!iw || !map) return;

    setSelectedId(pkg.id);
    iw.setContent(buildInfoHTML(pkg));
    iw.open(map, marker);

    if (pkg.tracking_number) {
      setTrackingLoading(true);
      try {
        const info = await trackingService.getTracking(pkg.tracking_number, pkg.carrier_name?.toLowerCase());
        if (info) iw.setContent(buildInfoHTML(pkg, info));
      } finally {
        setTrackingLoading(false);
      }
    }
  };

  const handleSidebarClick = async (pkg: PackageListItem) => {
    setSelectedId(pkg.id);
    setSidebarOpen(false);

    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marker = markersRef.current.find((m: any) => m.getTitle() === pkg.packing_number);
    if (marker) {
      map.panTo(marker.getPosition());
      map.setZoom(14);
      handleMarkerClick(pkg, marker);
    } else {
      const addr = [pkg.shipping_address, pkg.shipping_city, pkg.shipping_code].filter(Boolean).join(", ");
      if (addr) {
        const geocoder = new window.google.maps.Geocoder();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geocoder.geocode({ address: addr }, (results: any, status: any) => {
          if (status === "OK" && results?.[0]) {
            map.panTo(results[0].geometry.location);
            map.setZoom(14);
          }
        });
      }
    }
  };

  const filtered = useMemo(() => {
    let items = [...deliveries];
    if (statusFilter !== "all") items = items.filter((d) => d.warehouse_status === statusFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter((d) =>
        d.customer_name?.toLowerCase().includes(q) ||
        d.packing_number?.toLowerCase().includes(q) ||
        d.salesorder_number?.toLowerCase().includes(q) ||
        d.tracking_number?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [deliveries, searchTerm, statusFilter]);

  const formatDate = (d?: string | null) => {
    if (!d) return "-";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
  };

  return (
    <div className="relative flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* Mobile toggle */}
      <button
        className="absolute left-3 top-3 z-50 rounded-lg border border-border bg-card p-2 text-foreground shadow-md lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu size={20} />
      </button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div
        className={`absolute inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-border bg-card transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">Delivery Tracking</h2>
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text" placeholder="Search deliveries..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Deliveries</option>
              <option value="delivery_booked">Delivery Booked</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <RefreshCw size={14} className="animate-spin" /> Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <Package size={32} />
              <p className="text-sm">No deliveries found</p>
            </div>
          ) : (
            filtered.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => handleSidebarClick(pkg)}
                className={`flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors hover:bg-muted/50 ${
                  selectedId === pkg.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                }`}
              >
                <div className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[pkg.warehouse_status] || "#6b7280" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{pkg.packing_number}</span>
                    <span className="shrink-0 text-[10px] font-medium uppercase text-muted-foreground">{pkg.warehouse_status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <User size={10} /><span className="truncate">{pkg.customer_name}</span>
                  </div>
                  {pkg.salesorder_number && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Hash size={10} /><span>{pkg.salesorder_number}</span>
                    </div>
                  )}
                  {pkg.delivery_booked_at && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar size={10} /><span>{formatDate(pkg.delivery_booked_at)}</span>
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-border p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-purple-500" /> Booked</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500" /> Shipped</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Delivered</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={mapRef} className="size-full" />
        {!GOOGLE_MAPS_API_KEY && (
          <div className="absolute left-4 top-4 rounded-lg bg-card/90 px-4 py-2 text-sm text-muted-foreground shadow-md backdrop-blur">
            Set VITE_GOOGLE_API_KEY to enable map
          </div>
        )}
        {!mapReady && GOOGLE_MAPS_API_KEY && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw size={16} className="animate-spin" /> Loading map...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildInfoHTML(pkg: PackageListItem, tracking?: TrackingInfo | null): string {
  const statusLabel = (tracking?.status ?? pkg.warehouse_status).replace(/_/g, " ");
  const addr = [pkg.shipping_address, pkg.shipping_city, pkg.shipping_code].filter(Boolean).join(", ");

  let historyHTML = "";
  if (tracking?.tracking_events?.length) {
    const items = tracking.tracking_events.slice(0, 5).map((ev, i) => {
      const time = ev.date_time ? new Date(ev.date_time).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
      const isLatest = i === 0;
      return `
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
          <div style="width:6px;height:6px;border-radius:50%;background:${isLatest ? "#14b8a6" : "#6b7280"};margin-top:4px;flex-shrink:0;${isLatest ? "box-shadow:0 0 8px rgba(20,184,166,.6);" : ""}"></div>
          <div style="flex:1;min-width:0;">
            <div style="color:${isLatest ? "#14b8a6" : "#e5e7eb"};font-size:12px;font-weight:${isLatest ? 600 : 400};">${ev.description || ev.status || "Update"}</div>
            ${ev.location ? `<div style="color:#9ca3af;font-size:11px;">${ev.location}</div>` : ""}
            ${time ? `<div style="color:#6b7280;font-size:10px;">${time}</div>` : ""}
          </div>
        </div>`;
    }).join("");
    historyHTML = `
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid rgba(75,85,99,.3);">
        <div style="font-size:11px;font-weight:600;color:#14b8a6;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Tracking History</div>
        ${items}
      </div>`;
  }

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:240px;max-width:400px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#f9fafb;">${pkg.packing_number}</div>
          <div style="font-size:12px;color:#9ca3af;">${pkg.customer_name}</div>
        </div>
        <button onclick="window.closeInfoWindow()" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:18px;padding:0 4px;">&times;</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;margin-bottom:8px;">
        <div style="color:#9ca3af;">Status</div><div style="color:#f9fafb;text-transform:capitalize;">${statusLabel}</div>
        <div style="color:#9ca3af;">Order</div><div style="color:#f9fafb;">${pkg.salesorder_number || "N/A"}</div>
        ${pkg.tracking_number ? `<div style="color:#9ca3af;">Tracking</div><div style="color:#14b8a6;font-family:monospace;font-size:11px;">${pkg.tracking_number}</div>` : ""}
        ${addr ? `<div style="color:#9ca3af;">Address</div><div style="color:#f9fafb;">${addr}</div>` : ""}
      </div>
      ${historyHTML}
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button onclick="window.navigateToOrder('${pkg.order_id}')" style="background:#14b8a6;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">View Order</button>
      </div>
    </div>`;
}
