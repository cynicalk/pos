import Dexie from 'dexie';

// Local-first data store — every entity synced from the API lives here.
// The UI reads from here; the API is just a sync target.
export const db = new Dexie('cooklyt_pos_dashboard');

db.version(1).stores({
  menu:              '&id, category, available, name',
  restaurant_tables: '&id, number, status',
  kitchen:           '&order_item_id, order_id',
  reports:           '&date',
  sync_queue:        '++id, entity, operation, status, created_at',
  meta:              '&key',
});

export const dbMeta = {
  setLastSync: (entity) =>
    db.meta.put({ key: `last_sync_${entity}`, value: Date.now() }),
  getLastSync: async (entity) => {
    const rec = await db.meta.get(`last_sync_${entity}`);
    return rec?.value ?? null;
  },
};