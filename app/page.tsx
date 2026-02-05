'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  type Release, 
  type ChangeItem, 
  type ChangeType, 
  changeTypeConfig,
  generateMarkdown,
  generateJSON,
  generateHTML
} from '@/lib/types';

// Theme helpers
function getTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('shiplog-theme') as 'dark' | 'light') || 'dark';
}

function setTheme(theme: 'dark' | 'light') {
  localStorage.setItem('shiplog-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Auto-save helpers
function getSavedReleases(): Release[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('shiplog-autosave');
    if (!saved) return null;
    return JSON.parse(saved);
  } catch { return null; }
}

function saveReleases(releases: Release[]) {
  localStorage.setItem('shiplog-autosave', JSON.stringify(releases));
  localStorage.setItem('shiplog-autosave-time', new Date().toISOString());
}

function clearSavedReleases() {
  localStorage.removeItem('shiplog-autosave');
  localStorage.removeItem('shiplog-autosave-time');
}

// Version history helpers
interface VersionSnapshot {
  id: string;
  name: string;
  releases: Release[];
  createdAt: string;
}

function getVersionHistory(): VersionSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('shiplog-versions') || '[]');
  } catch { return []; }
}

function saveVersion(name: string, releases: Release[]): VersionSnapshot[] {
  const history = getVersionHistory();
  const newVersion: VersionSnapshot = {
    id: Math.random().toString(36).substring(2, 9),
    name,
    releases: JSON.parse(JSON.stringify(releases)), // Deep clone
    createdAt: new Date().toISOString()
  };
  // Keep last 10 versions
  const updated = [...history, newVersion].slice(-10);
  localStorage.setItem('shiplog-versions', JSON.stringify(updated));
  return updated;
}

function deleteVersion(id: string): VersionSnapshot[] {
  const history = getVersionHistory().filter(v => v.id !== id);
  localStorage.setItem('shiplog-versions', JSON.stringify(history));
  return history;
}

// Compare two version snapshots and return differences
interface VersionDiff {
  added: { release: string; change: string }[];
  removed: { release: string; change: string }[];
  modified: { release: string; oldVersion: string; newVersion: string }[];
}

function diffVersions(older: VersionSnapshot, newer: VersionSnapshot): VersionDiff {
  const diff: VersionDiff = { added: [], removed: [], modified: [] };
  
  // Create maps for easier comparison
  const olderChanges = new Set<string>();
  const newerChanges = new Set<string>();
  const olderVersions = new Map<string, string>();
  const newerVersions = new Map<string, string>();
  
  older.releases.forEach(r => {
    olderVersions.set(r.version, r.date);
    r.changes.forEach(c => olderChanges.add(`${r.version}::${c.type}::${c.description}`));
  });
  
  newer.releases.forEach(r => {
    newerVersions.set(r.version, r.date);
    r.changes.forEach(c => newerChanges.add(`${r.version}::${c.type}::${c.description}`));
  });
  
  // Find added changes
  newerChanges.forEach(change => {
    if (!olderChanges.has(change)) {
      const [release, , desc] = change.split('::');
      if (desc) diff.added.push({ release, change: desc });
    }
  });
  
  // Find removed changes
  olderChanges.forEach(change => {
    if (!newerChanges.has(change)) {
      const [release, , desc] = change.split('::');
      if (desc) diff.removed.push({ release, change: desc });
    }
  });
  
  // Find modified version numbers
  newerVersions.forEach((date, version) => {
    if (!olderVersions.has(version)) {
      // Check if this might be a version rename
      const oldVersions = Array.from(olderVersions.keys());
      const newVersions = Array.from(newerVersions.keys());
      if (oldVersions.length === newVersions.length && oldVersions.length > 0) {
        // Might be a version number change
        const oldV = oldVersions.find(v => !newerVersions.has(v));
        if (oldV) {
          diff.modified.push({ release: 'Version', oldVersion: oldV, newVersion: version });
        }
      }
    }
  });
  
  return diff;
}

function getLastSaveTime(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('shiplog-autosave-time');
}

interface Template {
  name: string;
  emoji: string;
  description: string;
  releases: Release[];
}

const templates: Template[] = [
  {
    name: 'Product Launch',
    emoji: '🚀',
    description: 'First release with core features',
    releases: [{
      version: '1.0.0',
      date: new Date().toISOString().split('T')[0],
      changes: [
        { id: generateId(), type: 'added', description: 'Initial release' },
        { id: generateId(), type: 'added', description: 'Core feature implementation' },
        { id: generateId(), type: 'added', description: 'User authentication' },
        { id: generateId(), type: 'added', description: 'Documentation' },
      ]
    }]
  },
  {
    name: 'Bug Fix',
    emoji: '🐛',
    description: 'Patch release with fixes',
    releases: [{
      version: '1.0.1',
      date: new Date().toISOString().split('T')[0],
      changes: [
        { id: generateId(), type: 'fixed', description: 'Fixed critical bug in...' },
        { id: generateId(), type: 'fixed', description: 'Resolved edge case where...' },
        { id: generateId(), type: 'changed', description: 'Improved error handling' },
      ]
    }]
  },
  {
    name: 'Security Update',
    emoji: '🔒',
    description: 'Critical security patches',
    releases: [{
      version: '1.0.2',
      date: new Date().toISOString().split('T')[0],
      changes: [
        { id: generateId(), type: 'security', description: 'Patched XSS vulnerability in...' },
        { id: generateId(), type: 'security', description: 'Updated dependencies to fix CVE-...' },
        { id: generateId(), type: 'changed', description: 'Enhanced input validation' },
      ]
    }]
  },
  {
    name: 'Major Update',
    emoji: '✨',
    description: 'New features & improvements',
    releases: [{
      version: '2.0.0',
      date: new Date().toISOString().split('T')[0],
      changes: [
        { id: generateId(), type: 'added', description: 'New feature: ...' },
        { id: generateId(), type: 'added', description: 'Added support for...' },
        { id: generateId(), type: 'changed', description: 'Redesigned UI for...' },
        { id: generateId(), type: 'changed', description: 'Improved performance by...' },
        { id: generateId(), type: 'deprecated', description: 'Old API endpoints' },
      ]
    }]
  },
  {
    name: 'Breaking Changes',
    emoji: '💥',
    description: 'Major version with breaking changes',
    releases: [{
      version: '3.0.0',
      date: new Date().toISOString().split('T')[0],
      changes: [
        { id: generateId(), type: 'changed', description: 'BREAKING: Changed API response format' },
        { id: generateId(), type: 'removed', description: 'BREAKING: Removed deprecated v1 endpoints' },
        { id: generateId(), type: 'added', description: 'New v3 API with improved performance' },
        { id: generateId(), type: 'changed', description: 'Updated minimum Node.js version to 18' },
      ]
    }]
  },
];

export default function Home() {
  const [releases, setReleases] = useState<Release[]>([
    {
      version: '1.0.0',
      date: new Date().toISOString().split('T')[0],
      changes: []
    }
  ]);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'html'>('markdown');
  const [copied, setCopied] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionSnapshot[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [showSaveVersion, setShowSaveVersion] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState<[VersionSnapshot | null, VersionSnapshot | null]>([null, null]);
  const [versionDiff, setVersionDiff] = useState<VersionDiff | null>(null);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState<Release[][]>([]);
  const [redoStack, setRedoStack] = useState<Release[][]>([]);

  // Wrap setReleases to track undo/redo
  const updateReleases = useCallback((updater: Release[] | ((prev: Release[]) => Release[])) => {
    setReleases(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Only add to undo stack if there's an actual change
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        setUndoStack(stack => [...stack.slice(-19), prev]); // Keep last 20 states
        setRedoStack([]); // Clear redo stack on new change
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [...stack, releases]);
    setReleases(previous);
  }, [undoStack, releases]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(stack => stack.slice(0, -1));
    setUndoStack(stack => [...stack, releases]);
    setReleases(next);
  }, [redoStack, releases]);

  // Keyboard shortcuts for undo/redo and search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      // Escape closes search
      if (e.key === 'Escape' && showSearchBar) {
        setShowSearchBar(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, showSearchBar]);

  // Load saved releases and version history on mount
  useEffect(() => {
    const saved = getSavedReleases();
    const savedTime = getLastSaveTime();
    if (saved && saved.length > 0) {
      // Check if there's meaningful content
      const hasContent = saved.some(r => r.changes.some(c => c.description.trim()));
      if (hasContent) {
        setShowRestorePrompt(true);
      }
    }
    if (savedTime) {
      setLastSaved(savedTime);
    }
    setVersionHistory(getVersionHistory());
    
    // Initialize theme
    const savedTheme = getTheme();
    setThemeState(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(newTheme);
    setTheme(newTheme);
  }, [theme]);

  // Auto-save when releases change (debounced)
  useEffect(() => {
    const hasContent = releases.some(r => r.changes.some(c => c.description.trim()));
    if (hasContent) {
      const timer = setTimeout(() => {
        saveReleases(releases);
        setLastSaved(new Date().toISOString());
        setHasUnsavedChanges(false);
      }, 1000);
      setHasUnsavedChanges(true);
      return () => clearTimeout(timer);
    }
  }, [releases]);

  const restoreSaved = useCallback(() => {
    const saved = getSavedReleases();
    if (saved) {
      setReleases(saved);
    }
    setShowRestorePrompt(false);
  }, []);

  const discardSaved = useCallback(() => {
    clearSavedReleases();
    setShowRestorePrompt(false);
    setLastSaved(null);
  }, []);

  const handleSaveVersion = useCallback(() => {
    const name = versionName.trim() || `v${releases[0]?.version || '1.0.0'} - ${new Date().toLocaleDateString()}`;
    const updated = saveVersion(name, releases);
    setVersionHistory(updated);
    setShowSaveVersion(false);
    setVersionName('');
  }, [releases, versionName]);

  const handleRestoreVersion = useCallback((version: VersionSnapshot) => {
    // Regenerate IDs to avoid duplicates
    const restoredReleases = version.releases.map(r => ({
      ...r,
      changes: r.changes.map(c => ({ ...c, id: generateId() }))
    }));
    setReleases(restoredReleases);
    setShowVersions(false);
  }, []);

  const handleDeleteVersion = useCallback((id: string) => {
    const updated = deleteVersion(id);
    setVersionHistory(updated);
  }, []);

  const handleSelectForCompare = useCallback((version: VersionSnapshot) => {
    setCompareVersions(prev => {
      if (!prev[0]) return [version, null];
      if (prev[0].id === version.id) return [null, null]; // Deselect
      if (!prev[1]) {
        // Compute diff
        const older = new Date(prev[0].createdAt) < new Date(version.createdAt) ? prev[0] : version;
        const newer = older === prev[0] ? version : prev[0];
        setVersionDiff(diffVersions(older, newer));
        return [prev[0], version];
      }
      // Reset and start new selection
      setVersionDiff(null);
      return [version, null];
    });
  }, []);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setCompareVersions([null, null]);
    setVersionDiff(null);
  }, []);

  const applyTemplate = useCallback((template: Template) => {
    // Regenerate IDs to avoid duplicates
    const newReleases = template.releases.map(r => ({
      ...r,
      changes: r.changes.map(c => ({ ...c, id: generateId() }))
    }));
    setReleases(newReleases);
    setShowTemplates(false);
    setShowRestorePrompt(false);
  }, []);

  const clearAll = useCallback(() => {
    setReleases([{
      version: '1.0.0',
      date: new Date().toISOString().split('T')[0],
      changes: []
    }]);
    clearSavedReleases();
    setLastSaved(null);
  }, []);

  const addRelease = useCallback(() => {
    const lastVersion = releases[0]?.version || '0.0.0';
    const [major, minor, patch] = lastVersion.split('.').map(Number);
    updateReleases(prev => [{
      version: `${major}.${minor}.${patch + 1}`,
      date: new Date().toISOString().split('T')[0],
      changes: []
    }, ...prev]);
  }, [releases, updateReleases]);

  const updateRelease = useCallback((index: number, updates: Partial<Release>) => {
    updateReleases(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  }, [updateReleases]);

  const deleteRelease = useCallback((index: number) => {
    updateReleases(prev => prev.filter((_, i) => i !== index));
  }, [updateReleases]);

  const addChange = useCallback((releaseIndex: number, type: ChangeType) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return {
        ...r,
        changes: [...r.changes, { id: generateId(), type, description: '' }]
      };
    }));
  }, [updateReleases]);

  const updateChange = useCallback((releaseIndex: number, changeId: string, description: string) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return {
        ...r,
        changes: r.changes.map(c => c.id === changeId ? { ...c, description } : c)
      };
    }));
  }, [updateReleases]);

  const deleteChange = useCallback((releaseIndex: number, changeId: string) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return { ...r, changes: r.changes.filter(c => c.id !== changeId) };
    }));
  }, [updateReleases]);

  const getExport = useCallback(() => {
    const filtered = releases.map(r => ({
      ...r,
      changes: r.changes.filter(c => c.description.trim())
    })).filter(r => r.changes.length > 0);
    
    if (exportFormat === 'markdown') return generateMarkdown(filtered);
    if (exportFormat === 'json') return generateJSON(filtered);
    return generateHTML(filtered);
  }, [releases, exportFormat]);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(getExport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getExport]);

  const downloadFile = useCallback(() => {
    const content = getExport();
    const filenames = { markdown: 'CHANGELOG.md', json: 'changelog.json', html: 'changelog.html' };
    const mimeTypes = { markdown: 'text/markdown', json: 'application/json', html: 'text/html' };
    
    const blob = new Blob([content], { type: mimeTypes[exportFormat] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenames[exportFormat];
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

          {/* Template Quick Start & Version History */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => { setShowTemplates(!showTemplates); setShowVersions(false); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showTemplates
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              📋 Templates
            </button>
            <button
              onClick={() => { setShowVersions(!showVersions); setShowTemplates(false); exitCompareMode(); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showVersions
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              📚 Versions {versionHistory.length > 0 && `(${versionHistory.length})`}
            </button>
            {versionHistory.length >= 2 && (
              <button
                onClick={() => { setCompareMode(!compareMode); setShowVersions(true); setShowTemplates(false); if (compareMode) exitCompareMode(); }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  compareMode
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                🔀 Compare
              </button>
            )}
            <button
              onClick={() => setShowSaveVersion(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-all"
            >
              💾 Save Version
            </button>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-all"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button
              onClick={() => { setShowSearchBar(!showSearchBar); if (showSearchBar) setSearchQuery(''); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showSearchBar
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              🔍 Search
            </button>
          </div>
            
            {showTemplates && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-w-3xl mx-auto fade-in">
                {templates.map((template, i) => (
                  <button
                    key={i}
                    onClick={() => applyTemplate(template)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
                  >
                    <span className="text-2xl">{template.emoji}</span>
                    <span className="text-sm font-medium text-white group-hover:text-emerald-400">{template.name}</span>
                    <span className="text-xs text-zinc-500 text-center">{template.description}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Version History Panel */}
            {showVersions && (
              <div className="mt-4 max-w-2xl mx-auto fade-in">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span>{compareMode ? '🔀' : '📚'}</span> {compareMode ? 'Compare Versions' : 'Saved Versions'}
                    {compareMode && (
                      <span className="text-xs text-purple-400 font-normal ml-2">
                        Select 2 versions to compare
                      </span>
                    )}
                  </h3>
                  {versionHistory.length === 0 ? (
                    <p className="text-zinc-500 text-center py-4">No saved versions yet. Click "Save Version" to create a snapshot!</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {[...versionHistory].reverse().map((version) => {
                        const isSelected = compareVersions[0]?.id === version.id || compareVersions[1]?.id === version.id;
                        return (
                          <div
                            key={version.id}
                            className={`flex items-center gap-3 p-3 rounded-lg transition-all group ${
                              compareMode 
                                ? isSelected 
                                  ? 'bg-purple-500/20 border border-purple-500/40' 
                                  : 'bg-zinc-800/50 hover:bg-zinc-800 cursor-pointer'
                                : 'bg-zinc-800/50 hover:bg-zinc-800'
                            }`}
                            onClick={() => compareMode && handleSelectForCompare(version)}
                          >
                            {compareMode && (
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? 'border-purple-500 bg-purple-500' : 'border-zinc-600'
                              }`}>
                                {isSelected && <span className="text-white text-xs">✓</span>}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{version.name}</p>
                              <p className="text-xs text-zinc-500">
                                {new Date(version.createdAt).toLocaleString()} • {version.releases.length} release{version.releases.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            {!compareMode && (
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleRestoreVersion(version)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-xs font-medium transition-all"
                                >
                                  Restore
                                </button>
                                <button
                                  onClick={() => handleDeleteVersion(version.id)}
                                  className="px-2 py-1.5 text-red-400 hover:bg-red-500/20 rounded-lg text-xs transition-all"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Diff Display */}
                  {compareMode && versionDiff && (
                    <div className="mt-4 pt-4 border-t border-zinc-700">
                      <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                        📊 Differences
                        <span className="text-xs text-zinc-500 font-normal">
                          ({compareVersions[0]?.name} → {compareVersions[1]?.name})
                        </span>
                      </h4>
                      
                      {versionDiff.added.length === 0 && versionDiff.removed.length === 0 && versionDiff.modified.length === 0 ? (
                        <p className="text-zinc-500 text-sm text-center py-2">No differences found</p>
                      ) : (
                        <div className="space-y-3 max-h-48 overflow-y-auto">
                          {versionDiff.added.length > 0 && (
                            <div>
                              <p className="text-xs text-green-400 font-medium mb-1">+ Added ({versionDiff.added.length})</p>
                              {versionDiff.added.map((item, i) => (
                                <div key={i} className="text-xs text-green-300/80 pl-3 py-0.5">
                                  <span className="text-zinc-500">[{item.release}]</span> {item.change}
                                </div>
                              ))}
                            </div>
                          )}
                          {versionDiff.removed.length > 0 && (
                            <div>
                              <p className="text-xs text-red-400 font-medium mb-1">- Removed ({versionDiff.removed.length})</p>
                              {versionDiff.removed.map((item, i) => (
                                <div key={i} className="text-xs text-red-300/80 pl-3 py-0.5">
                                  <span className="text-zinc-500">[{item.release}]</span> {item.change}
                                </div>
                              ))}
                            </div>
                          )}
                          {versionDiff.modified.length > 0 && (
                            <div>
                              <p className="text-xs text-yellow-400 font-medium mb-1">~ Modified ({versionDiff.modified.length})</p>
                              {versionDiff.modified.map((item, i) => (
                                <div key={i} className="text-xs text-yellow-300/80 pl-3 py-0.5">
                                  {item.release}: {item.oldVersion} → {item.newVersion}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Save Version Modal */}
            {showSaveVersion && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 fade-in">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full mx-4">
                  <h3 className="text-xl font-semibold text-white mb-4">💾 Save Version</h3>
                  <p className="text-zinc-400 text-sm mb-4">
                    Create a snapshot of your current changelog that you can restore later.
                  </p>
                  <input
                    type="text"
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                    placeholder={`v${releases[0]?.version || '1.0.0'} - ${new Date().toLocaleDateString()}`}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 mb-4"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowSaveVersion(false); setVersionName(''); }}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm font-medium transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveVersion}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-medium transition-all"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Restore Prompt */}
        {showRestorePrompt && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 fade-in">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💾</span>
              <div>
                <p className="text-white font-medium">Previous work found!</p>
                <p className="text-zinc-400 text-sm">You have unsaved changes from a previous session.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={restoreSaved}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-medium transition-all"
              >
                Restore
              </button>
              <button
                onClick={discardSaved}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm font-medium transition-all"
              >
                Start Fresh
              </button>
            </div>
          </div>
        )}

        {/* Auto-save indicator */}
        {lastSaved && !showRestorePrompt && (
          <div className="mb-4 flex justify-end">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
              hasUnsavedChanges
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}>
              {hasUnsavedChanges ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Saving...
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Auto-saved
                </>
              )}
            </div>
          </div>
        )}

        {/* Search Bar */}
        {showSearchBar && (
          <div className="mb-6 fade-in">
            <div className="relative max-w-xl mx-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search changes... (e.g. fixed, authentication, API)"
                className="w-full px-4 py-3 pl-10 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all"
                autoFocus
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            {searchQuery.trim() && (() => {
              const q = searchQuery.toLowerCase().trim();
              const matchCount = releases.reduce((count, r) => {
                return count + r.changes.filter(c => c.description.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)).length;
              }, 0);
              const versionMatch = releases.some(r => r.version.toLowerCase().includes(q));
              return (
                <p className="text-center text-xs text-zinc-500 mt-2">
                  {matchCount > 0 ? (
                    <span className="text-emerald-400">{matchCount} matching change{matchCount !== 1 ? 's' : ''} found</span>
                  ) : versionMatch ? (
                    <span className="text-emerald-400">Version match found</span>
                  ) : (
                    <span>No matches for "{searchQuery}"</span>
                  )}
                </p>
              );
            })()}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Editor Panel */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Releases</h2>
              <div className="flex gap-2">
                <button
                  onClick={clearAll}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-1"
                  title="Clear all and start fresh"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <button
                  onClick={addRelease}
                  className="btn-primary px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Release
                </button>
                {/* Undo/Redo Buttons */}
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={undo}
                    disabled={undoStack.length === 0}
                    className="p-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                    title="Undo (Ctrl+Z)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={redo}
                    disabled={redoStack.length === 0}
                    className="p-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                    title="Redo (Ctrl+Shift+Z)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {releases.map((release, releaseIndex) => {
                const q = searchQuery.toLowerCase().trim();
                const releaseHasMatch = q ? (
                  release.version.toLowerCase().includes(q) ||
                  release.changes.some(c => c.description.toLowerCase().includes(q) || c.type.toLowerCase().includes(q))
                ) : true;
                const isDimmed = q && !releaseHasMatch;
                
                return (
                <div 
                  key={releaseIndex} 
                  className={`release-card rounded-2xl p-5 fade-in transition-opacity ${isDimmed ? 'opacity-30' : ''}`}
                >
                  {/* Version & Date */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                    <div className="flex gap-2 sm:gap-3 flex-1">
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
                    </div>
                    {releases.length > 1 && (
                      <div className="flex items-end justify-end sm:justify-start">
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
                  <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 mb-4">
                    {(Object.keys(changeTypeConfig) as ChangeType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => addChange(releaseIndex, type)}
                        className={`${badgeClass(type)} px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 sm:gap-1.5`}
                      >
                        <span>{changeTypeConfig[type].emoji}</span>
                        <span className="hidden sm:inline">{changeTypeConfig[type].label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Changes List */}
                  <div className="space-y-2">
                    {release.changes.map(change => {
                      const changeMatches = q && (change.description.toLowerCase().includes(q) || change.type.toLowerCase().includes(q));
                      return (
                      <div 
                        key={change.id} 
                        className={`group flex gap-2 items-start fade-in transition-all ${changeMatches ? 'ring-1 ring-emerald-500/40 rounded-lg bg-emerald-500/5 p-1 -m-1' : ''}`}
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
                    );
                    })}
                    
                    {release.changes.length === 0 && (
                      <p className="text-zinc-600 text-sm text-center py-4">
                        Click a badge above to add changes
                      </p>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Preview</h2>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <div className="flex p-1 bg-zinc-900 rounded-lg">
                  <button
                    onClick={() => setExportFormat('markdown')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'markdown'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    MD
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
                  <button
                    onClick={() => setExportFormat('html')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'html'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    HTML
                  </button>
                </div>
                <button
                  onClick={copyToClipboard}
                  className={`btn-secondary px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 sm:gap-2 ${
                    copied ? 'copy-success' : 'text-zinc-300'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="hidden sm:inline">Copied!</span>
                      <span className="sm:hidden">✓</span>
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
                  className="btn-secondary px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 sm:gap-2 text-zinc-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="hidden sm:inline">Download</span>
                  <span className="sm:hidden">Save</span>
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 sm:p-5 min-h-[300px] sm:min-h-[400px] max-h-[400px] sm:max-h-[600px] overflow-auto custom-scrollbar">
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
