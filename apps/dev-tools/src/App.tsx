import { Link } from "react-router-dom";

const TOOLS = [
    {
        id: "new-worldgen",
        name: "New World Generator",
        description: "AI-driven bare planet generation using the Gemini API.",
        icon: "✨",
        status: "NEW",
        color: "bg-purple-500",
    },
    {
        id: "legacy-worldgen",
        name: "Legacy World Generator",
        description: "V3 procedural generator with tectonic plate simulation and biomes.",
        icon: "🌍",
        status: "STABLE",
        color: "bg-teal-500",
    },
];

export function App() {
    return (
        <div className="min-h-screen bg-[#070b12] text-gray-300 font-sans p-8">
            {/* Header */}
            <header className="mb-12">
                <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-500 text-[#0a0f14] font-bold text-sm">
                        ◆
                    </div>
                    <h1 className="text-xl font-bold tracking-[0.2em] text-gray-100">
                        ASHTRAIL <span className="text-gray-600 font-normal">| DEV TOOLS</span>
                    </h1>
                </div>
                <p className="text-gray-500 text-sm tracking-widest pl-12">
                    INTERNAL DEVELOPMENT UTILITIES
                </p>
            </header>

            {/* Tools Grid */}
            <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
                {TOOLS.map((tool) => (
                    <Link
                        key={tool.id}
                        to={`/${tool.id}`}
                        className="group block relative p-6 bg-[#121820] border border-[#1f2937] rounded-xl hover:border-teal-500/50 transition-all hover:bg-[#161d27]"
                    >
                        {/* Status Badge */}
                        <div className={`absolute top-4 right-4 text-[9px] font-bold tracking-widest px-2 py-0.5 rounded border ${tool.status === "STABLE" ? "border-teal-500/30 text-teal-400 bg-teal-500/10" :
                            tool.status === "WIP" ? "border-amber-500/30 text-amber-400 bg-amber-500/10" :
                                "border-gray-600/30 text-gray-500 bg-gray-600/10"
                            }`}>
                            {tool.status}
                        </div>

                        {/* Icon */}
                        <div className="text-4xl mb-6 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform origin-left">
                            {tool.icon}
                        </div>

                        {/* Content */}
                        <h2 className="text-lg font-bold text-gray-100 tracking-wider mb-2 group-hover:text-teal-400 transition-colors">
                            {tool.name.toUpperCase()}
                        </h2>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            {tool.description}
                        </p>
                    </Link>
                ))}
            </main>
        </div>
    );
}
