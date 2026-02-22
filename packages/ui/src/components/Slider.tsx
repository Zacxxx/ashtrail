import React, { memo } from "react";

export interface SliderProps {
    /** Label displayed above the slider */
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** Custom formatter for the display value */
    format?: (v: number) => string;
    onChange: (v: number) => void;
    className?: string;
}

export const Slider = memo(function Slider({
    label,
    value,
    min,
    max,
    step,
    format,
    onChange,
    className = "",
}: SliderProps) {
    const display = format ? format(value) : String(value);
    return (
        <div className={className}>
            <div className="flex justify-between mb-1">
                <span className="text-gray-500 text-[10px] tracking-wider">{label}</span>
                <span className="text-[#E6E6FA] text-[10px] font-mono">{display}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-[#E6E6FA] h-1"
            />
        </div>
    );
});
