interface CallState {
  isActive: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isOnHold: boolean;
  duration: number;
  direction: 'inbound' | 'outbound' | null;
}

interface ActiveCallProps {
  callState: CallState;
  displayText: string;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleHold: () => void;
}

export function ActiveCall({
  callState,
  displayText,
  onHangup,
  onToggleMute,
  onToggleHold,
}: ActiveCallProps) {
  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!callState.isActive && !callState.isConnecting) {
    return null;
  }

  return (
    <section className="active-call-section">
      <div className="active-call-header">
        <div className="call-status-indicator">
          <div className={`call-status-dot ${callState.isOnHold ? 'on-hold' : 'active'}`}></div>
          <span className="call-status-text">
            {callState.isConnecting
              ? 'Connecting...'
              : callState.isOnHold
                ? 'On Hold'
                : 'In Call'}
          </span>
        </div>
        <div className="call-duration">{formatDuration(callState.duration)}</div>
      </div>

      <div className="active-call-info">
        <div className="caller-location">{displayText}</div>
      </div>

      <div className="active-call-controls">
        <button
          className={`call-control-btn ${callState.isMuted ? 'active' : ''}`}
          onClick={onToggleMute}
          title={callState.isMuted ? 'Unmute' : 'Mute'}
        >
          <svg viewBox="0 0 24 24">
            {callState.isMuted ? (
              // Muted icon
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            ) : (
              // Unmuted icon
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            )}
          </svg>
          <span>{callState.isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          className={`call-control-btn ${callState.isOnHold ? 'active' : ''}`}
          onClick={onToggleHold}
          title={callState.isOnHold ? 'Resume' : 'Hold'}
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
          <span>{callState.isOnHold ? 'Resume' : 'Hold'}</span>
        </button>

        <button className="call-control-btn hangup" onClick={onHangup} title="End Call">
          <svg viewBox="0 0 24 24">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
          <span>End Call</span>
        </button>
      </div>
    </section>
  );
}

export default ActiveCall;
