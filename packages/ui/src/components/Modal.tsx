import React, { memo, useEffect } from "react";

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    /** Max width class — defaults to max-w-4xl */
    maxWidth?: string;
    className?: string;
}

export const Modal = memo(function Modal({
    open,
    onClose,
    title,
    children,
    maxWidth = "max-w-4xl",
    className = "",
}: ModalProps) {
    // Close on Escape key
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onClose}
        >
            <div
                className={`w-full ${maxWidth} h-[80vh] bg-[#1e1e1e]/90 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl flex flex-col overflow-hidden ${className}`}
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div className="h-14 border-b border-white/5 flex justify-between items-center px-6 shrink-0 bg-white/5">
                        <h3 className="text-[10px] font-black tracking-[0.2em] text-[#E6E6FA]">
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-white transition-colors"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
});
