import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area, Cell, Legend } from 'recharts';
import { ArrowUpRight, ArrowDownRight, RefreshCcw, Brain, ExternalLink, Activity, Target, Clock, TrendingUp, TrendingDown, Search, Pause, Play } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { MockGexResponse, MockGexMaxChange, GexApiResponse, GexMaxChangeResponse } from '../services/mockData';
import { fetchChain, fetchMaxChange } from '../services/api';
import { History3DChart } from './History3DChart';

// Initialize GenAI client safely - checking for env var in a real app
const API_KEY = import.meta.env.VITE_LLM_API_KEY || '';
const LLM_BASE_URL = import.meta.env.VITE_LLM_BASE_URL || '';
const LLM_MODEL = import.meta.env.VITE_LLM_MODEL || 'gemini-1.5-flash';

// Helper to format large numbers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const formatNumber = (value: number) => {
  if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(1) + 'B'; // Assuming base data is in millions, so 1000 = 1B
  }
  return value.toFixed(1) + 'M';
};

const formatCompact = (value: number) => {
  return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(value);
};

// Scale values proportionally to max, preserving relative magnitudes
// Max value becomes the cap, others scale proportionally
const scaleToMax = (values: number[]): { scaled: number[]; maxAbs: number } => {
  if (values.length === 0) return { scaled: [], maxAbs: 1 };
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const scaled = values.map(v => v / maxAbs * 100); // Scale to -100 to 100 range
  return { scaled, maxAbs };
};

const QUICK_TICKERS = ["AAPL", "AMD", "AMZN", "COIN", "GLD", "GOOG", "GOOGL", "INTC", "IWM", "META", "MSFT", "MSTR", "MU", "NFLX", "NVDA", "PLTR", "QQQ", "SLV", "SOFI", "SPX", "SPY", "TLT", "TSLA", "TSM", "UNH"];

export const Dashboard: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState<string>('SPX');
  const [customTicker, setCustomTicker] = useState('');
  const [apiData, setApiData] = useState<GexApiResponse>(MockGexResponse);
  const [maxChange, setMaxChange] = useState<GexMaxChangeResponse>(MockGexMaxChange);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(600000);
  const userRole = sessionStorage.getItem('userRole') || 'viewer';

  // Debug logs for API calls
  const [debugLogs, setDebugLogs] = useState<Array<{type: 'gexbot' | 'llm', status: 'success' | 'error', message: string, timestamp: Date}>>([]);

  // Custom LLM Overrides
  const [useCustomLLM, setUseCustomLLM] = useState(false);
  const [customLLMKey, setCustomLLMKey] = useState('');
  const [customLLMBase, setCustomLLMBase] = useState('');
  const [customLLMModel, setCustomLLMModel] = useState('');

  const addDebugLog = (type: 'gexbot' | 'llm', status: 'success' | 'error', message: string) => {
    setDebugLogs(prev => [{type, status, message, timestamp: new Date()}, ...prev].slice(0, 50));
  };

  // Transform raw strike data for the chart with proportional scaling
  const { chartData, maxVolAbs, maxOiAbs } = useMemo(() => {
    const raw = apiData.strikes.map((s) => ({
      strike: Math.round(s[0] as number), // Round to integer
      netGex: s[1] as number,
      netGexOi: s[2] as number,
    }));
    
    // Scale GEX values proportionally to max (preserves relative magnitudes)
    const volValues = raw.map(d => d.netGex);
    const oiValues = raw.map(d => d.netGexOi);
    const { scaled: scaledVol, maxAbs: maxVolAbs } = scaleToMax(volValues);
    const { scaled: scaledOi, maxAbs: maxOiAbs } = scaleToMax(oiValues);
    
    const scaled = raw.map((d, i) => ({
      ...d,
      scaledGex: scaledVol[i],
      scaledGexOi: scaledOi[i],
    }));
    return { chartData: scaled, maxVolAbs, maxOiAbs };
  }, [apiData]);

  // Calculate Chart Axis Domain: round to nearest 10 for grid alignment
  const chartDomain = useMemo(() => {
    const spot = apiData.spot;
    if (!spot || spot === 0) return [0, 1];
    const lower = Math.floor(spot * 0.99 / 10) * 10;
    const upper = Math.ceil(spot * 1.01 / 10) * 10;
    return [lower, upper];
  }, [apiData]);

  // Fetch live data from API (2 calls: chain + maxchange)
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [newChain, newMaxChange] = await Promise.all([
        fetchChain(selectedTicker),
        fetchMaxChange(selectedTicker)
      ]);

      setApiData(newChain);
      setMaxChange(newMaxChange);
      addDebugLog('gexbot', 'success', `Fetched ${selectedTicker} - Spot: ${newChain.spot}, Strikes: ${newChain.strikes.length}`);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      addDebugLog('gexbot', 'error', `Failed to fetch ${selectedTicker}: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [selectedTicker]);

  // Always fetch immediately on ticker change; auto-refresh on interval if enabled
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refreshData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshData]);

  const handleCustomTickerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTicker.trim()) {
      setSelectedTicker(customTicker.toUpperCase().trim());
      setCustomTicker('');
    }
  };

  const handleAnalyzeMarket = async () => {
    const effectiveApiKey = useCustomLLM ? customLLMKey : API_KEY;
    const effectiveBaseUrl = useCustomLLM ? customLLMBase : LLM_BASE_URL;
    const effectiveModel = useCustomLLM ? customLLMModel : LLM_MODEL;

    if (!effectiveApiKey) {
      setAiAnalysis(`Demo Mode (No API Key). 
      
      Please configure an API Key in settings or .env to use live analysis.`);
      return;
    }

    setAnalyzing(true);
    try {
      const context = `
        Asset: ${apiData.ticker}
        Spot Price: ${apiData.spot}
        Zero Gamma Level (Flip): ${apiData.zero_gamma}
        Major Resistance via Positive Gamma Change (Vol): ${apiData.major_pos_vol}
        Major Support via Negative Gamma Change (Vol): ${apiData.major_neg_vol}
        Major Positive Gamma (OI): ${apiData.major_pos_oi}
        Major Negative Gamma (OI): ${apiData.major_neg_oi}
        Net Gamma Exposure (Vol): ${apiData.sum_gex_vol}
        Net Gamma Exposure (OI): ${apiData.sum_gex_oi}
        Max Change (Current): Strike ${maxChange.current[0]} Value ${maxChange.current[1]}
      `;

      const prompt = `
        You are a quantitative derivatives analyst using Gexbot data. 
        Analyze these Major GEX Levels and Momentum shifts.
        Focus on:
        1. Where is the Spot relative to Zero Gamma? (Bullish/Bearish regime)
        2. Where are the major Vol/OI walls acting as Support/Resistance?
        3. Is Net Gamma positive (dampening volatility) or negative (accelerating volatility)?
        
        Provide 3 concise, actionable bullet points on market sentiment, volatility expectations, and key pivot levels.
        Data context: ${context}
      `;

      let resultText = "";

      // Logic to handle different providers based on BASE_URL
      // Ensure we have a clean base URL without trailing slash
      let cleanBaseUrl = effectiveBaseUrl.replace(/\/$/, '');

      // If the base URL doesn't already end in /chat/completions, append it for OpenAI-compatible endpoints
      // But only if we are taking the OpenAI path
      if (effectiveBaseUrl && !effectiveBaseUrl.includes('googleapis.com')) {
        if (!cleanBaseUrl.endsWith('/chat/completions')) {
          cleanBaseUrl = `${cleanBaseUrl}/chat/completions`;
        }

        // OpenAI Compatible Path (DeepSeek, Groq, OpenRouter, etc.)
        const response = await fetch(cleanBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveApiKey}`
          },
          body: JSON.stringify({
            model: effectiveModel || 'gpt-3.5-turbo',
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
          })
        });
        const data = await response.json();
        resultText = data.choices?.[0]?.message?.content || "Error: No response from provider.";
      } else {
        // Default Google GenAI Path
        const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
        const response = await ai.models.generateContent({
          model: effectiveModel || 'gemini-3.0-flash',
          contents: prompt,
        });
        resultText = response.text || "No analysis generated.";
      }

      setAiAnalysis(resultText);
      addDebugLog('llm', 'success', `Analysis generated (${effectiveModel || 'default'})`);
    } catch (error) {
      console.error("Analysis failed", error);
      setAiAnalysis("Error generating analysis. Please check API Key and Base URL configuration.");
      addDebugLog('llm', 'error', `Analysis failed: ${error}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const CustomTooltip = ({ active, payload, label, mode }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const val = mode === 'oi' ? data.netGexOi : data.netGex;
      return (
        <div className="bg-gray-900 border border-gray-700 p-3 rounded shadow-xl z-50">
          <p className="font-mono text-gray-300 mb-2 border-b border-gray-700 pb-1">Strike: ${data.strike}</p>
          <p className={`text-sm font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Net GEX ({mode === 'oi' ? 'OI' : 'Vol'}): {val.toFixed(2)}M
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Ticker Selection Row */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-gray-900/50 p-4 rounded-xl border border-gray-800">
        <div className="flex-1 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
          <div className="flex gap-2">
            {QUICK_TICKERS.map(t => (
              <button
                key={t}
                onClick={() => setSelectedTicker(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap ${selectedTicker === t
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleCustomTickerSubmit} className="relative w-full md:w-48 shrink-0">
          <input
            type="text"
            value={customTicker}
            onChange={(e) => setCustomTicker(e.target.value)}
            placeholder="Custom Ticker..."
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500 transition-colors pl-9 uppercase"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        </form>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              autoRefresh
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-gray-800 text-gray-500 border border-gray-700'
            }`}
          >
            {autoRefresh ? <Play size={12} /> : <Pause size={12} />}
            {autoRefresh ? 'Auto' : 'Paused'}
          </button>
            <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
          >
            <option value={60000}>1min</option>
            <option value={300000}>5min</option>
            <option value={600000}>10min</option>
            <option value={900000}>15min</option>
            <option value={1800000}>30min</option>
          </select>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Net GEX (Vol)"
          value={formatNumber(apiData.sum_gex_vol)}
          change={apiData.sum_gex_vol > 0 ? "Long Gamma" : "Short Gamma"}
          positive={apiData.sum_gex_vol > 0}
        />
        <StatCard
          title="Zero Gamma"
          value={apiData.zero_gamma.toFixed(2)}
          change={`Pivot Level`}
          positive={apiData.spot > apiData.zero_gamma}
          icon={<Activity size={16} />}
        />
        <StatCard
          title="Major Res (Vol)"
          value={apiData.major_pos_vol.toFixed(2)}
          change="Call Wall"
          positive={true}
        />
        <StatCard
          title="Major Supp (Vol)"
          value={apiData.major_neg_vol.toFixed(2)}
          change="Put Wall"
          positive={false}
        />
      </div>

      {/* Main Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Large Vertical Chart - GEX Depth Profile */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm relative overflow-hidden flex flex-col">

          <div className="flex flex-col space-y-4 mb-2">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-100">GEX Depth Profile</h2>
              <button
                onClick={refreshData}
                className={`p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all ${loading ? 'animate-spin' : ''}`}
              >
                <RefreshCcw size={18} />
              </button>
            </div>

            {/* Data Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-3 gap-x-4 p-3 bg-gray-950/50 rounded-lg border border-gray-800/50 text-xs">

              {/* Spot */}
              <div>
                <span className="block text-gray-500 mb-0.5 font-medium">Spot</span>
                <span className="text-yellow-500 font-mono font-bold text-sm">{apiData.spot.toFixed(2)}</span>
              </div>

              {/* Zero Gamma */}
              <div>
                <span className="block text-gray-500 mb-0.5 font-medium">Zero Gamma</span>
                <span className="text-purple-400 font-mono font-bold">{apiData.zero_gamma.toFixed(2)}</span>
              </div>

              {/* Net Vol */}
              <div>
                <span className="block text-gray-500 mb-0.5 font-medium">Net Vol</span>
                <span className={`font-mono font-bold ${apiData.sum_gex_vol >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatNumber(apiData.sum_gex_vol)}
                </span>
              </div>

              {/* Net OI */}
              <div>
                <span className="block text-gray-500 mb-0.5 font-medium">Net OI</span>
                <span className={`font-mono font-bold ${apiData.sum_gex_oi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatNumber(apiData.sum_gex_oi)}
                </span>
              </div>

              {/* Major Pos */}
              <div className="col-span-1 sm:col-span-2 lg:col-span-1">
                <span className="block text-gray-500 mb-0.5 font-medium">Max Pos (Vol / OI)</span>
                <div className="font-mono text-emerald-400">
                  {apiData.major_pos_vol} <span className="text-gray-600">/</span> {apiData.major_pos_oi}
                </div>
              </div>

              {/* Major Neg */}
              <div className="col-span-1 sm:col-span-2 lg:col-span-1">
                <span className="block text-gray-500 mb-0.5 font-medium">Max Neg (Vol / OI)</span>
                <div className="font-mono text-red-400">
                  {apiData.major_neg_vol} <span className="text-gray-600">/</span> {apiData.major_neg_oi}
                </div>
              </div>

              {/* Legend (condensed) */}
              <div className="hidden lg:flex flex-col justify-center gap-1 pl-2 border-l border-gray-800">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div> <span className="text-gray-500 scale-90 origin-left">Pos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div> <span className="text-gray-500 scale-90 origin-left">Neg</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-[500px] w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Volume Chart */}
            <div className="h-full flex flex-col">
              <h3 className="text-gray-400 text-xs font-mono mb-2 text-center">GEX by Volume</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" opacity={0.5} horizontal={true} vertical={true} />
                  <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis
                    dataKey="strike"
                    type="number"
                    domain={chartDomain}
                    allowDataOverflow={true}
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickCount={15}
                    label={{ value: 'Strike', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                    reversed={true}
                  />
                  <Tooltip content={<CustomTooltip mode="vol" />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                  <ReferenceLine x={0} stroke="#4b5563" />
                  <ReferenceLine y={apiData.spot} stroke="#f59e0b" strokeWidth={2} label={{ value: 'SPOT', fill: '#f59e0b', fontSize: 10 }} />
                  <Bar dataKey="scaledGex" barSize={10}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-vol-${index}`} fill={entry.scaledGex > 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* OI Chart */}
            <div className="h-full flex flex-col border-l border-gray-800 pl-2">
              <h3 className="text-gray-400 text-xs font-mono mb-2 text-center">GEX by Open Interest</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" opacity={0.5} horizontal={true} vertical={true} />
                  <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis
                    dataKey="strike"
                    type="number"
                    domain={chartDomain}
                    allowDataOverflow={true}
                    hide={true} // Hide Y Axis for the second chart to save space
                    reversed={true}
                  />
                  <Tooltip content={<CustomTooltip mode="oi" />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                  <ReferenceLine x={0} stroke="#4b5563" />
                  <ReferenceLine y={apiData.spot} stroke="#f59e0b" strokeWidth={2} />
                  <Bar dataKey="scaledGexOi" barSize={10}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-oi-${index}`} fill={entry.scaledGexOi > 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column: AI & Max Change */}
        <div className="space-y-6 flex flex-col h-full">

          {/* AI Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <Brain size={120} className="text-emerald-500" />
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-1.5 rounded-lg">
                <Brain size={18} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-100 flex items-center justify-between w-full">
                  LLM Intelligence
                  <button
                    onClick={() => setUseCustomLLM(!useCustomLLM)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${useCustomLLM ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                  >
                    {useCustomLLM ? 'CUSTOM ACTIVE' : 'SYSTEM DEFAULTS'}
                  </button>
                </h2>
              </div>
            </div>

            {useCustomLLM && (
              <div className="mb-4 p-3 bg-gray-950/50 rounded-lg border border-emerald-500/20 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="password"
                    placeholder="API Key"
                    value={customLLMKey}
                    onChange={(e) => setCustomLLMKey(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300 focus:border-emerald-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Base URL (Optional)"
                    value={customLLMBase}
                    onChange={(e) => setCustomLLMBase(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300 focus:border-emerald-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Model Name"
                    value={customLLMModel}
                    onChange={(e) => setCustomLLMModel(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300 focus:border-emerald-500 outline-none"
                  />
                </div>
                <p className="text-[10px] text-gray-500 italic text-center">Temporary frontend override</p>
              </div>
            )}

            <div className="flex-1 bg-gray-950/50 rounded-lg p-4 border border-gray-800 mb-4 font-mono text-sm text-gray-300 leading-relaxed overflow-y-auto min-h-[160px]">
              {aiAnalysis ? (
                <div className="whitespace-pre-line animate-fade-in">{aiAnalysis}</div>
              ) : (
                <div className="text-gray-600 italic flex flex-col items-center justify-center h-full gap-2">
                  <span>Awaiting analysis command...</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAnalyzeMarket}
              disabled={analyzing}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed z-10"
            >
              {analyzing ? (
                <>
                  <RefreshCcw size={18} className="animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  Generate Insight <ArrowUpRight size={18} />
                </>
              )}
            </button>
          </div>

          {/* New Section: Significant GEX Shifts (Max Change) */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-indigo-500/10 p-1.5 rounded text-indigo-400">
                <TrendingUp size={18} />
              </div>
              <div>
                <h3 className="text-md font-semibold text-gray-200">Max GEX Shifts</h3>
                <p className="text-xs text-gray-500">Highest delta variance per interval</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 flex-1 overflow-y-auto">
              <MaxChangeRow label="Current" data={maxChange.current} />
              <MaxChangeRow label="1 Min" data={maxChange.one} />
              <MaxChangeRow label="5 Min" data={maxChange.five} />
              <MaxChangeRow label="10 Min" data={maxChange.ten} />
              <MaxChangeRow label="15 Min" data={maxChange.fifteen} />
              <MaxChangeRow label="30 Min" data={maxChange.thirty} />
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Row: Three panels */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Panel 1: GEX Trend & Major Pivots */}
        <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-semibold text-gray-200">GEX Trend & Major Pivots</h3>
            {/* Manual Legend */}
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-purple-400 rounded-sm"></div>
                <span className="text-gray-400">Net GEX</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-yellow-500"></div>
                <span className="text-gray-400">SPOT</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-emerald-500 border-dashed" style={{borderTop: '1px dashed #10b981'}}></div>
                <span className="text-gray-400">Res</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-red-500 border-dashed" style={{borderTop: '1px dashed #ef4444'}}></div>
                <span className="text-gray-400">Supp</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis dataKey="strike" type="number" domain={chartDomain} allowDataOverflow={true} stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis 
                  stroke="#6b7280" 
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  domain={[-110, 110]}
                  allowDataOverflow={true}
                />
                <Tooltip content={<CustomTooltip mode="vol" />} />
                <ReferenceLine y={0} stroke="#4b5563" />
                <ReferenceLine x={apiData.spot} stroke="#f59e0b" strokeWidth={2} />
                <ReferenceLine x={apiData.major_pos_vol} stroke="#10b981" strokeWidth={2} strokeDasharray="8 4" />
                <ReferenceLine x={apiData.major_neg_vol} stroke="#ef4444" strokeWidth={2} strokeDasharray="8 4" />
                <Area type="monotone" dataKey="scaledGex" stroke="#8884d8" fillOpacity={1} fill="url(#colorNet)" name="Net GEX" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Panel 2: Historical GEX Surface */}
        <div className="md:col-span-2">
          <History3DChart apiData={apiData} />
        </div>

        {/* Panel 3: Real-Time API Calling */}
        <div className="md:col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Real-Time API Calling</h3>
          <div className="h-[300px] overflow-y-auto space-y-2">
            {debugLogs.length === 0 ? (
              <p className="text-gray-500 text-xs italic">No API calls yet...</p>
            ) : (
              debugLogs.map((log, idx) => (
                <div key={idx} className="text-xs border-l-2 pl-2 py-1" style={{
                  borderLeftColor: log.status === 'success' ? '#10b981' : '#ef4444'
                }}>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${log.type === 'gexbot' ? 'text-blue-400' : 'text-purple-400'}`}>
                      {log.type.toUpperCase()}
                    </span>
                    <span className={log.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-gray-400 mt-0.5">{log.message}</p>
                  <p className="text-gray-600 text-[10px]">{log.timestamp.toLocaleTimeString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MaxChangeRow: React.FC<{ label: string; data: [number, number] }> = ({ label, data }) => {
  const [strike, value] = data;
  const isPositive = value > 0;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-950/50 rounded-lg border border-gray-800">
      <div className="flex items-center gap-3">
        <div className="text-gray-500 text-xs font-mono w-12">{label}</div>
        <div className="text-gray-300 font-bold text-sm">{strike}</div>
      </div>
      <div className={`text-sm font-mono flex items-center gap-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {formatCompact(value)}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; change: string; positive: boolean; icon?: React.ReactNode }> = ({ title, value, change, positive, icon }) => (
  <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
      {icon && <div className="text-gray-600">{icon}</div>}
    </div>
    <div className="flex items-end justify-between mt-1">
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className={`text-sm font-medium flex items-center ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {positive ? <ArrowUpRight size={16} className="mr-1" /> : <ArrowDownRight size={16} className="mr-1" />}
        {change}
      </span>
    </div>
  </div>
);