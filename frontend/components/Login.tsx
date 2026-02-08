import React, { useState } from 'react';
import { Lock, User, ShieldCheck, AlertCircle } from 'lucide-react';

interface LoginProps {
    onLogin: (status: boolean) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const AUTH_USERNAME = import.meta.env.VITE_AUTH_USERNAME || 'admin';
    const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD;
    const VIEWER_PASSWORD = import.meta.env.VITE_VIEWER_PASSWORD || 'andy_access_2026';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!AUTH_PASSWORD) {
            setError('Authentication not configured. Please set VITE_AUTH_PASSWORD in .env');
            return;
        }

        if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
            sessionStorage.setItem('isAuthenticated', 'true');
            sessionStorage.setItem('userRole', 'admin');
            onLogin(true);
        } else if (username === 'andy' && password === VIEWER_PASSWORD) {
            sessionStorage.setItem('isAuthenticated', 'true');
            sessionStorage.setItem('userRole', 'viewer');
            onLogin(true);
        } else {
            setError('Invalid credentials. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 font-sans selection:bg-emerald-500/30">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] animate-pulse delay-700"></div>
            </div>

            <div className="w-full max-w-md relative">
                <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>

                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-500">
                            <ShieldCheck className="text-emerald-500 w-8 h-8" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Gexbot Sentinel</h1>
                        <p className="text-gray-400 text-sm mt-1">Institutional Market Intelligence</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Username</label>
                            <div className="relative group/input">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within/input:text-emerald-500 transition-colors">
                                    <User size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-gray-600"
                                    placeholder="Enter username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Access Token</label>
                            <div className="relative group/input">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within/input:text-emerald-500 transition-colors">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 border border-red-400/20 p-3 rounded-lg animate-in fade-in slide-in-from-top-1">
                                <AlertCircle size={14} />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all duration-300 transform active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group"
                        >
                            Verify Authority
                            <Lock size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </form>

                    <p className="mt-8 text-center text-gray-600 text-[10px] uppercase tracking-[0.2em]">
                        Secure Access • Restricted Area
                    </p>
                </div>
            </div>
        </div>
    );
};
