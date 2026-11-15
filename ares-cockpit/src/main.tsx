import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { waitForFontsReadyBounded } from './instruments/instrumentMath';
import { initWebVitalsReporter } from './lib/webVitalsReporter';

const ReferenceAtlas = lazy(() => import('./anatomy/ReferenceInspector'));
const isReferenceAtlas = window.location.pathname === '/anatomy';
const AnatomyLab = lazy(() => import('./anatomy/FixtureInspector'));
const isAnatomyLab = window.location.pathname === '/anatomy-lab';

// NotebookLM Risk 1 Fix: prime bounded local WOFF2 readiness promise immediately at boot
void waitForFontsReadyBounded();
initWebVitalsReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isReferenceAtlas ? <Suspense fallback={<p>Loading reference atlas</p>}><ReferenceAtlas /></Suspense> : isAnatomyLab ? <Suspense fallback={<p>Loading reference tool</p>}><AnatomyLab /></Suspense> : <App />}
  </StrictMode>,
);
