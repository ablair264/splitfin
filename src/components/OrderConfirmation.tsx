import React from 'react';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OrderConfirmation: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <CheckCircle size={64} style={{ color: '#22c55e', marginBottom: '16px' }} />
      <h2>Order Confirmed!</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>Your order has been successfully placed.</p>
      <button 
        onClick={() => navigate('/orders')}
        style={{
          background: 'linear-gradient(135deg, #79d5e9 0%, #4daeac 100%)',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        View Orders
      </button>
    </div>
  );
};

export default OrderConfirmation;
