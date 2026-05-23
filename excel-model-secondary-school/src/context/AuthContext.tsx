import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Settings } from '../types';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  settings: Settings | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Fetch settings initially
    fetchSettings();

    // Unified auth state listener that handles initial session + changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      console.log('Auth state change detected:', event, session?.user?.id);

      if (session?.user) {
        setUser(session.user);
        setLoading(true);

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (error) throw error;
          
          if (!data && isMounted) {
            // Profile missing - try to create it from auth metadata
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .upsert([{
                  id: authUser.id,
                  name: authUser.user_metadata?.name || 'User',
                  email: authUser.email || '',
                  role: authUser.user_metadata?.role || 'teacher'
                }])
                .select()
                .maybeSingle();
              
              if (!createError && isMounted) {
                setProfile(newProfile);
              } else if (isMounted) {
                setProfile(null);
              }
            } else if (isMounted) {
              setProfile(null);
            }
          } else if (isMounted) {
            setProfile(data);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function fetchSettings() {
    try {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshSettings = async () => {
    await fetchSettings();
  };

  return (
    <AuthContext.Provider value={{ user, profile, settings, loading, signOut, refreshSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
