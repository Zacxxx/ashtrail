
import React, { useState, useEffect, useRef } from 'react';
import { Button, ScreenShell, Stack, Container } from '../../UI/Primitives';
import { calculateClockState, ClockState } from '@ashtrail/core';

interface MenuScreenProps {
  onStart: () => void;
  onManageCharacters?: () => void;
  onSettings?: () => void;
  onSignInWithGoogle?: () => void;
  onEmailSignIn?: (email: string, password: string) => Promise<void>;
  onEmailSignUp?: (email: string, password: string) => Promise<void>;
  onResetPassword?: (email: string) => Promise<void>;
  onSignOut?: () => void;
  authUserEmail?: string | null;
  authMessage?: string | null;
  hasCharacter?: boolean;
  serverStartTime: number;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({
  onStart,
  onManageCharacters,
  onSettings,
  onSignInWithGoogle,
  onEmailSignIn,
  onEmailSignUp,
  onResetPassword,
  onSignOut,
  authUserEmail,
  authMessage,
  hasCharacter,
  serverStartTime
}) => {
  const [clock, setClock] = useState<ClockState>(calculateClockState(serverStartTime));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(calculateClockState(serverStartTime));
    }, 1000);

    const startAudio = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => { });
        window.removeEventListener('click', startAudio);
        window.removeEventListener('keydown', startAudio);
      }
    };

    window.addEventListener('click', startAudio);
    window.addEventListener('keydown', startAudio);

    return () => {
      clearInterval(timer);
      window.removeEventListener('click', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
  }, [serverStartTime]);

  // Game starts on Oct 12, 2031.
  // Each cycle represents one full game day passing.
  const baseDate = new Date(2031, 9, 12); // October is month 9 (0-indexed)
  const gameDate = new Date(baseDate.getTime() + (clock.currentCycle - 1) * 24 * 60 * 60 * 1000);

  const formattedDate = gameDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const formattedTime = `${clock.gameHour.toString().padStart(2, '0')}:00`;

  return (
    <ScreenShell>
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
      >
        <source
          src="https://twvtzbxhfibsvoesteek.supabase.co/storage/v1/object/public/public-assets/homescreen.mp4"
          type="video/mp4"
        />
      </video>
      <audio
        ref={audioRef}
        src="https://twvtzbxhfibsvoesteek.supabase.co/storage/v1/object/public/public-assets/theme.mp3"
        loop
      />
      <Container centered className="flex flex-col items-center gap-16 text-center relative z-10">
        <Stack gap={4} className="animate-in fade-in slide-in-from-top-4 duration-1000">
          <h1 className="text-9xl font-black italic tracking-tighter text-white mono uppercase scale-y-110 leading-none">
            ASHTRAIL
          </h1>
        </Stack>

        <Stack gap={4} className="w-72 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
          {authUserEmail ? (
            <div className="text-[10px] mono text-zinc-400 uppercase tracking-[0.15em] bg-zinc-900/70 border border-zinc-800 px-3 py-2 rounded">
              Signed in: <span className="text-zinc-200 normal-case">{authUserEmail}</span>
            </div>
          ) : (
            <div className="text-[10px] mono text-zinc-500 uppercase tracking-[0.15em] bg-zinc-900/40 border border-zinc-800 px-3 py-2 rounded">
              Not signed in
            </div>
          )}

          {!authUserEmail && (
            <Button
              size="md"
              variant="secondary"
              onClick={onSignInWithGoogle}
              className="py-4 text-xs tracking-[0.1em] font-bold"
            >
              Sign In With Google
            </Button>
          )}

          {!authUserEmail && (
            <div className="flex flex-col gap-2 p-3 border border-zinc-800 rounded bg-zinc-900/50">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-orange-500/60"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-orange-500/60"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => onEmailSignIn?.(email, password)}
                  className="py-3 text-[10px] tracking-[0.1em] font-bold"
                >
                  Email Sign In
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => onEmailSignUp?.(email, password)}
                  className="py-3 text-[10px] tracking-[0.1em] font-bold"
                >
                  Email Sign Up
                </Button>
              </div>
              <Button
                size="md"
                variant="ghost"
                onClick={() => onResetPassword?.(email)}
                className="py-2 text-[10px] tracking-[0.1em] font-bold border border-zinc-800/50"
              >
                Reset Password
              </Button>
            </div>
          )}

          {authMessage && (
            <div className="text-[10px] mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded">
              {authMessage}
            </div>
          )}

          {authUserEmail && (
            <Button
              size="md"
              variant="ghost"
              onClick={onSignOut}
              className="py-3 text-[10px] tracking-[0.1em] font-bold border border-zinc-800/50"
            >
              Sign Out
            </Button>
          )}

          <Button
            size="lg"
            variant="accent"
            onClick={onStart}
            className="py-6 text-base tracking-[0.2em] font-black group relative overflow-hidden"
          >
            <span className="relative z-10">Create Character</span>
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
          </Button>

          {hasCharacter && (
            <Button
              size="md"
              variant="secondary"
              onClick={onManageCharacters}
              className="py-4 text-xs tracking-[0.1em] font-bold"
            >
              Manage Characters
            </Button>
          )}

          <Button
            size="md"
            variant="ghost"
            onClick={onSettings}
            className="py-3 text-[10px] tracking-[0.1em] font-bold border border-zinc-800/50"
          >
            Settings
          </Button>
        </Stack>

        <Stack direction="row" gap={8} className="mt-8 items-center justify-center opacity-40">
          <div className="text-[10px] mono uppercase text-zinc-400">Player Active</div>
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
          <div className="text-[10px] mono uppercase text-zinc-400 tracking-widest">
            {formattedDate} // {formattedTime} HRS
          </div>
        </Stack>
      </Container>
    </ScreenShell>
  );
};
