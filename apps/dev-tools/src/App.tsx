import { useState } from "react";
import { Button, Card, CardContent, CardHeader } from "@ashtrail/ui";
import { MapCanvas } from "./components/MapCanvas";
import { GeoConfig } from "./modules/geo/types";

type WorkflowStep = "GEO" | "HUBS" | "ANTS" | "SHAPES" | "SUBDIV" | "TRAFFIC" | "NAMES" | "SAT";
const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "HUBS", "ANTS", "SHAPES", "SUBDIV", "TRAFFIC", "NAMES", "SAT"];

export function App() {
  const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
  const [activeMenu, setActiveMenu] = useState<"inspector" | "visualizations" | "settings">("inspector");

  const [geoConfig, setGeoConfig] = useState<GeoConfig>({
    seed: 42,
    scale: 300,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    waterLevel: 0.4
  });

  return (
    <div className="flex flex-col h-screen bg-[#0a0f14] text-gray-300 font-sans tracking-wide overflow-hidden">
      
      {/* Top Header */}
      <header className="h-12 flex items-center justify-between px-6 bg-[#0a0f14] border-b border-[#1f2937]">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-[#0a0f14] font-bold text-xs">
            S
          </div>
          <h1 className="text-sm font-bold tracking-[0.2em] text-gray-100">SPRAWL <span className="text-gray-600 font-normal">| OLAAS</span></h1>
        </div>
        <div className="flex gap-4 text-xs font-semibold tracking-widest text-teal-500">
          <button className="hover:text-teal-400 transition-colors">GENERATION</button>
          <button className="text-gray-500 hover:text-gray-400 transition-colors">CONCEPTS</button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Floating Sidebar */}
        <aside className="absolute left-4 top-4 w-64 flex flex-col gap-2 z-10">
          <button 
            onClick={() => setActiveMenu("inspector")}
            className="flex items-center justify-between w-full px-4 py-3 text-xs font-bold tracking-widest bg-[#121820] border border-[#1f2937] rounded-md hover:border-teal-500/50 transition-colors"
          >
            GEOGRAPHY INSPECTOR
            <span className="text-gray-500">+</span>
          </button>
          {activeMenu === "inspector" && (
            <div className="p-4 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md text-xs space-y-4">
               
               <div>
                 <div className="flex justify-between mb-1">
                    <span className="text-gray-500">NOISE SCALE</span>
                    <span className="text-teal-500">{geoConfig.scale}</span>
                 </div>
                 <input 
                    type="range" min="50" max="800" step="10" 
                    value={geoConfig.scale}
                    onChange={e => setGeoConfig({...geoConfig, scale: Number(e.target.value)})}
                    className="w-full accent-teal-500" 
                 />
               </div>

               <div>
                 <div className="flex justify-between mb-1">
                    <span className="text-gray-500">WATER LEVEL</span>
                    <span className="text-teal-500">{geoConfig.waterLevel.toFixed(2)}</span>
                 </div>
                 <input 
                    type="range" min="0" max="1" step="0.05"
                    value={geoConfig.waterLevel}
                    onChange={e => setGeoConfig({...geoConfig, waterLevel: Number(e.target.value)})}
                    className="w-full accent-teal-500" 
                 />
               </div>

               <div>
                 <div className="flex justify-between mb-1">
                    <span className="text-gray-500">OCTAVES (DETAIL)</span>
                    <span className="text-teal-500">{geoConfig.octaves}</span>
                 </div>
                 <input 
                    type="range" min="1" max="8" step="1"
                    value={geoConfig.octaves}
                    onChange={e => setGeoConfig({...geoConfig, octaves: Number(e.target.value)})}
                    className="w-full accent-teal-500" 
                 />
               </div>

               <Button 
                variant="secondary" 
                onClick={() => setGeoConfig({...geoConfig, seed: Math.floor(Math.random() * 1000000)})}
                className="w-full text-[10px] tracking-widest py-2 mt-4 bg-[#1f2937] hover:bg-[#374151] border border-gray-700"
               >
                 REGENERATE SEED ({geoConfig.seed})
               </Button>
            </div>
          )}

          <button 
            onClick={() => setActiveMenu("visualizations")}
            className="flex items-center justify-between w-full px-4 py-3 text-xs font-bold tracking-widest bg-[#121820] border border-[#1f2937] rounded-md hover:border-teal-500/50 transition-colors"
          >
            VISUALIZATIONS
            <span className="text-gray-500">+</span>
          </button>
          
          <button 
            onClick={() => setActiveMenu("settings")}
            className="flex items-center justify-between w-full px-4 py-3 text-xs font-bold tracking-widest bg-[#121820] border border-[#1f2937] rounded-md hover:border-teal-500/50 transition-colors"
          >
            GLOBAL SETTINGS
            <span className="text-gray-500">+</span>
          </button>
        </aside>

        {/* Center Canvas Area */}
        <main className="flex-1 relative bg-[#0d1218] flex items-center justify-center">
            <div className="absolute inset-0 opacity-80 mix-blend-screen pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #0a0f14 100%)' }}></div>
            
            <div className="w-full h-full p-8 pt-16 pb-32">
               {/* Map View */}
               <MapCanvas width={2400} height={1600} hexSize={12} geoConfig={geoConfig} />
            </div>

            {/* Bottom Workflow Bar */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#121820]/80 backdrop-blur px-6 py-3 rounded-full border border-[#1f2937] z-20 shadow-2xl">
              <span className="text-[10px] font-bold tracking-widest text-gray-500 mr-4">WORKFLOW</span>
              {WORKFLOW_STEPS.map((step, idx) => (
                <button
                  key={step}
                  onClick={() => setActiveStep(step)}
                  className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all ${
                    activeStep === step 
                      ? "border-2 border-teal-500 bg-teal-500/10 text-teal-400" 
                      : "border border-transparent text-gray-600 hover:text-gray-400 hover:bg-[#1f2937]"
                  }`}
                >
                  <span className="text-sm font-bold">{idx + 1}</span>
                  <span className="text-[8px] font-bold tracking-wider">{step}</span>
                </button>
              ))}
            </div>
        </main>
        
        {/* Right GPU Monitor / Status */}
        <aside className="absolute bottom-4 right-4 z-10 w-48">
           <button className="flex items-center justify-between w-full px-4 py-3 text-[10px] font-bold tracking-widest bg-[#121820] border border-[#1f2937] rounded-md hover:border-teal-500/50 transition-colors text-gray-400 shadow-lg">
             PERFORMANCE PROFILE
             <span className="text-green-500">OPTIMAL</span>
           </button>
        </aside>
      </div>
    </div>
  );
}
