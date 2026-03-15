import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, claimCall } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// State code to full name mapping
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington DC', PR: 'Puerto Rico', VI: 'Virgin Islands', GU: 'Guam'
};

interface IncomingCallData {
  call_log_id: string;
  display_text: string;
  lead_state: string;
  lead_city: string;
  eligible_closer_ids: string[];
  timestamp: string;
  // Briefing data for closer popup
  closer_briefing?: string | null;
  beneficiary_name?: string | null;
  coverage_type?: string | null;
  customer_age?: number | null;
}

interface UseIncomingCallsOptions {
  onCallClaimed?: (callData: IncomingCallData) => void;
}

interface UseIncomingCallsResult {
  incomingCall: IncomingCallData | null;
  activeCallData: IncomingCallData | null;
  isClaimingCall: boolean;
  claimError: string | null;
  acceptCall: (callLogId: string) => Promise<boolean>;
  declineCall: (callLogId: string) => void;
  clearActiveCall: () => void;
}

export function useIncomingCalls(options: UseIncomingCallsOptions = {}): UseIncomingCallsResult {
  const { onCallClaimed } = options;
  const { closer } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [activeCallData, setActiveCallData] = useState<IncomingCallData | null>(null);
  const [isClaimingCall, setIsClaimingCall] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Store closer ID in a ref to use in subscription callback
  const closerIdRef = useRef<string | null>(null);
  closerIdRef.current = closer?.id || null;

  // Subscribe to Supabase Realtime - using BROADCAST channel (n8n sends complete data)
  useEffect(() => {
    console.log('[IncomingCalls] useEffect RUNNING - setting up broadcast subscription');

    // Subscribe to postgres_changes on call_logs table for reliable real-time notifications
    // (Supabase REST API broadcast has known reliability issues)
    const channel = supabase.channel('incoming_calls');

    channel
      // Listen for INSERT on call_logs table (more reliable than broadcast)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs' },
        async (payload) => {
          console.log('[IncomingCalls] 🔔 postgres_changes INSERT received, fetching full record...');
          const payloadRow = payload.new as { id: string; status: string };

          // Only process unclaimed calls (status = 'pending' or 'ringing')
          if (payloadRow.status && !['pending', 'ringing'].includes(payloadRow.status)) {
            console.log('[IncomingCalls] Ignoring non-pending call:', payloadRow.status);
            return;
          }

          // Fetch full record from Supabase to avoid CHAR(2) truncation issue in realtime payload
          const { data: fullRecord, error } = await supabase
            .from('call_logs')
            .select('id, lead_state, lead_city, eligible_closer_ids, created_at, status, closer_briefing, beneficiary_name, coverage_type, customer_age')
            .eq('id', payloadRow.id)
            .single();

          if (error || !fullRecord) {
            console.error('[IncomingCalls] Failed to fetch call_log:', error);
            return;
          }

          console.log('[IncomingCalls] Fetched full record:', JSON.stringify(fullRecord));

          const currentCloserId = closerIdRef.current;

          // Build display text from lead location
          const city = (fullRecord.lead_city || 'Unknown').trim();
          const stateCode = (fullRecord.lead_state || '').trim();
          const stateName = STATE_NAMES[stateCode] || stateCode || 'Unknown';
          const displayText = stateCode && stateCode !== 'XX'
            ? `Incoming Caller: ${city}, ${stateName} (${stateCode})`
            : `Incoming Caller: ${city}`;

          const callData: IncomingCallData = {
            call_log_id: fullRecord.id,
            display_text: displayText,
            lead_state: fullRecord.lead_state || '',
            lead_city: fullRecord.lead_city || '',
            eligible_closer_ids: fullRecord.eligible_closer_ids || [],
            timestamp: fullRecord.created_at,
            // Briefing data for closer popup
            closer_briefing: fullRecord.closer_briefing,
            beneficiary_name: fullRecord.beneficiary_name,
            coverage_type: fullRecord.coverage_type,
            customer_age: fullRecord.customer_age
          };

          console.log('[IncomingCalls] Checking eligibility - closerId:', currentCloserId, 'eligible_ids:', callData.eligible_closer_ids);

          // Check if this closer is eligible for this call
          if (currentCloserId && callData.eligible_closer_ids?.includes(currentCloserId)) {
            console.log('[IncomingCalls] ✅ ELIGIBLE - showing modal');
            setIncomingCall(callData);
            setClaimError(null);
            playRingtone();
          } else {
            console.log('[IncomingCalls] ❌ Not eligible for this call');
          }
        }
      )
      // Listen for UPDATE on call_logs (qualified calls AND claims)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_logs' },
        async (payload) => {
          console.log('[IncomingCalls] postgres_changes UPDATE:', payload);
          const updatedRow = payload.new as {
            id: string;
            claimed_by: string;
            status: string;
            eligible_closer_ids?: string[];
          };
          const oldRow = payload.old as { status?: string; eligible_closer_ids?: string[] };
          const currentCloserId = closerIdRef.current;

          // CASE 1: New qualified call (status changed to 'qualified' with eligible_closer_ids)
          if (updatedRow.status === 'qualified' &&
              updatedRow.eligible_closer_ids &&
              updatedRow.eligible_closer_ids.length > 0 &&
              oldRow.status !== 'qualified') {
            console.log('[IncomingCalls] 🔔 QUALIFIED UPDATE detected!');

            // Check if this closer is eligible
            if (currentCloserId && updatedRow.eligible_closer_ids.includes(currentCloserId)) {
              console.log('[IncomingCalls] ✅ ELIGIBLE for qualified call - fetching full record...');

              // Fetch full record from Supabase
              const { data: fullRecord, error } = await supabase
                .from('call_logs')
                .select('id, lead_state, lead_city, eligible_closer_ids, created_at, status, closer_briefing, beneficiary_name, coverage_type, customer_age')
                .eq('id', updatedRow.id)
                .single();

              if (error || !fullRecord) {
                console.error('[IncomingCalls] Failed to fetch call_log:', error);
                return;
              }

              console.log('[IncomingCalls] Fetched qualified call:', JSON.stringify(fullRecord));

              // Build display text from lead location
              const city = (fullRecord.lead_city || 'Unknown').trim();
              const stateCode = (fullRecord.lead_state || '').trim();
              const stateName = STATE_NAMES[stateCode] || stateCode || 'Unknown';
              const displayText = stateCode && stateCode !== 'XX'
                ? `Incoming Caller: ${city}, ${stateName} (${stateCode})`
                : `Incoming Caller: ${city}`;

              const callData: IncomingCallData = {
                call_log_id: fullRecord.id,
                display_text: displayText,
                lead_state: fullRecord.lead_state || '',
                lead_city: fullRecord.lead_city || '',
                eligible_closer_ids: fullRecord.eligible_closer_ids || [],
                timestamp: fullRecord.created_at,
                closer_briefing: fullRecord.closer_briefing,
                beneficiary_name: fullRecord.beneficiary_name,
                coverage_type: fullRecord.coverage_type,
                customer_age: fullRecord.customer_age
              };

              console.log('[IncomingCalls] ✅ SHOWING MODAL for qualified call');
              setIncomingCall(callData);
              setClaimError(null);
              playRingtone();
            } else {
              console.log('[IncomingCalls] ❌ Not eligible for this qualified call');
            }
            return;
          }

          // CASE 2: Someone else claimed the call we're showing
          if (incomingCall &&
              updatedRow.id === incomingCall.call_log_id &&
              updatedRow.claimed_by &&
              updatedRow.claimed_by !== currentCloserId) {
            console.log('[IncomingCalls] Call taken by another closer - dismissing modal');
            setIncomingCall(null);
            setClaimError('Call was taken by another agent');
            stopRingtone();
          }
        }
      )
      // Listen for BROADCAST events (n8n sends directly via Supabase REST API)
      .on(
        'broadcast',
        { event: 'incoming_call' },
        (payload) => {
          console.log('[IncomingCalls] 🔔 BROADCAST incoming_call:', JSON.stringify(payload));
          const callData = payload.payload as IncomingCallData;
          const currentCloserId = closerIdRef.current;

          console.log('[IncomingCalls] Checking eligibility - closerId:', currentCloserId, 'eligible_ids:', callData.eligible_closer_ids);

          // Check if this closer is eligible for this call
          if (currentCloserId && callData.eligible_closer_ids?.includes(currentCloserId)) {
            console.log('[IncomingCalls] ✅ ELIGIBLE - showing modal');
            setIncomingCall(callData);
            setClaimError(null);
            playRingtone();
          } else {
            console.log('[IncomingCalls] ❌ Not eligible for this call');
          }
        }
      )
      .subscribe((status) => {
        console.log('[IncomingCalls] 📡 Channel status:', status);
      });

    // Cleanup on unmount
    return () => {
      console.log('[IncomingCalls] Cleaning up channel subscription');
      channel.unsubscribe();
      stopRingtone();
    };
  }, []); // Empty deps - run once on mount

  // Accept call - attempt to claim it
  const acceptCall = useCallback(
    async (callLogId: string): Promise<boolean> => {
      console.log('[AcceptCall] 🎯 Starting claim for call:', callLogId);
      console.log('[AcceptCall] closer?.id:', closer?.id);
      console.log('[AcceptCall] incomingCall exists:', !!incomingCall);

      if (!closer?.id) {
        console.log('[AcceptCall] ❌ No closer ID, aborting');
        return false;
      }

      setIsClaimingCall(true);
      setClaimError(null);

      try {
        console.log('[AcceptCall] Calling claimCall API...');
        const result = await claimCall(callLogId);
        console.log('[AcceptCall] claimCall result:', JSON.stringify(result));

        if (result.success) {
          console.log('[AcceptCall] ✅ Claim successful!');
          // Call was successfully claimed - store as active call
          const claimedCallData = incomingCall;
          console.log('[AcceptCall] claimedCallData:', claimedCallData ? 'exists' : 'NULL');
          setIncomingCall(null);
          stopRingtone();

          if (claimedCallData) {
            setActiveCallData(claimedCallData);
            // Trigger callback if provided
            console.log('[AcceptCall] 📞 Calling onCallClaimed callback...');
            onCallClaimed?.(claimedCallData);
            console.log('[AcceptCall] ✅ onCallClaimed callback executed');
          } else {
            console.log('[AcceptCall] ⚠️ claimedCallData is null, NOT calling onCallClaimed');
          }

          return true;
        } else {
          // Call was already claimed by someone else
          console.log('[AcceptCall] ❌ Claim failed:', result.error);
          setClaimError(result.error || 'Call was taken by another agent');
          setIncomingCall(null);
          stopRingtone();
          return false;
        }
      } catch (error) {
        console.error('[AcceptCall] ❌ Exception:', error);
        setClaimError('Failed to claim call. Please try again.');
        return false;
      } finally {
        setIsClaimingCall(false);
      }
    },
    [closer?.id, incomingCall, onCallClaimed]
  );

  // Decline call - just dismiss the modal
  const declineCall = useCallback((callLogId: string) => {
    console.log('Call declined:', callLogId);
    setIncomingCall(null);
    stopRingtone();
  }, []);

  // Clear active call data (called when call ends)
  const clearActiveCall = useCallback(() => {
    setActiveCallData(null);
  }, []);

  return {
    incomingCall,
    activeCallData,
    isClaimingCall,
    claimError,
    acceptCall,
    declineCall,
    clearActiveCall,
  };
}

// Audio management for ringtone
// Using Audio element instead of Web Audio API for better background tab support
let ringtoneAudio: HTMLAudioElement | null = null;
let isPlaying = false;
let ringtoneDataUrl: string | null = null;
let audioUnlocked = false; // Track if audio has been unlocked this session

// Generate a ringtone WAV file as a data URL (runs once)
// Pattern: 1 second of tone + 2 seconds of silence = 3 second loop (matches original)
function generateRingtoneDataUrl(): string {
  if (ringtoneDataUrl) return ringtoneDataUrl;

  // Generate a ringtone with pattern: 1s tone + 2s silence (like the original)
  const sampleRate = 44100;
  const toneDuration = 1; // 1 second of tone
  const silenceDuration = 2; // 2 seconds of silence
  const totalDuration = toneDuration + silenceDuration; // 3 seconds total
  const numSamples = sampleRate * totalDuration;
  const toneSamples = sampleRate * toneDuration;
  const numChannels = 1;
  const bitsPerSample = 16;

  // Create WAV file buffer
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  view.setUint16(32, numChannels * bitsPerSample / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Generate audio: tone for first second, silence for next 2 seconds
  for (let i = 0; i < numSamples; i++) {
    let pcmValue = 0;

    if (i < toneSamples) {
      // First second: dual-tone (440Hz + 480Hz like US ring tone)
      const t = i / sampleRate;
      // Envelope for smooth start/end of tone
      const envelope = Math.min(1, Math.min(i / 1000, (toneSamples - i) / 1000));
      const sample = envelope * 0.3 * (
        Math.sin(2 * Math.PI * 440 * t) +
        Math.sin(2 * Math.PI * 480 * t)
      );
      // Convert to 16-bit PCM
      pcmValue = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    }
    // else: silence (pcmValue stays 0)
    view.setInt16(44 + i * 2, pcmValue, true);
  }

  // Convert to base64 data URL
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  ringtoneDataUrl = 'data:audio/wav;base64,' + btoa(binary);
  console.log('[Audio] Ringtone WAV generated');
  return ringtoneDataUrl;
}

// Call this on user interaction (e.g., clicking anywhere) to prepare audio
// This just creates the audio element - no sound is played during unlock
export function unlockAudio() {
  // Skip if already unlocked this session
  if (audioUnlocked) {
    return;
  }

  // Mark as unlocked IMMEDIATELY
  audioUnlocked = true;

  try {
    // Pre-generate the ringtone data URL
    generateRingtoneDataUrl();

    // Create the audio element (but don't play it)
    if (!ringtoneAudio) {
      ringtoneAudio = new Audio(ringtoneDataUrl!);
      ringtoneAudio.loop = true;
      ringtoneAudio.volume = 0.5;
      console.log('[Audio] Audio element created and ready');
    }
  } catch (error) {
    console.error('[Audio] Failed to prepare audio:', error);
  }
}

async function playRingtone() {
  console.log('[Audio] playRingtone called, isPlaying:', isPlaying);
  if (isPlaying) return;

  try {
    // Ensure ringtone data URL is generated
    const dataUrl = generateRingtoneDataUrl();

    // Create audio element if it doesn't exist
    if (!ringtoneAudio) {
      ringtoneAudio = new Audio(dataUrl);
      ringtoneAudio.loop = true;
      ringtoneAudio.volume = 0.5;
    }

    // Play the ringtone
    await ringtoneAudio.play();
    isPlaying = true;
    console.log('[Audio] Ringtone playing (Audio element - works in background tabs)');
  } catch (error) {
    console.error('[Audio] Failed to play ringtone:', error);
    // Fallback: try to play anyway on next user interaction
  }
}

function stopRingtone() {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
  }
  isPlaying = false;
  console.log('[Audio] Ringtone stopped');
}

export default useIncomingCalls;
