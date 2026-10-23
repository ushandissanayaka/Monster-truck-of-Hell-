import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game.js';
import { Hud } from './ui/Hud.jsx';
import { bootError } from './ui/boot.js';
import './ui/hud.css';

// The loading screen is #boot in index.html (shown before this code even downloads); Game.start
// fades it out when the game is ready.
export default function App() {
  const mount = useRef(null);
  const [game, setGame] = useState(null);

  useEffect(() => {
    const g = new Game(mount.current);
    setGame(g);
    g.start().catch((err) => {
      console.error('[game] failed to start', err);
      bootError();
    });
    return () => g.dispose();
  }, []);

  return (
    <div className="app">
      <div ref={mount} className="app" />
      <Hud game={game} />
    </div>
  );
}
