// src/services/trackingService.ts
import { API_BASE_URL } from '../config/api';

export interface TrackingInfo {
  tracking_number: string;
  courier_code?: string;
  status: string;
  status_info?: string;
  latest_event?: string;
  origin?: string;
  destination?: string;
  delivery_date?: string;
  signed_by?: string;
  weight?: string;
  tracking_events?: TrackingEvent[];
  last_updated?: string;
}

export interface TrackingEvent {
  date_time: string;
  status: string;
  description: string;
  location?: string;
  details?: string;
}

export interface CourierInfo {
  code: string;
  name: string;
  country?: string;
  url?: string;
}

const TRACKINGMORE_PROXY = `${API_BASE_URL}/api/trackingmore-proxy`;
const UPS_PROXY_BASE = `${API_BASE_URL}/api/tracking/ups`;
const ROYALMAIL_PROXY_BASE = `${API_BASE_URL}/api/tracking/royalmail`;

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// UPS tracking number patterns
const UPS_PATTERNS = [
  /^1Z[A-Z0-9]{16}$/i,
  /^T\d{10}$/,
  /^\d{9,12}$/,
];

function isUPSTrackingNumber(tn: string): boolean {
  return UPS_PATTERNS.some((p) => p.test(tn));
}

// Royal Mail / Parcelforce patterns
const RM_PATTERNS = [
  /^[A-Z]{2}\d{9}[A-Z]{2}$/i,
  /^JV\d+GB$/i,
  /^[A-Z]{2}\d+[A-Z]{2}$/i,
  /^(JD|JJD)\d{8,}$/i,
];

function isRoyalMailTrackingNumber(tn: string): boolean {
  return RM_PATTERNS.some((p) => p.test(tn));
}

function isUPSCourier(code?: string, name?: string): boolean {
  const ids = ['ups', 'united-parcel-service', 'united parcel service'];
  const c = code?.toLowerCase() ?? '';
  const n = name?.toLowerCase() ?? '';
  return ids.some((id) => c.includes(id) || n.includes(id));
}

function isRoyalMailCourier(code?: string, name?: string): boolean {
  const ids = ['royal-mail', 'royal mail', 'parcelforce', 'parcel force'];
  const c = code?.toLowerCase() ?? '';
  const n = name?.toLowerCase() ?? '';
  return ids.some((id) => c.includes(id) || n.includes(id));
}

function mapTrackingStatus(deliveryStatus?: string): string {
  if (!deliveryStatus) return 'unknown';
  const m: Record<string, string> = {
    pending: 'pending',
    notfound: 'not_found',
    transit: 'in_transit',
    pickup: 'picked_up',
    delivered: 'delivered',
    expired: 'expired',
    undelivered: 'failed',
    exception: 'exception',
    InfoReceived: 'info_received',
  };
  return m[deliveryStatus] || deliveryStatus.toLowerCase();
}

function parseISODate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch { /* ignore */ }
  return new Date().toISOString();
}

function mapTrackingEvents(events?: unknown[]): TrackingEvent[] {
  if (!events || !Array.isArray(events)) return [];
  return (events as Record<string, unknown>[]).map((ev) => ({
    date_time: parseISODate(
      (ev.checkpoint_date ?? ev.Date ?? ev.checkpoint_time) as string | undefined,
    ),
    status: String(ev.checkpoint_status ?? ev.StatusDescription ?? ev.substatus ?? ''),
    description: String(ev.message ?? ev.Details ?? ev.status ?? ''),
    location: (ev.location ?? ev.checkpoint_location ?? ev.city) as string | undefined,
    details: (ev.tracking_detail ?? ev.details) as string | undefined,
  })).sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime());
}

function formatUPSDateTime(date?: string, time?: string): string {
  if (!date) return '';
  if (date.length === 8 && time && time.length === 6) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  }
  return time ? `${date} ${time}` : date;
}

function formatUPSLocation(addr?: Record<string, string>): string {
  if (!addr) return '';
  return [addr.city, addr.stateProvince, addr.postalCode, addr.country].filter(Boolean).join(', ');
}

function mapUPSStatus(code?: string): string {
  if (!code) return 'unknown';
  const m: Record<string, string> = {
    D: 'delivered', I: 'in_transit', M: 'in_transit', P: 'picked_up',
    X: 'exception', RS: 'returned', DO: 'delivered', DD: 'delivered',
    W: 'in_transit', NA: 'not_available', O: 'out_for_delivery',
  };
  return m[code] || 'in_transit';
}

class TrackingService {
  private cache = new Map<string, { data: TrackingInfo; timestamp: number }>();
  private pending = new Map<string, Promise<TrackingInfo | null>>();
  private readonly CACHE_MS = 15 * 60 * 1000;

  /** Primary entry point */
  async getTracking(trackingNumber: string, courierCodeOrSlug?: string): Promise<TrackingInfo | null> {
    const cached = this.cache.get(trackingNumber);
    if (cached && Date.now() - cached.timestamp < this.CACHE_MS) return cached.data;

    const key = `${trackingNumber}-${courierCodeOrSlug ?? 'auto'}`;
    if (this.pending.has(key)) return this.pending.get(key)!;

    const promise = this._resolve(trackingNumber, courierCodeOrSlug);
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }

  private async _resolve(tn: string, codeOrSlug?: string): Promise<TrackingInfo | null> {
    try {
      // 1. UPS by tracking number format
      if (isUPSTrackingNumber(tn)) return this._trackUPS(tn);

      // 2. Royal Mail by tracking number format
      if (isRoyalMailTrackingNumber(tn)) return this._trackRoyalMail(tn);

      // 3. If a courier code/slug was provided, route accordingly
      if (codeOrSlug) {
        if (isUPSCourier(codeOrSlug)) return this._trackUPS(tn);
        if (isRoyalMailCourier(codeOrSlug)) {
          const carrier = codeOrSlug.includes('parcelforce') ? 'parcelforce' : 'royal-mail';
          return this._trackRoyalMail(tn, carrier);
        }
        // Generic TrackingMore
        return this._trackViaTrackingMore(tn, codeOrSlug);
      }

      // 4. Auto-detect courier
      const detected = await this.detectCourier(tn);
      if (detected) {
        if (isUPSCourier(detected.code)) return this._trackUPS(tn);
        if (isRoyalMailCourier(detected.code, detected.name)) {
          const carrier = detected.code.includes('parcelforce') ? 'parcelforce' : 'royal-mail';
          return this._trackRoyalMail(tn, carrier);
        }
        return this._trackViaTrackingMore(tn, detected.code);
      }

      return null;
    } catch (err) {
      console.error('trackingService error:', err);
      return null;
    }
  }

  /** UPS via backend proxy */
  private async _trackUPS(tn: string): Promise<TrackingInfo | null> {
    try {
      const resp = await fetch(`${UPS_PROXY_BASE}/track?tracking=${encodeURIComponent(tn)}`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const pkg = data?.trackResponse?.shipment?.[0]?.package?.[0];
      if (!pkg) return null;

      const activities: Record<string, unknown>[] = pkg.activity ?? [];
      const events: TrackingEvent[] = activities.map((a: Record<string, unknown>) => ({
        date_time: formatUPSDateTime(a.date as string, a.time as string),
        status: ((a.status as Record<string, string>)?.type) ?? '',
        description: ((a.status as Record<string, string>)?.description) ?? '',
        location: formatUPSLocation((a.location as Record<string, Record<string, string>>)?.address),
        details: ((a.status as Record<string, string>)?.code),
      }));

      let deliveryDate: string | undefined;
      const rawDate = pkg.deliveryDate?.[0]?.date;
      if (rawDate?.length === 8) {
        deliveryDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      }

      const info: TrackingInfo = {
        tracking_number: tn,
        courier_code: 'ups',
        status: mapUPSStatus(pkg.currentStatus?.code),
        status_info: pkg.currentStatus?.description,
        latest_event: activities[0] ? ((activities[0].status as Record<string, string>)?.description) : undefined,
        origin: activities.length ? formatUPSLocation((activities[activities.length - 1].location as Record<string, Record<string, string>>)?.address) : undefined,
        destination: activities.length ? formatUPSLocation((activities[0].location as Record<string, Record<string, string>>)?.address) : undefined,
        delivery_date: deliveryDate,
        weight: pkg.weight ? `${pkg.weight.weight} ${pkg.weight.unitOfMeasurement}` : undefined,
        tracking_events: events,
        last_updated: new Date().toISOString(),
      };
      this.cache.set(tn, { data: info, timestamp: Date.now() });
      return info;
    } catch (err) {
      console.error('UPS tracking error:', err);
      return null;
    }
  }

  /** Royal Mail via backend proxy */
  private async _trackRoyalMail(tn: string, carrier: string = 'royal-mail'): Promise<TrackingInfo | null> {
    try {
      const url = `${ROYALMAIL_PROXY_BASE}/track?tracking=${encodeURIComponent(tn)}&carrier=${encodeURIComponent(carrier)}`;
      const resp = await fetch(url, { headers: getAuthHeaders() });
      if (!resp.ok) return null;
      const raw = await resp.json();

      // Find events in various API shapes
      let events: Record<string, unknown>[] = [];
      if (Array.isArray(raw.events)) events = raw.events;
      else if (raw.mailPieces?.events?.events) events = raw.mailPieces.events.events;
      else if (Array.isArray(raw.parcels) && raw.parcels[0]?.events) events = raw.parcels[0].events;
      else if (Array.isArray(raw.trackingEvents)) events = raw.trackingEvents;
      // TrackingMore format
      else if (raw.data && Array.isArray(raw.data)) {
        const t = raw.data[0];
        if (t?.tracking_details || t?.checkpoints) {
          events = t.tracking_details ?? t.checkpoints ?? [];
        }
      }

      const trackingEvents: TrackingEvent[] = events.map((ev) => {
        const dt = (ev.eventDateTime ?? ev.dateTime ?? ev.date_time ?? ev.timestamp ?? ev.date ?? ev.checkpoint_time) as string;
        const desc = (ev.eventDescription ?? ev.description ?? ev.event ?? ev.status ?? ev.message) as string;
        const loc = ev.location as string | Record<string, string> | undefined;
        const locStr = typeof loc === 'object' && loc !== null ? (loc as Record<string, string>).name : (loc ?? ev.eventLocation ?? ev.city) as string | undefined;

        return {
          date_time: parseISODate(dt as string),
          status: String(ev.eventCode ?? ev.code ?? ev.status ?? desc ?? ''),
          description: String(desc ?? ''),
          location: locStr ? String(locStr) : undefined,
        };
      }).sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime());

      const topDesc = trackingEvents[0]?.description?.toLowerCase() ?? '';
      let status = 'in_transit';
      if (topDesc.includes('deliver') && !topDesc.includes('attempt')) status = 'delivered';
      if (topDesc.includes('attempt') || topDesc.includes('exception')) status = 'exception';

      const info: TrackingInfo = {
        tracking_number: tn,
        courier_code: carrier,
        status,
        status_info: trackingEvents[0]?.description,
        latest_event: trackingEvents[0]?.description,
        delivery_date: raw.deliveryDate ?? raw.actualDeliveryDate ?? raw.deliveredAt,
        tracking_events: trackingEvents,
        last_updated: new Date().toISOString(),
      };
      this.cache.set(tn, { data: info, timestamp: Date.now() });
      return info;
    } catch (err) {
      console.error('Royal Mail tracking error:', err);
      return null;
    }
  }

  /** TrackingMore via backend proxy */
  private async _trackViaTrackingMore(tn: string, courierCode: string): Promise<TrackingInfo | null> {
    try {
      // Ensure tracking is created first
      await fetch(`${TRACKINGMORE_PROXY}?action=create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tracking_number: tn, courier_code: courierCode }),
      });

      const url = `${TRACKINGMORE_PROXY}?action=get&tracking_numbers=${encodeURIComponent(tn)}&courier_code=${encodeURIComponent(courierCode)}`;
      const resp = await fetch(url, { headers: getAuthHeaders() });
      if (!resp.ok) return null;
      const result = await resp.json();

      if (result.data?.[0]) {
        const t = result.data[0];
        const info: TrackingInfo = {
          tracking_number: t.tracking_number,
          courier_code: t.courier_code,
          status: mapTrackingStatus(t.delivery_status),
          status_info: t.substatus,
          latest_event: t.latest_event,
          origin: t.origin_info?.country,
          destination: t.destination_info?.country,
          delivery_date: t.delivery_date,
          signed_by: t.signed_by,
          weight: t.weight,
          tracking_events: mapTrackingEvents(t.tracking_details ?? t.checkpoints),
          last_updated: new Date().toISOString(),
        };
        this.cache.set(tn, { data: info, timestamp: Date.now() });
        return info;
      }
      return null;
    } catch (err) {
      console.error('TrackingMore error:', err);
      return null;
    }
  }

  /** Auto-detect courier from tracking number */
  async detectCourier(tn: string): Promise<CourierInfo | null> {
    if (isUPSTrackingNumber(tn)) return { code: 'ups', name: 'UPS', country: 'US' };
    if (isRoyalMailTrackingNumber(tn)) return { code: 'royal-mail', name: 'Royal Mail', country: 'UK' };

    try {
      const resp = await fetch(`${TRACKINGMORE_PROXY}?action=detect`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tracking_number: tn }),
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.data?.[0]) return result.data[0];
      }
    } catch { /* ignore */ }
    return null;
  }

  /** Get a tracking URL for a given tracking number and courier */
  getTrackingUrl(tn: string, courierCode?: string): string {
    if (isUPSCourier(courierCode) || isUPSTrackingNumber(tn)) {
      return `https://www.ups.com/track?loc=en_GB&tracknum=${tn}`;
    }
    if (courierCode === 'parcelforce') {
      return `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(tn)}`;
    }
    if (isRoyalMailCourier(courierCode) || isRoyalMailTrackingNumber(tn)) {
      return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tn)}`;
    }
    return `https://www.trackingmore.com/en/${tn}`;
  }

  /** Common couriers list for dropdowns */
  getCommonCouriers(): CourierInfo[] {
    return [
      { code: 'ups', name: 'UPS' },
      { code: 'dhl', name: 'DHL' },
      { code: 'fedex', name: 'FedEx' },
      { code: 'royal-mail', name: 'Royal Mail' },
      { code: 'parcelforce', name: 'Parcelforce' },
      { code: 'dpd-uk', name: 'DPD UK' },
      { code: 'hermes-uk', name: 'Evri (Hermes)' },
      { code: 'yodel', name: 'Yodel' },
    ];
  }

  /** Clear cache for a specific tracking number */
  clearCache(tn?: string): void {
    if (tn) this.cache.delete(tn);
    else this.cache.clear();
  }
}

export const trackingService = new TrackingService();
