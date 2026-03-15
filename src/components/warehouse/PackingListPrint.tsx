// src/components/warehouse/PackingListPrint.tsx
import type { Package } from '@/services/warehouseService';

interface PackingListPrintProps {
  pkg: Package;
}

export function PackingListPrint({ pkg }: PackingListPrintProps) {
  return (
    <div className="print:block hidden">
      <style>{`
        @media print {
          body > *:not(.print-container) { display: none !important; }
          .print-container { display: block !important; padding: 20px; font-family: sans-serif; }
        }
      `}</style>
      <div className="print-container">
        <h1 style={{ fontSize: '18px', marginBottom: '4px' }}>Packing List — {pkg.packing_number}</h1>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          Order: {pkg.salesorder_number} | Customer: {pkg.customer_name}
        </p>

        {pkg.shipping_address_json && (
          <div style={{ marginBottom: '16px', fontSize: '13px' }}>
            <strong>Ship to:</strong><br />
            {[
              (pkg.shipping_address_json as any)?.address,
              (pkg.shipping_address_json as any)?.city,
              (pkg.shipping_address_json as any)?.state,
              (pkg.shipping_address_json as any)?.zip,
            ].filter(Boolean).join(', ')}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '6px' }}>SKU</th>
              <th style={{ textAlign: 'left', padding: '6px' }}>Item</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {(pkg.items || []).map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '6px', fontFamily: 'monospace' }}>{item.sku}</td>
                <td style={{ padding: '6px' }}>{item.item_name}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{item.quantity_packed}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: '24px', fontSize: '11px', color: '#999' }}>
          Printed: {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function triggerPackingListPrint(pkg: Package) {
  // Create a temporary print window
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return;

  const items = (pkg.items || []).map((i) =>
    `<tr style="border-bottom:1px solid #ddd">
      <td style="padding:6px;font-family:monospace">${i.sku}</td>
      <td style="padding:6px">${i.item_name}</td>
      <td style="padding:6px;text-align:right">${i.quantity_packed}</td>
    </tr>`
  ).join('');

  printWindow.document.write(`
    <html><head><title>Packing List - ${pkg.packing_number}</title></head><body style="font-family:sans-serif;padding:20px">
    <h1 style="font-size:18px;margin-bottom:4px">Packing List — ${pkg.packing_number}</h1>
    <p style="font-size:14px;color:#666;margin-bottom:16px">Order: ${pkg.salesorder_number} | Customer: ${pkg.customer_name}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:2px solid #000"><th style="text-align:left;padding:6px">SKU</th><th style="text-align:left;padding:6px">Item</th><th style="text-align:right;padding:6px">Qty</th></tr></thead>
    <tbody>${items}</tbody></table>
    <p style="margin-top:24px;font-size:11px;color:#999">Printed: ${new Date().toLocaleString()}</p>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.print();
}
