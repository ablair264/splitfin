import React from 'react';
import { Scan } from 'lucide-react';

const BarcodeScannerApp: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Scan size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>Barcode Scanner</h2>
    <p className="text-muted-foreground">Barcode scanning feature - coming soon</p>
  </div>
);

export default BarcodeScannerApp;
