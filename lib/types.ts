export type ChangeType = 'added' | 'changed' | 'fixed' | 'removed' | 'security' | 'deprecated';

export interface ChangeItem {
  id: string;
  type: ChangeType;
  description: string;
}

export interface Release {
  version: string;
  date: string;
  changes: ChangeItem[];
}

export const changeTypeConfig: Record<ChangeType, { label: string; emoji: string; color: string }> = {
  added: { label: 'Added', emoji: '✨', color: 'bg-green-500' },
  changed: { label: 'Changed', emoji: '🔄', color: 'bg-blue-500' },
  fixed: { label: 'Fixed', emoji: '🐛', color: 'bg-yellow-500' },
  removed: { label: 'Removed', emoji: '🗑️', color: 'bg-red-500' },
  security: { label: 'Security', emoji: '🔒', color: 'bg-purple-500' },
  deprecated: { label: 'Deprecated', emoji: '⚠️', color: 'bg-orange-500' },
};

// Helper to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Parse raw changelog text into structured releases
export function parseChangelogText(text: string): Release[] {
  const releases: Release[] = [];
  const lines = text.split('\n');
  
  let currentRelease: Release | null = null;
  let currentType: ChangeType = 'added';
  
  // Patterns to detect version headers
  const versionPatterns = [
    /^##?\s*\[?v?(\d+\.\d+(?:\.\d+)?)\]?\s*[-–—]?\s*(.+)?$/i,  // ## [1.0.0] - 2024-01-01
    /^v?(\d+\.\d+(?:\.\d+)?)\s*[-–—]?\s*(.+)?$/i,               // 1.0.0 - 2024-01-01
    /^version\s*:?\s*v?(\d+\.\d+(?:\.\d+)?)\s*[-–—]?\s*(.+)?$/i // Version: 1.0.0
  ];
  
  // Patterns to detect section headers
  const sectionPatterns: { pattern: RegExp; type: ChangeType }[] = [
    { pattern: /^###?\s*(added|new|features?)/i, type: 'added' },
    { pattern: /^###?\s*(changed|updated?|modified)/i, type: 'changed' },
    { pattern: /^###?\s*(fixed|bug\s*fix|fixes)/i, type: 'fixed' },
    { pattern: /^###?\s*(removed|deleted)/i, type: 'removed' },
    { pattern: /^###?\s*(security)/i, type: 'security' },
    { pattern: /^###?\s*(deprecated)/i, type: 'deprecated' },
  ];
  
  // Pattern for list items
  const listItemPattern = /^[-*•]\s*(.+)$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for version header
    let versionMatch = null;
    for (const pattern of versionPatterns) {
      versionMatch = trimmed.match(pattern);
      if (versionMatch) break;
    }
    
    if (versionMatch) {
      // Save previous release
      if (currentRelease && currentRelease.changes.length > 0) {
        releases.push(currentRelease);
      }
      
      // Extract date from the rest of the line if present
      let date = new Date().toISOString().split('T')[0];
      const dateRest = versionMatch[2] || '';
      const dateMatch = dateRest.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
      if (dateMatch) {
        date = dateMatch[1].replace(/\//g, '-');
      }
      
      currentRelease = {
        version: versionMatch[1],
        date,
        changes: []
      };
      currentType = 'added'; // Reset to default type
      continue;
    }
    
    // Check for section header
    let sectionMatch = null;
    for (const { pattern, type } of sectionPatterns) {
      if (pattern.test(trimmed)) {
        sectionMatch = type;
        break;
      }
    }
    
    if (sectionMatch) {
      currentType = sectionMatch;
      continue;
    }
    
    // Check for list item
    const itemMatch = trimmed.match(listItemPattern);
    if (itemMatch && currentRelease) {
      // Auto-detect type from keywords if in default mode
      let detectedType = currentType;
      const description = itemMatch[1].trim();
      const lowerDesc = description.toLowerCase();
      
      if (lowerDesc.startsWith('fix') || lowerDesc.startsWith('bug')) {
        detectedType = 'fixed';
      } else if (lowerDesc.startsWith('add') || lowerDesc.startsWith('new ')) {
        detectedType = 'added';
      } else if (lowerDesc.startsWith('remove') || lowerDesc.startsWith('delete')) {
        detectedType = 'removed';
      } else if (lowerDesc.startsWith('security') || lowerDesc.includes('vulnerability') || lowerDesc.includes('cve')) {
        detectedType = 'security';
      } else if (lowerDesc.startsWith('deprecat')) {
        detectedType = 'deprecated';
      } else if (lowerDesc.startsWith('update') || lowerDesc.startsWith('change') || lowerDesc.startsWith('improve')) {
        detectedType = 'changed';
      }
      
      currentRelease.changes.push({
        id: generateId(),
        type: detectedType,
        description
      });
    }
  }
  
  // Don't forget the last release
  if (currentRelease && currentRelease.changes.length > 0) {
    releases.push(currentRelease);
  }
  
  return releases;
}

export function generateMarkdown(releases: Release[]): string {
  let md = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
  
  for (const release of releases) {
    md += `## [${release.version}] - ${release.date}\n\n`;
    
    const grouped: Record<ChangeType, ChangeItem[]> = {
      added: [], changed: [], fixed: [], removed: [], security: [], deprecated: []
    };
    
    for (const change of release.changes) {
      grouped[change.type].push(change);
    }
    
    for (const [type, items] of Object.entries(grouped)) {
      if (items.length > 0) {
        const config = changeTypeConfig[type as ChangeType];
        md += `### ${config.label}\n\n`;
        for (const item of items) {
          md += `- ${item.description}\n`;
        }
        md += '\n';
      }
    }
  }
  
  return md;
}

export function generateJSON(releases: Release[]): string {
  return JSON.stringify({ releases }, null, 2);
}

export function generateHTML(releases: Release[]): string {
  const typeColors: Record<ChangeType, string> = {
    added: '#22c55e',
    changed: '#3b82f6',
    fixed: '#eab308',
    removed: '#ef4444',
    security: '#a855f7',
    deprecated: '#f97316',
  };

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changelog</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e4e4e7; padding: 2rem; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #71717a; margin-bottom: 2rem; }
    .release { background: #18181b; border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid #27272a; }
    .release-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .version { font-size: 1.5rem; font-weight: 700; color: #10b981; }
    .date { color: #71717a; font-size: 0.875rem; }
    .section { margin-bottom: 1rem; }
    .section-title { font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; padding: 0.25rem 0.75rem; border-radius: 0.5rem; display: inline-block; }
    .changes { list-style: none; padding-left: 1rem; }
    .changes li { padding: 0.25rem 0; color: #a1a1aa; }
    .changes li::before { content: "→"; margin-right: 0.5rem; color: #52525b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Changelog</h1>
    <p class="subtitle">All notable changes to this project will be documented here.</p>
`;

  for (const release of releases) {
    html += `    <div class="release">
      <div class="release-header">
        <span class="version">v${release.version}</span>
        <span class="date">${release.date}</span>
      </div>
`;
    
    const grouped: Record<ChangeType, ChangeItem[]> = {
      added: [], changed: [], fixed: [], removed: [], security: [], deprecated: []
    };
    
    for (const change of release.changes) {
      grouped[change.type].push(change);
    }
    
    for (const [type, items] of Object.entries(grouped)) {
      if (items.length > 0) {
        const config = changeTypeConfig[type as ChangeType];
        const color = typeColors[type as ChangeType];
        html += `      <div class="section">
        <span class="section-title" style="background: ${color}20; color: ${color};">${config.emoji} ${config.label}</span>
        <ul class="changes">
`;
        for (const item of items) {
          html += `          <li>${item.description}</li>\n`;
        }
        html += `        </ul>
      </div>
`;
      }
    }
    
    html += `    </div>\n`;
  }

  html += `  </div>
</body>
</html>`;

  return html;
}
