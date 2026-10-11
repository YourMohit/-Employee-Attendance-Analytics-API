/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Navbar, TabType } from './components/Navbar';
import { ApiConsole } from './components/ApiConsole';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { PipelineStudio } from './components/PipelineStudio';
import { RulesLab } from './components/RulesLab';
import { CodeViewer } from './components/CodeViewer';
import { INITIAL_EMPLOYEES, INITIAL_LOGS } from './data/seedData';
import { Employee, AttendanceRecord } from './types/attendance';
import { ShieldCheck, Cpu, Terminal, ArrowUpRight, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('console');
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [logs, setLogs] = useState<AttendanceRecord[]>(INITIAL_LOGS);

  const handleResetData = () => {
    setEmployees(INITIAL_EMPLOYEES);
    setLogs(INITIAL_LOGS);
  };

  return (
    <div className="min-h-screen cyber-bg text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black relative">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onResetData={handleResetData}
      />

      {/* Futuristic Telemetry & Status HUD Strip */}
      <div className="bg-slate-950/80 backdrop-blur-md border-b border-cyan-500/20 px-4 py-2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-indigo-500/5 to-emerald-500/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs relative z-10">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-beacon" />
            <div className="flex items-center gap-2">
              <span className="text-slate-300 font-medium">
                HROne Core Engine: <span className="text-cyan-300 font-mono font-semibold">app/main.py</span> (FastAPI + MongoDB 7.0)
              </span>
              <span className="hidden sm:inline px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/80">
                R1–R10 ENFORCED
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
              SYS: <span className="text-emerald-400 font-bold">ONLINE</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hidden md:inline">
              PLAN: <span className="text-cyan-400 font-bold">IXSCAN GUARANTEED</span>
            </span>
            <button
              onClick={() => setActiveTab('code')}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-cyan-950/50"
            >
              <span>Submission Code</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'console' && (
          <ApiConsole
            employees={employees}
            setEmployees={setEmployees}
            logs={logs}
            setLogs={setLogs}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            employees={employees}
            logs={logs}
          />
        )}

        {activeTab === 'pipelines' && (
          <PipelineStudio />
        )}

        {activeTab === 'rules' && (
          <RulesLab />
        )}

        {activeTab === 'code' && (
          <CodeViewer />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50 py-6 text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>FastAPI + MongoDB 7.0 Attendance & Analytics System</span>
          </div>
          <div>
            Built with strict adherence to <span className="text-slate-300">OpenAPI 3.0.3</span> and <span className="text-slate-300">DATA_MODEL.md</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
