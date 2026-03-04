import { useState, useEffect, useCallback } from 'react';
import { supabase, claimCall } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface IncomingCallData {
  call_log_id: string;
  display_text: string;
  lead_state: string;
  lead_city: string;
  eligible_closer_ids: string[];
  timestamp: string;
}

interface UseIncomingCallsResult {
  incomingCall: IncomingCallData | null;
  isClaimingCall: boolean;
  claimError: string | null;
  acceptCall: (callLogId: string) => Promise<boolean>;
  declineCall: (callLogId: string) => void;
}

export function useIncomingCalls(): UseIncomingCallsResult {
  const { closer } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [isClaimingCall, setIsClaimingCall] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Subscribe to Supabase Realtime channel for incoming calls
  useEffect(() => {
    if (!closer?.id) return;

    // Subscribe to the incoming_calls broadcast channel
    const channel = supabase.channel('incoming_calls', {
      config: {
        broadcast: {
          self: false, // Don't receive our own broadcasts
        },
      },
    });

    channel
      .on('broadcast', { event: 'incoming_call' }, (payload) => {
        const callData = payload.payload as IncomingCallData;

        // Check if this closer is eligible for this call
        if (callData.eligible_closer_ids?.includes(closer.id)) {
          setIncomingCall(callData);
          setClaimError(null);

          // Play notification sound
          playRingtone();
        }
      })
      .on('broadcast', { event: 'call_claimed' }, (payload) => {
        const { call_log_id, claimed_by } = payload.payload as {
          call_log_id: string;
          claimed_by: string;
        };

        // If this call was claimed by someone else, dismiss the modal
        if (incomingCall?.call_log_id === call_log_id && claimed_by !== closer.id) {
          setIncomingCall(null);
          stopRingtone();
        }
      })
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      channel.unsubscribe();
      stopRingtone();
    };
  }, [closer?.id, incomingCall?.call_log_id]);

  // Accept call - attempt to claim it
  const acceptCall = useCallback(
    async (callLogId: string): Promise<boolean> => {
      if (!closer?.id) return false;

      setIsClaimingCall(true);
      setClaimError(null);

      try {
        const result = await claimCall(callLogId);

        if (result.success) {
          // Call was successfully claimed
          setIncomingCall(null);
          stopRingtone();

          // TODO: Initiate WebRTC connection
          console.log('Call claimed successfully, initiating WebRTC...');

          return true;
        } else {
          // Call was already claimed by someone else
          setClaimError(result.error || 'Call was taken by another agent');
          setIncomingCall(null);
          stopRingtone();
          return false;
        }
      } catch (error) {
        setClaimError('Failed to claim call. Please try again.');
        return false;
      } finally {
        setIsClaimingCall(false);
      }
    },
    [closer?.id]
  );

  // Decline call - just dismiss the modal
  const declineCall = useCallback((callLogId: string) => {
    console.log('Call declined:', callLogId);
    setIncomingCall(null);
    stopRingtone();
  }, []);

  return {
    incomingCall,
    isClaimingCall,
    claimError,
    acceptCall,
    declineCall,
  };
}

// Audio management for ringtone
let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let isPlaying = false;

function playRingtone() {
  if (isPlaying) return;

  try {
    // Create audio context if it doesn't exist
    if (!audioContext) {
      audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }

    // Create oscillator for a simple ring tone
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Ring pattern: 440Hz tone
    oscillator.frequency.value = 440;
    oscillator.type = 'sine';

    // Volume
    gainNode.gain.value = 0.3;

    oscillator.start();
    isPlaying = true;

    // Create ring pattern (on-off-on-off)
    const ringPattern = () => {
      if (!isPlaying || !gainNode) return;

      // Ring for 1 second
      gainNode.gain.setValueAtTime(0.3, audioContext!.currentTime);

      // Silence for 2 seconds
      gainNode.gain.setValueAtTime(0, audioContext!.currentTime + 1);

      // Repeat
      setTimeout(ringPattern, 3000);
    };

    ringPattern();
  } catch (error) {
    console.error('Failed to play ringtone:', error);
  }
}

function stopRingtone() {
  if (oscillator) {
    try {
      oscillator.stop();
      oscillator.disconnect();
    } catch {
      // Ignore errors when stopping
    }
    oscillator = null;
  }

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }

  isPlaying = false;
}

export default useIncomingCalls;
