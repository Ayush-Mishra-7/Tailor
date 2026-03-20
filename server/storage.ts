import {
  type Resume, type InsertResume, resumes,
  type Session, type InsertSession, sessions,
  type ChatMessage,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

const databasePath = process.env.DATA_DB_PATH?.trim() || "data.db";
const databaseDir = path.dirname(databasePath);

if (databaseDir && databaseDir !== ".") {
  fs.mkdirSync(databaseDir, { recursive: true });
}

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");

function hasColumn(tableName: string, columnName: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function ensureSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      file_path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id INTEGER NOT NULL,
      job_url TEXT,
      job_description TEXT NOT NULL,
      company_name TEXT,
      job_title TEXT,
      llm_provider TEXT NOT NULL DEFAULT '',
      llm_model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      tailored_text TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      enrichment_context TEXT NOT NULL DEFAULT '',
      enrichment_metadata TEXT NOT NULL DEFAULT '{}'
    );
  `);

  if (!hasColumn("sessions", "enrichment_context")) {
    sqlite.exec("ALTER TABLE sessions ADD COLUMN enrichment_context TEXT NOT NULL DEFAULT '';");
  }

  if (!hasColumn("sessions", "enrichment_metadata")) {
    sqlite.exec("ALTER TABLE sessions ADD COLUMN enrichment_metadata TEXT NOT NULL DEFAULT '{}';");
  }

  if (!hasColumn("sessions", "llm_provider")) {
    sqlite.exec("ALTER TABLE sessions ADD COLUMN llm_provider TEXT NOT NULL DEFAULT '';");
  }

  if (!hasColumn("sessions", "llm_model")) {
    sqlite.exec("ALTER TABLE sessions ADD COLUMN llm_model TEXT NOT NULL DEFAULT '';");
  }
}

ensureSchema();

export const db = drizzle(sqlite);

export function closeStorage(): void {
  sqlite.close();
}

export interface IStorage {
  createResume(resume: InsertResume): Resume;
  getResume(id: number): Resume | undefined;
  getAllResumes(): Resume[];
  createSession(session: InsertSession): Session;
  getSession(id: number): Session | undefined;
  getSessionsByResume(resumeId: number): Session[];
  updateSessionMessages(id: number, messages: ChatMessage[]): void;
  updateSessionTailored(id: number, tailoredText: string): void;
  updateSessionStatus(id: number, status: string): void;
}

export class DatabaseStorage implements IStorage {
  createResume(resume: InsertResume): Resume {
    return db.insert(resumes).values(resume).returning().get();
  }

  getResume(id: number): Resume | undefined {
    return db.select().from(resumes).where(eq(resumes.id, id)).get();
  }

  getAllResumes(): Resume[] {
    return db.select().from(resumes).all();
  }

  createSession(session: InsertSession): Session {
    return db.insert(sessions).values(session).returning().get();
  }

  getSession(id: number): Session | undefined {
    return db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  getSessionsByResume(resumeId: number): Session[] {
    return db.select().from(sessions).where(eq(sessions.resumeId, resumeId)).all();
  }

  updateSessionMessages(id: number, messages: ChatMessage[]): void {
    db.update(sessions)
      .set({ messages: JSON.stringify(messages) })
      .where(eq(sessions.id, id))
      .run();
  }

  updateSessionTailored(id: number, tailoredText: string): void {
    db.update(sessions)
      .set({ tailoredText })
      .where(eq(sessions.id, id))
      .run();
  }

  updateSessionStatus(id: number, status: string): void {
    db.update(sessions)
      .set({ status })
      .where(eq(sessions.id, id))
      .run();
  }
}

export const storage = new DatabaseStorage();
