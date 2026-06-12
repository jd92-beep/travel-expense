import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

function forwardCompactOAuthCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get('compact_oauth') !== '1') return false;
  const compactUrl = new URL(import.meta.env.VITE_COMPACT_PUBLIC_URL || 'https://travel-expense-compact.netlify.app/');
  compactUrl.hash = window.location.hash;
  window.location.replace(compactUrl.toString());
  return true;
}

function loadLocalDevSecrets(): Promise<void> {
  if (!import.meta.env.DEV || typeof document === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '/travel-expense/secrets.local.js';
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
    window.setTimeout(resolve, 800);
  });
}

if (!forwardCompactOAuthCallback()) {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  void loadLocalDevSecrets().finally(() => {
    if (import.meta.env.DEV) {
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );
    } else {
      root.render(<App />);
    }
  });
}
