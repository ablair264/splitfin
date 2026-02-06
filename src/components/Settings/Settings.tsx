import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/authService';
import { ArrowLeft } from 'lucide-react';
import { ProgressLoader } from '../ProgressLoader';
import FixOrder from '../FixOrder';

export default function Settings() {
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const agent = authService.getCachedAgent();

        if (!agent) {
          navigate('/login');
          return;
        }

        setUserRole(agent.is_admin ? 'Admin' : 'Sales Agent');
        setUserName(agent.name || agent.id);
        setUserEmail(''); // Not available in agent model
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [navigate]);

  // Get the current settings tab from the URL
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes('/settings/general')) return 'general';
    if (path.includes('/settings/profile')) return 'profile';
    if (path.includes('/settings/notifications')) return 'notifications';
    if (path.includes('/settings/database')) return 'database';
    if (path.includes('/settings/security')) return 'security';
    if (path.includes('/settings/fix-order')) return 'fix-order';
    return 'general'; // default
  };

  const currentTab = getCurrentTab();

  if (loading) {
    return (
      <ProgressLoader
        isVisible={true}
        message="Loading settings..."
        progress={50}
      />
    );
  }

  // Redirect to general settings if no specific tab is selected
  if (location.pathname === '/settings') {
    navigate('/settings/general');
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center gap-4 p-8 bg-card border-b border-foreground/10">
        <button
          className="flex items-center gap-2 bg-foreground/10 border border-foreground/20 rounded-lg px-3 py-2 text-foreground cursor-pointer transition-all duration-200 hover:bg-foreground/15 hover:border-foreground/30"
          onClick={() => navigate(-1)}
          title="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="m-0 text-3xl font-semibold">Settings - {currentTab.charAt(0).toUpperCase() + currentTab.slice(1)}</h1>
      </div>

      <div className="flex min-h-[calc(100vh-100px)] flex-col md:flex-row">
        <div className="flex-1 p-8 md:p-8 max-sm:p-4 overflow-y-auto">
          <div className="max-w-[900px]">
            <div className="bg-card rounded-xl p-8 max-sm:p-6">
              {currentTab === 'general' && <GeneralSettings userName={userName} userEmail={userEmail} userRole={userRole} />}
              {currentTab === 'profile' && (
                <ProfileSettings
                  userName={userName}
                  onProfileUpdate={(name) => setUserName(name)}
                  savingProfile={savingProfile}
                  setSavingProfile={setSavingProfile}
                />
              )}
              {currentTab === 'notifications' && <NotificationSettings />}
              {currentTab === 'database' && userRole === 'Admin' && <DatabaseSettings />}
              {currentTab === 'security' && <SecuritySettings />}
              {currentTab === 'fix-order' && userRole === 'Admin' && <FixOrder />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// General Settings Component
function GeneralSettings({ userName, userEmail, userRole }: { userName: string; userEmail: string; userRole: string }) {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Account Information</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 max-sm:grid-cols-1">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground uppercase tracking-wide">Name</label>
            <p className="m-0 text-base text-foreground">{userName || 'Not set'}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground uppercase tracking-wide">Email</label>
            <p className="m-0 text-base text-foreground">{userEmail}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground uppercase tracking-wide">Role</label>
            <p className="m-0 inline-block px-3 py-1 bg-primary/20 text-primary rounded text-[0.9rem] capitalize">{userRole || 'User'}</p>
          </div>
        </div>
      </div>

      {/* Admin Tools Section */}
      {userRole === 'Admin' && (
        <div className="mb-10 last:mb-0">
          <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Management Tools</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 max-sm:grid-cols-1">
            <button
              className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:bg-foreground/[0.08] hover:border-foreground/20 hover:-translate-y-0.5"
              onClick={() => navigate('/settings/fix-order')}
            >
              <span className="text-2xl text-primary">&#128295;</span>
              <span className="text-base font-medium">Fix Order</span>
              <small className="text-xs text-muted-foreground">Edit and re-submit orders to Zoho</small>
            </button>
          </div>
        </div>
      )}

      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Application Preferences</h3>
        <div className="flex items-center justify-between py-4 border-b border-foreground/5 max-sm:flex-col max-sm:items-start max-sm:gap-4">
          <div>
            <h4 className="m-0 mb-1 text-base text-foreground">Theme</h4>
            <p className="m-0 text-sm text-muted-foreground">Choose your preferred color theme</p>
          </div>
          <select className="px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-md text-foreground text-[0.9rem] cursor-pointer" defaultValue="dark">
            <option value="dark">Dark</option>
            <option value="light">Light (Coming soon)</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-4 border-b-0 pb-0 max-sm:flex-col max-sm:items-start max-sm:gap-4">
          <div>
            <h4 className="m-0 mb-1 text-base text-foreground">Language</h4>
            <p className="m-0 text-sm text-muted-foreground">Select your preferred language</p>
          </div>
          <select className="px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-md text-foreground text-[0.9rem] cursor-pointer" defaultValue="en">
            <option value="en">English</option>
            <option value="es">Spanish (Coming soon)</option>
            <option value="fr">French (Coming soon)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// Profile Settings Component
function ProfileSettings({
  userName,
  onProfileUpdate,
  savingProfile,
  setSavingProfile
}: {
  userName: string;
  onProfileUpdate: (name: string) => void;
  savingProfile: boolean;
  setSavingProfile: (saving: boolean) => void;
}) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    department: ''
  });

  useEffect(() => {
    // Initialize form with current user name
    const names = userName.split(' ');
    setFormData({
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      phone: '',
      department: ''
    });
  }, [userName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);

    try {
      // Profile editing not yet supported via API
      onProfileUpdate(`${formData.firstName} ${formData.lastName}`.trim());
      alert('Profile update saved locally. Backend support coming soon.');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div>
      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Profile Information</h3>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor="firstName" className="text-[0.9rem] text-foreground font-medium">First Name</label>
            <input
              type="text"
              id="firstName"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="Enter your first name"
              className="px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-md text-foreground text-[0.95rem] transition-all duration-200 focus:outline-none focus:border-primary focus:bg-foreground/[0.08]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="lastName" className="text-[0.9rem] text-foreground font-medium">Last Name</label>
            <input
              type="text"
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Enter your last name"
              className="px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-md text-foreground text-[0.95rem] transition-all duration-200 focus:outline-none focus:border-primary focus:bg-foreground/[0.08]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className="text-[0.9rem] text-foreground font-medium">Phone Number</label>
            <input
              type="tel"
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Enter your phone number"
              className="px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-md text-foreground text-[0.95rem] transition-all duration-200 focus:outline-none focus:border-primary focus:bg-foreground/[0.08]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="department" className="text-[0.9rem] text-foreground font-medium">Department</label>
            <input
              type="text"
              id="department"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              placeholder="Enter your department"
              className="px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-md text-foreground text-[0.95rem] transition-all duration-200 focus:outline-none focus:border-primary focus:bg-foreground/[0.08]"
            />
          </div>

          <button
            type="submit"
            className="self-start px-8 py-3 bg-primary text-white border-none rounded-lg text-base font-medium cursor-pointer transition-all duration-200 hover:brightness-90 hover:-translate-y-px hover:shadow-[0_4px_12px_var(--primary)/30] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={savingProfile}
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Notification Settings Component
function NotificationSettings() {
  const [notifications, setNotifications] = useState({
    orderUpdates: true,
    newCustomers: true,
    lowInventory: false,
    dailyReports: true,
    weeklyReports: false
  });

  const handleToggle = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <label className="relative inline-block w-12 h-6">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="opacity-0 w-0 h-0 peer"
      />
      <span className="absolute cursor-pointer inset-0 bg-foreground/10 rounded-full transition-colors duration-300 before:absolute before:content-[''] before:h-[18px] before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-muted-foreground before:rounded-full before:transition-all before:duration-300 peer-checked:bg-primary peer-checked:before:translate-x-6 peer-checked:before:bg-white" />
    </label>
  );

  return (
    <div>
      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Email Notifications</h3>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-foreground/[0.03] rounded-lg transition-all duration-200 hover:bg-foreground/5">
            <div>
              <h4 className="m-0 mb-1 text-[0.95rem] text-foreground">Order Updates</h4>
              <p className="m-0 text-sm text-muted-foreground">Receive notifications when order status changes</p>
            </div>
            <ToggleSwitch checked={notifications.orderUpdates} onChange={() => handleToggle('orderUpdates')} />
          </div>

          <div className="flex items-center justify-between p-4 bg-foreground/[0.03] rounded-lg transition-all duration-200 hover:bg-foreground/5">
            <div>
              <h4 className="m-0 mb-1 text-[0.95rem] text-foreground">New Customers</h4>
              <p className="m-0 text-sm text-muted-foreground">Get notified when new customers are added</p>
            </div>
            <ToggleSwitch checked={notifications.newCustomers} onChange={() => handleToggle('newCustomers')} />
          </div>

          <div className="flex items-center justify-between p-4 bg-foreground/[0.03] rounded-lg transition-all duration-200 hover:bg-foreground/5">
            <div>
              <h4 className="m-0 mb-1 text-[0.95rem] text-foreground">Low Inventory Alerts</h4>
              <p className="m-0 text-sm text-muted-foreground">Alerts when inventory falls below threshold</p>
            </div>
            <ToggleSwitch checked={notifications.lowInventory} onChange={() => handleToggle('lowInventory')} />
          </div>
        </div>
      </div>

      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Report Emails</h3>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-foreground/[0.03] rounded-lg transition-all duration-200 hover:bg-foreground/5">
            <div>
              <h4 className="m-0 mb-1 text-[0.95rem] text-foreground">Daily Reports</h4>
              <p className="m-0 text-sm text-muted-foreground">Receive daily sales and activity reports</p>
            </div>
            <ToggleSwitch checked={notifications.dailyReports} onChange={() => handleToggle('dailyReports')} />
          </div>

          <div className="flex items-center justify-between p-4 bg-foreground/[0.03] rounded-lg transition-all duration-200 hover:bg-foreground/5">
            <div>
              <h4 className="m-0 mb-1 text-[0.95rem] text-foreground">Weekly Summary</h4>
              <p className="m-0 text-sm text-muted-foreground">Get weekly performance summaries</p>
            </div>
            <ToggleSwitch checked={notifications.weeklyReports} onChange={() => handleToggle('weeklyReports')} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Database Settings Component - Admin only
function DatabaseSettings() {
  const [activeTab, setActiveTab] = useState<'maintenance' | 'export'>('maintenance');

  return (
    <div>
      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Database Management</h3>
        <p className="text-muted-foreground m-0 mb-6 leading-relaxed">
          Manage database operations and maintenance tasks. These operations should be performed during off-peak hours.
          <br /><small className="text-muted-foreground mt-2 block">Access restricted to Admins</small>
        </p>
      </div>

      {/* Database Tools Tabs */}
      <div className="mb-10 last:mb-0">
        <div className="flex gap-2 mb-6 bg-foreground/[0.03] p-1 rounded-lg">
          <button
            className={`flex-1 py-3 px-4 border-none rounded-md text-[0.9rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap ${
              activeTab === 'maintenance'
                ? 'bg-primary text-white hover:brightness-90'
                : 'bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            }`}
            onClick={() => setActiveTab('maintenance')}
          >
            Database Maintenance
          </button>
          <button
            className={`flex-1 py-3 px-4 border-none rounded-md text-[0.9rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap ${
              activeTab === 'export'
                ? 'bg-primary text-white hover:brightness-90'
                : 'bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            }`}
            onClick={() => setActiveTab('export')}
          >
            Data Export
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'maintenance' && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 max-sm:grid-cols-1">
            <button className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:enabled:bg-foreground/[0.08] hover:enabled:border-foreground/20 hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-primary" onClick={() => alert('Feature coming soon')}>
              <span className="text-2xl text-primary">&#128295;</span>
              <span className="text-base font-medium">Optimize Tables</span>
              <small className="text-xs text-muted-foreground">Improve database performance</small>
            </button>

            <button className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:enabled:bg-foreground/[0.08] hover:enabled:border-foreground/20 hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-primary" onClick={() => alert('Feature coming soon')}>
              <span className="text-2xl text-primary">&#128465;&#65039;</span>
              <span className="text-base font-medium">Clean Up Data</span>
              <small className="text-xs text-muted-foreground">Remove old records</small>
            </button>

            <button className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:enabled:bg-foreground/[0.08] hover:enabled:border-foreground/20 hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-primary" onClick={() => alert('Feature coming soon')}>
              <span className="text-2xl text-primary">&#9851;&#65039;</span>
              <span className="text-base font-medium">Rebuild Indexes</span>
              <small className="text-xs text-muted-foreground">Optimize query performance</small>
            </button>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 max-sm:grid-cols-1">
            <button className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:enabled:bg-foreground/[0.08] hover:enabled:border-foreground/20 hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-primary" onClick={() => alert('Feature coming soon')}>
              <span className="text-2xl text-primary">&#128202;</span>
              <span className="text-base font-medium">Export Orders</span>
              <small className="text-xs text-muted-foreground">Download order data</small>
            </button>

            <button className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:enabled:bg-foreground/[0.08] hover:enabled:border-foreground/20 hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-primary" onClick={() => alert('Feature coming soon')}>
              <span className="text-2xl text-primary">&#128101;</span>
              <span className="text-base font-medium">Export Customers</span>
              <small className="text-xs text-muted-foreground">Download customer data</small>
            </button>

            <button className="flex flex-col items-center gap-2 py-8 px-4 bg-foreground/5 border border-foreground/10 rounded-lg text-foreground cursor-pointer transition-all duration-200 text-center hover:enabled:bg-foreground/[0.08] hover:enabled:border-foreground/20 hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-primary" onClick={() => alert('Feature coming soon')}>
              <span className="text-2xl text-primary">&#128230;</span>
              <span className="text-base font-medium">Export Inventory</span>
              <small className="text-xs text-muted-foreground">Download inventory data</small>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Security Settings Component
function SecuritySettings() {
  const handlePinChange = () => {
    alert('PIN change functionality coming soon. Contact an admin to reset your PIN.');
  };

  return (
    <div>
      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">PIN Authentication</h3>
        <p className="text-muted-foreground m-0 mb-6 leading-relaxed">
          Your account uses a PIN for authentication.
        </p>
        <button
          className="px-6 py-3 bg-primary text-white border-none rounded-lg text-[0.95rem] font-medium cursor-pointer transition-all duration-200 hover:enabled:brightness-90 hover:enabled:-translate-y-px hover:enabled:shadow-[0_4px_12px_var(--primary)/30] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handlePinChange}
        >
          Change PIN
        </button>
      </div>

      <div className="mb-10 last:mb-0">
        <h3 className="m-0 mb-4 text-lg font-semibold text-foreground">Active Sessions</h3>
        <p className="text-muted-foreground m-0 mb-6 leading-relaxed">
          View and manage your active sessions across different devices.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-4 bg-foreground/[0.03] rounded-lg">
            <div>
              <h4 className="m-0 mb-1 text-[0.95rem] text-foreground">Current Session</h4>
              <p className="m-0 text-sm text-muted-foreground">Active now</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
