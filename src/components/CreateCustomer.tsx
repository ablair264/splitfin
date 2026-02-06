import React, { useState, useEffect } from 'react';
import { X, Save, Building, User, MapPin, Users } from 'lucide-react';
import { customerService } from '../services/customerService';
import { agentService } from '../services/agentService';
import type { Agent } from '../types/domain';
import { cn } from '@/lib/utils';

interface CreateCustomerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface CustomerFormData {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  mobile: string;
  agent_id: string;
  billing_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

const CreateCustomer: React.FC<CreateCustomerProps> = ({ isOpen, onClose, onCreated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [formData, setFormData] = useState<CustomerFormData>({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    mobile: '',
    agent_id: '',
    billing_address: {
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'United Kingdom',
    },
  });

  useEffect(() => {
    if (isOpen) {
      agentService.list().then(setAgents).catch(console.error);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('billing_')) {
      const field = name.replace('billing_', '');
      setFormData(prev => ({
        ...prev,
        billing_address: {
          ...prev.billing_address,
          [field]: value,
        },
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        company_name: formData.company_name,
        contact_name: formData.contact_name || null,
        email: formData.email || null,
        phone: formData.phone || null,
        mobile: formData.mobile || null,
        billing_address: formData.billing_address,
        status: 'active',
        sync_status: 'pending_push',
      };

      if (formData.agent_id) {
        payload.agent_id = formData.agent_id;
      }

      await customerService.create(payload);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setFormData({
      company_name: '',
      contact_name: '',
      email: '',
      phone: '',
      mobile: '',
      agent_id: '',
      billing_address: { street: '', city: '', state: '', zip: '', country: 'United Kingdom' },
    });
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const inputClasses = 'w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30';
  const selectClasses = 'w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground text-sm transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30 cursor-pointer';
  const labelClasses = 'block text-sm font-medium text-foreground/80 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={resetAndClose}
      />

      {/* Modal Panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-card border-b border-border rounded-t-xl">
          <h2 className="text-lg font-semibold text-foreground">New Customer</h2>
          <button
            onClick={resetAndClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Company Information */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              <Building size={14} />
              Company Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="company_name" className={labelClasses}>Company Name *</label>
                <input
                  type="text"
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleInputChange}
                  required
                  className={inputClasses}
                  placeholder="Enter company name"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="agent_id" className={labelClasses}>
                  <span className="flex items-center gap-1.5">
                    <Users size={12} className="text-brand-300" />
                    Assigned Agent
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </span>
                </label>
                <select
                  id="agent_id"
                  name="agent_id"
                  value={formData.agent_id}
                  onChange={handleInputChange}
                  className={selectClasses}
                >
                  <option value="">No agent assigned</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}{agent.is_admin ? ' (Admin)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              <User size={14} />
              Contact Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact_name" className={labelClasses}>Contact Name</label>
                <input
                  type="text"
                  id="contact_name"
                  name="contact_name"
                  value={formData.contact_name}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label htmlFor="email" className={labelClasses}>Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="email@company.com"
                />
              </div>
              <div>
                <label htmlFor="phone" className={labelClasses}>Phone</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="+44..."
                />
              </div>
              <div>
                <label htmlFor="mobile" className={labelClasses}>Mobile</label>
                <input
                  type="tel"
                  id="mobile"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="+44..."
                />
              </div>
            </div>
          </div>

          {/* Billing Address */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              <MapPin size={14} />
              Billing Address
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="billing_street" className={labelClasses}>Street Address</label>
                <input
                  type="text"
                  id="billing_street"
                  name="billing_street"
                  value={formData.billing_address.street}
                  onChange={handleInputChange}
                  className={inputClasses}
                  placeholder="123 High Street"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="billing_city" className={labelClasses}>City</label>
                  <input
                    type="text"
                    id="billing_city"
                    name="billing_city"
                    value={formData.billing_address.city}
                    onChange={handleInputChange}
                    className={inputClasses}
                    placeholder="London"
                  />
                </div>
                <div>
                  <label htmlFor="billing_state" className={labelClasses}>County</label>
                  <input
                    type="text"
                    id="billing_state"
                    name="billing_state"
                    value={formData.billing_address.state}
                    onChange={handleInputChange}
                    className={inputClasses}
                    placeholder="Greater London"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="billing_zip" className={labelClasses}>Postal Code</label>
                  <input
                    type="text"
                    id="billing_zip"
                    name="billing_zip"
                    value={formData.billing_address.zip}
                    onChange={handleInputChange}
                    className={inputClasses}
                    placeholder="SW1A 1AA"
                  />
                </div>
                <div>
                  <label htmlFor="billing_country" className={labelClasses}>Country</label>
                  <input
                    type="text"
                    id="billing_country"
                    name="billing_country"
                    value={formData.billing_address.country}
                    onChange={handleInputChange}
                    className={inputClasses}
                    placeholder="United Kingdom"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-primary-foreground rounded-lg transition-all',
                'bg-primary hover:bg-primary/90',
                loading && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Save size={16} />
              {loading ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCustomer;
