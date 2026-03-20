import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const resumes = sqliteTable("resumes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  rawText: text("raw_text").notNull(),
  filePath: text("file_path").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resumeId: integer("resume_id").notNull(),
  jobUrl: text("job_url"),
  jobDescription: text("job_description").notNull(),
  companyName: text("company_name"),
  jobTitle: text("job_title"),
  llmProvider: text("llm_provider").notNull().default(""),
  llmModel: text("llm_model").notNull().default(""),
  status: text("status").notNull().default("active"), // active, completed
  tailoredText: text("tailored_text"),
  messages: text("messages").notNull().default("[]"), // JSON array of chat messages
  enrichmentContext: text("enrichment_context").notNull().default(""),
  enrichmentMetadata: text("enrichment_metadata").notNull().default("{}"),
});

export const insertResumeSchema = createInsertSchema(resumes).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, status: true, messages: true, tailoredText: true });

export type InsertResume = z.infer<typeof insertResumeSchema>;
export type Resume = typeof resumes.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
