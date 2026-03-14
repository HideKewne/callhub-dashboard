import { useState, useEffect } from 'react';

interface BriefingPopupProps {
  isVisible: boolean;
  closerBriefing: string | null | undefined;
  beneficiaryName: string | null | undefined;
  coverageType: string | null | undefined;
  customerAge: number | null | undefined;
}

export function BriefingPopup({
  isVisible,
  closerBriefing,
  beneficiaryName,
  coverageType,
  customerAge,
}: BriefingPopupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  // Reset state when visibility changes
  useEffect(() => {
    if (isVisible) {
      setIsExpanded(true);
      setIsMinimized(false);
    }
  }, [isVisible]);

  // Don't render if not visible or no briefing data
  if (!isVisible || !closerBriefing) {
    return null;
  }

  // Format coverage type for display
  const formatCoverageType = (type: string | null | undefined): string => {
    if (!type) return 'Unknown';
    switch (type.toLowerCase()) {
      case 'burial':
        return 'Burial Coverage';
      case 'cremation':
        return 'Cremation Coverage';
      case 'family_money':
        return 'Leave Money for Family';
      case 'both':
        return 'Burial + Family Money';
      default:
        return type;
    }
  };

  // Parse bullet points from closer_briefing
  const briefingLines = closerBriefing.split('\n').filter(line => line.trim());

  if (isMinimized) {
    return (
      <div className="briefing-popup-minimized" onClick={() => setIsMinimized(false)}>
        <div className="briefing-minimized-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <span>Call Briefing</span>
      </div>
    );
  }

  return (
    <div className="briefing-popup">
      <div className="briefing-popup-header">
        <div className="briefing-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Call Briefing</span>
        </div>
        <div className="briefing-controls">
          <button
            className="briefing-control-btn"
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className="briefing-control-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="briefing-popup-content">
          {/* Quick Info Pills */}
          <div className="briefing-pills">
            {customerAge && (
              <div className="briefing-pill age">
                <span className="pill-label">Age</span>
                <span className="pill-value">{customerAge}</span>
              </div>
            )}
            {beneficiaryName && (
              <div className="briefing-pill beneficiary">
                <span className="pill-label">Beneficiary</span>
                <span className="pill-value">{beneficiaryName}</span>
              </div>
            )}
            {coverageType && (
              <div className="briefing-pill coverage">
                <span className="pill-label">Looking For</span>
                <span className="pill-value">{formatCoverageType(coverageType)}</span>
              </div>
            )}
          </div>

          {/* Full Briefing */}
          <div className="briefing-details">
            {briefingLines.map((line, index) => (
              <div key={index} className="briefing-line">
                {line.startsWith('•') ? (
                  <span dangerouslySetInnerHTML={{ __html: line.replace(/^•\s*/, '') }} />
                ) : (
                  <span>{line}</span>
                )}
              </div>
            ))}
          </div>

          {/* Key Phrases Highlight */}
          {closerBriefing.includes('Key phrases:') && (
            <div className="briefing-key-phrases">
              <div className="key-phrases-label">Customer's Words:</div>
              <div className="key-phrases-content">
                {closerBriefing
                  .split('Key phrases:')[1]
                  ?.match(/"[^"]+"/g)
                  ?.map((phrase, i) => (
                    <span key={i} className="phrase-tag">
                      {phrase.replace(/"/g, '')}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BriefingPopup;
