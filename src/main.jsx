import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import App from './App.jsx';
import InvestorPage from './components/investor/InvestorPage.jsx';

// Google Fonts
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap';
document.head.appendChild(link);

// Base styles
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; }
  body { -webkit-font-smoothing: antialiased; overscroll-behavior: none; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e2240; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #2e3260; }
  [data-theme="light"] ::-webkit-scrollbar-thumb { background: #dde2f0; }
  ::selection { background: #00e5a030; color: #00e5a0; }
  input, select, textarea, button { font-family: inherit; }
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 30px #0a0c18 inset !important;
    -webkit-text-fill-color: #c8cde8 !important;
  }
  [data-theme="light"] input:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 30px #f8f9fc inset !important;
    -webkit-text-fill-color: #3a3d5a !important;
  }
`;
document.head.appendChild(style);

// Route detection — no top-level await
const path = window.location.pathname;
const investorMatch = path.match(/^\/investor\/([a-f0-9]{32,64})$/i);
const investorToken = investorMatch ? investorMatch[1] : null;

const root = ReactDOM.createRoot(document.getElementById('root'));

if (investorToken) {
  // Public investor read-only view — no auth wrapper
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <InvestorPage token={investorToken} />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  // Full authenticated app
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
