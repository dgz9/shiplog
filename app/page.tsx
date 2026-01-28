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

  const downloadFile = useCallback(() => {
    const content = getExport();
    const filename = exportFormat === 'markdown' ? 'CHANGELOG.md' : 'changelog.json';
    const mimeType = exportFormat === 'markdown' ? 'text/markdown' : 'application/json';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getExport, exportFormat]);

  const badgeClass = (type: ChangeType) => {
    const classes: Record<ChangeType, string> = {
      added: 'badge-added',
      changed: 'badge-changed',
      fixed: 'badge-fixed',
      removed: 'badge-removed',
      security: 'badge-security',
      deprecated: 'badge-deprecated'
    };
    return classes[type];
  };

  return (
    <main className="min-h-screen bg-mesh">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="text-center py-8 sm:py-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <span className="text-emerald-400 text-sm font-medium">Keep a Changelog format</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-bold mb-4 tracking-tight">
            <span className="text-emerald-400">Ship</span>
            <span className="text-white">Log</span>
            <span className="ml-3">🚀</span>
          </h1>
          
          <p className="text-zinc-400 text-lg max-w-md mx-auto">
            Generate beautiful changelogs for your releases
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Editor Panel */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Releases</h2>
              <button
                onClick={addRelease}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Release
              </button>
            </div>

            <div className="space-y-4">
              {releases.map((release, releaseIndex) => (
                <div 
                  key={releaseIndex} 
                  className="release-card rounded-2xl p-5 fade-in"
                >
                  {/* Version & Date */}
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-500 mb-1 block">Version</label>
                      <input
                        type="text"
                        value={release.version}
                        onChange={e => updateRelease(releaseIndex, { version: e.target.value })}
                        placeholder="1.0.0"
                        className="input-field w-full rounded-lg px-3 py-2 text-white text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-zinc-500 mb-1 block">Date</label>
                      <input
                        type="date"
                        value={release.date}
                        onChange={e => updateRelease(releaseIndex, { date: e.target.value })}
                        className="input-field w-full rounded-lg px-3 py-2 text-white text-sm"
                      />
                    </div>
                    {releases.length > 1 && (
                      <div className="flex items-end">
                        <button
                          onClick={() => deleteRelease(releaseIndex)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete release"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Change Type Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(Object.keys(changeTypeConfig) as ChangeType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => addChange(releaseIndex, type)}
                        className={`${badgeClass(type)} px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5`}
                      >
                        <span>{changeTypeConfig[type].emoji}</span>
                        <span>{changeTypeConfig[type].label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Changes List */}
                  <div className="space-y-2">
                    {release.changes.map(change => (
                      <div 
                        key={change.id} 
                        className="group flex gap-2 items-start fade-in"
                      >
                        <span className={`${badgeClass(change.type)} px-2 py-1 rounded text-xs flex-shrink-0 mt-1`}>
                          {changeTypeConfig[change.type].emoji}
                        </span>
                        <input
                          type="text"
                          value={change.description}
                          onChange={e => updateChange(releaseIndex, change.id, e.target.value)}
                          placeholder={`What was ${change.type}?`}
                          className="input-field flex-1 rounded-lg px-3 py-2 text-white text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => deleteChange(releaseIndex, change.id)}
                          className="delete-btn p-2 text-zinc-600 hover:text-red-400 rounded transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    
                    {release.changes.length === 0 && (
                      <p className="text-zinc-600 text-sm text-center py-4">
                        Click a badge above to add changes
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Preview</h2>
              <div className="flex gap-2">
                <div className="flex p-1 bg-zinc-900 rounded-lg">
                  <button
                    onClick={() => setExportFormat('markdown')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'markdown'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => setExportFormat('json')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'json'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    JSON
                  </button>
                </div>
                <button
                  onClick={copyToClipboard}
                  className={`btn-secondary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                    copied ? 'copy-success' : 'text-zinc-300'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={downloadFile}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-zinc-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 min-h-[400px] max-h-[600px] overflow-auto custom-scrollbar">
              <pre className="code-preview text-zinc-300 whitespace-pre-wrap">
                {getExport() || (
                  <span className="text-zinc-600">Add some changes to see the preview...</span>
                )}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pb-8 text-center">
          <p className="text-zinc-600 text-sm">
            Made with 🦞 by{' '}
            <a 
              href="https://luke-lobster-site.vercel.app" 
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
              target="_blank"
            >
              Luke
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
