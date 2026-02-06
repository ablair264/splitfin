import React from 'react';
import { ClipboardList } from 'lucide-react';

const OrderManagement: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <ClipboardList size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>Order Management</h2>
    <p className="text-muted-foreground">Manage orders - coming soon</p>
  </div>
);

export default OrderManagement;
