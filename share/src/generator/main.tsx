import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import '../styles/generator.css';

const container = document.getElementById('share-generator-root');
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
