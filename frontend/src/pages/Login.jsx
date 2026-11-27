import { useState } from "react";
import { login } from "../services/auth.js";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        setError("");
        setLoading(true);

        try {
            await login(email, password);
        } catch (error) {
            console.error(error);
            setError("Invalid email or password.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-white text-slate-900"
            style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            }}
        >
            {/* Left Visual Brand Canvas (Desktop) */}
            <aside
                aria-hidden="true"
                className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative overflow-hidden bg-gradient-to-br from-[#071930] via-[#0B274C] to-[#0F3B70] text-white flex-col justify-between p-12"
            >
                {/* Subtle Architectural Grid */}
                <div
                    className="absolute inset-0 opacity-[0.07]"
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />

                {/* Subtle Radial Depth */}
                <div
                    className="absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full opacity-20 pointer-events-none"
                    style={{
                        background: "radial-gradient(circle, #E87722 0%, transparent 65%)",
                    }}
                />

                {/* Top Brand Mark */}
                <div className="relative z-10 flex items-center gap-3.5">
                    <div className="w-10 h-10 bg-white text-[#0F3B70] flex items-center justify-center text-xs font-bold tracking-tight rounded-md shadow-sm relative overflow-hidden">
                        <span>EMR</span>
                        <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#E87722]" />
                    </div>
                    <span className="text-lg font-semibold tracking-tight text-white/95">
                        UTEP Clinical Record System
                    </span>
                </div>

                {/* Center Clean Clinical Visual Motif (No Extra Text) */}
                <div className="relative z-10 flex items-center justify-center my-auto py-8">
                    <div className="w-full max-w-[440px]">
                        <div className="rounded-xl border border-white/12 bg-white/[0.04] backdrop-blur-[2px] p-8 shadow-2xl">
                            {/* Abstract Minimalist Clinical Chart Frame */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#E87722]" />
                                    <span className="w-16 h-2 rounded-full bg-white/25" />
                                </div>
                                <span className="w-10 h-2 rounded-full bg-white/15" />
                            </div>

                            {/* Precision Clinical Pulse SVG */}
                            <div className="rounded-lg bg-[#061529]/70 border border-white/10 px-5 py-7 mb-6">
                                <svg
                                    viewBox="0 0 360 90"
                                    className="w-full h-20 overflow-visible"
                                    fill="none"
                                >
                                    <line x1="0" y1="48" x2="360" y2="48" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                                    <line x1="0" y1="24" x2="360" y2="24" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                    <line x1="0" y1="72" x2="360" y2="72" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                    <path
                                        d="M0 54 L62 54 L78 54 L88 38 L98 66 L112 16 L126 78 L138 46 L152 54 L215 54 L228 42 L238 62 L250 22 L262 72 L274 48 L288 54 L360 54"
                                        stroke="rgba(255,255,255,0.28)"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M88 38 L98 66 L112 16 L126 78 L138 46 L152 54 L215 54"
                                        stroke="#E87722"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <circle cx="112" cy="16" r="4" fill="#E87722" />
                                    <circle cx="215" cy="54" r="3" fill="#ffffff" />
                                </svg>
                            </div>

                            {/* Abstract Clean Data Bars */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-lg bg-white/[0.05] border border-white/10 p-3.5 space-y-2">
                                    <span className="block w-8 h-1.5 rounded-full bg-[#E87722]/80" />
                                    <span className="block w-14 h-2.5 rounded-full bg-white/30" />
                                </div>
                                <div className="rounded-lg bg-white/[0.05] border border-white/10 p-3.5 space-y-2">
                                    <span className="block w-10 h-1.5 rounded-full bg-white/35" />
                                    <span className="block w-12 h-2.5 rounded-full bg-white/30" />
                                </div>
                                <div className="rounded-lg bg-white/[0.05] border border-white/10 p-3.5 space-y-2">
                                    <span className="block w-7 h-1.5 rounded-full bg-emerald-400/75" />
                                    <span className="block w-14 h-2.5 rounded-full bg-white/30" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Accent Bar */}
                <div className="relative z-10 flex items-center gap-2">
                    <span className="w-8 h-1 rounded-full bg-[#E87722]" />
                    <span className="w-2 h-1 rounded-full bg-white/30" />
                    <span className="w-2 h-1 rounded-full bg-white/15" />
                </div>
            </aside>

            {/* Right Authentication Panel */}
            <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-between bg-[#F8FAFC] lg:bg-white">
                {/* Mobile Top Brand Bar */}
                <header className="lg:hidden bg-[#0F3B70] border-b-[3px] border-[#E87722] px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-white text-[#0F3B70] flex items-center justify-center text-[11px] font-bold tracking-tight rounded-sm relative overflow-hidden shrink-0">
                        <span>EMR</span>
                        <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#E87722]" />
                    </div>
                    <span className="text-base font-semibold tracking-tight text-white">
                        UTEP Clinical Record System
                    </span>
                </header>

                {/* Centered Form */}
                <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-12">
                    <div className="w-full max-w-[380px] bg-white lg:bg-transparent border border-slate-200 lg:border-0 rounded-xl lg:rounded-none shadow-sm lg:shadow-none p-8 lg:p-0">
                        <div className="mb-8">
                            <div className="w-8 h-1 bg-[#E87722] rounded-full mb-4" aria-hidden="true" />
                            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                                Sign In
                            </h1>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-xs font-semibold text-slate-700 mb-2"
                                >
                                    Email
                                </label>
                                <div className="relative flex items-center">
                                    <svg
                                        className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        aria-hidden="true"
                                    >
                                        <rect x="3" y="5" width="18" height="14" rx="2" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6" />
                                    </svg>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        autoComplete="email"
                                        required
                                        placeholder="name@utep.edu"
                                        className="w-full h-11 pl-10 pr-3.5 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 border border-slate-300 focus:border-[#0F3B70] focus:ring-4 focus:ring-[#0F3B70]/10 rounded-lg outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-xs font-semibold text-slate-700 mb-2"
                                >
                                    Password
                                </label>
                                <div className="relative flex items-center">
                                    <svg
                                        className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.6"
                                        aria-hidden="true"
                                    >
                                        <rect x="5" y="11" width="14" height="10" rx="2" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0v4" />
                                    </svg>
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        autoComplete="current-password"
                                        required
                                        placeholder="Enter your password"
                                        className="w-full h-11 pl-10 pr-10 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 border border-slate-300 focus:border-[#0F3B70] focus:ring-4 focus:ring-[#0F3B70]/10 rounded-lg outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        className="absolute right-2.5 p-1.5 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                                    >
                                        {showPassword ? (
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5 0 9 4 10 7a11.6 11.6 0 01-2.5 3.88M6.61 6.61A11.7 11.7 0 002 12c1 3 5 7 10 7 1.61 0 3.12-.41 4.44-1.12" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <p
                                    role="alert"
                                    className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700"
                                >
                                    {error}
                                </p>
                            )}

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-11 px-4 bg-[#0F3B70] hover:bg-[#164C8C] active:bg-[#0A2B54] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_6px_rgba(15,59,112,0.22)]"
                                >
                                    {loading ? "Signing in..." : "Sign In"}
                                </button>
                            </div>
                        </form>
                    </div>
                </main>

                {/* Minimal Footer */}
                <footer className="py-5 px-6 text-center text-xs text-slate-400">
                    <a href="#/about" className="text-slate-600 hover:text-[#0F3B70] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">About us</a>
                    <p className="mt-2">UTEP Educational EMR</p>
                </footer>
            </div>
        </div>
    );
}
