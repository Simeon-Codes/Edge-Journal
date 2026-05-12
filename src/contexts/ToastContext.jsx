import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useTheme } from './ThemeContext.jsx';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const toast = useCallback((msg, type = 'info', duration = 3500) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be within ToastProvider');
  return ctx;
};

// Convenience helpers attached to the hook
export const useNotify = () => {
  const { toast } = useToast();
  return {
    success: (msg) => toast(msg, 'success'),
    error:   (msg) => toast(msg, 'error', 5000),
    info:    (msg) => toast(msg, 'info'),
    warn:    (msg) => toast(msg, 'warn', 4500),
  };
};

function ToastContainer({ toasts, onDismiss }) {
  const { theme: t } = useTheme();

  const STYLES = {
    success: { bg: t.accentDim,  border: t.accentBorder, color: t.accent, icon: '✓' },
    error:   { bg: t.redDim,     border: t.red+'40',     color: t.red,    icon: '✕' },
    warn:    { bg: t.yellowDim,  border: t.yellow+'40',  color: t.yellow, icon: '⚠' },
    info:    { bg: t.purpleDim,  border: t.purple+'30',  color: t.purple, icon: 'ℹ' },
  };

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
    }}>
      {toasts.map(toast => {
        const s = STYLES[toast.type] || STYLES.info;
        return (
          <div key={toast.id} onClick={() => onDismiss(toast.id)}
            style={{
              background: s.bg, border: `1px solid ${s.border}`,
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              cursor: 'pointer', boxShadow: '0 8px 24px #00000040',
              animation: 'slideIn 0.2s ease',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
            <span style={{ color: s.color, fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{s.icon}</span>
            <span style={{ color: s.color, fontSize: 12, lineHeight: 1.5, flex: 1 }}>{toast.msg}</span>
            <span style={{ color: s.color, fontSize: 12, opacity: 0.6, flexShrink: 0 }}>✕</span>
          </div>
        );
      })}
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } }`}</style>
    </div>
  );
}
