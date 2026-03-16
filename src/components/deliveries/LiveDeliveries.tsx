import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { warehouseService, type PackageListItem } from "@/services/warehouseService";
import { trackingService, type TrackingInfo } from "@/services/trackingService";
import { usePageTitle } from "@/hooks/usePageTitle";
import { RefreshCw } from "lucide-react";

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

export default function LiveDeliveries() {
  usePageTitle("Live Deliveries");
  const navigate = useNavigate();

  const [deliveries, setDeliveries] = useState<PackageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowInstance = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersMap = useRef<Map<number, any>>(new Map());

  // Load shipped deliveries
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await warehouseService.list({
          warehouse_status: "shipped",
          sort_by: "updated_at",
          sort_order: "desc",
          limit: 100,
        });
        setDeliveries(result.data);
      } catch (err) {
        console.error("LiveDeliveries load error:", err);
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

  const initMap = () => {
    if (!mapRef.current || !window.google?.maps || mapInstance.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER, zoom: 6,
      disableDefaultUI: false, zoomControl: true, mapTypeControl: false,
      streetViewControl: false, fullscreenControl: true, styles: MAP_STYLES,
    });
    const iw = new window.google.maps.InfoWindow({ maxWidth: 500 });
    mapInstance.current = map;
    infoWindowInstance.current = iw;
  };

  // Navigation helpers
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).navigateToOrder = (id: string) => {
      if (id && id !== "undefined") navigate(`/view-order/${id}`);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).closeInfoWindow = () => infoWindowInstance.current?.close();
  }, [navigate]);

  // Place markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !window.google?.maps || deliveries.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markersMap.current.forEach((m: any) => m.setMap(null));
    markersMap.current.clear();

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

          // Glow marker
          new window.google.maps.Marker({
            position: pos, map,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE, scale: 16,
              fillColor: "#14b8a6", fillOpacity: 0.3,
              strokeColor: "#14b8a6", strokeOpacity: 0.6, strokeWeight: 2,
            },
            zIndex: 1, clickable: false,
          });

          // Main marker
          const marker = new window.google.maps.Marker({
            position: pos, map, title: pkg.packing_number,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE, scale: 8,
              fillColor: "#ffffff", fillOpacity: 0.95,
              strokeColor: "#14b8a6", strokeWeight: 2,
            },
            zIndex: 2,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          marker.addListener("click", () => handleMarkerClick(pkg, marker));
          markersMap.current.set(pkg.id, marker);
          bounds.extend(pos);
          placed++;
          if (placed === deliveries.length) map.fitBounds(bounds);
        }
      });
    });

    if (deliveries.length === 0) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(6);
    }
  }, [deliveries, mapInstance.current]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMarkerClick = async (pkg: PackageListItem, marker: any) => {
    const iw = infoWindowInstance.current;
    const map = mapInstance.current;
    if (!iw || !map) return;

    iw.setContent(buildInfoHTML(pkg));
    iw.open(map, marker);

    if (pkg.tracking_number) {
      try {
        const info = await trackingService.getTracking(pkg.tracking_number, pkg.carrier_name?.toLowerCase());
        if (info) iw.setContent(buildInfoHTML(pkg, info));
      } catch { /* ignore */ }
    }
  };

  const handleListClick = (pkg: PackageListItem) => {
    const marker = markersMap.current.get(pkg.id);
    if (marker) {
      mapInstance.current?.panTo(marker.getPosition());
      mapInstance.current?.setZoom(13);
      handleMarkerClick(pkg, marker);
    }
    setExpanded(false);
  };

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-[#0f172a]">
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.7;transform:scale(1.1);}}`}</style>

      <div ref={mapRef} className="size-full" />

      {!GOOGLE_MAPS_API_KEY && (
        <div className="absolute left-4 top-4 rounded-lg bg-card/90 px-3 py-2 text-sm text-foreground shadow backdrop-blur">
          Set VITE_GOOGLE_API_KEY to enable map
        </div>
      )}

      {loading && (
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-[#1a1f2a]/95 px-3 py-2 text-sm text-gray-300 shadow-lg backdrop-blur">
          <RefreshCw size={14} className="animate-spin" /> Loading...
        </div>
      )}

      {/* Floating delivery counter / list */}
      <div
        className="absolute right-5 top-5 z-10 min-w-[220px] max-w-[340px] rounded-xl border border-teal-500/30 bg-[#1a1f2a]/98 shadow-[0_8px_24px_rgba(0,0,0,.4)] backdrop-blur-[10px]"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-teal-500/5"
          style={{ borderBottom: expanded ? "1px solid rgba(20,184,166,.2)" : "none" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="size-2.5 rounded-full bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,.8)]" style={{ animation: "pulse 2s infinite" }} />
            <span className="text-[15px] font-semibold tracking-tight text-gray-200">Live Deliveries</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-full border border-teal-500/30 bg-teal-500/25 px-2.5 py-0.5 text-[13px] font-bold text-teal-400">
              {deliveries.length}
            </span>
            <span className="text-sm font-bold text-gray-500 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>
              ▼
            </span>
          </div>
        </button>

        {expanded && (
          <div className="max-h-[300px] overflow-y-auto py-1">
            {deliveries.map((pkg, i) => (
              <button
                key={pkg.id}
                onClick={() => handleListClick(pkg)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-teal-500/10"
                style={{ borderBottom: i < deliveries.length - 1 ? "1px solid rgba(149,165,166,.1)" : "none" }}
              >
                <div className="size-1.5 shrink-0 rounded-full bg-teal-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold tracking-tight text-gray-200">{pkg.packing_number}</div>
                  <div className="truncate text-[11px] font-medium text-gray-500">{pkg.customer_name}</div>
                </div>
                {pkg.carrier_name && (
                  <span className="shrink-0 text-[10px] font-medium text-gray-600">{pkg.carrier_name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildInfoHTML(pkg: PackageListItem, tracking?: TrackingInfo | null): string {
  const statusLabel = (tracking?.status ?? pkg.warehouse_status ?? "shipped").replace(/_/g, " ");
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
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:220px;max-width:380px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#f9fafb;">${pkg.packing_number}</div>
          <div style="font-size:12px;color:#9ca3af;">${pkg.customer_name}</div>
        </div>
        <button onclick="window.closeInfoWindow()" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:18px;padding:0 4px;">&times;</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;">
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
