import React from 'react';
import { FileText } from 'lucide-react';

const OrderSummary: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <FileText size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>Order Summary</h2>
    <p className="text-muted-foreground">Order summary view - coming soon</p>
  </div>
);

export default OrderSummary;
