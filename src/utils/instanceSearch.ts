import type { Instance } from '@/types/launcher';

export function filterInstances(instances: Instance[], query: string): Instance[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return instances;
  }

  return instances.filter((instance) => {
    const haystack = `${instance.name} ${instance.gameVersion} ${instance.loader} ${instance.channel ?? 'release'}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
