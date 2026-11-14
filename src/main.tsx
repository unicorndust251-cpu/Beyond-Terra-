import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// StrictMode is left out on purpose: it mounts effects twice in development, which
// would create and destroy each WebGL context twice on startup.
createRoot(document.getElementById('root')!).render(<App />);
