import React from 'react';

interface FixOrderProps {
  orderId?: string;
}

const FixOrder: React.FC<FixOrderProps> = ({ orderId }) => {
  return (
    <div style={{ padding: '20px' }}>
      <h3>Fix Order</h3>
      <p>Order repair tool - coming soon</p>
      {orderId && <p>Order ID: {orderId}</p>}
    </div>
  );
};

export default FixOrder;
