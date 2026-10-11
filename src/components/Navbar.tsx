import React from 'react';
import { Database, Terminal, BarChart3, GitFork, BookOpen, Layers, CheckCircle2, RotateCcw } from 'lucide-react';

export type TabType = 'console' | 'analytics' | 'pipelines' | 'rules' | 'code';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onResetData: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onResetData }) => {
  return (
    <header className="border-b border-cyan-500/20 bg-slate-950/85 backdrop-blur-xl sticky top-0 z-50 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.8)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Database className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight tech-gradient-text">HROne Attendance & Analytics</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                  API 2.0.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono tracking-tight">FastAPI Engine · MongoDB 7.0 · PyMongo · Strict Rules R1–R10</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-950/90 p-1.5 rounded-xl border border-slate-800/90 shadow-inner">
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'console'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Terminal className="w-4 h-4 text-cyan-400" />
              API Sandbox
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'analytics'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Workforce Analytics
            </button>

            <button
              onClick={() => setActiveTab('pipelines')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'pipelines'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Layers className="w-4 h-4 text-indigo-400" />
              Pipelines & Explain
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'rules'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              Rules Lab
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'code'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.25)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <BookOpen className="w-4 h-4 text-purple-400" />
              Code & Review
            </button>
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('code')}
              title="View Submission Guide & Git Instructions"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
            >
              <GitFork className="w-3.5 h-3.5 text-white" />
              <span>Submit Assignment</span>
            </button>

            <button
              onClick={onResetData}
              title="Reset Sample Data to DATA_MODEL.md state"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Reset Seed</span>
            </button>

            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg bg-emerald-950/50 border border-emerald-800/50 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>MongoDB 7.0 Ready</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              activeTab === 'console' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            API Sandbox
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab('pipelines')}
            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              activeTab === 'pipelines' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Pipelines
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              activeTab === 'rules' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Rules Lab
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              activeTab === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Code & Review
          </button>
        </div>
      </div>
    </header>
  );
};
