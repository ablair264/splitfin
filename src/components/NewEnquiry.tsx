import { useState, useEffect } from 'react';
import { X, Save, Building, Star, User } from 'lucide-react';
import { enquiryService } from '../services/enquiryService';
import { agentService } from '../services/agentService';
import type { Agent } from '../types/domain';
import { cn } from '@/lib/utils';

interface NewEnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface EnquiryFormData {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  brands_interest: string[];
  lead_source: string;
  assigned_to: string;
  priority: string;
  notes: string;
}

const emptyForm: EnquiryFormData = {
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  brands_interest: [],
  lead_source: 'website',
  assigned_to: '',
  priority: 'medium',
  notes: '',
};

export default function NewEnquiryModal({ isOpen, onClose, onCreated }: NewEnquiryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [formData, setFormData] = useState<EnquiryFormData>(emptyForm);

  useEffect(() => {
    if (isOpen) {
      loadBrands();
      loadAgents();
      setFormData(emptyForm);
      setError(null);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  const loadBrands = async () => {
    try {
      const data = await enquiryService.getBrands();
      setBrands(data);
    } catch (err) {
      console.error('Error loading brands:', err);
    }
  };

  const loadAgents = async () => {
    try {
      const data = await agentService.list();
      setAgents(data);
    } catch (err) {
      console.error('Error loading agents:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBrandToggle = (brand: string) => {
    setFormData(prev => ({
      ...prev,
      brands_interest: prev.brands_interest.includes(brand)
        ? prev.brands_interest.filter(b => b !== brand)
        : [...prev.brands_interest, brand],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.company_name.trim()) throw new Error('Company name is required');
      if (!formData.contact_name.trim()) throw new Error('Contact name is required');
      if (!formData.email.trim()) throw new Error('Email is required');
      if (formData.brands_interest.length === 0) throw new Error('Select at least one brand');

      const selectedBrands = formData.brands_interest.join(', ');

      await enquiryService.create({
        contact_name: formData.contact_name,
        company_name: formData.company_name,
        email: formData.email,
        phone: formData.phone || null,
        subject: `Enquiry from ${formData.company_name}`,
        description: formData.notes || `New enquiry from ${formData.company_name} interested in: ${selectedBrands}`,
        product_interest: selectedBrands,
        lead_source: formData.lead_source,
        assigned_to: formData.assigned_to || null,
        priority: formData.priority as 'urgent' | 'high' | 'medium' | 'low',
        status: 'new',
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create enquiry');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputClasses = 'w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30';
  const selectClasses = 'w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300/30 cursor-pointer';
  const labelClasses = 'block text-[12px] font-medium text-gray-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[84vh] bg-[#141922] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[15px] font-semibold text-white">New Enquiry</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 -mr-1.5 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="new-enquiry-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Error */}
            {error && (
              <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Company & Contact */}
            <div>
              <h3 className="flex items-center gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                <Building size={12} />
                Company & Contact
              </h3>
              <div className="space-y-3">
                <div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="contact_name" className={labelClasses}>Contact Name *</label>
                    <input
                      type="text"
                      id="contact_name"
                      name="contact_name"
                      value={formData.contact_name}
                      onChange={handleInputChange}
                      required
                      className={inputClasses}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className={labelClasses}>Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className={inputClasses}
                      placeholder="contact@company.com"
                    />
                  </div>
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
              </div>
            </div>

            {/* Brands */}
            <div>
              <h3 className="flex items-center gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                <Star size={12} />
                Brands of Interest *
              </h3>
              {brands.length === 0 ? (
                <p className="text-sm text-gray-500">Loading brands...</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {brands.map(brand => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => handleBrandToggle(brand)}
                      className={cn(
                        'px-2.5 py-1.5 rounded-md text-[12px] font-medium border transition-all',
                        formData.brands_interest.includes(brand)
                          ? 'bg-brand-300/15 border-brand-300/40 text-brand-300'
                          : 'bg-[#0f1419] border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      )}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lead Information */}
            <div>
              <h3 className="flex items-center gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                <User size={12} />
                Lead Information
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="lead_source" className={labelClasses}>Lead Source</label>
                    <select
                      id="lead_source"
                      name="lead_source"
                      value={formData.lead_source}
                      onChange={handleInputChange}
                      className={selectClasses}
                    >
                      <option value="website">Website</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="social_media">Social Media</option>
                      <option value="referral">Referral</option>
                      <option value="trade_show">Trade Show</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="assigned_to" className={labelClasses}>Assign To</label>
                    <select
                      id="assigned_to"
                      name="assigned_to"
                      value={formData.assigned_to}
                      onChange={handleInputChange}
                      className={selectClasses}
                    >
                      <option value="">Assign to me</option>
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}{agent.is_admin ? ' (Admin)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="priority" className={labelClasses}>Priority</label>
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      className={selectClasses}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="notes" className={labelClasses}>Notes</label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className={cn(inputClasses, 'resize-none')}
                    placeholder="Additional notes about this enquiry..."
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-enquiry-form"
            disabled={loading}
            className={cn(
              'flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-all',
              'bg-gradient-to-r from-brand-300 to-[#4daeac]',
              'hover:shadow-lg hover:shadow-brand-300/25',
              loading && 'opacity-60 cursor-not-allowed'
            )}
          >
            <Save size={15} />
            {loading ? 'Creating...' : 'Create Enquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}
