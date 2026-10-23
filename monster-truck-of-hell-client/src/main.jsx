import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { bloxity } from './bloxity/bloxity.js';
import './index.css';

// Boxity: init once on boot and subscribe before anything else (see docs.bloxity.io "handshake").
bloxity.init();

createRoot(document.getElementById('root')).render(<App />);
