import { useState } from 'react';
import { PermissionScreen } from './components/PermissionScreen';
import './app.css';

type AppScreen = 'permission' | 'warmup' | 'waiting' | 'game';

function App() {
  const params = new URLSearchParams(window.location.search);
  const serverUrl = params.get('server') ?? '';
  const roomCode  = params.get('room')?.toUpperCase() ?? '';
  const playerSlot: 1 | 2 = params.get('slot') === '2' ? 2 : 1;

  const [screen, setScreen] = useState<AppScreen>('permission');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  function handlePermissionGranted(stream: MediaStream) {
    setCameraStream(stream);
    setScreen('warmup');
  }

  // Stubs — Plans 03 and 04 replace these
  void serverUrl;
  void roomCode;
  void playerSlot;
  void cameraStream;

  return (
    <div className="app-root">
      {screen === 'permission' && (
        <PermissionScreen onPermissionGranted={handlePermissionGranted} />
      )}
      {screen === 'warmup' && (
        <p>Warmup screen — Phase 12 Plan 04</p>
      )}
      {screen === 'waiting' && (
        <p>Waiting screen — Phase 12 Plan 03</p>
      )}
      {screen === 'game' && (
        <div id="game-canvas-root" />
      )}
    </div>
  );
}

export default App;
