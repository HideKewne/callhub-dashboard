import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { StateSelector } from '../components/StateSelector';
import { supabase } from '../lib/supabase';
import './Settings.css';

type TabId = 'profile' | 'licenses' | 'billing' | 'notifications';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'licenses',
    label: 'Licenses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

export function Settings() {
  const { closer, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('licenses');

  // License state
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [originalStates, setOriginalStates] = useState<string[]>([]);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseSaving, setLicenseSaving] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch existing licenses on mount
  useEffect(() => {
    const fetchLicenses = async () => {
      if (!user?.id) return;

      setLicenseLoading(true);
      try {
        const { data, error } = await supabase
          .from('closer_licenses')
          .select('state_code')
          .eq('closer_id', user.id);

        if (error) throw error;

        const states = data?.map(l => l.state_code) || [];
        setSelectedStates(states);
        setOriginalStates(states);
      } catch (error) {
        console.error('Error fetching licenses:', error);
        setLicenseMessage({ type: 'error', text: 'Failed to load licenses' });
      } finally {
        setLicenseLoading(false);
      }
    };

    fetchLicenses();
  }, [user?.id]);

  // Check if licenses have changed
  const hasLicenseChanges = () => {
    if (selectedStates.length !== originalStates.length) return true;
    const sortedSelected = [...selectedStates].sort();
    const sortedOriginal = [...originalStates].sort();
    return sortedSelected.some((state, i) => state !== sortedOriginal[i]);
  };

  // Save license changes
  const handleSaveLicenses = async () => {
    if (!user?.id || !hasLicenseChanges()) return;

    setLicenseSaving(true);
    setLicenseMessage(null);

    try {
      // Calculate diff
      const toAdd = selectedStates.filter(s => !originalStates.includes(s));
      const toRemove = originalStates.filter(s => !selectedStates.includes(s));

      // Delete removed states
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('closer_licenses')
          .delete()
          .eq('closer_id', user.id)
          .in('state_code', toRemove);

        if (deleteError) throw deleteError;
      }

      // Insert new states
      if (toAdd.length > 0) {
        const newLicenses = toAdd.map(stateCode => ({
          closer_id: user.id,
          state_code: stateCode,
          verified: false
        }));

        const { error: insertError } = await supabase
          .from('closer_licenses')
          .insert(newLicenses);

        if (insertError) throw insertError;
      }

      // Update original states to match current
      setOriginalStates([...selectedStates]);
      setLicenseMessage({ type: 'success', text: 'Licenses saved successfully!' });

      // Clear success message after 3 seconds
      setTimeout(() => setLicenseMessage(null), 3000);
    } catch (error) {
      console.error('Error saving licenses:', error);
      setLicenseMessage({ type: 'error', text: 'Failed to save licenses' });
    } finally {
      setLicenseSaving(false);
    }
  };

  const handleBackToDashboard = () => {
    navigate('/');
  };

  return (
    <>
      {/* Background Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="settings-container">
        <div className="settings-card">
          {/* Header */}
          <div className="settings-header">
            <button className="back-button" onClick={handleBackToDashboard}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <h1>Settings</h1>
            <p>Manage your account preferences</p>
          </div>

          {/* Tabs */}
          <div className="settings-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="settings-content">
            {activeTab === 'profile' && (
              <div className="tab-panel">
                <h2>Profile Information</h2>
                <div className="profile-info">
                  <div className="info-row">
                    <label>Full Name</label>
                    <span>{closer?.full_name || 'Not set'}</span>
                  </div>
                  <div className="info-row">
                    <label>Email</label>
                    <span>{closer?.email || user?.email || 'Not set'}</span>
                  </div>
                  <div className="info-row">
                    <label>Balance</label>
                    <span className="balance">${(closer?.balance || 0).toFixed(2)}</span>
                  </div>
                  <div className="info-row">
                    <label>Status</label>
                    <span className={`status ${closer?.is_available ? 'online' : 'offline'}`}>
                      {closer?.is_available ? 'Available' : 'Offline'}
                    </span>
                  </div>
                </div>
                <button className="danger-button" onClick={signOut}>
                  Sign Out
                </button>
              </div>
            )}

            {activeTab === 'licenses' && (
              <div className="tab-panel">
                <h2>State Licenses</h2>
                <p className="tab-description">
                  Select the states where you are licensed to operate. You will only receive calls from leads in these states.
                </p>

                {licenseMessage && (
                  <div className={`license-message ${licenseMessage.type}`}>
                    {licenseMessage.text}
                  </div>
                )}

                {licenseLoading ? (
                  <div className="license-loading">
                    <div className="loading-spinner"></div>
                    <span>Loading licenses...</span>
                  </div>
                ) : (
                  <>
                    <StateSelector
                      selectedStates={selectedStates}
                      onChange={setSelectedStates}
                      disabled={licenseSaving}
                    />

                    <div className="license-actions">
                      <button
                        className="save-button"
                        onClick={handleSaveLicenses}
                        disabled={!hasLicenseChanges() || licenseSaving}
                      >
                        {licenseSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      {hasLicenseChanges() && (
                        <span className="unsaved-indicator">Unsaved changes</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="tab-panel">
                <h2>Billing</h2>
                <p className="tab-description">
                  Manage your payment methods and view transaction history.
                </p>
                <div className="coming-soon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Coming Soon</span>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="tab-panel">
                <h2>Notifications</h2>
                <p className="tab-description">
                  Configure how and when you receive notifications.
                </p>
                <div className="coming-soon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Coming Soon</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Settings;
