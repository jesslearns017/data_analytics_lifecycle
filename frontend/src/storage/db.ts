import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "datahealth-studio";
const DB_VERSION = 1;

export interface ProblemDefinition {
  businessProblem: string;
  analyticsProblem: string;
}

export interface RunRecord {
  id: string;
  filename: string;
  uploadedAt: string;
  fileBlob: Blob;
  problemDefinition?: ProblemDefinition;
  profile?: unknown;
  etlPlan?: unknown;
  cleanedBlob?: Blob;
  report?: unknown;
  modelRuns?: unknown[];
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("runs")) {
          db.createObjectStore("runs", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveRun(run: RunRecord): Promise<void> {
  const db = await getDb();
  await db.put("runs", run);
}

export async function getRun(id: string): Promise<RunRecord | undefined> {
  const db = await getDb();
  return db.get("runs", id);
}

export async function getAllRuns(): Promise<RunRecord[]> {
  const db = await getDb();
  return db.getAll("runs");
}

export async function deleteRun(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("runs", id);
}

export async function updateRun(
  id: string,
  updates: Partial<Omit<RunRecord, "id">>
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("runs", id);
  if (!existing) throw new Error(`Run ${id} not found`);
  await db.put("runs", { ...existing, ...updates });
}
