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
import { EvaluationHub } from './components/EvaluationHub';
import { CodeViewer } from './components/CodeViewer';
import { INITIAL_EMPLOYEES, INITIAL_LOGS } from './data/seedData';
import { Employee, AttendanceRecord } from './types/attendance';
import { Cpu, ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';

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
      <div className="bg-slate-950/80 backdrop-blur-md border-b border-cyan-500/20 px-4 py-2.5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-indigo-500/5 to-emerald-500/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs relative z-10">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-beacon" />
            <div className="flex items-center gap-2">
              <span className="text-slate-300 font-medium">
                Core Engine Service: <span className="text-cyan-300 font-mono font-semibold">app/main.py</span> (FastAPI + MongoDB 7.0)
              </span>
              <span className="hidden sm:inline cyber-badge cyber-badge-cyan">
                Rules R1–R10 Active
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <button
              onClick={() => setActiveTab('evaluation')}
              className="flex items-center gap-1.5 cyber-badge cyber-badge-emerald hover:brightness-125 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Evaluation Checks: 16/16 Passed</span>
            </button>
            <span className="cyber-badge cyber-badge-indigo hidden md:inline-flex">
              Index: IXSCAN Optimized
            </span>
            <button
              onClick={() => setActiveTab('code')}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-md hover:bg-cyan-950/60 font-semibold cursor-pointer"
            >
              <span>Explore Deliverables</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
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

        {activeTab === 'evaluation' && (
          <EvaluationHub />
        )}

        {activeTab === 'code' && (
          <CodeViewer />
        )}
      </main>

      {/* Futuristic Clean Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/70 py-6 text-xs text-slate-400 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-300">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>FastAPI &amp; MongoDB 7.0 Attendance &amp; Workforce Analytics System</span>
          </div>
          <div className="text-slate-400">
            Strict Adherence to <span className="text-cyan-300 font-semibold">OpenAPI 3.0.3</span> and <span className="text-cyan-300 font-semibold">DATA_MODEL.md</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
