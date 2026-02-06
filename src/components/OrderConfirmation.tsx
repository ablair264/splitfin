import React from 'react';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OrderConfirmation: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <CheckCircle size={64} className="text-success" style={{ marginBottom: '16px' }} />
      <h2>Order Confirmed!</h2>
      <p className="text-muted-foreground" style={{ marginBottom: '24px' }}>Your order has been successfully placed.</p>
      <button
        onClick={() => navigate('/orders')}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        style={{
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
