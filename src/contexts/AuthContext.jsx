import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { pb, Auth, Profiles } from '../services/pb.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]           = useState(null);
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const p = await Profiles.getMine();
      setProfile(p);
      // p can still be null here if both attempts in getMine() returned nothing.
      // This should be extremely rare — only if Railway is down AND the fallback
      // client-side create in register() also failed. The app will render in a
      // degraded state (tier 0, no settings) but won't crash.
      if (!p) {
        console.warn('[EDGE] Profile not found after retries — rendering in degraded state');
      }
    } catch (err) {
      console.error('[EDGE] loadProfile error:', err);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    // Restore session from SDK authStore (survives page refresh via localStorage)
    const restore = async () => {
      try {
        if (pb.authStore.isValid) {
          setUser(pb.authStore.record);
          await loadProfile();
        }
      } finally {
        setLoading(false);
      }
    };
    restore();

    // SDK authStore.onChange fires on login, logout, and token refresh.
    // This replaces the manual 'pb:logout' event and scheduleTokenRefresh timer.
    const unsub = pb.authStore.onChange((token, model) => {
      if (token && model) {
        setUser(model);
        // Profile may have changed (e.g. tier upgrade) — reload it
        loadProfile();
      } else {
        // Cleared — user logged out or token expired
        setUser(null);
        setProfile(null);
      }
    });

    return () => unsub();
  }, [loadProfile]);

  const login = useCallback(async (credentials) => {
    const data = await Auth.login(credentials);
    // authStore.onChange fires automatically — no manual setUser needed
    // but we still await loadProfile for immediate render
    await loadProfile();
    return data;
  }, [loadProfile]);

  const register = useCallback(async (fields) => {
    const data = await Auth.register(fields);
    await loadProfile();
    return data;
  }, [loadProfile]);

  const logout = useCallback(() => {
    Auth.logout();
    // authStore.onChange will fire and clear user/profile state
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!profile) return;
    const updated = await Profiles.update(profile.id, updates);
    setProfile(updated);
    return updated;
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfile();
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider value={{
      user, profile, loading, profileLoading,
      login, register, logout,
      updateProfile, refreshProfile,
      isLoggedIn:         !!user,
      tier:               profile?.tier ?? 0,
      subscriptionStatus: profile?.subscription_status ?? 'trial',
      token: pb.authStore.token || null,
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
