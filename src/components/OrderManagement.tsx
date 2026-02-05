import React from 'react';
import { ClipboardList } from 'lucide-react';

const OrderManagement: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <ClipboardList size={48} style={{ color: '#79d5e9', marginBottom: '16px' }} />
    <h2>Order Management</h2>
    <p style={{ color: '#666' }}>Manage orders - coming soon</p>
  </div>
);

export default OrderManagement;
