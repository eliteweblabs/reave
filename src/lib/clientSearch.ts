import Fuse from 'fuse.js';
import clientsData from '../data/clients.json';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  nmls?: string;
  notes?: string;
  created_at: string;
}

export interface ClientSearchResult extends Client {
  score: number;
}

const clients: Client[] = clientsData as Client[];

// Module-level singleton so the index is built once per process.
// Weighted keys bias results toward the fields users most often query.
const fuse = new Fuse<Client>(clients, {
  keys: [
    { name: 'name', weight: 0.4 },
    { name: 'email', weight: 0.3 },
    { name: 'company', weight: 0.15 },
    { name: 'phone', weight: 0.1 },
    { name: 'nmls', weight: 0.03 },
    { name: 'notes', weight: 0.02 },
  ],
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export function searchClients(query: string, limit = 10): ClientSearchResult[] {
  const q = query.trim();
  if (!q) return [];

  return fuse
    .search(q, { limit })
    .map(({ item, score }) => ({
      ...item,
      score: typeof score === 'number' ? score : 1,
    }));
}

export function getAllClients(): Client[] {
  return clients;
}
