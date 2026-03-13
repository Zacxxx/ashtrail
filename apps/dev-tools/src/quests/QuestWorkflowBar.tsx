interface QuestWorkflowBarProps {
    steps: string[];
    activeStep: string;
    onStepChange: (step: string) => void;
}

export function QuestWorkflowBar({ steps, activeStep, onStepChange }: QuestWorkflowBarProps) {
    return (
        <div className="flex items-center bg-[#1e1e1e]/50 border border-white/5 rounded-full p-1 shadow-lg backdrop-blur-md">
            {steps.map((step, index) => {
                const isActive = activeStep === step;
                return (
                    <button
                        key={step}
                        type="button"
                        onClick={() => onStepChange(step)}
                        className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition-all duration-300 ${isActive
                            ? 'bg-amber-500/15 text-amber-200 shadow-sm'
                            : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                        }`}
                    >
                        <span className="text-[10px] font-black opacity-60">0{index + 1}</span>
                        <span className="text-[10px] font-bold tracking-[0.24em] uppercase">{step}</span>
                    </button>
                );
            })}
        </div>
    );
}
