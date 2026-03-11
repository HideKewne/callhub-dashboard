import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { StateSelector } from '../components/StateSelector';
import { supabase } from '../lib/supabase';

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = account info, 2 = state selection

  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleAccountSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Move to state selection
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    setError('');
    setLoading(true);

    const { error, data } = await signUp(email, password, fullName);

    if (error) {
      setError(error.message);
      setLoading(false);
      setStep(1); // Go back to first step on error
    } else {
      // Save selected states to closer_licenses
      // The closer ID is the same as the user ID (set during signup)
      if (selectedStates.length > 0 && data?.user?.id) {
        const licenses = selectedStates.map(stateCode => ({
          closer_id: data.user!.id,
          state_code: stateCode,
          verified: true
        }));

        const { error: licenseError } = await supabase
          .from('closer_licenses')
          .insert(licenses);

        if (licenseError) {
          console.error('Error saving licenses:', licenseError);
          // Don't fail signup if license save fails - can be fixed in Settings later
        }
      }

      navigate('/');
    }
  };

  const handleSkipStates = () => {
    handleFinalSubmit();
  };

  return (
    <>
      {/* Background Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo">
              <div className="logo-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </div>
              <div className="logo-text">
                Wing<span>Man</span>
              </div>
            </div>
            <h1>{step === 1 ? 'Create Account' : 'Select Your States'}</h1>
            <p>
              {step === 1
                ? 'Join as a Closer and start receiving calls'
                : 'Which states are you licensed to operate in?'}
            </p>
          </div>

          {/* Progress indicator */}
          <div className="signup-progress">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>1</div>
            <div className="progress-line"></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>2</div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          {step === 1 ? (
            <form onSubmit={handleAccountSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Smith"
                  required
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-button">
                Continue
              </button>
            </form>
          ) : (
            <div className="auth-form">
              <StateSelector
                selectedStates={selectedStates}
                onChange={setSelectedStates}
              />

              <div className="auth-buttons-row">
                <button
                  type="button"
                  className="auth-button secondary"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="auth-button"
                  onClick={handleFinalSubmit}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>

              <button
                type="button"
                className="skip-link"
                onClick={handleSkipStates}
                disabled={loading}
              >
                Skip for now
              </button>
            </div>
          )}

          <div className="auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default Signup;
