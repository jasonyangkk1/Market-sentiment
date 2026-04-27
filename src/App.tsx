/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, ChevronRight, Search, Zap, BarChart3, Info, History as HistoryIcon, LayoutDashboard, Trash2 } from "lucide-react";
import { useState, useEffect, type FormEvent, type MouseEvent } from "react";
import { analyzeStock, AnalysisResult } from "./services/geminiService";
import { fetchAllStockData } from "./services/twseService";

const HISTORY_STORAGE_KEY = "gemini_stock_analysis_history";
const MAX_HISTORY_ITEMS = 20;

type HistoryItem = AnalysisResult & { timestamp: number };

function IndicatorCard({ title, content, delay = 0, statusLabel, statusType, badge }: { title: string, content: string, delay?: number, statusLabel?: string, statusType?: 'danger' | 'warning' | 'info' | 'success', badge?: string }) {
  const statusColors = {
    danger: "bg-red-900/50 text-red-300 border-red-700/50",
    warning: "bg-amber-900/50 text-amber-300 border-amber-700/50",
    info: "bg-blue-900/50 text-blue-300 border-blue-700/50",
    success: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50"
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="bg-[#161B22] border border-white/5 rounded-xl p-5 flex flex-col h-full hover:border-white/10 transition-colors"
      id={`indicator-${title.replace(/\s+/g, '-')}`}
    >
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-start gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white">
                {title}
              </h3>
              {badge && (
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/30 break-words max-w-full">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-tight font-mono">Dynamic Monitoring</p>
          </div>
        </div>
        {statusLabel && (
          <div className={`px-2 py-1 rounded text-[10px] border leading-tight break-words ${statusColors[statusType || 'info']}`}>
            {statusLabel}
          </div>
        )}
      </div>
      
      <div className="flex-1">
        <p className="text-xs text-slate-300 leading-relaxed font-medium">
          {content}
        </p>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'analysis' | 'history'>('analysis');
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [finmindToken, setFinmindToken] = useState<string>(() => localStorage.getItem("finmind_token") || "");
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  const saveToHistory = (newResult: AnalysisResult) => {
    const historyItem: HistoryItem = { ...newResult, timestamp: Date.now() };
    const updatedHistory = [historyItem, ...history.filter(item => item.symbol !== newResult.symbol)].slice(0, MAX_HISTORY_ITEMS);
    setHistory(updatedHistory);
    // Use a safe stringification to handle potential large data, although localData is usually fine up to 5MB
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
  };

  const handleSearch = async (e?: FormEvent, searchSymbol?: string) => {
    e?.preventDefault();
    const targetSymbol = searchSymbol || symbol.trim();
    if (!targetSymbol) return;

    if (!finmindToken && !import.meta.env.VITE_FINMIND_TOKEN) {
      setShowTokenModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    setActiveTab('analysis');
    try {
      const stockData = await fetchAllStockData(targetSymbol);
      const analysisData = await analyzeStock(stockData);
      setResult(analysisData);
      saveToHistory(analysisData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    } finally {
      setLoading(false);
    }
  };

  const deleteHistoryItem = (e: MouseEvent, sym: string) => {
    e.stopPropagation();
    const updated = history.filter(item => item.symbol !== sym);
    setHistory(updated);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  };

  const saveToken = () => {
    const trimmed = tempToken.trim();
    if (trimmed) {
      localStorage.setItem("finmind_token", trimmed);
      setFinmindToken(trimmed);
      setShowTokenModal(false);
      setTempToken("");
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E2E8F0] font-sans">
      {/* Token Modal */}
      <AnimatePresence>
        {showTokenModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#161B22] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowTokenModal(false)}
                className="absolute right-6 top-6 text-slate-500 hover:text-ash-400 p-1"
              >
                <Trash2 size={18} className="rotate-45" /> 
              </button>
              <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center mb-6">
                <Zap className="text-blue-500" size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">設定 FinMind API Token</h3>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                台股數據抓取需要 FinMind Token。請先至 <a href="https://finmindtrade.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">finmindtrade.com</a> 免費註冊並取得 Token。
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Your API Token</label>
                  <input 
                    type="password"
                    placeholder="在此貼入您的 Token"
                    value={tempToken}
                    onChange={(e) => setTempToken(e.target.value)}
                    className="w-full bg-[#0A0C10] border border-white/10 rounded-lg py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-700"
                  />
                </div>
                <button 
                  onClick={saveToken}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 text-sm mt-2"
                >
                  儲存並啟用
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-white/10 px-6 py-6 bg-[#0A0C10] sticky top-0 z-50 backdrop-blur-md bg-opacity-90">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 group">
            <div className="bg-blue-600 p-2.5 rounded-lg shadow-lg shadow-blue-600/20 group-hover:scale-105 transition-transform">
              <BarChart3 className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Gemini 籌碼分析儀
              </h1>
              <p className="text-slate-400 text-sm italic">全方位主力與散戶動態監測系統</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {/* Tab Navigation */}
            <nav className="flex bg-[#161B22] p-1 rounded-lg border border-white/5 w-full sm:w-auto">
              <button 
                onClick={() => setActiveTab('analysis')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${activeTab === 'analysis' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <LayoutDashboard size={14} />
                分析面板
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <HistoryIcon size={14} />
                歷史紀錄
              </button>
            </nav>

            <div className="h-6 w-[1px] bg-white/10 hidden md:block" />

            <div className="flex items-center gap-2 w-full md:w-auto">
              <form onSubmit={(e) => handleSearch(e)} className="relative flex-1 sm:w-48 group">
                <input
                  type="text"
                  placeholder="代碼 (EX: 2330)"
                  inputMode="numeric"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full bg-[#161B22] border border-white/10 rounded-lg py-3 sm:py-2.5 pl-11 pr-12 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-slate-600 text-white"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <button 
                  type="submit"
                  disabled={loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 disabled:opacity-50 transition-colors"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <ChevronRight size={20} />}
                </button>
              </form>

              <button 
                onClick={() => {
                  setTempToken(finmindToken);
                  setShowTokenModal(true);
                }}
                className={`p-3 sm:p-2.5 bg-[#161B22] border rounded-lg transition-all ${finmindToken ? "text-blue-500 border-blue-500/30" : "text-slate-500 border-white/5 hover:text-blue-500"}`}
                title="API 設定"
              >
                <Zap size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'analysis' ? (
            <motion.div
              key="analysis-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {!result && !loading && !error && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-32 text-center"
                >
                  <div className="w-20 h-20 rounded-2xl bg-[#161B22] border border-white/5 flex items-center justify-center mb-8 shadow-2xl relative">
                    <div className="absolute inset-0 bg-blue-500/5 blur-2xl rounded-full"></div>
                    <Zap className="text-blue-500 relative z-10" size={40} />
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-4">準備好啟動籌碼分析了嗎？</h2>
                  <p className="text-slate-400 max-w-md text-lg leading-relaxed">
                    請在上方輸入台股代碼，Gemini AI 將即刻為您透視籌碼結構，並提供最具參考價值的操作建議。
                  </p>
                </motion.div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center py-32">
                  <div className="relative w-20 h-20 mb-8">
                    <div className="absolute inset-0 border-2 border-blue-500/10 rounded-full"></div>
                    <div className="absolute inset-0 border-2 border-t-blue-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-4 border border-blue-400/20 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-blue-400 font-medium tracking-wide">正在定位最近有效交易日並抓取數據...</p>
                  <p className="text-slate-500 text-xs mt-3 uppercase tracking-widest font-mono">Scanning Market Breadth & Insider Shadow</p>
                </div>
              )}

              {error && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-10 text-center max-w-2xl mx-auto mt-10">
                  <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">分析引擎發聲錯誤</h3>
                  <p className="text-slate-400 text-lg mb-6">{error}</p>
                  <button 
                    onClick={() => handleSearch()}
                    className="px-8 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition-all shadow-lg shadow-red-500/20"
                  >
                    重新掃描
                  </button>
                </div>
              )}

              {result && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-in fade-in duration-700">
                  {/* Sidebar: Main Verdict */}
                  <div className="md:col-span-4 space-y-6">
                    <motion.div 
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="bg-[#161B22] border border-white/5 rounded-2xl p-8 shadow-2xl flex flex-col justify-between h-full min-h-[400px]"
                    >
                      <div className="space-y-8">
                        <div>
                          <div className="flex justify-between items-start mb-4">
                            <div className="space-y-1">
                              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Gemini 終極判斷</h2>
                              <p className="text-[10px] text-slate-600 font-medium">資料來源：TWSE OpenAPI & FinMind (混合 API)</p>
                            </div>
                            <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                              TRADING DATE: {result.tradingDate}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-2xl font-black text-white">{result.symbol}</span>
                            <div className={`inline-flex items-center px-4 py-1.5 rounded-full font-black text-lg border ${
                              result.recommendation === "強力買進" 
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                : result.recommendation === "分批布局" || result.recommendation === "觀望"
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                : "bg-red-500/10 border-red-500/30 text-red-500"
                            }`}>
                              {result.recommendation}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Info size={16} />
                            <span className="text-xs font-bold uppercase tracking-tight italic">核心分析結論</span>
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed font-medium">
                            {result.summary}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 space-y-3">
                        <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                          <span>分析信心度</span>
                          <span className="text-blue-400 font-mono">{Math.round(result.confidence * 100)}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${result.confidence * 100}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="bg-blue-500 h-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                          />
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Main Content: Indicators Grid */}
                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <IndicatorCard 
                      title="情緒逆向指標" 
                      statusLabel="SENTIMENT"
                      statusType={result.scores.sentiment > 0 ? "success" : "danger"}
                      content={result.indicators.sentiment} 
                      delay={0.1}
                    />
                    <IndicatorCard 
                      title="量縮回測法則" 
                      statusLabel="QUANT VOL"
                      statusType={result.scores.retest > 0 ? "success" : "danger"}
                      content={result.indicators.retest} 
                      delay={0.2}
                    />
                    <IndicatorCard 
                      title="大盤環境濾網" 
                      statusLabel="MARKET BREADTH"
                      statusType={result.scores.marketBreadth > 0 ? "success" : "danger"}
                      content={result.indicators.marketBreadth} 
                      delay={0.3}
                    />
                    <IndicatorCard 
                      title="隔日沖警報器" 
                      statusLabel="TRAP ALERT"
                      statusType={result.scores.overnightTrap > 0 ? "success" : "danger"}
                      content={result.indicators.overnightTrap} 
                      delay={0.4}
                    />
                    <IndicatorCard 
                      title="關鍵分點追蹤" 
                      statusLabel="INSIDER SHADOW"
                      statusType={result.scores.insiderShadow > 0 ? "success" : "danger"}
                      badge={result.raw?.institutionDate && result.raw?.institutionDate !== result.tradingDate ? `⚠️ 延遲至 ${result.raw.institutionDate}` : undefined}
                      content={(result.raw?.institutionDate && result.raw?.institutionDate !== result.tradingDate ? `⚠️ 注意：當日法人資料尚未發布，此為 ${result.raw.institutionDate} 數據。\n\n` : "") + result.indicators.insiderShadow} 
                      delay={0.5}
                    />
                    <IndicatorCard 
                      title="散戶融資退潮" 
                      statusLabel="RETAIL WEIGHT"
                      statusType={result.scores.retailWeight > 0 ? "success" : "danger"}
                      content={result.indicators.retailWeight} 
                      delay={0.6}
                    />
                  </div>

                  {/* Scoring Board */}
                  <div className="md:col-span-12 mt-4 bg-[#161B22] border border-white/5 rounded-2xl p-6 shadow-xl">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <BarChart3 size={16} className="text-blue-500" />
                          數據評分系統 (6大板塊)
                        </h3>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Quantative Scoring Breakdown</p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          { label: "情緒", score: result.scores.sentiment },
                          { label: "回測", score: result.scores.retest },
                          { label: "廣度", score: result.scores.marketBreadth },
                          { label: "大戶", score: result.scores.overnightTrap },
                          { label: "關鍵", score: result.scores.insiderShadow },
                          { label: "散戶", score: result.scores.retailWeight },
                        ].map((item, idx) => (
                          <div key={idx} className="flex flex-col items-center bg-[#0A0C10] border border-white/5 rounded-xl p-3 min-w-[70px]">
                            <span className="text-[10px] text-slate-500 font-bold mb-1">{item.label}</span>
                            <span className={`text-sm font-black ${item.score > 0 ? "text-emerald-400" : "text-red-500"}`}>
                              {item.score > 0 ? `+${item.score}` : item.score}
                            </span>
                          </div>
                        ))}
                        <div className="flex flex-col items-center bg-blue-600/10 border border-blue-500/20 rounded-xl p-3 min-w-[80px]">
                          <span className="text-[10px] text-blue-400 font-bold mb-1">總計總分</span>
                          <span className={`text-lg font-black ${result.scores.total >= 5 ? "text-emerald-400" : result.scores.total >= 3 ? "text-amber-400" : "text-red-500"}`}>
                            {result.scores.total}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div className="flex flex-wrap justify-center sm:justify-start gap-8">
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                          <span className="text-xs font-bold text-slate-300">看多: +1 分</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                          <span className="text-xs font-bold text-slate-300">看空: 0 分</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 italic max-w-sm text-center sm:text-right">
                        評分說明：5-6分強力買進，4分分批布局，3分觀望，2分以下絕對觀望。
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="history-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">分析歷史紀錄</h2>
                  <p className="text-slate-500 text-sm mt-1">儲存最近 {MAX_HISTORY_ITEMS} 次深度掃描結果，重啟瀏覽器亦可存取</p>
                </div>
                {history.length > 0 && (
                  <button 
                    onClick={clearHistory}
                    className="flex items-center gap-2 text-xs font-bold text-red-500/80 hover:text-red-500 transition-colors bg-red-500/5 px-3 py-1.5 rounded-lg border border-red-500/10"
                  >
                    <Trash2 size={14} />
                    清除所有
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="bg-[#161B22] border border-white/5 rounded-3xl p-20 text-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6">
                    <HistoryIcon className="text-slate-600" size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">尚無歷史紀錄</h3>
                  <p className="text-slate-500 max-w-xs mb-8">啟動第一次搜尋後，分析結果將自動在此留存以便日後對比。</p>
                  <button 
                    onClick={() => setActiveTab('analysis')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500 transition-all"
                  >
                    快去尋找強勢股
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item, idx) => (
                    <motion.div
                      key={`${item.symbol}-${item.timestamp}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => {
                        setResult(item);
                        setSymbol(item.symbol);
                        setActiveTab('analysis');
                      }}
                      className="bg-[#161B22] border border-white/5 rounded-2xl p-6 flex items-center justify-between hover:border-blue-500/30 hover:bg-[#1C2128] cursor-pointer group transition-all"
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-xl shadow-lg ${
                          item.recommendation === "強力買進" 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                            : item.recommendation === "分批布局" || item.recommendation === "觀望"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                        }`}>
                          {item.symbol}
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className={`text-xs font-black uppercase tracking-widest ${
                              item.recommendation === "強力買進" 
                                ? "text-emerald-400" 
                                : item.recommendation === "分批布局" || item.recommendation === "觀望"
                                ? "text-amber-400"
                                : "text-red-500"
                            }`}>
                              {item.recommendation}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(item.timestamp).toLocaleString('zh-TW', { hour12: false })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 font-medium line-clamp-1 max-w-md">
                            {item.summary}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block mr-4">
                          <div className="text-[10px] uppercase text-slate-600 font-bold tracking-widest mb-0.5">AI 信心值</div>
                          <div className="text-sm font-black text-blue-400 font-mono">{Math.round(item.confidence * 100)}%</div>
                        </div>
                        <button 
                          onClick={(e) => deleteHistoryItem(e, item.symbol)}
                          className="p-2 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ChevronRight className="text-slate-700 group-hover:text-blue-500 transition-all group-hover:translate-x-1" size={20} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-6xl mx-auto px-6 pt-10 pb-20 text-center border-t border-white/5">
        <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] mb-4">
          Experimental AI Chip Analysis Engine • Powered by Gemini 3-Flash
        </p>
        <p className="text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
          免責聲明：本工具分析結果僅供參考。籌碼數據具有滯後性，且 AI 判讀受限於公開資訊。
          投資人應依個人判斷並自負盈虧。系統不保證任何獲利預期。
        </p>
      </footer>
    </div>
  );
}
