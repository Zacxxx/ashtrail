import React, { memo } from "react";

export interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    className?: string;
}

export const Toggle = memo(function Toggle({
    label,
    checked,
    onChange,
    className = "",
}: ToggleProps) {
    return (
        <label className={`flex items-center gap-3 cursor-pointer group ${className}`}>
            <div
                className={`w-10 h-5 rounded-full transition-colors relative ${checked ? "bg-[#E6E6FA]" : "bg-white/10"
                    }`}
            >
                <div
                    className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${checked ? "translate-x-5" : ""
                        }`}
                />
            </div>
            <span className="text-[10px] font-bold tracking-widest text-gray-400 group-hover:text-gray-200 transition-colors">
                {label}
            </span>
        </label>
    );
});
