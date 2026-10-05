import { Banner, Button, Field, Stack, TextField } from '@aaronherbert/design-system';
import { useState, type FormEvent } from 'react';
import { cleanName } from '../engine/engine';
import { PLAYER_COLORS } from '../engine/types';
import { ConnectError, JoinRejectedError, joinRoom, type Joined } from '../net/guestTransport';
import { isRoomCode } from '../net/peerIds';
import { getSessionId, loadName, saveName } from '../session/storage';

interface HomeScreenProps {
  notice?: string | null;
  onCreate: (name: string) => void;
  onJoined: (code: string, name: string, joined: Joined) => void;
}

const LOGO = 'SUDOKU'.split('');
const CODE_SLOTS = [0, 1, 2, 3, 4];

export function HomeScreen({ notice, onCreate, onJoined }: HomeScreenProps) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [joining, setJoining] = useState(false);

  const validName = () => {
    const clean = cleanName(name);
    if (!clean) {
      setNameError('Enter a display name so other players know who you are.');
      return null;
    }
    setNameError(undefined);
    saveName(clean);
    return clean;
  };

  const create = () => {
    const clean = validName();
    if (clean) onCreate(clean);
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const clean = validName();
    const trimmed = code.trim();
    if (!isRoomCode(trimmed)) {
      setCodeError('Enter the five-digit code the host shared, like 48213.');
      return;
    }
    setCodeError(undefined);
    if (!clean) return;

    setJoining(true);
    try {
      const joined = await joinRoom(trimmed, getSessionId(), clean);
      onJoined(trimmed, clean, joined);
    } catch (err) {
      setJoining(false);
      if (err instanceof JoinRejectedError) {
        setCodeError(
          err.reason === 'full'
            ? 'That game already has 8 players. Ask the host to start a new one.'
            : 'That game has ended. Ask the host for a new code.',
        );
      } else if (err instanceof ConnectError && err.kind === 'not-found') {
        setCodeError(`No game with code ${trimmed}. Check the code with the host and try again.`);
      } else {
        setCodeError("Couldn't connect to that game. Check your internet connection and try again.");
      }
    }
  };

  const initial = cleanName(name).charAt(0).toUpperCase() || '?';

  return (
    <div className="arc-menu">
      <Stack gap={8}>
        <div className="arc-logo">
          <div className="arc-logo__tiles" aria-hidden="true">
            {LOGO.map((letter, i) => (
              <span key={i} className={`arc-logo__tile player-${PLAYER_COLORS[i]}`}>{letter}</span>
            ))}
          </div>
          <h1 className="arc-display arc-title arc-logo__title">
            <span className="sr-only">Sudoku </span>Mash
          </h1>
          <p className="arc-muted">Race your friends to fill the same Sudoku. First correct digit claims the cell.</p>
        </div>

        {notice && <Banner variant="subtle" title={notice} />}

        <TextField
          label="Your name"
          name="name"
          autoComplete="nickname"
          maxLength={20}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          fieldClassName="arc-field"
          leading={<span className="arc-token" aria-hidden="true">{initial}</span>}
        />

        <Stack gap={2}>
          <Button
            variant="ghost"
            className="arc-btn arc-btn--gold arc-btn--block"
            onClick={create}
            disabled={joining}
            leadingIcon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          >
            Host a game
          </Button>
          <p className="arc-muted arc-center">
            You get a code to share. Your browser runs the game, so keep this tab open.
          </p>
        </Stack>

        <form onSubmit={join} noValidate>
          <Stack gap={5}>
            <div className="arc-divider">
              <span className="arc-label">Or join a game</span>
            </div>
            <Field
              label="Room code"
              hint="Five digits, from the host's screen."
              error={codeError}
              className="arc-field"
            >
              {(control) => (
                <div className="code-tiles">
                  <input
                    {...control}
                    className="code-tiles__input"
                    name="code"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]*"
                    maxLength={5}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  />
                  {CODE_SLOTS.map((i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`code-tile${i === Math.min(code.length, 4) ? ' is-next' : ''}`}
                    >
                      {code[i] ?? ''}
                    </span>
                  ))}
                </div>
              )}
            </Field>
            <Button type="submit" variant="ghost" className="arc-btn arc-btn--blue arc-btn--block" loading={joining}>
              Join game
            </Button>
          </Stack>
        </form>
      </Stack>
    </div>
  );
}
