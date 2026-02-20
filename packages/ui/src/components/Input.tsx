import React, { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
        <input
          ref={ref}
          className={`px-3 py-2 bg-gray-900 border ${error ? "border-red-500" : "border-gray-700 focus:border-blue-500"} rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-1 ${error ? "focus:ring-red-500" : "focus:ring-blue-500"} transition-colors ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
