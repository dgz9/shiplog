'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  type Release, 
  type ChangeItem, 
  type ChangeType, 
  changeTypeConfig,
  tagPresets,
  generateMarkdown,
  generateJSON,
  generateHTML,
  generateYAML,
  generateTOML,
  generateRSS,
  generateConventionalCommits,
  generatePlainSummary,
  parseChangelogText,
  suggestVersionBump,
  applyBump
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
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'html' | 'yaml' | 'toml' | 'rss' | 'commits' | 'summary'>('markdown');
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
  const [showStats, setShowStats] = useState(false);

  // Calculate statistics from releases
  const stats = useMemo(() => {
    const counts: Record<ChangeType, number> = {
      added: 0,
      changed: 0,
      fixed: 0,
      removed: 0,
      security: 0,
      deprecated: 0,
    };
    let totalChanges = 0;
    const releasesByMonth: Record<string, number> = {};
    
    releases.forEach(release => {
      // Count by month
      const month = release.date.substring(0, 7); // YYYY-MM
      releasesByMonth[month] = (releasesByMonth[month] || 0) + 1;
      
      // Count by type
      release.changes.forEach(change => {
        if (change.description.trim()) {
          counts[change.type]++;
          totalChanges++;
        }
      });
    });
    
    return { counts, totalChanges, releaseCount: releases.length, releasesByMonth };
  }, [releases]);
  
  // Quick Add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  
  // Keyboard shortcuts panel
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Timeline view
  const [showTimeline, setShowTimeline] = useState(false);

  // Import from text state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<Release[]>([]);

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchBar(prev => !prev);
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      // Escape closes search
      if (e.key === 'Escape') {
        if (showSearchBar) { setShowSearchBar(false); setSearchQuery(''); }
        if (showShortcuts) setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, showSearchBar, showShortcuts]);

  // Refs for keyboard shortcuts that reference later-defined functions
  const addReleaseRef = useRef<() => void>(() => {});
  const copyToClipboardRef = useRef<() => void>(() => {});

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

  // Quick Add handler - parse shorthand like +feature, !fix, ~change, -removed, *security, ^deprecated
  const handleQuickAdd = useCallback(() => {
    if (!quickAddText.trim()) return;
    const lines = quickAddText.split('\n').filter(l => l.trim());
    const newChanges: ChangeItem[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      let type: ChangeType = 'added';
      let desc = trimmed;
      if (trimmed.startsWith('+')) { type = 'added'; desc = trimmed.slice(1).trim(); }
      else if (trimmed.startsWith('!')) { type = 'fixed'; desc = trimmed.slice(1).trim(); }
      else if (trimmed.startsWith('~')) { type = 'changed'; desc = trimmed.slice(1).trim(); }
      else if (trimmed.startsWith('-')) { type = 'removed'; desc = trimmed.slice(1).trim(); }
      else if (trimmed.startsWith('*')) { type = 'security'; desc = trimmed.slice(1).trim(); }
      else if (trimmed.startsWith('^')) { type = 'deprecated'; desc = trimmed.slice(1).trim(); }
      if (desc) newChanges.push({ id: generateId(), type, description: desc });
    }
    if (newChanges.length > 0) {
      updateReleases(prev => prev.map((r, i) => i === 0 ? { ...r, changes: [...r.changes, ...newChanges] } : r));
    }
    setQuickAddText('');
    setShowQuickAdd(false);
  }, [quickAddText, updateReleases]);

  // Handle import text change - parse preview
  const handleImportTextChange = useCallback((text: string) => {
    setImportText(text);
    if (text.trim()) {
      const parsed = parseChangelogText(text);
      setImportPreview(parsed);
    } else {
      setImportPreview([]);
    }
  }, []);

  // Apply import
  const applyImport = useCallback(() => {
    if (importPreview.length > 0) {
      updateReleases(importPreview);
      setShowImport(false);
      setImportText('');
      setImportPreview([]);
    }
  }, [importPreview, updateReleases]);

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

  const duplicateRelease = useCallback((index: number) => {
    updateReleases(prev => {
      const source = prev[index];
      const duplicate: Release = {
        version: source.version + '-copy',
        date: new Date().toISOString().split('T')[0],
        changes: source.changes.map(c => ({ ...c, id: generateId() }))
      };
      const next = [...prev];
      next.splice(index, 0, duplicate);
      return next;
    });
  }, [updateReleases]);

  const moveRelease = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    updateReleases(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
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

  const updateChangeContributor = useCallback((releaseIndex: number, changeId: string, contributor: string) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return {
        ...r,
        changes: r.changes.map(c => c.id === changeId ? { ...c, contributor: contributor || undefined } : c)
      };
    }));
  }, [updateReleases]);

  const deleteChange = useCallback((releaseIndex: number, changeId: string) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return { ...r, changes: r.changes.filter(c => c.id !== changeId) };
    }));
  }, [updateReleases]);

  const toggleTag = useCallback((releaseIndex: number, changeId: string, tag: string) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      return {
        ...r,
        changes: r.changes.map(c => {
          if (c.id !== changeId) return c;
          const tags = c.tags || [];
          return {
            ...c,
            tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
          };
        })
      };
    }));
  }, [updateReleases]);

  // State for which change item has tag picker open
  const [tagPickerOpen, setTagPickerOpen] = useState<string | null>(null);

  const moveChange = useCallback((releaseIndex: number, fromIdx: number, toIdx: number) => {
    updateReleases(prev => prev.map((r, i) => {
      if (i !== releaseIndex) return r;
      const changes = [...r.changes];
      const [moved] = changes.splice(fromIdx, 1);
      changes.splice(toIdx, 0, moved);
      return { ...r, changes };
    }));
  }, [updateReleases]);

  // Drag state for reordering changes within a release
  const [dragState, setDragState] = useState<{ releaseIndex: number; changeIndex: number } | null>(null);
  // Drag state for reordering releases
  const [dragReleaseIndex, setDragReleaseIndex] = useState<number | null>(null);
  const [dragOverReleaseIndex, setDragOverReleaseIndex] = useState<number | null>(null);

  const getExport = useCallback(() => {
    const filtered = releases.map(r => ({
      ...r,
      changes: r.changes.filter(c => c.description.trim())
    })).filter(r => r.changes.length > 0);
    
    if (exportFormat === 'markdown') return generateMarkdown(filtered);
    if (exportFormat === 'json') return generateJSON(filtered);
    if (exportFormat === 'yaml') return generateYAML(filtered);
    if (exportFormat === 'toml') return generateTOML(filtered);
    if (exportFormat === 'rss') return generateRSS(filtered);
    if (exportFormat === 'commits') return generateConventionalCommits(filtered);
    if (exportFormat === 'summary') return generatePlainSummary(filtered);
    return generateHTML(filtered);
  }, [releases, exportFormat]);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(getExport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getExport]);

  // Keep refs in sync for keyboard shortcuts
  addReleaseRef.current = addRelease;
  copyToClipboardRef.current = copyToClipboard;

  // Extra keyboard shortcuts using refs
  useEffect(() => {
    const handleExtraKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        addReleaseRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        copyToClipboardRef.current();
      }
    };
    window.addEventListener('keydown', handleExtraKeys);
    return () => window.removeEventListener('keydown', handleExtraKeys);
  }, []);

  const downloadFile = useCallback(() => {
    const content = getExport();
    const filenames: Record<string, string> = { markdown: 'CHANGELOG.md', json: 'changelog.json', html: 'changelog.html', yaml: 'changelog.yaml', toml: 'changelog.toml', rss: 'changelog.xml', commits: 'commits.txt', summary: 'release-notes.txt' };
    const mimeTypes: Record<string, string> = { markdown: 'text/markdown', json: 'application/json', html: 'text/html', yaml: 'text/yaml', toml: 'application/toml', rss: 'application/rss+xml', commits: 'text/plain', summary: 'text/plain' };
    
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
              onClick={() => setShowStats(!showStats)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showStats
                  ? 'bg-amber-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              📊 Stats
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
            <button
              onClick={() => { setShowQuickAdd(!showQuickAdd); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showQuickAdd
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              ⚡ Quick Add
            </button>
            <button
              onClick={() => { setShowImport(!showImport); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showImport
                  ? 'bg-cyan-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              📥 Import
            </button>
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showShortcuts
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              ⌨️ Shortcuts
            </button>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                showTimeline
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              📅 Timeline
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

        {/* Keyboard Shortcuts Panel */}
        {showShortcuts && (
          <div className="mb-6 fade-in max-w-xl mx-auto">
            <div className="bg-zinc-900/80 border border-indigo-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>⌨️</span> Keyboard Shortcuts
                </h3>
                <button onClick={() => setShowShortcuts(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ['⌘/Ctrl + N', 'New Release'],
                  ['⌘/Ctrl + Z', 'Undo'],
                  ['⌘/Ctrl + Shift + Z', 'Redo'],
                  ['⌘/Ctrl + Y', 'Redo (alt)'],
                  ['⌘/Ctrl + E', 'Copy Export'],
                  ['⌘/Ctrl + K', 'Toggle Search'],
                  ['?', 'Toggle Shortcuts'],
                  ['Escape', 'Close Panels'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-zinc-800/50">
                    <kbd className="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-300 font-mono whitespace-nowrap">{key}</kbd>
                    <span className="text-sm text-zinc-400">{desc}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-600 mt-3 text-center">Press <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 font-mono">?</kbd> anywhere to toggle this panel</p>
            </div>
          </div>
        )}

        {/* Quick Add Panel */}
        {showQuickAdd && (
          <div className="mb-6 fade-in max-w-2xl mx-auto">
            <div className="bg-zinc-900/80 border border-orange-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>⚡</span> Quick Add
                </h3>
                <button onClick={() => { setShowQuickAdd(false); setQuickAddText(''); }} className="text-zinc-500 hover:text-zinc-300 transition-colors">✕</button>
              </div>
              <p className="text-zinc-400 text-xs mb-3">
                Type one change per line using prefixes: <code className="text-green-400">+</code> added · <code className="text-yellow-400">!</code> fixed · <code className="text-blue-400">~</code> changed · <code className="text-red-400">-</code> removed · <code className="text-purple-400">*</code> security · <code className="text-orange-400">^</code> deprecated
              </p>
              <textarea
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                placeholder={`+New user dashboard\n!Fixed login timeout bug\n~Updated API response format\n-Removed legacy endpoints`}
                rows={5}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-orange-500 resize-y mb-3"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleQuickAdd(); } }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">⌘+Enter to submit</span>
                <button
                  onClick={handleQuickAdd}
                  disabled={!quickAddText.trim()}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-all"
                >
                  Add to Latest Release
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import from Text Panel */}
        {showImport && (
          <div className="mb-6 fade-in max-w-4xl mx-auto">
            <div className="bg-zinc-900/80 border border-cyan-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>📥</span> Import from Text
                </h3>
                <button
                  onClick={() => { setShowImport(false); setImportText(''); setImportPreview([]); }}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <p className="text-zinc-400 text-sm mb-4">
                Paste your changelog text below. Supports Markdown format, bullet lists, and auto-detects change types from keywords.
              </p>
              
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Input */}
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">Raw Changelog Text</label>
                  <textarea
                    value={importText}
                    onChange={(e) => handleImportTextChange(e.target.value)}
                    placeholder={`## 1.0.0 - 2024-01-15

### Added
- New feature for users
- Added dark mode support

### Fixed
- Fixed login bug
- Bug fix for mobile layout

### Changed
- Updated dependencies
- Improved performance`}
                    className="w-full h-64 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-cyan-500 resize-y"
                  />
                </div>
                
                {/* Preview */}
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">
                    Preview ({importPreview.length} release{importPreview.length !== 1 ? 's' : ''} detected)
                  </label>
                  <div className="h-64 bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 overflow-y-auto">
                    {importPreview.length === 0 ? (
                      <p className="text-zinc-600 text-sm">Paste text to see preview...</p>
                    ) : (
                      <div className="space-y-4">
                        {importPreview.map((release, i) => (
                          <div key={i} className="bg-zinc-800 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-emerald-400 font-semibold">v{release.version}</span>
                              <span className="text-zinc-500 text-xs">{release.date}</span>
                            </div>
                            <div className="space-y-1">
                              {release.changes.map((change) => (
                                <div key={change.id} className="flex items-center gap-2 text-xs">
                                  <span className={`px-1.5 py-0.5 rounded ${
                                    change.type === 'added' ? 'bg-green-500/20 text-green-400' :
                                    change.type === 'fixed' ? 'bg-yellow-500/20 text-yellow-400' :
                                    change.type === 'changed' ? 'bg-blue-500/20 text-blue-400' :
                                    change.type === 'removed' ? 'bg-red-500/20 text-red-400' :
                                    change.type === 'security' ? 'bg-purple-500/20 text-purple-400' :
                                    'bg-orange-500/20 text-orange-400'
                                  }`}>
                                    {changeTypeConfig[change.type].emoji}
                                  </span>
                                  <span className="text-zinc-300 truncate">{change.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setShowImport(false); setImportText(''); setImportPreview([]); }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={applyImport}
                  disabled={importPreview.length === 0}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-all"
                >
                  Import {importPreview.length > 0 && `(${importPreview.length} releases)`}
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Stats Dashboard */}
        {showStats && (() => {
          const allChanges = releases.flatMap(r => r.changes.filter(c => c.description.trim()));
          const totalChanges = allChanges.length;
          const byType: Record<string, number> = {};
          allChanges.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
          const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
          const totalReleases = releases.length;
          const avgPerRelease = totalReleases > 0 ? (totalChanges / totalReleases).toFixed(1) : '0';
          
          // Contributor stats
          const contributorCounts: Record<string, number> = {};
          allChanges.forEach(c => {
            const contributor = c.contributor?.trim();
            if (contributor) {
              contributorCounts[contributor] = (contributorCounts[contributor] || 0) + 1;
            }
          });
          const topContributors = Object.entries(contributorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const totalWords = allChanges.reduce((sum, c) => sum + c.description.trim().split(/\s+/).length, 0);
          const totalChars = allChanges.reduce((sum, c) => sum + c.description.trim().length, 0);
          
          return (
            <div className="mb-6 fade-in">
              <div className="max-w-2xl mx-auto bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span>📊</span> Changelog Stats
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-400">{totalReleases}</div>
                    <div className="text-xs text-zinc-500">Releases</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">{totalChanges}</div>
                    <div className="text-xs text-zinc-500">Total Changes</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-400">{avgPerRelease}</div>
                    <div className="text-xs text-zinc-500">Avg / Release</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-orange-400">{topType ? changeTypeConfig[topType[0] as ChangeType]?.emoji || '—' : '—'}</div>
                    <div className="text-xs text-zinc-500">{topType ? `Most: ${topType[0]}` : 'No data'}</div>
                  </div>
                </div>
                {totalChanges > 0 && (
                  <div className="space-y-2">
                    {(Object.keys(changeTypeConfig) as ChangeType[]).map(type => {
                      const count = byType[type] || 0;
                      if (count === 0) return null;
                      const pct = Math.round((count / totalChanges) * 100);
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <span className="text-sm w-24 flex items-center gap-1.5">
                            {changeTypeConfig[type].emoji} {changeTypeConfig[type].label}
                          </span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-zinc-500 w-12 text-right">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Extra metrics */}
                {totalChanges > 0 && (
                  <div className="mt-4 pt-3 border-t border-zinc-800">
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span>📝 {totalWords} words</span>
                      <span>🔤 {totalChars.toLocaleString()} chars</span>
                      <span>📊 ~{Math.max(1, Math.ceil(totalWords / 200))} min read</span>
                    </div>
                  </div>
                )}
                
                {/* Contributor leaderboard */}
                {topContributors.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-2">👥 Top Contributors</p>
                    <div className="space-y-1.5">
                      {topContributors.map(([name, count], i) => (
                        <div key={name} className="flex items-center gap-2 text-sm">
                          <span className="text-zinc-600 w-5 text-right">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                          <span className="text-zinc-300 flex-1 truncate">{name}</span>
                          <span className="text-emerald-400 font-medium">{count}</span>
                          <span className="text-zinc-600 text-xs">change{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Release Timeline */}
        {showTimeline && (() => {
          const sorted = [...releases]
            .filter(r => r.changes.some(c => c.description.trim()))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          if (sorted.length === 0) return (
            <div className="mb-6 fade-in max-w-3xl mx-auto">
              <div className="bg-zinc-900/50 border border-teal-500/30 rounded-xl p-6 text-center">
                <p className="text-zinc-500">Add some releases with changes to see the timeline!</p>
              </div>
            </div>
          );

          const maxChanges = Math.max(...sorted.map(r => r.changes.filter(c => c.description.trim()).length), 1);

          return (
            <div className="mb-6 fade-in max-w-4xl mx-auto">
              <div className="bg-zinc-900/50 border border-teal-500/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  <span>📅</span> Release Timeline
                  <span className="text-xs text-zinc-500 font-normal">({sorted.length} releases)</span>
                </h3>
                
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-zinc-800" />
                  
                  <div className="space-y-6">
                    {sorted.map((release, i) => {
                      const changeCount = release.changes.filter(c => c.description.trim()).length;
                      const barWidth = Math.round((changeCount / maxChanges) * 100);
                      const typeCounts: Record<string, number> = {};
                      release.changes.filter(c => c.description.trim()).forEach(c => {
                        typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
                      });
                      const isLatest = i === sorted.length - 1;
                      
                      return (
                        <div key={i} className="relative pl-16 group">
                          {/* Timeline dot */}
                          <div className={`absolute left-4 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isLatest
                              ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/30'
                              : 'bg-zinc-800 border-zinc-600 group-hover:border-emerald-500/50'
                          }`}>
                            {isLatest && <span className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          
                          {/* Content */}
                          <div className={`bg-zinc-800/50 rounded-xl p-4 border transition-all ${
                            isLatest ? 'border-emerald-500/30' : 'border-zinc-800 group-hover:border-zinc-700'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-400 font-bold font-mono">v{release.version}</span>
                                {isLatest && (
                                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full">Latest</span>
                                )}
                              </div>
                              <span className="text-xs text-zinc-500">{release.date}</span>
                            </div>
                            
                            {/* Change type breakdown bar */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden flex">
                                {(Object.keys(changeTypeConfig) as ChangeType[]).map(type => {
                                  const count = typeCounts[type] || 0;
                                  if (count === 0) return null;
                                  const pct = (count / changeCount) * barWidth;
                                  const colors: Record<string, string> = {
                                    added: 'bg-green-500', changed: 'bg-blue-500', fixed: 'bg-yellow-500',
                                    removed: 'bg-red-500', security: 'bg-purple-500', deprecated: 'bg-orange-500',
                                  };
                                  return <div key={type} className={`h-full ${colors[type]}`} style={{ width: `${pct}%` }} />;
                                })}
                              </div>
                              <span className="text-xs text-zinc-500 w-8 text-right">{changeCount}</span>
                            </div>
                            
                            {/* Change type pills */}
                            <div className="flex flex-wrap gap-1">
                              {(Object.keys(changeTypeConfig) as ChangeType[]).map(type => {
                                const count = typeCounts[type] || 0;
                                if (count === 0) return null;
                                return (
                                  <span key={type} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-zinc-900/80 text-zinc-400">
                                    {changeTypeConfig[type].emoji} {count}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragReleaseIndex(releaseIndex); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverReleaseIndex(releaseIndex); }}
                  onDragLeave={() => { if (dragOverReleaseIndex === releaseIndex) setDragOverReleaseIndex(null); }}
                  onDrop={(e) => { e.preventDefault(); if (dragReleaseIndex !== null && dragReleaseIndex !== releaseIndex) { moveRelease(dragReleaseIndex, releaseIndex); } setDragReleaseIndex(null); setDragOverReleaseIndex(null); }}
                  onDragEnd={() => { setDragReleaseIndex(null); setDragOverReleaseIndex(null); }}
                  className={`release-card rounded-2xl p-5 fade-in transition-all ${isDimmed ? 'opacity-30' : ''} ${dragReleaseIndex === releaseIndex ? 'opacity-40 scale-95' : ''} ${dragOverReleaseIndex === releaseIndex && dragReleaseIndex !== null && dragReleaseIndex !== releaseIndex ? 'ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-zinc-950' : ''}`}
                >
                  {/* Version & Date */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                    <span className="text-zinc-600 cursor-grab active:cursor-grabbing self-center mr-1 opacity-50 hover:opacity-100 transition-opacity" title="Drag to reorder releases">⠿</span>
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
                        {/* Smart version bump suggestion */}
                        {release.changes.filter(c => c.description.trim()).length > 0 && (() => {
                          const suggestion = suggestVersionBump(release.changes.filter(c => c.description.trim()));
                          if (!suggestion) return null;
                          const suggestedVersion = applyBump(release.version, suggestion.bump);
                          if (suggestedVersion === release.version) return null;
                          return (
                            <button
                              onClick={() => updateRelease(releaseIndex, { version: suggestedVersion })}
                              className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all hover:scale-105 ${
                                suggestion.bump === 'major' ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' :
                                suggestion.bump === 'minor' ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25' :
                                'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                              }`}
                              title={suggestion.reason}
                            >
                              💡 Suggest {suggestedVersion} ({suggestion.bump})
                            </button>
                          );
                        })()}
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
                    <div className="flex items-end justify-end sm:justify-start gap-1">
                      <button
                        onClick={async () => {
                          const singleRelease = [release];
                          let text = '';
                          if (exportFormat === 'markdown') text = generateMarkdown(singleRelease);
                          else if (exportFormat === 'json') text = generateJSON(singleRelease);
                          else if (exportFormat === 'summary') text = generatePlainSummary(singleRelease);
                          else if (exportFormat === 'commits') text = generateConventionalCommits(singleRelease);
                          else text = generateMarkdown(singleRelease);
                          try { await navigator.clipboard.writeText(text); } catch {}
                        }}
                        className="p-2 text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                        title="Copy this release's notes"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => duplicateRelease(releaseIndex)}
                        className="p-2 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Duplicate release"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      {releases.length > 1 && (
                        <button
                          onClick={() => deleteRelease(releaseIndex)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete release"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
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
                    {release.changes.map((change, changeIdx) => {
                      const changeMatches = q && (change.description.toLowerCase().includes(q) || change.type.toLowerCase().includes(q));
                      return (
                      <div 
                        key={change.id}
                        draggable
                        onDragStart={() => setDragState({ releaseIndex, changeIndex: changeIdx })}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragState && dragState.releaseIndex === releaseIndex && dragState.changeIndex !== changeIdx) {
                            moveChange(releaseIndex, dragState.changeIndex, changeIdx);
                          }
                          setDragState(null);
                        }}
                        onDragEnd={() => setDragState(null)}
                        className={`group flex gap-2 items-start fade-in transition-all cursor-grab active:cursor-grabbing ${changeMatches ? 'ring-1 ring-emerald-500/40 rounded-lg bg-emerald-500/5 p-1 -m-1' : ''} ${
                          dragState?.releaseIndex === releaseIndex && dragState?.changeIndex === changeIdx ? 'opacity-40' : ''
                        }`}
                      >
                        <span className="text-zinc-600 mt-2 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-xs">⠿</span>
                        <span className={`${badgeClass(change.type)} px-2 py-1 rounded text-xs flex-shrink-0 mt-1`}>
                          {changeTypeConfig[change.type].emoji}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={change.description}
                              onChange={e => updateChange(releaseIndex, change.id, e.target.value)}
                              placeholder={`What was ${change.type}?`}
                              className="input-field flex-1 rounded-lg px-3 py-2 text-white text-sm"
                              autoFocus
                            />
                            <input
                              type="text"
                              value={change.contributor || ''}
                              onChange={e => updateChangeContributor(releaseIndex, change.id, e.target.value)}
                              placeholder="@user"
                              className="input-field w-20 sm:w-24 rounded-lg px-2 py-2 text-white text-xs"
                              title="Contributor (optional)"
                            />
                          </div>
                          {/* Tags display */}
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {(change.tags || []).map(tag => {
                              const preset = tagPresets.find(p => p.label === tag);
                              return (
                                <span
                                  key={tag}
                                  onClick={() => toggleTag(releaseIndex, change.id, tag)}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                                  style={{ backgroundColor: preset ? preset.color + '20' : '#52525b20', color: preset?.color || '#a1a1aa', border: `1px solid ${preset ? preset.color + '40' : '#52525b40'}` }}
                                  title="Click to remove"
                                >
                                  {preset?.emoji} {tag} ✕
                                </span>
                              );
                            })}
                            <button
                              onClick={() => setTagPickerOpen(tagPickerOpen === change.id ? null : change.id)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-zinc-800 hover:border-emerald-500/30 transition-all"
                            >
                              🏷️ {(change.tags || []).length > 0 ? '+' : 'Add tag'}
                            </button>
                          </div>
                          {/* Tag picker dropdown */}
                          {tagPickerOpen === change.id && (
                            <div className="flex flex-wrap gap-1 mt-1.5 p-2 bg-zinc-800/80 rounded-lg border border-zinc-700 fade-in">
                              {tagPresets.map(preset => {
                                const isActive = (change.tags || []).includes(preset.label);
                                return (
                                  <button
                                    key={preset.label}
                                    onClick={() => toggleTag(releaseIndex, change.id, preset.label)}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                      isActive
                                        ? 'ring-1 scale-105'
                                        : 'opacity-70 hover:opacity-100'
                                    }`}
                                    style={{
                                      backgroundColor: preset.color + (isActive ? '30' : '15'),
                                      color: preset.color,
                                      borderColor: isActive ? preset.color : 'transparent',
                                    }}
                                  >
                                    {preset.emoji} {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => deleteChange(releaseIndex, change.id)}
                          className="delete-btn p-2 text-zinc-600 hover:text-red-400 rounded transition-all flex-shrink-0"
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
                  <button
                    onClick={() => setExportFormat('yaml')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'yaml'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    YAML
                  </button>
                  <button
                    onClick={() => setExportFormat('toml')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'toml'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    TOML
                  </button>
                  <button
                    onClick={() => setExportFormat('rss')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'rss'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    RSS
                  </button>
                  <button
                    onClick={() => setExportFormat('commits')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'commits'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Commits
                  </button>
                  <button
                    onClick={() => setExportFormat('summary')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      exportFormat === 'summary'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    📣 Summary
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
            {/* Word count, reading time & changelog mood */}
            {(() => {
              const text = getExport();
              if (!text) return null;
              const words = text.trim().split(/\s+/).length;
              const chars = text.length;
              const readingTime = Math.max(1, Math.ceil(words / 200));
              const activeReleases = releases.filter(r => r.changes.some(c => c.description.trim()));
              
              // Compute changelog mood
              const allChanges = releases.flatMap(r => r.changes.filter(c => c.description.trim()));
              const typeCounts: Record<string, number> = {};
              allChanges.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });
              const total = allChanges.length;
              
              let mood = { emoji: '📝', label: 'Getting started', color: 'text-zinc-400' };
              if (total > 0) {
                const addedPct = (typeCounts['added'] || 0) / total;
                const fixedPct = (typeCounts['fixed'] || 0) / total;
                const removedPct = (typeCounts['removed'] || 0) / total;
                const securityPct = (typeCounts['security'] || 0) / total;
                const deprecatedPct = (typeCounts['deprecated'] || 0) / total;
                
                if (securityPct >= 0.4) mood = { emoji: '🔒', label: 'Security focused', color: 'text-purple-400' };
                else if (fixedPct >= 0.5) mood = { emoji: '🩹', label: 'Bug squashing', color: 'text-yellow-400' };
                else if (removedPct >= 0.4) mood = { emoji: '🧹', label: 'Spring cleaning', color: 'text-red-400' };
                else if (deprecatedPct >= 0.3) mood = { emoji: '🌅', label: 'Sunsetting', color: 'text-orange-400' };
                else if (addedPct >= 0.6) mood = { emoji: '🚀', label: 'Feature-packed', color: 'text-emerald-400' };
                else if (addedPct >= 0.3 && fixedPct >= 0.2) mood = { emoji: '⚡', label: 'Balanced update', color: 'text-blue-400' };
                else mood = { emoji: '🎯', label: 'Steady progress', color: 'text-cyan-400' };
                
                if (total >= 15) mood = { ...mood, emoji: '🎉', label: mood.label + ' (big release!)' };
              }
              
              return (
                <>
                <div className="flex items-center justify-between mt-2 px-1">
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>{words} words</span>
                    <span>{chars.toLocaleString()} chars</span>
                    <span>~{readingTime} min read</span>
                    <span>{activeReleases.length} release{activeReleases.length !== 1 ? 's' : ''}</span>
                  </div>
                  {total > 0 && (
                    <div className={`flex items-center gap-1.5 text-xs ${mood.color}`} title="Changelog mood based on change types">
                      <span>{mood.emoji}</span>
                      <span className="font-medium">{mood.label}</span>
                    </div>
                  )}
                </div>
                {/* Emoji Summary Line */}
                {total > 0 && (() => {
                  const emojiMap: Record<string, string> = {
                    added: '✨', changed: '🔄', fixed: '🐛', removed: '🗑️', security: '🔒', deprecated: '📦'
                  };
                  const emojiLine = allChanges.map(c => emojiMap[c.type] || '📝').join('');
                  const truncated = emojiLine.length > 40 ? emojiLine.slice(0, 40) + '…' : emojiLine;
                  return (
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(emojiLine); } catch {}
                        }}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/30 transition-all text-left"
                        title="Click to copy emoji summary"
                      >
                        <span className="text-xs text-zinc-600 flex-shrink-0">📊</span>
                        <span className="text-xs tracking-wider">{truncated}</span>
                        <span className="text-[10px] text-zinc-600 group-hover:text-emerald-400 flex-shrink-0 transition-colors">copy</span>
                      </button>
                      <span className="text-[10px] text-zinc-600">Emoji summary · {total} changes</span>
                    </div>
                  );
                })()}
                </>
              );
            })()}
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
