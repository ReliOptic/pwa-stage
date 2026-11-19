import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/simulator.css';
import { JourneyStudio } from './components/JourneyStudio';

export function mountSimulatorApp(rootElement: HTMLElement | null): void {
  if (!rootElement) {
    return;
  }
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      {window.journeyStudio ? <JourneyStudio bridge={window.journeyStudio}/> : <App />}
    </React.StrictMode>
  );
}

if (typeof document !== 'undefined') {
  mountSimulatorApp(document.getElementById('root'));
}
