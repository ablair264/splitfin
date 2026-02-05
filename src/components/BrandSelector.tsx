import React from 'react';

interface BrandSelectorProps {
  selectedBrand?: string;
  onBrandSelect?: (brand: string) => void;
}

const BrandSelector: React.FC<BrandSelectorProps> = ({ selectedBrand, onBrandSelect }) => (
  <div style={{ padding: '20px' }}>
    <h3>Select Brand</h3>
    <p style={{ color: '#666' }}>Brand selection - coming soon</p>
  </div>
);

export default BrandSelector;
