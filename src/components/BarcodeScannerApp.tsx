import React from 'react';
import { Scan } from 'lucide-react';

const BarcodeScannerApp: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Scan size={48} style={{ color: '#79d5e9', marginBottom: '16px' }} />
    <h2>Barcode Scanner</h2>
    <p style={{ color: '#666' }}>Barcode scanning feature - coming soon</p>
  </div>
);

export default BarcodeScannerApp;
