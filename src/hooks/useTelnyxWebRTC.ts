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
  isRinging: boolean;  // Added: specifically indicates 'ringing' state for answering
  isAnswering: boolean;  // Added: for SIP transfers that skip ringing
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
  const wasOnHoldRef = useRef<boolean>(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isConnecting: false,
    isRinging: false,
    isAnswering: false,
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

    console.log('🔌 Telnyx WebRTC: Starting connection...');
    console.log('🔌 Login:', credentials.login);
    console.log('🔌 Password length:', credentials.password?.length || 0);

    setIsConnecting(true);
    setError(null);

    try {
      const client = new TelnyxRTC({
        login: credentials.login,
        password: credentials.password,
        ringtoneFile: undefined, // We handle ringtone ourselves
        ringbackFile: undefined,
      });

      // CRITICAL: Set the remote element for audio output
      // This tells the SDK where to play incoming audio from the call
      client.remoteElement = 'telnyx-remote-audio';
      console.log('🔌 TelnyxRTC client created successfully');
      console.log('🔊 Remote audio element set to: telnyx-remote-audio');

      // Handle ready event
      client.on('telnyx.ready', () => {
        console.log('✅ Telnyx WebRTC: READY - Registered with username:', credentials.login);
        setIsConnected(true);
        setIsConnecting(false);
      });

      // Handle socket close
      // CRITICAL: If there's an active call, DON'T destroy anything.
      // WebRTC audio is peer-to-peer and survives without the signaling socket.
      // Creating a new client would kill the active call.
      client.on('telnyx.socket.close', () => {
        console.log('⚠️ Telnyx WebRTC: Socket closed');
        setIsConnected(false);
        setIsConnecting(false);

        if (callRef.current) {
          // ACTIVE CALL: Keep everything intact - don't clear clientRef or callRef
          // The audio stream is peer-to-peer and may still be flowing
          // If we clear clientRef, Dashboard will create a NEW client, killing this call
          console.log('⚠️ Socket closed during ACTIVE CALL - keeping call alive (audio is P2P)');
          return;
        }

        // NO ACTIVE CALL: Safe to clear client for fresh reconnection
        clientRef.current = null;
      });

      // Handle errors
      client.on('telnyx.error', (errorEvent: { error?: { message?: string } }) => {
        console.error('❌ Telnyx WebRTC Error:', errorEvent);
        const errorMsg = errorEvent.error?.message || 'Connection error';
        console.error('❌ Error message:', errorMsg);
        setError(errorMsg);
        setIsConnecting(false);
      });

      // Handle incoming notification (incoming call)
      client.on('telnyx.notification', (notification: { type: string; call?: Call }) => {
        console.log('🔔 Telnyx Notification:', notification.type, notification);

        if (notification.type === 'callUpdate' && notification.call) {
          const call = notification.call;
          console.log('📞 Call Update - State:', call.state, 'Direction:', call.direction, 'ID:', call.id);
          callRef.current = call;

          handleCallStateChange(call);
        }
      });

      // Add socket open handler to debug connection
      client.on('telnyx.socket.open', () => {
        console.log('🔌 Telnyx WebRTC: WebSocket OPENED');
      });

      // Connect
      console.log('🔌 Telnyx WebRTC: Calling connect()...');
      client.connect();
      clientRef.current = client;
      console.log('🔌 Telnyx WebRTC: connect() called, waiting for events...');
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
            isRinging: false,
            isAnswering: false,
            direction: call.direction as 'inbound' | 'outbound',
          }));
          break;

        case 'ringing':
          console.log('📞 Call now in RINGING state - ready to answer');
          setCallState((prev) => ({
            ...prev,
            isConnecting: true,
            isRinging: true,  // Only true when actually ringing
            isAnswering: false,
            direction: call.direction as 'inbound' | 'outbound',
          }));
          break;

        case 'answering':
          // SIP transfers often skip 'ringing' and go straight to 'answering'
          console.log('📞 Call now in ANSWERING state (SIP transfer in progress)');
          setCallState((prev) => ({
            ...prev,
            isConnecting: true,
            isRinging: false,
            isAnswering: true,
            direction: call.direction as 'inbound' | 'outbound',
          }));
          break;

        case 'active': {
          // Check if resuming from hold (using ref to avoid side effects in state setter)
          const isResumingFromHold = wasOnHoldRef.current;
          wasOnHoldRef.current = false; // Reset the ref

          if (!isResumingFromHold) {
            // New call - start the duration timer
            startDurationTimer();
          }
          // If resuming from hold, timer is already running, don't restart

          setCallState((prev) => ({
            ...prev,
            isActive: true,
            isConnecting: false,
            isRinging: false,
            isAnswering: false,
            isOnHold: false,
            // Preserve duration when resuming from hold
            duration: isResumingFromHold ? prev.duration : 0,
          }));
          break;
        }

        case 'held':
          wasOnHoldRef.current = true;
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
            isRinging: false,
            isAnswering: false,
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
      isRinging: false,
      isAnswering: false,
      isMuted: false,
      isOnHold: false,
      duration: 0,
      direction: null,
    });
  }, [stopDurationTimer]);

  // Answer incoming call
  const answer = useCallback(() => {
    console.log('📞 answer() called');
    console.log('📞 callRef.current:', callRef.current ? 'exists' : 'null');
    console.log('📞 call state:', callRef.current?.state);

    if (callRef.current && callRef.current.state === 'ringing') {
      console.log('📞 Answering call...');
      callRef.current.answer();
    } else {
      console.log('📞 Cannot answer - call not in ringing state');
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
        // Resuming from hold
        callRef.current.unhold();
      } else {
        // Putting on hold - set ref immediately so it's ready when 'active' fires on resume
        wasOnHoldRef.current = true;
        callRef.current.hold();
      }
      setCallState((prev) => ({
        ...prev,
        isOnHold: !prev.isOnHold,
      }));
    }
  }, [callState.isActive, callState.isOnHold]);

  // Web Lock: prevent browser from throttling/freezing this tab during active calls
  useEffect(() => {
    if (!callState.isActive || !('locks' in navigator)) return;

    let releaseLock: (() => void) | null = null;

    navigator.locks.request(
      'wingman-active-call',
      { mode: 'exclusive' },
      () => new Promise<void>((resolve) => { releaseLock = resolve; })
    );

    console.log('🔒 Web Lock acquired - tab will not be throttled during call');

    return () => {
      releaseLock?.();
      console.log('🔓 Web Lock released - call ended');
    };
  }, [callState.isActive]);

  // Web Worker keepalive: workers are NOT throttled in background tabs
  // This keeps the tab's event loop alive as a second layer of protection
  useEffect(() => {
    if (!callState.isActive) return;

    const workerCode = `
      let interval = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          interval = setInterval(function() { self.postMessage('ping'); }, 15000);
        } else if (e.data === 'stop') {
          if (interval) clearInterval(interval);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.postMessage('start');

    worker.onmessage = () => {
      if (clientRef.current) {
        console.log('💓 Keepalive ping - WebRTC connection active');
      }
    };

    console.log('💓 Keepalive worker started for active call');

    return () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(url);
      console.log('💓 Keepalive worker stopped');
    };
  }, [callState.isActive]);

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
