import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { waitForFontsReadyBounded } from './instruments/instrumentMath';

const AnatomyLab = lazy(() => import('./anatomy/FixtureInspector'));
const isAnatomyLab = window.location.pathname === '/anatomy-lab';

// NotebookLM Risk 1 Fix: prime bounded local WOFF2 readiness promise immediately at boot
void waitForFontsReadyBounded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAnatomyLab ? <Suspense fallback={<p>Loading reference tool</p>}><AnatomyLab /></Suspense> : <App />}
  </StrictMode>,
);
