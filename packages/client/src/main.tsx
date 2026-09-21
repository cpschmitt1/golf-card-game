import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { registerServiceWorker } from './registerServiceWorker.js';
import './styles.css';

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
