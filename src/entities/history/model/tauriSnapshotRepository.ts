import type Database from '@tauri-apps/plugin-sql';
import type { Snapshot } from './historyStore';
import { envelopeToRow, rowToSnapshot, scanToEnvelope, type SnapshotRow } from './snapshotRecord';
import { LIMIT_PER_PROJECT, type SnapshotRepository } from './snapshotRepository';

const DB_URL = 'sqlite:archora.db';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS snapshots (
     project_id   TEXT NOT NULL,
     scanned_at   TEXT NOT NULL,
     app_version  TEXT NOT NULL,
     exported_at  TEXT NOT NULL,
     envelope     TEXT NOT NULL,
     PRIMARY KEY (project_id, scanned_at)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_project
     ON snapshots (project_id, scanned_at DESC)`,
  `CREATE TABLE IF NOT EXISTS baselines (
     project_id  TEXT PRIMARY KEY,
     scanned_at  TEXT NOT NULL
   )`,
];

let dbPromise: Promise<Database> | null = null;

async function db(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const Driver = (await import('@tauri-apps/plugin-sql')).default;
      const connection = await Driver.load(DB_URL);
      for (const ddl of SCHEMA) await connection.execute(ddl);
      return connection;
    })();
  }
  return dbPromise;
}

export function createTauriSnapshotRepository(appVersion: string): SnapshotRepository {
  return {
    async list(projectId) {
      const conn = await db();
      const rows = await conn.select<SnapshotRow[]>(
        `SELECT project_id as projectId, scanned_at as scannedAt, app_version as appVersion,
                exported_at as exportedAt, envelope
           FROM snapshots WHERE project_id = $1 ORDER BY scanned_at DESC`,
        [projectId],
      );
      return rows.map(rowToSnapshot);
    },
    async add(snapshot: Snapshot) {
      const conn = await db();
      const row = envelopeToRow(snapshot.projectId, scanToEnvelope(snapshot.scan, appVersion));
      await conn.execute(
        `INSERT OR REPLACE INTO snapshots
           (project_id, scanned_at, app_version, exported_at, envelope)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.projectId, row.scannedAt, row.appVersion, row.exportedAt, row.envelope],
      );
      // FIFO cap: keep the newest LIMIT_PER_PROJECT for this project.
      await conn.execute(
        `DELETE FROM snapshots WHERE project_id = $1 AND scanned_at NOT IN (
           SELECT scanned_at FROM snapshots WHERE project_id = $1
           ORDER BY scanned_at DESC LIMIT $2
         )`,
        [snapshot.projectId, LIMIT_PER_PROJECT],
      );
    },
    async remove(projectId, scannedAt) {
      const conn = await db();
      await conn.execute(`DELETE FROM snapshots WHERE project_id = $1 AND scanned_at = $2`, [
        projectId,
        scannedAt,
      ]);
    },
    async clearProject(projectId) {
      const conn = await db();
      await conn.execute(`DELETE FROM snapshots WHERE project_id = $1`, [projectId]);
      await conn.execute(`DELETE FROM baselines WHERE project_id = $1`, [projectId]);
    },
    async getBaseline(projectId) {
      const conn = await db();
      const rows = await conn.select<{ scannedAt: string }[]>(
        `SELECT scanned_at as scannedAt FROM baselines WHERE project_id = $1`,
        [projectId],
      );
      return rows[0]?.scannedAt ?? null;
    },
    async setBaseline(projectId, scannedAt) {
      const conn = await db();
      await conn.execute(
        `INSERT OR REPLACE INTO baselines (project_id, scanned_at) VALUES ($1, $2)`,
        [projectId, scannedAt],
      );
    },
    async clearBaseline(projectId) {
      const conn = await db();
      await conn.execute(`DELETE FROM baselines WHERE project_id = $1`, [projectId]);
    },
  };
}
