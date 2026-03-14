import type { WorkflowStep } from "./types";
import { WORKFLOW_STEPS, WORKFLOW_LABELS } from "./types";

interface WorkflowBarProps {
    activeStep: WorkflowStep;
    onStepChange: (step: WorkflowStep) => void;
}

export function WorkflowBar({ activeStep, onStepChange }: WorkflowBarProps) {
    return (
        <div className="flex items-center bg-[#1e1e1e]/60 backdrop-blur-md border border-white/5 rounded-full p-1 shadow-lg">
            {WORKFLOW_STEPS.map((step, idx) => {
                const isActive = activeStep === step;

                // For the compact header look, we'll keep the coloring very subtle 
                // but use the step's theme color when active.
                const colorMap: Record<string, { bg: string; text: string; }> = {
                    GEO: { bg: "bg-[#E6E6FA]/20", text: "text-[#E6E6FA]" },
                    GEOGRAPHY: { bg: "bg-cyan-500/20", text: "text-cyan-300" },
                    ECO: { bg: "bg-green-500/20", text: "text-green-300" },
                    HUMANITY: { bg: "bg-orange-500/20", text: "text-orange-300" },
                };
                const colorSettings = colorMap[step] ?? colorMap.HUMANITY;

                const bgClass = isActive ? `${colorSettings.bg} shadow-sm` : "bg-transparent hover:bg-white/5";
                const textClass = isActive ? colorSettings.text : "text-gray-500 hover:text-gray-300";

                return (
                    <button
                        key={step}
                        onClick={() => onStepChange(step)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-300 ${bgClass} ${textClass}`}
                    >
                        <span className="text-[10px] font-black opacity-60">0{idx + 1}</span>
                        <span className="text-[10px] font-bold tracking-widest">{WORKFLOW_LABELS[step].toUpperCase()}</span>
                    </button>
                );
            })}
        </div>
    );
}
