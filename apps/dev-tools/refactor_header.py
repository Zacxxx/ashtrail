import os
import re

filepath = "/home/moebius/dev/projects/ashtrail/apps/dev-tools/src/WorldGenPage.tsx"
with open(filepath, "r") as f:
    content = f.read()

# 1. Update WORKFLOW_STEPS
content = content.replace(
    'type WorkflowStep = "GEO" | "ECO" | "HUMANITY";',
    'type WorkflowStep = "GEO" | "GEOGRAPHY" | "ECO" | "HUMANITY";'
)
content = content.replace(
    'const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "ECO", "HUMANITY"];',
    'const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "GEOGRAPHY", "ECO", "HUMANITY"];'
)
old_labels = """const WORKFLOW_LABELS: Record<WorkflowStep, string> = {
  GEO: "Geology",
  ECO: "Ecology",
  HUMANITY: "Humanity",
};"""
new_labels = """const WORKFLOW_LABELS: Record<WorkflowStep, string> = {
  GEO: "Geology",
  GEOGRAPHY: "Geography",
  ECO: "Ecology",
  HUMANITY: "Humanity",
};"""
content = content.replace(old_labels, new_labels)

# 2. Add isHeaderConfigOpen state
old_state = """  const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("base");"""
new_state = """  const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
  const [isHeaderConfigOpen, setIsHeaderConfigOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("base");"""
content = content.replace(old_state, new_state)

# 3. Add button to Header
old_header_btn = """          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all backdrop-blur-md shadow-lg ${showHistory ? 'bg-[#E6E6FA]/20 border-[#E6E6FA]/50 text-[#E6E6FA]' : 'bg-[#1e1e1e]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
            title="Generation Gallery"
          >"""
new_header_btn = """          <button 
            onClick={() => setIsHeaderConfigOpen(!isHeaderConfigOpen)}
            className={`flex items-center gap-2 px-4 py-1.5 h-10 rounded-full text-[10px] font-bold tracking-widest transition-all backdrop-blur-md shadow-lg border ${isHeaderConfigOpen ? "bg-[#E6E6FA] text-black border-[#E6E6FA]" : "bg-[#1e1e1e]/60 text-gray-300 hover:text-white border-white/10"}`}
          >
            PLANET CONFIG
            <svg className={`w-3 h-3 transition-transform duration-300 ${isHeaderConfigOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all backdrop-blur-md shadow-lg ${showHistory ? 'bg-[#E6E6FA]/20 border-[#E6E6FA]/50 text-[#E6E6FA]' : 'bg-[#1e1e1e]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
            title="Generation Gallery"
          >"""
content = content.replace(old_header_btn, new_header_btn)

# 4. Extract GEO Panel and wrap in header dropdown
start_marker = '{activeStep === "GEO" && ('
end_marker = '          {activeStep === "ECO" && ('
geo_block = content[content.find(start_marker) : content.find(end_marker)]

old_main_start = """      {/* ══ Main Layout ══ */}
      <div className="flex-1 flex overflow-hidden relative z-10 pt-16">

        {/* ── Left Sidebar (Prompt & Config) ── */}
        <aside className="absolute left-6 top-20 bottom-24 w-[340px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none pb-4">

""" + geo_block

# Process geo_block removing the {activeStep === "GEO" && ( and the trailing )}
import string
extracted_geo = geo_block.replace('{activeStep === "GEO" && (', '').rstrip()
if extracted_geo.endswith(')}'):
    extracted_geo = extracted_geo[:-2]
# Adjust classes on extracted geo slightly for the centered wide layout
extracted_geo = extracted_geo.replace('bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5', 'bg-[#1e1e1e]/90 backdrop-blur-2xl border border-white/10')
extracted_geo = extracted_geo.replace("h-full", "max-h-[80vh]")

new_main_start = """      {/* ══ Main Layout ══ */}
      <div className="flex-1 flex overflow-hidden relative z-10 pt-16">

        {/* ── Global Header Config Dropdown ── */}
        <div className={`absolute left-1/2 -translate-x-1/2 top-4 z-40 w-[600px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top ${isHeaderConfigOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-4 pointer-events-none"}`}>
""" + extracted_geo + """
        </div>

        {/* ── Left Sidebar (Tools & Active Step Config) ── */}
        <aside className="absolute left-6 top-8 bottom-24 w-[340px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none pb-4">

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
{ _ble_edit_exec_gexec__save_lastarg "$@"; } 4>&1 5>&2 &>/dev/null
