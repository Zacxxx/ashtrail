import { Link } from "react-router-dom";
import { DEVTOOLS_TOOL_ROUTE_BY_ID } from "./lib/routes";

const TOOLS = [
    {
        id: "worldgen",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID.worldgen,
        name: "World Generator",
        description: "AI-driven planetary simulation and terrain generation using the Gemini API.",
        icon: "✨",
        status: "STABLE",
        color: "bg-purple-500",
    },
    {
        id: "asset-generator",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID["asset-generator"],
        name: "Asset Generator",
        description: "AI-powered generation of icons and textures for game assets using Gemini.",
        icon: "🎨",
        status: "STABLE",
        color: "bg-amber-500",
    },
    {
        id: "game-master",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID["game-master"],
        name: "Game Master",
        description: "World-scoped AI GM settings, canon context, and event guidance orchestration.",
        icon: "🧠",
        status: "STABLE",
        color: "bg-indigo-500",
    },
    {
        id: "gallery",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID.gallery,
        name: "Gallery",
        description: "Browse and sync generated planets and icons across local and cloud storage.",
        icon: "🌌",
        status: "STABLE",
        color: "bg-teal-500",
    },
    {
        id: "gameplay-engine",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID["gameplay-engine"],
        name: "Gameplay Engine",
        description: "Explore and define the rules for Exploration, Events, Combat, and Character.",
        icon: "⚙️",
        status: "STABLE",
        color: "bg-orange-500",
    },
    {
        id: "character-builder",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID["character-builder"],
        name: "Character Builder",
        description: "Create, edit, and export characters, NPCs, and archetypes.",
        icon: "👤",
        status: "STABLE",
        color: "bg-indigo-500",
    },
    {
        id: "history",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID.history,
        name: "History",
        description: "AI powered tool to generate game history for lore, world, and factions.",
        icon: "📜",
        status: "STABLE",
        color: "bg-red-500",
    },
    {
        id: "ecology",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID.ecology,
        name: "Ecology",
        description: "World-scoped flora, fauna, climate, and province ecology canon management.",
        icon: "🌿",
        status: "STABLE",
        color: "bg-emerald-500",
    },
    {
        id: "quests",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID.quests,
        name: "Quests",
        description: "Generate, run, persist, and resume world-scoped multi-ending quest runs.",
        icon: "🧭",
        status: "STABLE",
        color: "bg-amber-500",
    },
    {
        id: "story-loop",
        path: DEVTOOLS_TOOL_ROUTE_BY_ID["story-loop"],
        name: "Story Loop",
        description: "Hackathon-facing hybrid loop planner for quest-driven scenes, inserts, and mixed media.",
        icon: "LIVE",
        status: "WIP",
        color: "bg-cyan-500",
    }
];

export function App() {
    return (
        <div className="bg-[#070b12] text-gray-300 font-sans pt-24 px-8 pb-8">
            {/* Tools Grid */}
            <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
                {TOOLS.map((tool) => (
                    <Link
                        key={tool.id}
                        to={tool.path}
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
