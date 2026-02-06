import React from 'react';
import { Package } from 'lucide-react';

const ProductList: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Package size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>Product List</h2>
    <p className="text-muted-foreground">Product listing - coming soon</p>
  </div>
);

export default ProductList;
