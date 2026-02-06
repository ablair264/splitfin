import React from 'react';
import { Database } from 'lucide-react';

const AirtableDemo: React.FC = () => (
  <div style={{ padding: '40px', textAlign: 'center' }}>
    <Database size={48} className="text-primary" style={{ marginBottom: '16px' }} />
    <h2>Airtable Demo</h2>
    <p className="text-muted-foreground">Airtable integration demo - coming soon</p>
  </div>
);

export default AirtableDemo;
