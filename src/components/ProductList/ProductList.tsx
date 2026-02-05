import React from 'react';
import { Package } from 'lucide-react';

const ProductList: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Package size={48} style={{ color: '#79d5e9', marginBottom: '16px' }} />
    <h2>Product List</h2>
    <p style={{ color: '#666' }}>Product listing - coming soon</p>
  </div>
);

export default ProductList;
