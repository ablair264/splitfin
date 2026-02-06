import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { Truck, Edit2, Trash2, Plus, MapPin, TrendingUp, Clock } from 'lucide-react';

interface Courier {
  id: string;
  name: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  service_types: string[];
  coverage_areas: string[];
  base_rate?: number;
  per_kg_rate?: number;
  express_rate?: number;
  tracking_enabled: boolean;
  api_integration_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CourierStats {
  total_shipments: number;
  delivered_shipments: number;
  pending_shipments: number;
  average_delivery_time: number;
  success_rate: number;
}

const Couriers: React.FC = () => {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [stats, setStats] = useState<Record<string, CourierStats>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    contact_email: '',
    contact_phone: '',
    website: '',
    service_types: [''],
    coverage_areas: [''],
    base_rate: '',
    per_kg_rate: '',
    express_rate: '',
    tracking_enabled: false,
    api_integration_enabled: false,
    is_active: true
  });

  useEffect(() => {
    loadCouriers();
  }, []);

  const loadCouriers = async () => {
    try {
      const agent = authService.getCachedAgent();
      if (!agent) {
        console.warn('No authenticated agent found');
        setLoading(false);
        return;
      }

      // TODO: Implement GET /api/v1/couriers backend endpoint
      console.warn('TODO: Implement GET /api/v1/couriers backend endpoint');

      // For now, return empty couriers since the couriers table doesn't exist in the new backend yet
      setCouriers([]);
      setStats({});

    } catch (error) {
      console.error('Error loading couriers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCourierStats = async (courierId: string): Promise<CourierStats> => {
    // TODO: Implement GET /api/v1/couriers/:id/stats backend endpoint
    console.warn('TODO: Implement GET /api/v1/couriers/:id/stats backend endpoint');
    return getDefaultStats();
  };

  const getDefaultStats = (): CourierStats => ({
    total_shipments: 0,
    delivered_shipments: 0,
    pending_shipments: 0,
    average_delivery_time: 0,
    success_rate: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const agent = authService.getCachedAgent();
      if (!agent) {
        console.warn('No authenticated agent found');
        return;
      }

      const courierData = {
        ...formData,
        service_types: formData.service_types.filter(type => type.trim()),
        coverage_areas: formData.coverage_areas.filter(area => area.trim()),
        base_rate: formData.base_rate ? parseFloat(formData.base_rate) : null,
        per_kg_rate: formData.per_kg_rate ? parseFloat(formData.per_kg_rate) : null,
        express_rate: formData.express_rate ? parseFloat(formData.express_rate) : null,
        updated_at: new Date().toISOString()
      };

      if (editingCourier) {
        // TODO: Implement PUT /api/v1/couriers/:id backend endpoint
        console.warn('TODO: Implement PUT /api/v1/couriers/:id backend endpoint');
        console.log('Would update courier:', editingCourier.id, courierData);
      } else {
        // TODO: Implement POST /api/v1/couriers backend endpoint
        console.warn('TODO: Implement POST /api/v1/couriers backend endpoint');
        console.log('Would create courier:', courierData);
      }

      setShowModal(false);
      setEditingCourier(null);
      resetForm();
      loadCouriers();
    } catch (error) {
      console.error('Error saving courier:', error);
    }
  };

  const handleEdit = (courier: Courier) => {
    setEditingCourier(courier);
    setFormData({
      name: courier.name,
      logo_url: courier.logo_url || '',
      contact_email: courier.contact_email || '',
      contact_phone: courier.contact_phone || '',
      website: courier.website || '',
      service_types: courier.service_types.length > 0 ? courier.service_types : [''],
      coverage_areas: courier.coverage_areas.length > 0 ? courier.coverage_areas : [''],
      base_rate: courier.base_rate?.toString() || '',
      per_kg_rate: courier.per_kg_rate?.toString() || '',
      express_rate: courier.express_rate?.toString() || '',
      tracking_enabled: courier.tracking_enabled,
      api_integration_enabled: courier.api_integration_enabled,
      is_active: courier.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this courier?')) return;

    try {
      // TODO: Implement DELETE /api/v1/couriers/:id backend endpoint
      console.warn('TODO: Implement DELETE /api/v1/couriers/:id backend endpoint');
      console.log('Would delete courier:', id);
      loadCouriers();
    } catch (error) {
      console.error('Error deleting courier:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      logo_url: '',
      contact_email: '',
      contact_phone: '',
      website: '',
      service_types: [''],
      coverage_areas: [''],
      base_rate: '',
      per_kg_rate: '',
      express_rate: '',
      tracking_enabled: false,
      api_integration_enabled: false,
      is_active: true
    });
  };

  const addServiceType = () => {
    setFormData(prev => ({
      ...prev,
      service_types: [...prev.service_types, '']
    }));
  };

  const addCoverageArea = () => {
    setFormData(prev => ({
      ...prev,
      coverage_areas: [...prev.coverage_areas, '']
    }));
  };

  const updateServiceType = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      service_types: prev.service_types.map((type, i) => i === index ? value : type)
    }));
  };

  const updateCoverageArea = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      coverage_areas: prev.coverage_areas.map((area, i) => i === index ? value : area)
    }));
  };

  const removeServiceType = (index: number) => {
    setFormData(prev => ({
      ...prev,
      service_types: prev.service_types.filter((_, i) => i !== index)
    }));
  };

  const removeCoverageArea = (index: number) => {
    setFormData(prev => ({
      ...prev,
      coverage_areas: prev.coverage_areas.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-lg text-muted-foreground">
        Loading couriers...
      </div>
    );
  }

  return (
    <div className="p-8 md:p-4 min-h-screen bg-gradient-to-br from-background via-card to-card text-foreground">
      <div className="flex flex-col md:flex-col md:items-stretch md:gap-4 sm:flex-row justify-between items-start mb-8 bg-card/90 p-8 rounded-2xl border border-primary/20 shadow-md">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2">Courier Management</h1>
          <p className="text-muted-foreground text-lg">Manage your shipping partners and their rates</p>
        </div>
        <button
          className="flex items-center gap-2 px-6 py-4 bg-primary text-primary-foreground border-none rounded-xl font-semibold cursor-pointer transition-all duration-300 shadow-md hover:-translate-y-0.5 hover:shadow-lg"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
        >
          <Plus />
          Add New Courier
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] md:grid-cols-1 gap-8">
        {couriers.map((courier) => {
          const courierStats = stats[courier.id] || getDefaultStats();

          return (
            <div
              key={courier.id}
              className={`bg-card/90 border rounded-2xl p-8 transition-all duration-300 backdrop-blur-[20px] shadow-md hover:-translate-y-0.5 hover:shadow-lg ${
                !courier.is_active
                  ? 'opacity-60 border-muted-foreground/20'
                  : 'border-primary/20 hover:border-primary/40'
              }`}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  {courier.logo_url ? (
                    <img
                      src={courier.logo_url}
                      alt={courier.name}
                      className="w-12 h-12 rounded-lg object-contain bg-foreground p-1"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-2xl">
                      <Truck />
                    </div>
                  )}
                  <div>
                    <h3 className="m-0 mb-1 text-foreground text-xl font-semibold">{courier.name}</h3>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide ${
                        courier.is_active
                          ? 'bg-success/20 text-success'
                          : 'bg-muted-foreground/20 text-muted-foreground'
                      }`}
                    >
                      {courier.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(courier)}
                    className="p-2 border-none rounded-lg cursor-pointer transition-all duration-200 text-sm bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    <Edit2 />
                  </button>
                  <button
                    onClick={() => handleDelete(courier.id)}
                    className="p-2 border-none rounded-lg cursor-pointer transition-all duration-200 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  {courier.contact_email && <p className="my-1 text-foreground text-sm">Email: {courier.contact_email}</p>}
                  {courier.contact_phone && <p className="my-1 text-foreground text-sm">Phone: {courier.contact_phone}</p>}
                  {courier.website && <p className="my-1 text-foreground text-sm">Web: {courier.website}</p>}
                </div>

                <div>
                  <h4 className="mb-3 text-primary text-sm font-semibold uppercase tracking-wide flex items-center gap-2">Services</h4>
                  <div className="flex flex-wrap gap-2">
                    {courier.service_types.map((service, index) => (
                      <span key={index} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20">
                        {service}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-primary text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
                    <MapPin /> Coverage Areas
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {courier.coverage_areas.map((area, index) => (
                      <span key={index} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-primary text-sm font-semibold uppercase tracking-wide flex items-center gap-2">Rates</h4>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-3">
                    {courier.base_rate && (
                      <span className="bg-success/10 text-success px-3 py-2 rounded-lg text-xs font-semibold text-center border border-success/20">
                        Base: {courier.base_rate.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                      </span>
                    )}
                    {courier.per_kg_rate && (
                      <span className="bg-success/10 text-success px-3 py-2 rounded-lg text-xs font-semibold text-center border border-success/20">
                        Per kg: {courier.per_kg_rate.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                      </span>
                    )}
                    {courier.express_rate && (
                      <span className="bg-success/10 text-success px-3 py-2 rounded-lg text-xs font-semibold text-center border border-success/20">
                        Express: {courier.express_rate.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-primary text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
                    <TrendingUp /> Performance
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col items-center p-3 bg-black/20 rounded-lg border border-white/10">
                      <span className="text-xl font-bold text-primary mb-1">{courierStats.total_shipments}</span>
                      <span className="text-xs text-muted-foreground text-center">Total Shipments</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/20 rounded-lg border border-white/10">
                      <span className="text-xl font-bold text-primary mb-1">{courierStats.success_rate}%</span>
                      <span className="text-xs text-muted-foreground text-center">Success Rate</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/20 rounded-lg border border-white/10">
                      <span className="text-xl font-bold text-primary mb-1">{courierStats.average_delivery_time}d</span>
                      <span className="text-xs text-muted-foreground text-center">Avg Delivery</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/20 rounded-lg border border-white/10">
                      <span className="text-xl font-bold text-primary mb-1">{courierStats.pending_shipments}</span>
                      <span className="text-xs text-muted-foreground text-center">Pending</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div>
                    <span
                      className={`text-xs px-2 py-1 rounded-lg font-medium ${
                        courier.tracking_enabled
                          ? 'bg-success/20 text-success'
                          : 'bg-muted-foreground/20 text-muted-foreground'
                      }`}
                    >
                      {courier.tracking_enabled ? 'Y' : 'N'} Tracking
                    </span>
                  </div>
                  <div>
                    <span
                      className={`text-xs px-2 py-1 rounded-lg font-medium ${
                        courier.api_integration_enabled
                          ? 'bg-success/20 text-success'
                          : 'bg-muted-foreground/20 text-muted-foreground'
                      }`}
                    >
                      {courier.api_integration_enabled ? 'Y' : 'N'} API Integration
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {couriers.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 px-8 text-center text-muted-foreground">
            <Truck size={48} />
            <h3 className="mt-4 mb-2 text-foreground text-xl">No Couriers Added</h3>
            <p className="m-0 text-base">Courier management feature is being set up. Add your first courier to start managing shipments.</p>
            <small>Note: Backend courier endpoints are not yet implemented.</small>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-8 md:p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-card rounded-2xl border border-primary/20 w-full max-w-[600px] max-h-[90vh] md:max-h-[95vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-8 py-6 border-b border-white/10">
              <h2 className="m-0 text-primary text-xl font-semibold">
                {editingCourier ? 'Edit Courier' : 'Add New Courier'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer p-1 transition-colors duration-200 hover:text-foreground"
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8">
              <div className="grid grid-cols-2 md:grid-cols-1 gap-4 mb-6">
                <div className="flex flex-col gap-2">
                  <label className="text-foreground font-medium text-sm">Courier Name*</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                    className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-foreground font-medium text-sm">Logo URL</label>
                  <input
                    type="url"
                    value={formData.logo_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                    className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-foreground font-medium text-sm">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                    className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-foreground font-medium text-sm">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-foreground font-medium text-sm">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="mb-6">
                <h3 className="mb-4 text-primary text-base font-semibold">Service Types</h3>
                {formData.service_types.map((service, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={service}
                      onChange={(e) => updateServiceType(index, e.target.value)}
                      placeholder="e.g., Next Day, Standard, Express"
                      className="flex-1 px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm"
                    />
                    {formData.service_types.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeServiceType(index)}
                        className="px-3 py-3 bg-destructive/20 border-none rounded-lg text-destructive cursor-pointer font-semibold transition-colors duration-200 hover:bg-destructive/30"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addServiceType}
                  className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-primary cursor-pointer text-sm transition-all duration-200 hover:bg-primary/20"
                >
                  + Add Service Type
                </button>
              </div>

              <div className="mb-6">
                <h3 className="mb-4 text-primary text-base font-semibold">Coverage Areas</h3>
                {formData.coverage_areas.map((area, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={area}
                      onChange={(e) => updateCoverageArea(index, e.target.value)}
                      placeholder="e.g., UK, Europe, Worldwide"
                      className="flex-1 px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm"
                    />
                    {formData.coverage_areas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCoverageArea(index)}
                        className="px-3 py-3 bg-destructive/20 border-none rounded-lg text-destructive cursor-pointer font-semibold transition-colors duration-200 hover:bg-destructive/30"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addCoverageArea}
                  className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-primary cursor-pointer text-sm transition-all duration-200 hover:bg-primary/20"
                >
                  + Add Coverage Area
                </button>
              </div>

              <div className="mb-6">
                <h3 className="mb-4 text-primary text-base font-semibold">Rates</h3>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-foreground font-medium text-sm">Base Rate (GBP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.base_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, base_rate: e.target.value }))}
                      className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-foreground font-medium text-sm">Per KG Rate (GBP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.per_kg_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, per_kg_rate: e.target.value }))}
                      className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-foreground font-medium text-sm">Express Rate (GBP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.express_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, express_rate: e.target.value }))}
                      className="px-3 py-3 bg-black/30 border border-white/10 rounded-lg text-foreground text-sm transition-colors duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="mb-4 text-primary text-base font-semibold">Settings</h3>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 text-foreground cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={formData.tracking_enabled}
                      onChange={(e) => setFormData(prev => ({ ...prev, tracking_enabled: e.target.checked }))}
                      className="m-0 scale-125 accent-primary"
                    />
                    Tracking Enabled
                  </label>

                  <label className="flex items-center gap-3 text-foreground cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={formData.api_integration_enabled}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_integration_enabled: e.target.checked }))}
                      className="m-0 scale-125 accent-primary"
                    />
                    API Integration Enabled
                  </label>

                  <label className="flex items-center gap-3 text-foreground cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="m-0 scale-125 accent-primary"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="flex gap-4 justify-end pt-6 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 border border-muted-foreground/20 rounded-lg font-semibold cursor-pointer transition-all duration-200 text-sm bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 border-none rounded-lg font-semibold cursor-pointer transition-all duration-200 text-sm bg-primary text-primary-foreground shadow-md hover:-translate-y-px hover:shadow-lg"
                >
                  {editingCourier ? 'Update Courier' : 'Add Courier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Couriers;
