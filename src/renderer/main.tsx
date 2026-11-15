import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/simulator.css';

export function mountSimulatorApp(rootElement: HTMLElement | null): void {
  if (!rootElement) {
    return;
  }
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (typeof document !== 'undefined') {
  mountSimulatorApp(document.getElementById('root'));
}
