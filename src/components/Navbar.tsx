import React from 'react';
import { Database, Terminal, BarChart3, BookOpen, Layers, CheckCircle2, RotateCcw, GitPullRequest, ShieldCheck } from 'lucide-react';

export type TabType = 'console' | 'analytics' | 'pipelines' | 'rules' | 'evaluation' | 'code';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onResetData: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onResetData }) => {
  return (
    <header className="border-b border-cyan-500/20 bg-slate-950/90 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.85)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Database className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold text-base sm:text-lg text-white tracking-tight tech-gradient-text">
                  Attendance &amp; Workforce Analytics
                </span>
                <span className="cyber-badge cyber-badge-cyan">
                  v2.0.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono tracking-tight hidden sm:block">
                FastAPI Engine · MongoDB 7.0 Aggregations · Standard Rules R1–R10
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'console'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>API Sandbox</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'analytics'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Workforce Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('pipelines')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'pipelines'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Pipeline Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'rules'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Rules Lab</span>
            </button>

            <button
              onClick={() => setActiveTab('evaluation')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'evaluation'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Evaluation &amp; Interview</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'code'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_16px_rgba(0,240,255,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Code &amp; Review</span>
            </button>
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('evaluation')}
              title="Open HROne Evaluation & Interview Suite"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25 transition-all hover:scale-[1.02]"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
              <span className="font-bold">Evaluation Suite</span>
            </button>

            <button
              onClick={onResetData}
              title="Reset sample data back to standard specification"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors border border-white/10"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>MongoDB 7.0</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden overflow-x-auto py-2.5 gap-1.5 border-t border-white/10 no-scrollbar">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'console' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            API Sandbox
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'analytics' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab('pipelines')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'pipelines' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pipelines
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'rules' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Rules Lab
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'evaluation' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Evaluation &amp; Interview
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'code' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Code Review
          </button>
        </div>
      </div>
    </header>
  );
};
