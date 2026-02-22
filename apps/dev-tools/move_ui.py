import sys

filepath = "/home/moebius/dev/projects/ashtrail/apps/dev-tools/src/WorldGenPage.tsx"
with open(filepath, "r") as f:
    lines = f.readlines()

new_lines = []
in_geo_block = False
geo_block_lines = []

for i, line in enumerate(lines):
    if "type WorkflowStep =" in line:
        new_lines.append('type WorkflowStep = "GEO" | "GEOGRAPHY" | "ECO" | "HUMANITY";\n')
    elif "const WORKFLOW_STEPS:" in line:
        new_lines.append('const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "GEOGRAPHY", "ECO", "HUMANITY"];\n')
    elif "const WORKFLOW_LABELS:" in line:
        new_lines.append('const WORKFLOW_LABELS: Record<WorkflowStep, string> = {\n')
        new_lines.append('  GEO: "Geology",\n')
        new_lines.append('  GEOGRAPHY: "Geography",\n')
        new_lines.append('  ECO: "Ecology",\n')
        new_lines.append('  HUMANITY: "Humanity",\n')
        new_lines.append('};\n')
    elif "  GEO: \"Geology\"," in line or "  ECO: \"Ecology\"," in line or "  HUMANITY: \"Humanity\"," in line or "};" in line and "HUMANITY" in lines[i-1]:
        # skip old labels
        pass
    elif "const [activeStep, setActiveStep] = useState<WorkflowStep>(\"GEO\");" in line:
        new_lines.append(line)
        new_lines.append('  const [isHeaderConfigOpen, setIsHeaderConfigOpen] = useState(false);\n')
    elif "title=\"Generation Gallery\"" in line and "<button" in lines[i-3]:
        # Insert header button before the gallery button
        header_btn = """          <button 
            onClick={() => setIsHeaderConfigOpen(!isHeaderConfigOpen)}
            className={`flex items-center gap-2 px-4 py-1.5 h-10 rounded-full text-[10px] font-bold tracking-widest transition-all backdrop-blur-md shadow-lg border ${isHeaderConfigOpen ? "bg-[#E6E6FA] text-black border-[#E6E6FA]" : "bg-[#1e1e1e]/60 text-gray-300 hover:text-white border-white/10"}`}
          >
            PLANET CONFIG
            <svg className={`w-3 h-3 transition-transform duration-300 ${isHeaderConfigOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>\n\n"""
        new_lines.insert(-3, header_btn)
        new_lines.append(line)
    elif "{/* ══ Main Layout ══ */}" in line:
        new_lines.append(line)
    elif "className=\"flex-1 flex overflow-hidden relative z-10 pt-16\">" in line:
        new_lines.append(line)
        # We will insert the glob dropdown marker here, and replace it later
        new_lines.append("        {/* --- GLOB MARKER --- */}\n")
    elif "{activeStep === \"GEO\" && (" in line:
        in_geo_block = True
    elif in_geo_block and "  )}\n" == line and "        {activeStep === \"ECO\" && (" in lines[i+2]:
        in_geo_block = False
    elif in_geo_block:
        geo_block_lines.append(line)
    elif "        {/* ── Left Sidebar (Prompt & Config) ── */}" in line:
        # We replace the comment
        new_lines.append("        {/* ── Left Sidebar (Tools & Active Step Config) ── */}\n")
    elif "        <aside className=\"absolute left-6 top-20 bottom-24 w-[340px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none pb-4\">" in line:
        new_lines.append('        <aside className="absolute left-6 top-8 bottom-24 w-[340px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none pb-4">\n')
        
        # Inject the stubs
        stub = """
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
                <h3 className="text-[11px] font-black tracking-[0.2em] text-cyan-400 flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  GEOGRAPHY TOOLS
                </h3>
                
                <div className="space-y-4">
                  <button className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] font-bold tracking-widest text-gray-300 group-hover:text-white transition-colors">LASSO SELECT</span>
                      <span className="text-[9px] text-gray-500 mt-1">Manually trace landmasses</span>
                    </div>
                    <svg className="w-4 h-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>

                  <button className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group">
{ _ble_edit_exec_gexec__save_lastarg "$@"; } 4>&1 5>&2 &>/dev/null
