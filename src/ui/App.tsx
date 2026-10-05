import { AppShell, Button, Container, ThemeProvider, ToastProvider } from '@aaronherbert/design-system';
import { useCallback, useState } from 'react';
import type { Joined } from '../net/guestTransport';
import { useGuestRoom } from '../session/useGuestRoom';
import { useHostRoom } from '../session/useHostRoom';
import {
  clearGuest,
  clearHost,
  getSessionId,
  loadGuest,
  loadHost,
  loadTheme,
  pruneExpired,
  saveTheme,
  type ThemeChoice,
} from '../session/storage';
import { HomeScreen } from './HomeScreen';
import { RoomScreen } from './RoomScreen';
import './app.css';
import './arcade.css';

type Screen =
  | { kind: 'home'; notice?: string }
  | { kind: 'host'; mode: 'create' | 'resume'; name: string }
  | { kind: 'guest'; code: string; name: string; initial?: Joined };

/** After a refresh, go straight back into the room this tab was in. */
function initialScreen(): Screen {
  pruneExpired();
  const host = loadHost();
  if (host && host.state.phase !== 'closed') return { kind: 'host', mode: 'resume', name: host.name };
  const guest = loadGuest();
  if (guest) return { kind: 'guest', code: guest.code, name: guest.name };
  return { kind: 'home' };
}

export function App() {
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [sessionId] = useState(getSessionId);

  const goHome = useCallback((notice?: string) => {
    clearHost();
    clearGuest();
    setScreen({ kind: 'home', notice });
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveTheme(next);
  };

  return (
    <ThemeProvider theme={theme}>
      <ToastProvider>
        <AppShell
          className="arc-shell"
          brand={<span className="arc-brand">Sudoku <span>Mash</span></span>}
          headerActions={
            <Button variant="ghost" size="sm" className="arc-btn arc-btn--sm" onClick={toggleTheme} aria-pressed={theme === 'light'}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </Button>
          }
        >
          <Container size="lg">
            {screen.kind === 'home' && (
              <Container size="sm">
                <HomeScreen
                  notice={screen.notice}
                  onCreate={(name) => setScreen({ kind: 'host', mode: 'create', name })}
                  onJoined={(code, name, initial) => setScreen({ kind: 'guest', code, name, initial })}
                />
              </Container>
            )}
            {screen.kind === 'host' && (
              <HostRoom key={`host-${screen.mode}`} mode={screen.mode} name={screen.name} sessionId={sessionId} onExit={goHome} />
            )}
            {screen.kind === 'guest' && (
              <GuestRoom
                key={`guest-${screen.code}`}
                code={screen.code}
                name={screen.name}
                initial={screen.initial}
                sessionId={sessionId}
                onExit={goHome}
              />
            )}
          </Container>
        </AppShell>
      </ToastProvider>
    </ThemeProvider>
  );
}

interface HostRoomProps {
  mode: 'create' | 'resume';
  name: string;
  sessionId: string;
  onExit: (notice?: string) => void;
}

function HostRoom({ mode, name, sessionId, onExit }: HostRoomProps) {
  const room = useHostRoom({ mode, name, sessionId });
  return <RoomScreen room={room} onExit={onExit} />;
}

interface GuestRoomProps {
  code: string;
  name: string;
  sessionId: string;
  initial?: Joined;
  onExit: (notice?: string) => void;
}

function GuestRoom({ code, name, sessionId, initial, onExit }: GuestRoomProps) {
  const room = useGuestRoom({ code, name, sessionId, initial });
  return <RoomScreen room={room} onExit={onExit} />;
}
