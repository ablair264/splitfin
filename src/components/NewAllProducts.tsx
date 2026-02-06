import React from 'react';
import { Package } from 'lucide-react';

const NewAllProducts: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Package size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>All Products</h2>
    <p className="text-muted-foreground">Product catalog view - coming soon</p>
  </div>
);

export default NewAllProducts;
