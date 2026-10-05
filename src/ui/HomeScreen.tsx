import { Banner, Button, Card, Heading, Stack, Text, TextField } from '@aaronherbert/design-system';
import { useState, type FormEvent } from 'react';
import { cleanName } from '../engine/engine';
import { ConnectError, JoinRejectedError, joinRoom, type Joined } from '../net/guestTransport';
import { isRoomCode } from '../net/peerIds';
import { getSessionId, loadName, saveName } from '../session/storage';

interface HomeScreenProps {
  notice?: string | null;
  onCreate: (name: string) => void;
  onJoined: (code: string, name: string, joined: Joined) => void;
}

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

  return (
    <Stack gap={8}>
      <Stack gap={2}>
        <Heading level={1} size="2xl">Sudoku Mash</Heading>
        <Text tone="muted" size="lg">
          Race your friends to fill the same Sudoku. Every correct digit claims a cell and scores points.
        </Text>
      </Stack>

      {notice && <Banner variant="subtle" title={notice} />}

      <Card padding="lg">
        <Stack gap={6}>
          <TextField
            label="Display name"
            name="name"
            autoComplete="nickname"
            maxLength={20}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
          />

          <Stack gap={3}>
            <Heading level={2} size="sm">Host a game</Heading>
            <Text size="sm" tone="muted">You get a code to share. Your browser runs the game, so keep this tab open.</Text>
            <div>
              <Button onClick={create} disabled={joining}>Create game</Button>
            </div>
          </Stack>

          <form onSubmit={join} noValidate>
            <Stack gap={3}>
              <Heading level={2} size="sm">Join a game</Heading>
              <TextField
                label="Room code"
                name="code"
                hint="Five digits, from the host's screen."
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                maxLength={5}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                error={codeError}
              />
              <div>
                <Button type="submit" variant="secondary" loading={joining}>Join game</Button>
              </div>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Stack>
  );
}
