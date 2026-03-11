import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { updateAvailability } from './lib/supabase';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ActiveCall } from './components/ActiveCall';
import { useIncomingCalls, unlockAudio } from './hooks/useIncomingCalls';
import { useTelnyxWebRTC } from './hooks/useTelnyxWebRTC';
import { Sidebar } from './components/Sidebar';

interface LineData {
  id: number;
  name: string;
  label: string;
  isOnline: boolean;
}

interface ActivityData {
  initials: string;
  name: string;
  time: string;
  duration: string;
  status: 'approved' | 'denied';
}

const initialLines: LineData[] = [
  { id: 1, name: 'Line 1', label: 'Primary', isOnline: true },
  { id: 2, name: 'Line 2', label: 'Backup', isOnline: true },
  { id: 3, name: 'Line 3', label: 'Partner', isOnline: true },
  { id: 4, name: 'Line 4', label: 'Overflow', isOnline: true },
  { id: 5, name: 'Line 5', label: 'Reserve', isOnline: true },
];

const activityData: ActivityData[] = [
  { initials: 'JS', name: 'John Smith', time: '2 minutes ago', duration: '5:23', status: 'approved' },
  { initials: 'MG', name: 'Maria Garcia', time: '15 minutes ago', duration: '2:15', status: 'denied' },
  { initials: 'RC', name: 'Robert Chen', time: '32 minutes ago', duration: '4:47', status: 'approved' },
  { initials: 'LW', name: 'Lisa Wong', time: '1 hour ago', duration: '1:02', status: 'denied' },
];

export function Dashboard() {
  const { closer } = useAuth();
  const [currentTime, setCurrentTime] = useState('');
  const [isOnline, setIsOnline] = useState(closer?.is_available ?? false);
  const [lines, setLines] = useState<LineData[]>(initialLines);
  const [isUpdating, setIsUpdating] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Unlock audio on EVERY click on the page (browser requires user interaction)
  // Keep listening because audio context can get suspended again
  useEffect(() => {
    const handleClick = () => {
      unlockAudio();
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('touchstart', handleClick);
    // Also unlock immediately if already mounted
    unlockAudio();
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  // WebRTC for Telnyx voice calls
  const {
    isConnected: webrtcConnected,
    isConnecting: webrtcConnecting,
    callState,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
    answer: answerWebRTC,
    hangup,
    toggleMute,
    toggleHold,
    error: webrtcError,
  } = useTelnyxWebRTC();

  // Track if we're expecting a WebRTC call (after claiming)
  const [expectingWebRTCCall, setExpectingWebRTCCall] = useState(false);

  // Callback when a call is successfully claimed - set flag to auto-answer WebRTC
  const handleCallClaimed = useCallback(() => {
    console.log('🎯 [Dashboard] handleCallClaimed TRIGGERED - setting expectingWebRTCCall=true');
    console.log('🎯 [Dashboard] Current callState:', JSON.stringify(callState));
    setExpectingWebRTCCall(true);
  }, [callState]);

  // Auto-answer Telnyx WebRTC call when it arrives after claiming
  // Handle both normal calls (ringing) and SIP transfers (answering/active)
  useEffect(() => {
    console.log('🔄 [Dashboard] Auto-answer useEffect - isRinging:', callState.isRinging,
      'isAnswering:', callState.isAnswering, 'isActive:', callState.isActive,
      'direction:', callState.direction, 'expectingWebRTCCall:', expectingWebRTCCall);

    // Normal incoming call - needs to be answered
    if (callState.isRinging && callState.direction === 'inbound' && expectingWebRTCCall) {
      console.log('✅ [Dashboard] RINGING - auto-answering!');
      answerWebRTC();
      setExpectingWebRTCCall(false);
    }

    // SIP transfer - call is already being answered, just clear the flag
    if ((callState.isAnswering || callState.isActive) && callState.direction === 'inbound' && expectingWebRTCCall) {
      console.log('✅ [Dashboard] SIP TRANSFER - call already connected, clearing flag');
      setExpectingWebRTCCall(false);
    }
  }, [callState.isRinging, callState.isAnswering, callState.isActive, callState.direction, expectingWebRTCCall, answerWebRTC]);

  // Incoming call handling with callback
  const {
    incomingCall,
    activeCallData,
    acceptCall,
    declineCall,
    claimError,
    clearActiveCall,
    isClaimingCall,
  } = useIncomingCalls({ onCallClaimed: handleCallClaimed });

  // Show claim error as alert (temporary - could be improved with toast)
  useEffect(() => {
    if (claimError) {
      alert(claimError);
    }
  }, [claimError]);

  // Show WebRTC error as alert
  useEffect(() => {
    if (webrtcError) {
      console.error('WebRTC Error:', webrtcError);
    }
  }, [webrtcError]);

  // Connect/disconnect WebRTC based on online status
  useEffect(() => {
    // Use sip_username and sip_password for Telnyx WebRTC authentication
    const sipUsername = closer?.sip_username;
    const sipPassword = closer?.sip_password;

    if (isOnline && sipUsername && sipPassword && !webrtcConnected && !webrtcConnecting) {
      // Connect to Telnyx WebRTC when going online
      console.log('Going online, connecting Telnyx WebRTC with username:', sipUsername);
      connectWebRTC({ login: sipUsername, password: sipPassword });
    } else if (!isOnline && webrtcConnected) {
      // Disconnect from Telnyx WebRTC when going offline
      console.log('Going offline, disconnecting WebRTC');
      disconnectWebRTC();
    }
  }, [isOnline, closer?.sip_username, closer?.sip_password, webrtcConnected, webrtcConnecting, connectWebRTC, disconnectWebRTC]);

  // Clear active call data when WebRTC call ends
  useEffect(() => {
    if (!callState.isActive && activeCallData) {
      // Call ended, clear active call data after a short delay
      const timeout = setTimeout(() => {
        clearActiveCall();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [callState.isActive, activeCallData, clearActiveCall]);

  // Update current time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      setCurrentTime(now.toLocaleTimeString('en-US', options));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync with closer's availability from database
  useEffect(() => {
    if (closer) {
      setIsOnline(closer.is_available);
    }
  }, [closer]);

  // Master toggle handler
  const handleMasterToggle = async () => {
    if (isUpdating) return;

    // Unlock audio on user interaction (required by browsers)
    unlockAudio();

    const newState = !isOnline;
    setIsUpdating(true);

    // Optimistically update UI
    setIsOnline(newState);
    setLines(lines.map((line) => ({ ...line, isOnline: newState })));

    // Update backend
    const result = await updateAvailability(newState);

    if (!result.success) {
      // Revert on failure
      setIsOnline(!newState);
      setLines(lines.map((line) => ({ ...line, isOnline: !newState })));
      console.error('Failed to update availability:', result.error);
    }

    setIsUpdating(false);
  };

  /* Individual line toggle handler (hidden for now)
  const handleLineToggle = (lineId: number) => {
    const newLines = lines.map((line) =>
      line.id === lineId ? { ...line, isOnline: !line.isOnline } : line
    );
    setLines(newLines);

    // Check master state
    const allOnline = newLines.every((l) => l.isOnline);
    const allOffline = newLines.every((l) => !l.isOnline);

    if (allOnline) {
      setIsOnline(true);
    } else if (allOffline) {
      setIsOnline(false);
    }
  };

  const activeLineCount = lines.filter((l) => l.isOnline).length;
  */

  return (
    <>
      {/* CRITICAL: Audio element for Telnyx remote audio (incoming call audio from lead) */}
      {/* This element receives the remote audio stream from the WebRTC call */}
      <audio id="telnyx-remote-audio" autoPlay playsInline />

      {/* Background Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Incoming Call Modal */}
      <IncomingCallModal
        callData={incomingCall}
        onAccept={acceptCall}
        onDecline={declineCall}
        autoDeclineSeconds={30}
        isClaimingCall={isClaimingCall}
      />

      {/* Active Call Panel (shown when on a call) */}
      {(callState.isActive || callState.isConnecting) && (
        <ActiveCall
          callState={callState}
          displayText={activeCallData?.display_text || 'Unknown Caller'}
          onHangup={hangup}
          onToggleMute={toggleMute}
          onToggleHold={toggleHold}
        />
      )}

      {/* App Layout with Sidebar */}
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

        <main className="main-content">
          <div className="container">
          {/* Header with Logo, Time and User */}
          <header className="header">
            <div className="logo">
              <div className="logo-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <span className="logo-text">Wing<span>Man</span></span>
            </div>
            <div className="header-right">
              <div className="time-display" id="current-time">
                {currentTime}
              </div>
              <div className="user-profile">
                <div className="user-avatar">
                  {closer?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </div>
                <span className="user-name">{closer?.full_name?.split(' ')[0] || 'User'}</span>
              </div>
            </div>
          </header>

          {/* Master Toggle Section */}
          <section
            className={`master-section ${isOnline ? 'online' : 'offline'}`}
            id="master-section"
          >
            <div className="status-text">System Status</div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div className="pulse-ring"></div>
              <button
                className={`power-button ${isOnline ? 'online' : 'offline'} ${isUpdating ? 'updating' : ''}`}
                id="master-toggle"
                onClick={handleMasterToggle}
                disabled={isUpdating}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z" />
                </svg>
              </button>
            </div>
            <div className="main-status" id="main-status">
              {isOnline
                ? (webrtcConnecting
                    ? 'CONNECTING...'
                    : webrtcConnected
                      ? 'AVAILABLE FOR CALLS'
                      : webrtcError
                        ? 'CONNECTION FAILED'
                        : 'CONNECTING...')
                : 'OFFLINE'}
            </div>
            {/* Lines counter hidden for now */}
          </section>

          {/* Phone Lines Grid - Hidden for now, will be re-enabled later
          <section className="lines-grid">
            {lines.map((line) => (
              <div
                key={line.id}
                className={`line-card ${line.isOnline ? 'online' : 'offline'}`}
                data-line={line.id}
              >
                <div className="line-header">
                  <div className="line-status-dot"></div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={line.isOnline}
                      onChange={() => handleLineToggle(line.id)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="line-name">{line.name}</div>
                <div className="line-label">{line.label}</div>
              </div>
            ))}
          </section>
          */}

          {/* Stats Cards */}
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </div>
              <div className="stat-content">
                <div className="stat-value">12</div>
                <div className="stat-label">Calls Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
              <div className="stat-content">
                <div className="stat-value">40%</div>
                <div className="stat-label">Conversion Rate</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
              </div>
              <div className="stat-content">
                <div className="stat-value">4:32</div>
                <div className="stat-label">Avg Duration</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
                </svg>
              </div>
              <div className="stat-content">
                <div className="stat-value">47</div>
                <div className="stat-label">This Week</div>
              </div>
            </div>
          </section>

          {/* Recent Activity */}
          <section className="activity-section">
            <div className="activity-header">
              <h2 className="activity-title">Recent Activity</h2>
              <span className="activity-badge">Live Updates</span>
            </div>
            <div className="activity-list">
              {activityData.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-avatar">{activity.initials}</div>
                  <div className="activity-info">
                    <div className="activity-name">{activity.name}</div>
                    <div className="activity-time">{activity.time}</div>
                  </div>
                  <div className="activity-duration">{activity.duration}</div>
                  <span className={`activity-status ${activity.status}`}>
                    {activity.status === 'approved' ? 'Approved' : 'Denied'}
                  </span>
                </div>
              ))}
            </div>
          </section>
          </div>
        </main>
      </div>
    </>
  );
}

export default Dashboard;
