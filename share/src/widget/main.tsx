import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import '../styles/widget.css';

const container = document.getElementById('share-widget-root');
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
