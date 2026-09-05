import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, Folder, BookOpen, Terminal } from 'lucide-react';
import { PYTHON_FILES } from '../pythonSources';
import { PythonFile } from '../types';

export const CodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<PythonFile>(PYTHON_FILES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([selectedFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="code-viewer-panel" className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col shadow-lg">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-base font-semibold text-zinc-100">Library Source Code</h2>
          <span className="text-xs text-zinc-400">MicroPython 1.19+ & Python 3</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-copy-code"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy File'}</span>
          </button>
          <button
            id="btn-download-file"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-700/80 hover:bg-emerald-600 text-zinc-100 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {selectedFile.name}</span>
          </button>
        </div>
      </div>

      {/* Main split view: File list & Code Editor */}
      <div className="grid grid-cols-1 md:grid-cols-4 min-h-[480px]">
        {/* Sidebar File Tree */}
        <div className="p-3 bg-zinc-950/70 border-r border-zinc-800 space-y-4 text-xs">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              <span>Core Module (src/epdws/)</span>
            </div>
            <div className="space-y-1 mt-1">
              {PYTHON_FILES.filter((f) => f.category === 'core').map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors font-mono ${
                    selectedFile.path === file.path
                      ? 'bg-zinc-800 text-emerald-400 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
              <Folder className="w-3.5 h-3.5 text-emerald-400" />
              <span>Examples (examples/)</span>
            </div>
            <div className="space-y-1 mt-1">
              {PYTHON_FILES.filter((f) => f.category === 'examples').map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors font-mono ${
                    selectedFile.path === file.path
                      ? 'bg-zinc-800 text-emerald-400 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
              <Folder className="w-3.5 h-3.5 text-blue-400" />
              <span>Tools & Host (tools/)</span>
            </div>
            <div className="space-y-1 mt-1">
              {PYTHON_FILES.filter((f) => f.category === 'tools').map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors font-mono ${
                    selectedFile.path === file.path
                      ? 'bg-zinc-800 text-emerald-400 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Documentation</span>
            </div>
            <div className="space-y-1 mt-1">
              {PYTHON_FILES.filter((f) => f.category === 'docs').map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors font-mono ${
                    selectedFile.path === file.path
                      ? 'bg-zinc-800 text-emerald-400 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Code Content Window */}
        <div className="col-span-3 flex flex-col bg-zinc-950">
          {/* File path banner */}
          <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-400 bg-zinc-900/40">
            <span className="font-mono text-zinc-200">{selectedFile.path}</span>
            <span className="text-[11px] text-zinc-500 italic">{selectedFile.description}</span>
          </div>

          {/* Code Viewer with Line Numbers */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-200 select-text max-h-[560px]">
            <pre className="flex">
              {/* Line Numbers */}
              <span className="pr-4 text-zinc-600 select-none text-right border-r border-zinc-800/60 mr-4 font-mono">
                {selectedFile.content
                  .trim()
                  .split('\n')
                  .map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
              </span>
              {/* Code lines */}
              <code className="text-emerald-300 whitespace-pre">{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
