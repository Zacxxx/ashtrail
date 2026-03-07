import React from 'react';
import { TemporalityConfig } from '../hooks/useGenerationHistory';
import { AshtrailDate, getDaysInMonth } from '../lib/calendar';

interface DateSelectorProps {
    config?: TemporalityConfig | null;
    date: AshtrailDate;
    onChange: (date: AshtrailDate) => void;
    className?: string;
}

export function DateSelector({ config, date, onChange, className = "" }: DateSelectorProps) {
    if (!config) {
        return (
            <div className={`p-4 bg-[#121820] border border-dashed border-white/10 rounded-xl text-xs text-gray-500 font-bold tracking-widest uppercase text-center ${className}`}>
                No Temporality Defined
            </div>
        );
    }

    const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...date, year: parseInt(e.target.value) || 1 });
    };

    const handleEraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...date, era: e.target.value });
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newMonth = parseInt(e.target.value) || 1;
        const daysInNewMonth = getDaysInMonth(newMonth, config);
        let newDay = date.day;
        if (newDay > daysInNewMonth) {
            newDay = daysInNewMonth;
        }
        onChange({ ...date, month: newMonth, day: newDay });
    };

    const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDay = parseInt(e.target.value) || 1;
        onChange({ ...date, day: newDay });
    };

    const currentDaysInMonth = getDaysInMonth(date.month, config);

    return (
        <div className={`flex gap-3 items-end ${className}`}>
            <div className="flex flex-col gap-2 w-20 relative">
                <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Month</label>
                <select
                    value={date.month}
                    onChange={handleMonthChange}
                    className="w-full bg-[#05080c] border border-white/5 rounded-lg p-3 text-xs focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-cyan-300 shadow-inner appearance-none transition-all duration-300"
                >
                    {config.months.map((m, idx) => (
                        <option key={idx} value={idx + 1}>{m.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col gap-2 w-16 relative">
                <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Day</label>
                <input
                    type="number"
                    min={1}
                    max={currentDaysInMonth}
                    value={date.day}
                    onChange={handleDayChange}
                    className="w-full bg-[#05080c] border border-white/5 rounded-lg p-3 text-xs focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-gray-200 shadow-inner font-mono transition-all duration-300"
                />
            </div>
            <div className="flex flex-col gap-2 w-24 relative">
                <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Year</label>
                <input
                    type="number"
                    min={1}
                    value={date.year}
                    onChange={handleYearChange}
                    className="w-full bg-[#05080c] border border-white/5 rounded-lg p-3 text-xs focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-gray-200 shadow-inner font-mono transition-all duration-300"
                />
            </div>
            <div className="flex flex-col gap-2 w-20 relative">
                <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Era</label>
                <select
                    value={date.era}
                    onChange={handleEraChange}
                    className="w-full bg-[#05080c] border border-white/5 rounded-lg p-3 text-xs focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-cyan-300 shadow-inner appearance-none transition-all duration-300"
                >
                    <option value={config.eras.before}>{config.eras.before}</option>
                    <option value={config.eras.after}>{config.eras.after}</option>
                </select>
            </div>
        </div>
    );
}
