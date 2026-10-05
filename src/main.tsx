import { createRoot } from 'react-dom/client';
import '@aaronherbert/design-system/fonts.css';
import '@aaronherbert/design-system/styles.css';
import { App } from './ui/App';

// No <StrictMode>: its double-mounted effects would open, tear down and
// reopen the PeerJS connections, which briefly frees the room's peer id.
createRoot(document.getElementById('root')!).render(<App />);
