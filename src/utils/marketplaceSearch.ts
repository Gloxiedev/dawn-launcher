import type { MarketplaceProject } from '@/types/launcher';

function relevanceScore(query: string, project: MarketplaceProject): number {
  const title = project.title.toLowerCase();
  const slug = (project.slug ?? '').toLowerCase();
  const description = project.description.toLowerCase();

  if (title === query || slug === query) {
    return 1000;
  }
  if (title.startsWith(query) || slug.startsWith(query)) {
    return 500;
  }
  if (title.includes(query) || slug.includes(query)) {
    return 200;
  }
  if (description.includes(query)) {
    return 50;
  }
  return 0;
}

export function rankMarketplaceResults(query: string, projects: MarketplaceProject[]): MarketplaceProject[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return projects;
  }

  return [...projects].sort((a, b) => {
    const scoreDiff = relevanceScore(normalized, b) - relevanceScore(normalized, a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return (b.downloads ?? 0) - (a.downloads ?? 0);
  });
}
