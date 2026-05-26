import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Auth, Profiles } from '../services/pb.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (authModel) => {
    try {
      const p = await Profiles.getMine();
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      try {
        if (Auth.isLoggedIn()) {
          const model = Auth.getModel();
          setUser(model);
          await loadProfile(model);
        }
      } finally {
        setLoading(false);
      }
    };
    restore();

    // Listen for forced logout (token expired)
    const handler = () => { setUser(null); setProfile(null); };
    window.addEventListener('pb:logout', handler);
    return () => window.removeEventListener('pb:logout', handler);
  }, [loadProfile]);

  const login = useCallback(async (credentials) => {
    const data = await Auth.login(credentials);
    setUser(data.record);
    await loadProfile(data.record);
    return data;
  }, [loadProfile]);

  const register = useCallback(async (fields) => {
    const data = await Auth.register(fields);
    setUser(data.record);
    await loadProfile(data.record);
    return data;
  }, [loadProfile]);

  const logout = useCallback(() => {
    Auth.logout();
    setUser(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!profile) return;
    const updated = await Profiles.update(profile.id, updates);
    setProfile(updated);
    return updated;
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfile(user);
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      login, register, logout,
      updateProfile, refreshProfile,
      isLoggedIn: !!user,
      tier: profile?.tier ?? 0,
      subscriptionStatus: profile?.subscription_status ?? 'trial',
      // Expose the raw JWT token so components like AICoach can pass it
      // directly to custom PocketBase endpoints via Authorization header.
      token: Auth.getToken ? Auth.getToken() : null,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
