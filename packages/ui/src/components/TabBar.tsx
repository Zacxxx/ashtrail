import React, { memo } from "react";

export interface TabBarProps {
    /** List of tab identifiers */
    tabs: string[];
    /** Currently active tab */
    activeTab: string;
    /** Called when a tab is clicked */
    onTabChange: (tab: string) => void;
    /** Optional label formatter — defaults to tab.toUpperCase() */
    formatLabel?: (tab: string) => string;
    /** Additional wrapper class */
    className?: string;
}

export const TabBar = memo(function TabBar({
    tabs,
    activeTab,
    onTabChange,
    formatLabel,
    className = "",
}: TabBarProps) {
    return (
        <div
            className={`flex items-center gap-2 bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-full p-1 shadow-lg ${className}`}
        >
            {tabs.map((tab) => (
                <button
                    key={tab}
                    onClick={() => onTabChange(tab)}
                    className={`flex-1 px-4 py-1.5 text-[10px] font-bold tracking-widest rounded-full transition-all duration-300 ${activeTab === tab
                        ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-sm"
                        : "bg-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
                        }`}
                >
                    {formatLabel ? formatLabel(tab) : tab.toUpperCase()}
                </button>
            ))}
        </div>
    );
});
