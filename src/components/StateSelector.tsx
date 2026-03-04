import { useState } from 'react';

// US States with their codes
const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'Washington DC' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

interface StateSelectorProps {
  selectedStates: string[];
  onChange: (states: string[]) => void;
  disabled?: boolean;
}

export function StateSelector({
  selectedStates,
  onChange,
  disabled = false,
}: StateSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStates = US_STATES.filter(
    (state) =>
      state.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      state.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleState = (code: string) => {
    if (disabled) return;

    if (selectedStates.includes(code)) {
      onChange(selectedStates.filter((s) => s !== code));
    } else {
      onChange([...selectedStates, code]);
    }
  };

  const selectAll = () => {
    if (disabled) return;
    onChange(US_STATES.map((s) => s.code));
  };

  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className="state-selector">
      <div className="state-selector-header">
        <div className="state-search">
          <input
            type="text"
            placeholder="Search states..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="state-actions">
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            className="state-action-btn"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="state-action-btn"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="state-count">
        {selectedStates.length} states selected
      </div>

      <div className="state-grid">
        {filteredStates.map((state) => (
          <button
            key={state.code}
            type="button"
            className={`state-chip ${
              selectedStates.includes(state.code) ? 'selected' : ''
            }`}
            onClick={() => toggleState(state.code)}
            disabled={disabled}
          >
            <span className="state-code">{state.code}</span>
            <span className="state-name">{state.name}</span>
          </button>
        ))}
      </div>

      {filteredStates.length === 0 && (
        <div className="state-no-results">No states match your search</div>
      )}
    </div>
  );
}

export default StateSelector;
