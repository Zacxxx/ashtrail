
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  size = 'md',
  className = '', 
  ...props 
}) => {
  const base = "rounded font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider mono shrink-0";
  const sizes = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-5 py-2.5 text-xs",
    lg: "px-8 py-4 text-sm"
  };
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700",
    danger: "bg-red-900/40 hover:bg-red-800/60 text-red-200 border border-red-800/50",
    accent: "bg-orange-600 hover:bg-orange-500 text-white",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-400"
  };

  return (
    <button 
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} 
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = "", ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-[10px] uppercase text-zinc-500 mono">{label}</label>}
    <input 
      className={`w-full bg-zinc-900 border border-zinc-800 p-3 text-white mono focus:border-orange-500 outline-none rounded-sm text-sm transition-colors ${className}`}
      {...props}
    />
  </div>
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }> = ({ label, options, className = "", ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-[10px] uppercase text-zinc-500 mono">{label}</label>}
    <select 
      className={`w-full bg-zinc-900 border border-zinc-800 p-3 text-white mono focus:border-orange-500 outline-none rounded-sm text-sm appearance-none transition-colors ${className}`}
      {...props}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-zinc-900">{opt.label}</option>
      ))}
    </select>
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; title?: string; className?: string; headerAction?: React.ReactNode }> = ({ 
  children, 
  title, 
  className = "",
  headerAction
}) => (
  <div className={`bg-zinc-900/80 border border-zinc-800 rounded-sm overflow-hidden flex flex-col backdrop-blur-md ${className}`}>
    {title && (
      <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex justify-between items-center">
        <span>{title}</span>
        {headerAction}
      </div>
    )}
    <div className="p-4 flex-1 overflow-hidden flex flex-col">
      {children}
    </div>
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: 'blue' | 'red' | 'green' | 'zinc' | 'orange' }> = ({ 
  children, 
  color = 'zinc' 
}) => {
  const colors = {
    blue: "bg-blue-900/30 text-blue-400 border-blue-800/50",
    red: "bg-red-900/30 text-red-400 border-red-800/50",
    green: "bg-green-900/30 text-green-400 border-green-800/50",
    orange: "bg-orange-900/30 text-orange-400 border-orange-800/50",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700"
  };
  return (
    <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold border uppercase tracking-tighter ${colors[color]}`}>
      {children}
    </span>
  );
};

export const ProgressBar: React.FC<{ value: number; max: number; color?: string; label?: string }> = ({ 
  value, 
  max, 
  color = "bg-blue-500",
  label 
}) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-500 mb-1">
          <span>{label}</span>
          <span>{value}/{max}</span>
        </div>
      )}
      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${color}`} 
          style={{ width: `${percent}%` }} 
        />
      </div>
    </div>
  );
};

export const Stack: React.FC<{ children: React.ReactNode; gap?: number; className?: string; direction?: 'col' | 'row' }> = ({ 
  children, 
  gap = 4, 
  className = "",
  direction = 'col'
}) => {
  const flexDir = direction === 'col' ? 'flex-col' : 'flex-row';
  const gapClass = `gap-${gap}`;
  return (
    <div className={`flex ${flexDir} ${gapClass} ${className}`}>
      {children}
    </div>
  );
};

export const Container: React.FC<{ children: React.ReactNode; className?: string; centered?: boolean }> = ({ 
  children, 
  className = "",
  centered = false
}) => (
  <div className={`max-w-4xl w-full ${centered ? 'mx-auto' : ''} ${className}`}>
    {children}
  </div>
);

export const ScreenShell: React.FC<{ children: React.ReactNode; variant?: 'wasteland' | 'technical' }> = ({ 
  children,
  variant = 'wasteland'
}) => {
  const bg = variant === 'wasteland' ? "bg-zinc-950" : "bg-black";
  return (
    <div className={`relative h-screen w-full flex flex-col items-center justify-center ${bg} overflow-hidden`}>
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        {variant === 'wasteland' && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-orange-900/5 to-transparent" />
        )}
      </div>
      <div className="z-10 w-full h-full flex flex-col items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
};

export const Tooltip: React.FC<{ content: React.ReactNode; children: React.ReactNode }> = ({ content, children }) => {
  return (
    <div className="relative group cursor-help">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-zinc-950 border border-zinc-800 shadow-2xl rounded text-[9px] mono uppercase text-zinc-300 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-[100] text-center leading-relaxed">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-800" />
      </div>
    </div>
  );
};
