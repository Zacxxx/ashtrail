import { Link } from "react-router-dom";

export function TravelPage() {
    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Header ══ */}
            <header className="absolute top-0 left-0 right-0 z-30 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto">
                <div className="h-16 flex items-center justify-between px-6 w-full">
                    {/* Left: Logo & Contextual Tabs */}
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-xs font-black tracking-[0.3em] text-white">
                            ASHTRAIL <span className="text-gray-500">| NODE TRAVEL</span>
                        </h1>
                    </div>
                </div>
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[80px] pb-12 items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="text-6xl mb-6 opacity-30">🚀</div>
                    <h2 className="text-2xl font-bold tracking-widest text-gray-100">NODE ROUTING</h2>
                    <p className="text-gray-500 tracking-wider">UNDER CONSTRUCTION</p>
                    <p className="text-xs text-gray-600 max-w-md mx-auto mt-4 px-6 border border-white/5 bg-black/40 py-4 rounded-xl leading-relaxed text-left">
                        A visualized network to traverse local nodes, access interconnected galaxy endpoints, monitor packet travel in realtime, and jump to other stars in the cluster.
                    </p>
                </div>
            </div>
        </div>
    );
}
