import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CallProvider, useCall } from './context/CallContext';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ActiveCall } from './components/ActiveCall';
import { BriefingPopup } from './components/BriefingPopup';
import Dashboard from './Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Settings from './pages/Settings';

// Call overlays rendered at app level so they show on ALL pages
function CallOverlays() {
  const {
    callState,
    incomingCall,
    activeCallData,
    acceptCall,
    declineCall,
    isClaimingCall,
    hangup,
    toggleMute,
    toggleHold,
  } = useCall();

  return (
    <>
      <IncomingCallModal
        callData={incomingCall}
        onAccept={acceptCall}
        onDecline={declineCall}
        autoDeclineSeconds={30}
        isClaimingCall={isClaimingCall}
      />

      {(callState.isActive || callState.isConnecting) && (
        <ActiveCall
          callState={callState}
          displayText={activeCallData?.display_text || 'Unknown Caller'}
          onHangup={hangup}
          onToggleMute={toggleMute}
          onToggleHold={toggleHold}
        />
      )}

      <BriefingPopup
        isVisible={!!(callState.isActive && activeCallData?.closer_briefing)}
        closerBriefing={activeCallData?.closer_briefing}
        beneficiaryName={activeCallData?.beneficiary_name}
        coverageType={activeCallData?.coverage_type}
        customerAge={activeCallData?.customer_age}
      />
    </>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// All protected pages wrapped with CallProvider so WebRTC persists across navigation
function ProtectedApp() {
  return (
    <CallProvider>
      <CallOverlays />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CallProvider>
  );
}

// Public route wrapper (redirects to dashboard if logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Signup />
            </PublicRoute>
          }
        />
        {/* All protected routes go through ProtectedApp which has CallProvider */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <ProtectedApp />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
