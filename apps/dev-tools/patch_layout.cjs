const fs = require('fs');
const file = "/home/moebius/dev/projects/ashtrail/apps/dev-tools/src/WorldGenPage.tsx";
let content = fs.readFileSync(file, 'utf8');

const geoStart = content.indexOf('{activeStep === "GEO" && (');
const ecoStart = content.indexOf('{activeStep === "ECO" && (');

if (geoStart === -1 || ecoStart === -1) {
    console.error("Markers not found");
    process.exit(1);
}

// Extract the original geo block
let geoBlockRaw = content.substring(geoStart, ecoStart);
// Strip the wrapper: {activeStep === "GEO" && ( \n ... \n )} \n \n
geoBlockRaw = geoBlockRaw.replace('{activeStep === "GEO" && (', '');
let lastParenIdx = geoBlockRaw.lastIndexOf(')}');
// take just the inside
let geoBlock = geoBlockRaw.substring(0, lastParenIdx).trim();

// modify the geoBlock for the header
geoBlock = geoBlock.replace('className="flex flex-col gap-4 h-full"', 'className="flex flex-col gap-4 max-h-[85vh]"');
geoBlock = geoBlock.replace('bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5', 'bg-[#1e1e1e]/90 backdrop-blur-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]');

// The new components we want
const globalDropdown = `
        {/* ── Global Header Config Dropdown ── */}
        <div className={\`absolute top-2 left-1/2 -translate-x-1/2 w-[600px] z-[60] transition-all duration-500 origin-top \${isHeaderConfigOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-4 pointer-events-none"}\`}>
${geoBlock}
        </div>
`;

const sidebarStub = `
          {activeStep === "GEO" && (
            <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-[200px] shrink-0">
              <div className="p-5 flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
                </div>
                <h3 className="text-[11px] font-black tracking-[0.2em] text-[#E6E6FA] mb-2">GEOLOGY ENGINE</h3>
                <p className="text-[10px] text-gray-500 leading-relaxed max-w-[200px]">Configure your planetary parameters in the top header menu, then generate the base globe.</p>
              </div>
            </div>
          )}

          {activeStep === "GEOGRAPHY" && (
            <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
              <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-[#0ea5e9] flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
                  GEOGRAPHY TOOLS
                </h3>
                
                <div className="space-y-4">
                  {isDrawingLasso && (
                     <div className="text-[9px] font-bold tracking-widest text-[#0ea5e9] animate-pulse pb-2 text-center border-b border-[#0ea5e9]/20">
                       DRAW ON THE 2D MAP...
                     </div>
                  )}
                  <button 
                    onClick={() => {
                        setViewMode("2d");
                        setIsDrawingLasso(!isDrawingLasso);
                    }}
                    className={\`w-full flex items-center justify-between p-4 rounded-xl border transition-colors group \${isDrawingLasso ? 'bg-cyan-500/20 border-cyan-500/50' : 'border-white/10 bg-white/5 hover:bg-white/10'}\`}>
                    <div className="flex flex-col text-left">
                      <span className={\`text-[10px] font-bold tracking-widest transition-colors \${isDrawingLasso ? 'text-cyan-400' : 'text-gray-300 group-hover:text-white'}\`}>LASSO SELECT</span>
                      <span className="text-[9px] text-gray-500 mt-1">Manually trace landmasses</span>
                    </div>
                    <svg className="w-4 h-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  
                  {regions.length > 0 && (
                    <div className="mt-6 space-y-2">
                       <h4 className="text-[9px] font-bold tracking-[0.2em] text-gray-500 border-b border-white/5 pb-2 mb-3">DEFINED REGIONS</h4>
                       {regions.map(r => (
                         <div key={r.id} className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                           <div className="flex items-center gap-3">
                             <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                             <span className="text-[10px] text-gray-300 font-bold">{r.name}</span>
                           </div>
                           <button onClick={() => setRegions(prev => prev.filter(x => x.id !== r.id))} className="text-red-400 hover:text-red-300">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                           </button>
                         </div>
                       ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

`;

// Assemble new content
let newContent = content.substring(0, geoStart);
// insert the global dropdown at the top of main layout flex
let mainLayoutMarker = '{/* ══ Main Layout ══ */}';
let mainIdx = newContent.indexOf(mainLayoutMarker);
if (mainIdx !== -1) {
    let flexMarker = 'className="flex-1 flex overflow-hidden relative z-10 pt-16">';
    let flexIdx = newContent.indexOf(flexMarker, mainIdx);
    if (flexIdx !== -1) {
        let before = newContent.substring(0, flexIdx + flexMarker.length);
        let after = newContent.substring(flexIdx + flexMarker.length);
        newContent = before + "\n" + globalDropdown + after;
    }
} else {
    console.error("Main layout marker not found");
}

newContent += sidebarStub;
newContent += content.substring(ecoStart);

fs.writeFileSync(file, newContent, 'utf8');
console.log("Success");
