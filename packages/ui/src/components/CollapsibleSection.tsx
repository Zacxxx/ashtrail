import React, { memo } from "react";

export interface CollapsibleSectionProps {
    title: string;
    collapsed: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    className?: string;
}

export const CollapsibleSection = memo(function CollapsibleSection({
    title,
    collapsed,
    onToggle,
    children,
    className = "",
}: CollapsibleSectionProps) {
    return (
        <div className={`mb-2 ${className}`}>
            <button
                onClick={onToggle}
                className="flex items-center justify-between w-full border-b border-[#1f2937] pb-2 mb-2 group"
            >
                <h3 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">
                    {title}
                </h3>
                <span
                    className={`text-gray-600 text-[10px] transition-transform ${collapsed ? "" : "rotate-180"
                        }`}
                >
                    ▾
                </span>
            </button>
            {!collapsed && <div className="space-y-3">{children}</div>}
        </div>
    );
});
