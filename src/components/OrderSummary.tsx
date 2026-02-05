import React from 'react';
import { FileText } from 'lucide-react';

const OrderSummary: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <FileText size={48} style={{ color: '#79d5e9', marginBottom: '16px' }} />
    <h2>Order Summary</h2>
    <p style={{ color: '#666' }}>Order summary view - coming soon</p>
  </div>
);

export default OrderSummary;
