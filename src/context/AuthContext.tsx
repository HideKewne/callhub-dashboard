import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, createSipCredentials } from '../lib/supabase';
import type { Closer, CloserLicense } from '../types/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  closer: Closer | null;
  licenses: CloserLicense[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; data?: { user: User | null } }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [closer, setCloser] = useState<Closer | null>(null);
  const [licenses, setLicenses] = useState<CloserLicense[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch closer profile and licenses
  const fetchProfile = async (userId: string) => {
    try {
      // Fetch closer profile
      const { data: closerData, error: closerError } = await supabase
        .from('closers')
        .select('*')
        .eq('id', userId)
        .single();

      if (closerError) {
        // If no profile exists, create one
        if (closerError.code === 'PGRST116') {
          // Will be created during signup flow
          return;
        }
        throw closerError;
      }

      setCloser(closerData);

      // Fetch licenses
      const { data: licensesData, error: licensesError } = await supabase
        .from('closer_licenses')
        .select('*')
        .eq('closer_id', userId);

      if (licensesError) throw licensesError;
      setLicenses(licensesData || []);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  // Refresh profile data
  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  // Initialize auth state using onAuthStateChange as single source of truth
  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST (Supabase v2 recommended pattern)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;

        console.log('Auth state change:', event, session?.user?.email);

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch profile in background, don't block loading state
          fetchProfile(session.user.id).catch(console.error);
        } else {
          setCloser(null);
          setLicenses([]);
        }

        // Always set loading to false after any auth state change
        setLoading(false);
      }
    );

    // Get initial session (triggers onAuthStateChange with INITIAL_SESSION)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
      }
      // If no session and no auth state change fired yet, stop loading
      if (!session && mounted) {
        setLoading(false);
      }
    }).catch((err) => {
      console.error('getSession error:', err);
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  // Sign up with email, password, and full name
  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      // Create auth user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        return { error: signUpError, data: undefined };
      }

      // Create closer profile
      if (data.user) {
        const { error: profileError } = await supabase.from('closers').insert({
          id: data.user.id,
          email,
          full_name: fullName,
          balance: 0,
          min_balance: 0.5,
          is_available: false,
        });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          // Don't fail signup if profile creation fails
          // Profile can be created later
        }

        // Create SIP credentials for WebRTC calling
        // This runs in background - don't block signup
        createSipCredentials(data.user.id, email)
          .then((result) => {
            if (result.success) {
              console.log('SIP credentials created:', result.sip_username);
            } else {
              console.error('Failed to create SIP credentials:', result.error);
            }
          })
          .catch((err) => {
            console.error('SIP credential creation error:', err);
          });
      }

      return { error: null, data: { user: data.user } };
    } catch (error) {
      return { error: error as Error, data: undefined };
    }
  };

  // Sign out
  const signOut = async () => {
    await supabase.auth.signOut();
    setCloser(null);
    setLicenses([]);
  };

  const value = {
    user,
    session,
    closer,
    licenses,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
