import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const OrderDetail: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  
  return (
    <div style={{ padding: '24px' }}>
      <button 
        onClick={() => navigate('/orders')}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px' }}
      >
        <ArrowLeft size={20} /> Back to Orders
      </button>
      <h2>Order Details</h2>
      <p style={{ color: '#666' }}>Order #{orderId}</p>
    </div>
  );
};

export default OrderDetail;
