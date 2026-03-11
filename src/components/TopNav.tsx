import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface TopNavProps {
  isOnline: boolean;
}

export function TopNav({ isOnline }: TopNavProps) {
  const { user, closer, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const tabs = ['Dashboard', 'Leads', 'Calls', 'Routes', 'Agents', 'Settings'];

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = closer?.full_name || user?.user_metadata?.full_name || 'User';

  return (
    <nav className="topnav">
      <div className="topnav-left">
        <div className="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <span className="brand-name">WingMan</span>
      </div>

      <div className="topnav-center">
        {tabs.map(tab => (
          <div
            key={tab}
            className={`nav-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      <div className="topnav-right">
        <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
          <span className="status-dot"></span>
          {isOnline ? 'Active' : 'Offline'}
        </div>
        <div className="topnav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span className="notif-dot"></span>
        </div>
        <div className="topnav-avatar" onClick={signOut} title="Click to logout">
          {getInitials(displayName)}
        </div>
      </div>
    </nav>
  );
}

export default TopNav;
