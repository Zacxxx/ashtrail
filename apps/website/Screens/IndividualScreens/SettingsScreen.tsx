
import React from 'react';
import { Card, Button, Badge, ProgressBar, ScreenShell, Stack, Container } from '../../UI/Primitives';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  return (
    <ScreenShell variant="technical">
      <Container centered className="max-w-4xl flex flex-col gap-6 animate-in fade-in zoom-in duration-500 overflow-y-auto">
        <div className="flex justify-between items-end border-b border-zinc-800 pb-4 shrink-0">
           <div>
             <h2 className="text-4xl font-black italic mono uppercase text-white leading-none">Settings</h2>
             <span className="text-[10px] mono uppercase text-zinc-500 tracking-[0.3em]">System Diagnostics & Configuration</span>
           </div>
           <Button variant="secondary" size="sm" onClick={onBack}>Return to Uplink</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Audio Feedback">
            <Stack gap={6}>
              <Stack gap={2}>
                <div className="flex justify-between text-[10px] mono uppercase text-zinc-400">
                  <span>Environmental Ambience</span>
                  <span>75%</span>
                </div>
                <ProgressBar value={75} max={100} color="bg-orange-500" />
              </Stack>
              <Stack gap={2}>
                <div className="flex justify-between text-[10px] mono uppercase text-zinc-400">
                  <span>Comm-Link (Dialogue)</span>
                  <span>90%</span>
                </div>
                <ProgressBar value={90} max={100} color="bg-orange-500" />
              </Stack>
              <Stack gap={2}>
                <div className="flex justify-between text-[10px] mono uppercase text-zinc-400">
                  <span>UI Feedback</span>
                  <span>40%</span>
                </div>
                <ProgressBar value={40} max={100} color="bg-zinc-600" />
              </Stack>
            </Stack>
          </Card>

          <Card title="Visual Uplink">
            <Stack gap={4}>
              <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-sm">
                <span className="text-xs mono uppercase text-zinc-300">High Fidelity Shadows</span>
                <div className="h-4 w-8 bg-orange-600 rounded-full flex items-center px-1">
                  <div className="h-2 w-2 bg-white rounded-full ml-auto" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-sm">
                <span className="text-xs mono uppercase text-zinc-300">Screen Shake (Impact)</span>
                <div className="h-4 w-8 bg-zinc-700 rounded-full flex items-center px-1">
                  <div className="h-2 w-2 bg-zinc-400 rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-sm">
                <span className="text-xs mono uppercase text-zinc-300">Retro Terminal Effect</span>
                <div className="h-4 w-8 bg-orange-600 rounded-full flex items-center px-1">
                  <div className="h-2 w-2 bg-white rounded-full ml-auto" />
                </div>
              </div>
            </Stack>
          </Card>

          <Card title="Data Persistence" className="md:col-span-2">
             <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="flex-1 space-y-2">
                   <h4 className="text-sm font-bold text-white mono uppercase">Reset Local Shard</h4>
                   <p className="text-[10px] text-zinc-500 leading-relaxed uppercase mono">
                     This will wipe all locally stored character data and settings. This action is irreversible once the overwrite sequence begins.
                   </p>
                </div>
                <Button variant="danger" className="w-full md:w-auto">Purge Data Store</Button>
             </div>
          </Card>
        </div>

        <Stack direction="row" gap={8} className="justify-center py-4 border-t border-zinc-900 shrink-0">
           <div className="flex items-center gap-2">
             <Badge color="zinc">v0.6.1</Badge>
             <span className="text-[8px] mono text-zinc-600 uppercase">Synchronized Build</span>
           </div>
           <div className="flex items-center gap-2">
             <Badge color="zinc">Uplink Status</Badge>
             <span className="text-[8px] mono text-green-700 uppercase">Optimal</span>
           </div>
        </Stack>
      </Container>
    </ScreenShell>
  );
};
