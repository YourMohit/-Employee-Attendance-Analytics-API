import React, { useState } from 'react';
import { BookOpen, Copy, Check, Search, FileCode, FileText } from 'lucide-react';
import { REPO_FILES, RepoFile } from '../data/repoFiles';

export const CodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<RepoFile>(REPO_FILES[0]); // main.py
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = selectedFile.content.split('\n');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* File List Sidebar (3 cols) */}
      <div className="lg:col-span-3 space-y-4">
        <div className="glass-panel hud-corner rounded-xl p-3 shadow-xl space-y-1">
          <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider px-2 py-1 font-mono flex items-center gap-1.5 border-b border-cyan-500/10 pb-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Repository Deliverables
          </div>
          {REPO_FILES.map(file => {
            const isSelected = file.path === selectedFile.path;
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 font-semibold shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {file.name.endsWith('.md') ? (
                  <FileText className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                ) : (
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                )}
                <span className="truncate">{file.name}</span>
              </button>
            );
          })}
        </div>

        {/* HROne Submission Banner */}
        <div className="glass-panel rounded-xl p-4 text-xs space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-2">
            <span className="font-bold text-slate-100 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>Assignment Submission</span>
            </span>
            <span className="cyber-badge cyber-badge-amber">
              Due Oct 15
            </span>
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div><span className="text-slate-400 font-medium">Candidate:</span> Mohit Kumar</div>
            <div><span className="text-slate-400 font-medium">Email:</span> <span className="font-mono text-cyan-300">mohitdto0311@gmail.com</span></div>
            <div><span className="text-slate-400 font-medium">Deadline:</span> 11:59 PM IST, 15 Oct 2026</div>
          </div>

          <a
            href="https://forms.cloud.microsoft/r/eUE5uvaxpr"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center py-2 px-3 rounded-lg cyber-btn-primary font-bold text-xs uppercase tracking-wider transition-all"
          >
            Open HROne Form ↗
          </a>

          <div className="pt-2 border-t border-white/10">
            <div className="font-semibold text-slate-300 text-[11px] mb-1 font-mono">Git Deployment Commands:</div>
            <pre className="p-2.5 bg-slate-950/90 rounded-lg text-[10px] font-mono text-emerald-300 overflow-x-auto leading-relaxed border border-cyan-500/20">
{`git remote add origin https://github.com/<your-user>/hrone-api.git
git push -u origin main`}
            </pre>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              ✓ All required files present (<code className="text-cyan-300 font-mono">app/main.py</code>, <code className="text-cyan-300 font-mono">requirements.txt</code>, <code className="text-cyan-300 font-mono">REVIEW.md</code>, <code className="text-cyan-300 font-mono">DECISIONS.md</code>, <code className="text-cyan-300 font-mono">README.md</code>)<br/>
              ✓ Zero secrets or .env committed
            </p>
          </div>
        </div>
      </div>

      {/* Code Display Area (9 cols) */}
      <div className="lg:col-span-9 glass-panel hud-corner rounded-xl overflow-hidden shadow-xl flex flex-col">
        {/* File Header */}
        <div className="p-4 bg-slate-950/80 border-b border-cyan-500/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-cyan-200">{selectedFile.path}</span>
              <span className="cyber-badge cyber-badge-cyan">
                {selectedFile.language}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{selectedFile.description}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Find in file..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="cyber-input rounded-lg pl-8 pr-3 py-1 text-xs text-cyan-200 font-mono w-40 sm:w-52"
              />
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer font-mono"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Code Lines with Line Numbers */}
        <div className="p-4 bg-slate-950/90 overflow-x-auto max-h-[680px] overflow-y-auto font-mono text-xs leading-relaxed">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, idx) => {
                const lineNum = idx + 1;
                const matchesSearch = searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase());
                return (
                  <tr
                    key={lineNum}
                    className={`${matchesSearch ? 'bg-indigo-950/60' : 'hover:bg-slate-900/50'}`}
                  >
                    <td className="pr-4 text-slate-600 select-none text-right w-10 font-mono text-[11px]">
                      {lineNum}
                    </td>
                    <td className="text-slate-300 whitespace-pre font-mono">
                      {line}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
