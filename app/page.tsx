'use client';

import { useState, useCallback } from 'react';
import { 
  type Release, 
  type ChangeItem, 
  type ChangeType, 
  changeTypeConfig,
  generateMarkdown,
  generateJSON 
} from '@/lib/types';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function Home() {
  const [releases, setReleases] = useState<Release[]>([
    {
      version: '1.0.0',
      date: new Date().toISOString().split('T')[0],
      changes: []
    }
  ]);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');
  const [copied, setCopied] = useState(false);

  const addRelease = useCallback(() => {
    const lastVersion = releases[0]?.version || '0.0.0';
    const [major, minor, patch] = lastVersion.split('.').map(Number);
    setReleases(prev => [{
      version: `${major}.${minor}.${patch + 1}`,
      date: new Date().toISOString().split('T')[0],
      changes: []
    }, ...prev]);
  }, [releases]);

  const updateRelease = useCallback((index: number, updates: Partial<Release>) => {
    setReleases(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  }, []);

  const deleteRelease = useCallback((index: number) => {
    setReleases(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addChange = useCallback((releaseIndex: number, type: ChangeType) => {
    setReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return {
        ...r,
        changes: [...r.changes, { id: generateId(), type, description: '' }]
      };
    }));
  }, []);

  const updateChange = useCallback((releaseIndex: number, changeId: string, description: string) => {
    setReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return {
        ...r,
        changes: r.changes.map(c => c.id === changeId ? { ...c, description } : c)
      };
    }));
  }, []);

  const deleteChange = useCallback((releaseIndex: number, changeId: string) => {
    setReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return { ...r, changes: r.changes.filter(c => c.id !== changeId) };
    }));
  }, []);

  const getExport = useCallback(() => {
    const filtered = releases.map(r => ({
      ...r,
      changes: r.changes.filter(c => c.description.trim())
    })).filter(r => r.changes.length > 0);
    
    return exportFormat === 'markdown' 
      ? generateMarkdown(filtered)
      : generateJSON(filtered);
  }, [releases, exportFormat]);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(getExport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getExport]);

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2">
            <span className="text-emerald-400">Ship</span>
            <span className="text-white">Log</span>
            <span className="ml-2">🚀</span>
          </h1>
          <p className="text-gray-400">Generate beautiful changelogs for your releases</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Releases</h2>
              <button
                onClick={addRelease}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-all"
              >
                + New Release
              </button>
            </div>

            {releases.map((release, releaseIndex) => (
              <div key={releaseIndex} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 animate-fade-in">
                {/* Version & Date */}
                <div className="flex gap-3 mb-4">
                  <input
                    type="text"
                    value={release.version}
                    onChange={e => updateRelease(releaseIndex, { version: e.target.value })}
                    placeholder="1.0.0"
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="date"
                    value={release.date}
                    onChange={e => updateRelease(releaseIndex, { date: e.target.value })}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {releases.length > 1 && (
                    <button
                      onClick={() => deleteRelease(releaseIndex)}
                      className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm"
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* Change Type Buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {(Object.keys(changeTypeConfig) as ChangeType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => addChange(releaseIndex, type)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${changeTypeConfig[type].color} bg-opacity-20 hover:bg-opacity-40 transition-all`}
                    >
                      {changeTypeConfig[type].emoji} {changeTypeConfig[type].label}
                    </button>
                  ))}
                </div>

                {/* Changes List */}
                <div className="space-y-2">
                  {release.changes.map(change => (
                    <div key={change.id} className="flex gap-2 items-start animate-fade-in">
                      <span className={`px-2 py-1 rounded text-xs ${changeTypeConfig[change.type].color} bg-opacity-30`}>
                        {changeTypeConfig[change.type].emoji}
                      </span>
                      <input
                        type="text"
                        value={change.description}
                        onChange={e => updateChange(releaseIndex, change.id, e.target.value)}
                        placeholder={`What was ${change.type}?`}
                        className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        autoFocus
                      />
                      <button
                        onClick={() => deleteChange(releaseIndex, change.id)}
                        className="p-1.5 hover:bg-slate-700 rounded text-gray-500 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {release.changes.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-2">
                      Click a badge above to add changes
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Preview</h2>
              <div className="flex gap-2">
                <select
                  value={exportFormat}
                  onChange={e => setExportFormat(e.target.value as 'markdown' | 'json')}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="markdown">Markdown</option>
                  <option value="json">JSON</option>
                </select>
                <button
                  onClick={copyToClipboard}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    copied 
                      ? 'bg-green-600 text-white' 
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>

            <pre className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm overflow-auto max-h-[600px] whitespace-pre-wrap font-mono">
              {getExport() || '// Add some changes to see the preview'}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>Made with 🦞 by <a href="https://luke-lobster-site.vercel.app" className="text-emerald-400 hover:text-emerald-300">Luke</a></p>
        </footer>
      </div>
    </main>
  );
}
