import React from 'react';
import { Book } from 'lucide-react';

const CataloguesLanding: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Book size={48} style={{ color: '#79d5e9', marginBottom: '16px' }} />
    <h2>Catalogues</h2>
    <p style={{ color: '#666' }}>Product catalogues - coming soon</p>
  </div>
);

export default CataloguesLanding;
