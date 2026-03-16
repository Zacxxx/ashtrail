import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

interface HelperModalProps {
    open: boolean;
    onClose: () => void;
}

export function HelperModal({ open, onClose }: HelperModalProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const location = useLocation();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Detect current tool from route
    const getCurrentTool = () => {
        const path = location.pathname;
        if (path.includes("/worldgen")) return "World Generator";
        if (path.includes("/asset-generator")) return "Asset Generator";
        if (path.includes("/game-master")) return "Game Master";
        if (path.includes("/gallery")) return "Gallery";
        if (path.includes("/gameplay-engine")) return "Gameplay Engine";
        if (path.includes("/character-builder")) return "Character Builder";
        if (path.includes("/history")) return "History";
        if (path.includes("/ecology")) return "Ecology";
        if (path.includes("/quests")) return "Quests";
        return "Dev Tools Hub";
    };

    const buildContextPrompt = (userMessage: string) => {
        const currentTool = getCurrentTool();
        const contextInfo = {
            currentTool,
            route: location.pathname,
            search: location.search,
        };

        return {
            prompt: userMessage,
            current_tool: contextInfo.currentTool,
            route: contextInfo.route,
        };
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            role: "user",
            content: input.trim(),
            timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const payload = buildContextPrompt(userMessage.content);
            const response = await fetch("/api/helper/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error("Failed to get response");
            }

            const data = await response.json();
            const assistantMessage: Message = {
                role: "assistant",
                content: data.text || "Sorry, I couldn't generate a response.",
                timestamp: Date.now(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error("Helper chat error:", error);
            const errorMessage: Message = {
                role: "assistant",
                content: "Sorry, I encountered an error. Please try again.",
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
                <div
                    className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl h-[600px] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/30">
                                <span className="text-xl">💬</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-white tracking-wider uppercase">
                                    Dev-Tools Helper
                                </h2>
                                <p className="text-xs text-gray-500">
                                    Currently in: {getCurrentTool()}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                                    <span className="text-3xl">🤖</span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">
                                    How can I help you?
                                </h3>
                                <p className="text-sm text-gray-500 max-w-md">
                                    Ask me anything about the dev-tools, workflows, features, or troubleshooting.
                                    I have access to the complete tutorial and can provide contextual guidance.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-xl px-4 py-3 ${
                                        msg.role === "user"
                                            ? "bg-teal-500/20 border border-teal-500/30 text-white"
                                            : "bg-[#2a2a2a] border border-white/10 text-gray-200"
                                    }`}
                                >
                                    {msg.role === "assistant" ? (
                                        <div className="text-sm prose prose-invert prose-sm max-w-none">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code: ({ node, inline, className, children, ...props }: any) => {
                                                        return inline ? (
                                                            <code className="bg-black/30 px-1.5 py-0.5 rounded text-teal-300 font-mono text-xs" {...props}>
                                                                {children}
                                                            </code>
                                                        ) : (
                                                            <code className="block bg-black/40 p-3 rounded-lg text-gray-300 font-mono text-xs overflow-x-auto" {...props}>
                                                                {children}
                                                            </code>
                                                        );
                                                    },
                                                    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                                                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                                    li: ({ children }) => <li className="text-gray-300">{children}</li>,
                                                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                                                    em: ({ children }) => <em className="text-teal-300">{children}</em>,
                                                    h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2 mt-3 first:mt-0">{children}</h1>,
                                                    h2: ({ children }) => <h2 className="text-base font-bold text-white mb-2 mt-3 first:mt-0">{children}</h2>,
                                                    h3: ({ children }) => <h3 className="text-sm font-bold text-white mb-1 mt-2 first:mt-0">{children}</h3>,
                                                    blockquote: ({ children }) => (
                                                        <blockquote className="border-l-4 border-teal-500/50 pl-3 italic text-gray-400 my-2">
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                    a: ({ children, href }) => (
                                                        <a href={href} className="text-teal-400 hover:text-teal-300 underline" target="_blank" rel="noopener noreferrer">
                                                            {children}
                                                        </a>
                                                    ),
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="max-w-[80%] rounded-xl px-4 py-3 bg-[#2a2a2a] border border-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                                        <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                                        <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-6 py-4 border-t border-white/10 bg-[#1a1a1a]">
                        <div className="flex items-stretch gap-3">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Ask a question..."
                                className="flex-1 bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 transition-all min-h-[60px]"
                                rows={2}
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="flex items-center justify-center w-[60px] rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-teal-500/25 disabled:shadow-none"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
