import React from 'react';
import { Book } from 'lucide-react';

const CataloguesLanding: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Book size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>Catalogues</h2>
    <p className="text-muted-foreground">Product catalogues - coming soon</p>
  </div>
);

export default CataloguesLanding;
