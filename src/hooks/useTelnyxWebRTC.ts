import { useState, useEffect, useCallback, useRef } from 'react';
import { TelnyxRTC, Call } from '@telnyx/webrtc';

interface TelnyxCredentials {
  login: string;
  password: string;
  callerIdNumber?: string;
}

interface CallState {
  isActive: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isOnHold: boolean;
  duration: number;
  direction: 'inbound' | 'outbound' | null;
}

interface UseTelnyxWebRTCResult {
  isConnected: boolean;
  isConnecting: boolean;
  callState: CallState;
  connect: (credentials: TelnyxCredentials) => void;
  disconnect: () => void;
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  error: string | null;
}

export function useTelnyxWebRTC(): UseTelnyxWebRTCResult {
  const clientRef = useRef<TelnyxRTC | null>(null);
  const callRef = useRef<Call | null>(null);
  const durationIntervalRef = useRef<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isConnecting: false,
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

  // Connect to Telnyx
  const connect = useCallback((credentials: TelnyxCredentials) => {
    if (clientRef.current) {
      console.log('Already connected or connecting');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const client = new TelnyxRTC({
        login: credentials.login,
        password: credentials.password,
        ringtoneFile: undefined, // We handle ringtone ourselves
        ringbackFile: undefined,
      });

      // Handle ready event
      client.on('telnyx.ready', () => {
        console.log('Telnyx WebRTC: Ready');
        setIsConnected(true);
        setIsConnecting(false);
      });

      // Handle socket close
      client.on('telnyx.socket.close', () => {
        console.log('Telnyx WebRTC: Socket closed');
        setIsConnected(false);
        setIsConnecting(false);
      });

      // Handle errors
      client.on('telnyx.error', (errorEvent: { error?: { message?: string } }) => {
        console.error('Telnyx WebRTC Error:', errorEvent);
        setError(errorEvent.error?.message || 'Connection error');
        setIsConnecting(false);
      });

      // Handle incoming notification (incoming call)
      client.on('telnyx.notification', (notification: { type: string; call?: Call }) => {
        console.log('Telnyx Notification:', notification);

        if (notification.type === 'callUpdate' && notification.call) {
          const call = notification.call;
          callRef.current = call;

          handleCallStateChange(call);
        }
      });

      // Connect
      client.connect();
      clientRef.current = client;
    } catch (err) {
      console.error('Failed to initialize Telnyx:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setIsConnecting(false);
    }
  }, []);

  // Handle call state changes
  const handleCallStateChange = useCallback(
    (call: Call) => {
      const state = call.state;

      switch (state) {
        case 'new':
        case 'trying':
        case 'requesting':
          setCallState((prev) => ({
            ...prev,
            isConnecting: true,
            direction: call.direction as 'inbound' | 'outbound',
          }));
          break;

        case 'ringing':
          setCallState((prev) => ({
            ...prev,
            isConnecting: true,
            direction: call.direction as 'inbound' | 'outbound',
          }));
          break;

        case 'active':
          setCallState((prev) => ({
            ...prev,
            isActive: true,
            isConnecting: false,
            duration: 0,
          }));
          startDurationTimer();
          break;

        case 'held':
          setCallState((prev) => ({
            ...prev,
            isOnHold: true,
          }));
          break;

        case 'done':
        case 'hangup':
        case 'destroy':
          stopDurationTimer();
          setCallState({
            isActive: false,
            isConnecting: false,
            isMuted: false,
            isOnHold: false,
            duration: 0,
            direction: null,
          });
          callRef.current = null;
          break;
      }
    },
    [startDurationTimer, stopDurationTimer]
  );

  // Disconnect from Telnyx
  const disconnect = useCallback(() => {
    if (callRef.current) {
      callRef.current.hangup();
      callRef.current = null;
    }

    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    stopDurationTimer();
    setIsConnected(false);
    setCallState({
      isActive: false,
      isConnecting: false,
      isMuted: false,
      isOnHold: false,
      duration: 0,
      direction: null,
    });
  }, [stopDurationTimer]);

  // Answer incoming call
  const answer = useCallback(() => {
    if (callRef.current && callRef.current.state === 'ringing') {
      callRef.current.answer();
    }
  }, []);

  // Hang up current call
  const hangup = useCallback(() => {
    if (callRef.current) {
      callRef.current.hangup();
      callRef.current = null;
    }
    stopDurationTimer();
  }, [stopDurationTimer]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (callRef.current && callState.isActive) {
      if (callState.isMuted) {
        callRef.current.unmuteAudio();
      } else {
        callRef.current.muteAudio();
      }
      setCallState((prev) => ({
        ...prev,
        isMuted: !prev.isMuted,
      }));
    }
  }, [callState.isActive, callState.isMuted]);

  // Toggle hold
  const toggleHold = useCallback(() => {
    if (callRef.current && callState.isActive) {
      if (callState.isOnHold) {
        callRef.current.unhold();
      } else {
        callRef.current.hold();
      }
      setCallState((prev) => ({
        ...prev,
        isOnHold: !prev.isOnHold,
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
  };
}

export default useTelnyxWebRTC;
