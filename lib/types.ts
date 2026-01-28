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
