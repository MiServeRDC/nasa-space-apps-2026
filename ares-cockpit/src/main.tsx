import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { waitForFontsReadyBounded } from './instruments/instrumentMath';

// NotebookLM Risk 1 Fix: prime bounded local WOFF2 readiness promise immediately at boot
void waitForFontsReadyBounded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
