import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './styles/weather-fx.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

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
