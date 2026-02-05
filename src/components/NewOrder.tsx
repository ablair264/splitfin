import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart } from 'lucide-react';

const NewOrder: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div style={{ padding: '24px' }}>
      <button 
        onClick={() => navigate('/orders')}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px' }}
      >
        <ArrowLeft size={20} /> Back to Orders
      </button>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <ShoppingCart size={48} style={{ color: '#79d5e9', marginBottom: '16px' }} />
        <h2>Create New Order</h2>
        <p style={{ color: '#666' }}>Order creation form - coming soon</p>
      </div>
    </div>
  );
};

export default NewOrder;
