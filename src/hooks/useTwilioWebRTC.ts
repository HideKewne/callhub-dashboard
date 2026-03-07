import { useState, useEffect, useCallback, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';

// Token endpoint - n8n webhook for Twilio access tokens
const TOKEN_ENDPOINT = import.meta.env.VITE_TWILIO_TOKEN_ENDPOINT || 'https://www.n8n.fairintech.com/webhook/wingman-twilio-token';

interface CallState {
  isActive: boolean;
  isConnecting: boolean;
  isRinging: boolean;
  isMuted: boolean;
  isOnHold: boolean;
  duration: number;
  direction: 'inbound' | 'outbound' | null;
}

interface UseTwilioWebRTCResult {
  isConnected: boolean;
  isConnecting: boolean;
  callState: CallState;
  connect: (identity: string) => Promise<void>;
  disconnect: () => void;
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  error: string | null;
  incomingCall: Call | null;
}

export function useTwilioWebRTC(): UseTwilioWebRTCResult {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const incomingCallRef = useRef<Call | null>(null);
  const durationIntervalRef = useRef<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isConnecting: false,
    isRinging: false,
    isMuted: false,
    isOnHold: false,
    duration: 0,
    direction: null,
  });

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    durationIntervalRef.current = window.setInterval(() => {
      setCallState((prev) => ({
        ...prev,
        duration: prev.duration + 1,
      }));
    }, 1000);
  }, []);

  // Stop duration timer
  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Reset call state
  const resetCallState = useCallback(() => {
    stopDurationTimer();
    setCallState({
      isActive: false,
      isConnecting: false,
      isRinging: false,
      isMuted: false,
      isOnHold: false,
      duration: 0,
      direction: null,
    });
    callRef.current = null;
    incomingCallRef.current = null;
    setIncomingCall(null);
  }, [stopDurationTimer]);

  // Fetch token from server
  const fetchToken = useCallback(async (identity: string): Promise<string> => {
    const response = await fetch(`${TOKEN_ENDPOINT}?identity=${encodeURIComponent(identity)}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch token: ${response.status}`);
    }
    const data = await response.json();
    return data.token;
  }, []);

  // Connect to Twilio with identity
  const connect = useCallback(async (identity: string) => {
    if (deviceRef.current) {
      console.log('Already connected or connecting');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Fetch access token
      console.log(`Fetching token for identity: ${identity}`);
      const token = await fetchToken(identity);

      // Create Twilio Device
      const device = new Device(token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.PCMU, Call.Codec.Opus],
      });

      // Handle device ready
      device.on('registered', () => {
        console.log('Twilio Device: Registered and ready');
        setIsConnected(true);
        setIsConnecting(false);
      });

      // Handle incoming call
      device.on('incoming', (call: Call) => {
        console.log('Twilio: Incoming call');
        incomingCallRef.current = call;
        setIncomingCall(call);
        setCallState((prev) => ({
          ...prev,
          isRinging: true,
          direction: 'inbound',
        }));

        // Set up call event handlers
        setupCallHandlers(call);
      });

      // Handle device error
      device.on('error', (error: { message?: string }) => {
        console.error('Twilio Device Error:', error);
        setError(error.message || 'Device error');
        setIsConnecting(false);
      });

      // Handle unregistered
      device.on('unregistered', () => {
        console.log('Twilio Device: Unregistered');
        setIsConnected(false);
      });

      // Handle token expiring
      device.on('tokenWillExpire', async () => {
        console.log('Twilio: Token will expire, refreshing...');
        try {
          const newToken = await fetchToken(identity);
          device.updateToken(newToken);
        } catch (err) {
          console.error('Failed to refresh token:', err);
        }
      });

      // Register the device
      await device.register();
      deviceRef.current = device;

    } catch (err) {
      console.error('Failed to connect to Twilio:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  }, [fetchToken]);

  // Set up call event handlers
  const setupCallHandlers = useCallback((call: Call) => {
    call.on('accept', () => {
      console.log('Twilio Call: Accepted');
      callRef.current = call;
      setCallState((prev) => ({
        ...prev,
        isActive: true,
        isConnecting: false,
        isRinging: false,
        duration: 0,
      }));
      setIncomingCall(null);
      startDurationTimer();
    });

    call.on('disconnect', () => {
      console.log('Twilio Call: Disconnected');
      resetCallState();
    });

    call.on('cancel', () => {
      console.log('Twilio Call: Cancelled');
      resetCallState();
    });

    call.on('reject', () => {
      console.log('Twilio Call: Rejected');
      resetCallState();
    });

    call.on('error', (error: { message?: string }) => {
      console.error('Twilio Call Error:', error);
      setError(error.message || 'Call error');
      resetCallState();
    });

    call.on('mute', (isMuted: boolean) => {
      setCallState((prev) => ({
        ...prev,
        isMuted,
      }));
    });
  }, [startDurationTimer, resetCallState]);

  // Disconnect from Twilio
  const disconnect = useCallback(() => {
    if (callRef.current) {
      callRef.current.disconnect();
      callRef.current = null;
    }

    if (incomingCallRef.current) {
      incomingCallRef.current.reject();
      incomingCallRef.current = null;
    }

    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }

    resetCallState();
    setIsConnected(false);
    setError(null);
  }, [resetCallState]);

  // Answer incoming call
  const answer = useCallback(() => {
    if (incomingCallRef.current) {
      console.log('Answering incoming call');
      incomingCallRef.current.accept();
      callRef.current = incomingCallRef.current;
    }
  }, []);

  // Hang up current call
  const hangup = useCallback(() => {
    if (callRef.current) {
      callRef.current.disconnect();
    } else if (incomingCallRef.current) {
      incomingCallRef.current.reject();
    }
    resetCallState();
  }, [resetCallState]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (callRef.current && callState.isActive) {
      const newMuteState = !callState.isMuted;
      callRef.current.mute(newMuteState);
    }
  }, [callState.isActive, callState.isMuted]);

  // Toggle hold (note: Twilio Client doesn't have native hold, we simulate with mute)
  const toggleHold = useCallback(() => {
    if (callRef.current && callState.isActive) {
      // Twilio Voice SDK doesn't have native hold
      // We simulate it by muting (real hold would need conference)
      const newHoldState = !callState.isOnHold;
      callRef.current.mute(newHoldState);
      setCallState((prev) => ({
        ...prev,
        isOnHold: newHoldState,
        isMuted: newHoldState,
      }));
    }
  }, [callState.isActive, callState.isOnHold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    callState,
    connect,
    disconnect,
    answer,
    hangup,
    toggleMute,
    toggleHold,
    error,
    incomingCall,
  };
}

export default useTwilioWebRTC;
