import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { updateAvailability } from '../lib/supabase';
import { useIncomingCalls, unlockAudio } from '../hooks/useIncomingCalls';
import { useTelnyxWebRTC } from '../hooks/useTelnyxWebRTC';

interface CallContextType {
  // Online status
  isOnline: boolean;
  isUpdating: boolean;
  handleMasterToggle: () => Promise<void>;

  // WebRTC
  webrtcConnected: boolean;
  webrtcConnecting: boolean;
  webrtcError: string | null;
  callState: {
    isActive: boolean;
    isConnecting: boolean;
    isRinging: boolean;
    isAnswering: boolean;
    isMuted: boolean;
    isOnHold: boolean;
    duration: number;
    direction: 'inbound' | 'outbound' | null;
  };
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;

  // Incoming calls
  incomingCall: any;
  activeCallData: any;
  acceptCall: (callLogId: string) => Promise<boolean>;
  declineCall: (callLogId: string) => void;
  isClaimingCall: boolean;
  claimError: string | null;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
  const { closer } = useAuth();
  const [isOnline, setIsOnline] = useState(closer?.is_available ?? false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Unlock audio on every click (browser requires user interaction for audio)
  useEffect(() => {
    const handleClick = () => unlockAudio();
    document.addEventListener('click', handleClick);
    document.addEventListener('touchstart', handleClick);
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

  // Callback when a call is successfully claimed
  const handleCallClaimed = useCallback(() => {
    console.log('🎯 [CallContext] handleCallClaimed - setting expectingWebRTCCall=true');
    setExpectingWebRTCCall(true);
  }, []);

  // Auto-answer Telnyx WebRTC call when it arrives after claiming
  useEffect(() => {
    if (callState.isRinging && callState.direction === 'inbound' && expectingWebRTCCall) {
      console.log('✅ [CallContext] RINGING - auto-answering!');
      answerWebRTC();
      setExpectingWebRTCCall(false);
    }
    if ((callState.isAnswering || callState.isActive) && callState.direction === 'inbound' && expectingWebRTCCall) {
      console.log('✅ [CallContext] SIP TRANSFER - call already connected, clearing flag');
      setExpectingWebRTCCall(false);
    }
  }, [callState.isRinging, callState.isAnswering, callState.isActive, callState.direction, expectingWebRTCCall, answerWebRTC]);

  // Incoming call handling
  const {
    incomingCall,
    activeCallData,
    acceptCall,
    declineCall,
    claimError,
    clearActiveCall,
    isClaimingCall,
  } = useIncomingCalls({ onCallClaimed: handleCallClaimed });

  // Connect/disconnect WebRTC based on online status
  // Do NOT reconnect during an active call
  useEffect(() => {
    const sipUsername = closer?.sip_username;
    const sipPassword = closer?.sip_password;

    if (isOnline && sipUsername && sipPassword && !webrtcConnected && !webrtcConnecting) {
      if (callState.isActive || callState.isConnecting) {
        console.log('⚠️ Socket disconnected but call is active - NOT reconnecting');
        return;
      }
      const timeout = setTimeout(() => {
        console.log('🔄 Reconnecting Telnyx WebRTC...');
        connectWebRTC({ login: sipUsername, password: sipPassword });
      }, 2000);
      return () => clearTimeout(timeout);
    } else if (!isOnline && webrtcConnected) {
      console.log('Going offline, disconnecting WebRTC');
      disconnectWebRTC();
    }
  }, [isOnline, closer?.sip_username, closer?.sip_password, webrtcConnected, webrtcConnecting, callState.isActive, callState.isConnecting, connectWebRTC, disconnectWebRTC]);

  // Clear active call data when call ends + restore online status
  useEffect(() => {
    if (!callState.isActive && activeCallData) {
      const timeout = setTimeout(() => {
        clearActiveCall();
        setIsOnline(true);
        updateAvailability(true);
        console.log('📞 Call ended - restoring online status');
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [callState.isActive, activeCallData, clearActiveCall]);

  // Sync with closer's availability from database
  // Skip during active calls (n8n sets is_available=false on accept)
  useEffect(() => {
    if (closer && !callState.isActive && !callState.isConnecting) {
      setIsOnline(closer.is_available);
    }
  }, [closer, callState.isActive, callState.isConnecting]);

  // Master toggle handler
  const handleMasterToggle = useCallback(async () => {
    if (isUpdating) return;

    unlockAudio();
    const newState = !isOnline;
    setIsUpdating(true);
    setIsOnline(newState);

    const result = await updateAvailability(newState);
    if (!result.success) {
      setIsOnline(!newState);
      console.error('Failed to update availability:', result.error);
    }
    setIsUpdating(false);
  }, [isOnline, isUpdating]);

  const value: CallContextType = {
    isOnline,
    isUpdating,
    handleMasterToggle,
    webrtcConnected,
    webrtcConnecting,
    webrtcError,
    callState,
    hangup,
    toggleMute,
    toggleHold,
    incomingCall,
    activeCallData,
    acceptCall,
    declineCall,
    isClaimingCall,
    claimError,
  };

  return (
    <CallContext.Provider value={value}>
      {/* Audio element for Telnyx remote audio - must persist across pages */}
      <audio id="telnyx-remote-audio" autoPlay playsInline />
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
