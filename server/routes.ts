import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import mammoth from "mammoth";
import path from "path";
import fs from "fs";
import { type ChatMessage } from "@shared/schema";
import { generateLLMResponse, getAvailableLLMOptions, resolveLLMSelection } from "./llm";
import { buildTailoringPrompt, enrichSessionContext } from "./enrichment";

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".docx")) {
      cb(null, true);
    } else {
      cb(new Error("Only .docx files are supported"));
    }
  },
});

const SYSTEM_PROMPT = `You are an expert resume tailoring assistant. Your job is to analyze a resume and a job description, then produce a tailored version of the resume that maximizes the candidate's chances of getting an interview.

Your approach:
1. Analyze the job description to identify key requirements, skills, and keywords.
2. Review the current resume to understand the candidate's background.
3. If you need more information about a specific experience, skill, or project to tailor effectively, ASK the user a specific, targeted question. Don't ask vague questions — be precise about what you need.
4. When you have enough information, produce the tailored resume.

Rules for tailoring:
- Preserve all truthful information — never fabricate experience or skills.
- Reorder bullet points to prioritize the most relevant ones for this role.
- Rephrase bullet points to use keywords and terminology from the job description where honestly applicable.
- Adjust the summary/objective to directly address the target role.
- If the candidate has relevant skills not highlighted in the resume, ask them about it and add it.
- Keep the format clean and professional.
- Do NOT remove experiences — reframe them to show relevance where possible.

When you produce the final tailored resume, wrap it in <tailored_resume> tags. Only include the resume content inside these tags, no other commentary. The content should be in a clean text format that can be converted to a docx.`;

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.get("/api/llm/options", async (_req: Request, res: Response) => {
    try {
      const options = await getAvailableLLMOptions();
      res.json(options);
    } catch (err: any) {
      const statusCode = err?.statusCode || err?.status || 500;
      res.status(statusCode).json({ error: err?.message || "Failed to load LLM options" });
    }
  });

  // Upload resume
  app.post("/api/resumes/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const result = await mammoth.extractRawText({ path: filePath });
      const rawText = result.value;

      if (!rawText || rawText.trim().length === 0) {
        return res.status(400).json({ error: "Could not extract text from the document" });
      }

      const resume = storage.createResume({
        filename: req.file.originalname,
        rawText,
        filePath,
      });

      res.json(resume);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  // Get all resumes
  app.get("/api/resumes", (_req: Request, res: Response) => {
    const allResumes = storage.getAllResumes();
    res.json(allResumes);
  });

  // Get single resume
  app.get("/api/resumes/:id", (req: Request, res: Response) => {
    const resume = storage.getResume(Number(req.params.id));
    if (!resume) return res.status(404).json({ error: "Resume not found" });
    res.json(resume);
  });

  // Create tailoring session
  app.post("/api/sessions", async (req: Request, res: Response) => {
    try {
      const { resumeId, jobUrl, jobDescription, companyName, jobTitle, llmProvider, llmModel } = req.body;
      const normalizedJobUrl = typeof jobUrl === "string" && jobUrl.trim() ? jobUrl.trim() : null;
      const normalizedJobDescription = typeof jobDescription === "string" ? jobDescription.trim() : "";
      const normalizedCompanyName = typeof companyName === "string" && companyName.trim() ? companyName.trim() : null;
      const normalizedJobTitle = typeof jobTitle === "string" && jobTitle.trim() ? jobTitle.trim() : null;
      const selection = resolveLLMSelection({
        provider: typeof llmProvider === "string" ? llmProvider : null,
        model: typeof llmModel === "string" ? llmModel : null,
      });

      if (!resumeId || (!normalizedJobDescription && !normalizedJobUrl)) {
        return res.status(400).json({ error: "Resume ID and either a job description or job URL are required" });
      }

      const resume = storage.getResume(resumeId);
      if (!resume) return res.status(404).json({ error: "Resume not found" });

      const enrichment = await enrichSessionContext({
        jobUrl: normalizedJobUrl,
        companyName: normalizedCompanyName,
      });

      const session = storage.createSession({
        resumeId,
        jobUrl: normalizedJobUrl,
        jobDescription: normalizedJobDescription,
        companyName: normalizedCompanyName,
        jobTitle: normalizedJobTitle,
        llmProvider: selection.provider,
        llmModel: selection.model,
        enrichmentContext: enrichment.promptContext,
        enrichmentMetadata: JSON.stringify(enrichment.metadata),
      });

      const userMsg = buildTailoringPrompt({
        resumeText: resume.rawText,
        jobDescription: normalizedJobDescription,
        jobUrl: normalizedJobUrl,
        companyName: normalizedCompanyName,
        jobTitle: normalizedJobTitle,
        enrichmentContext: enrichment.promptContext,
      });

      const llmResponse = await generateLLMResponse(
        [{ role: "user", content: userMsg }],
        { systemPrompt: SYSTEM_PROMPT },
        selection,
      );

      const messages: ChatMessage[] = [
        { role: "user", content: userMsg },
        { role: "assistant", content: llmResponse },
      ];

      storage.updateSessionMessages(session.id, messages);

      // Check if tailored resume was produced
      const tailoredMatch = llmResponse.match(/<tailored_resume>([\s\S]*?)<\/tailored_resume>/);
      if (tailoredMatch) {
        storage.updateSessionTailored(session.id, tailoredMatch[1].trim());
        storage.updateSessionStatus(session.id, "completed");
      }

      const updated = storage.getSession(session.id)!;
      res.json(updated);
    } catch (err: any) {
      const statusCode = err?.statusCode || err?.status || 500;
      res.status(statusCode).json({ error: err?.message || "Failed to create session" });
    }
  });

  // Get session
  app.get("/api/sessions/:id", (req: Request, res: Response) => {
    const session = storage.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  // Chat in session (answer questions / request changes)
  app.post("/api/sessions/:id/chat", async (req: Request, res: Response) => {
    try {
      const session = storage.getSession(Number(req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });

      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });

      const messages: ChatMessage[] = JSON.parse(session.messages);
      messages.push({ role: "user", content: message });

      const llmMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const llmResponse = await generateLLMResponse(llmMessages, {
        systemPrompt: SYSTEM_PROMPT,
      }, {
        provider: session.llmProvider || null,
        model: session.llmModel || null,
      });
      messages.push({ role: "assistant", content: llmResponse });

      storage.updateSessionMessages(session.id, messages);

      // Check if tailored resume was produced
      const tailoredMatch = llmResponse.match(/<tailored_resume>([\s\S]*?)<\/tailored_resume>/);
      if (tailoredMatch) {
        storage.updateSessionTailored(session.id, tailoredMatch[1].trim());
        storage.updateSessionStatus(session.id, "completed");
      }

      const updated = storage.getSession(session.id)!;
      res.json(updated);
    } catch (err: any) {
      const statusCode = err?.statusCode || err?.status || 500;
      res.status(statusCode).json({ error: err?.message || "Chat failed" });
    }
  });

  // Download tailored resume as .docx
  app.get("/api/sessions/:id/download", async (req: Request, res: Response) => {
    try {
      const session = storage.getSession(Number(req.params.id));
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (!session.tailoredText) return res.status(400).json({ error: "No tailored resume available" });

      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

      // Parse the tailored text into docx paragraphs
      const lines = session.tailoredText.split("\n");
      const paragraphs: any[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          paragraphs.push(new Paragraph({ text: "" }));
          continue;
        }

        // Detect headers (lines in all caps or with # prefix)
        if (trimmed.startsWith("# ")) {
          paragraphs.push(
            new Paragraph({
              text: trimmed.replace(/^#+\s*/, ""),
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 240, after: 120 },
            }),
          );
        } else if (trimmed.startsWith("## ")) {
          paragraphs.push(
            new Paragraph({
              text: trimmed.replace(/^#+\s*/, ""),
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            }),
          );
        } else if (trimmed.startsWith("### ")) {
          paragraphs.push(
            new Paragraph({
              text: trimmed.replace(/^#+\s*/, ""),
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 160, after: 80 },
            }),
          );
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed.replace(/^[-•]\s*/, ""),
                  size: 22,
                }),
              ],
              bullet: { level: 0 },
              spacing: { before: 40, after: 40 },
            }),
          );
        } else if (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && !trimmed.match(/^\d/)) {
          // ALL CAPS line = section header
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  bold: true,
                  size: 24,
                }),
              ],
              spacing: { before: 240, after: 120 },
            }),
          );
        } else if (trimmed.includes("|")) {
          // Pipe-separated line (e.g., "Company | Role | Dates")
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  bold: true,
                  size: 22,
                }),
              ],
              spacing: { before: 80, after: 40 },
            }),
          );
        } else {
          // Parse **bold** markdown
          const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
          const children = parts.map((part) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return new TextRun({ text: part.slice(2, -2), bold: true, size: 22 });
            }
            return new TextRun({ text: part, size: 22 });
          });
          paragraphs.push(
            new Paragraph({
              children,
              spacing: { before: 40, after: 40 },
            }),
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,
                  right: 720,
                  bottom: 720,
                  left: 720,
                },
              },
            },
            children: paragraphs,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      const filename = `tailored_resume_${session.companyName || "company"}_${Date.now()}.docx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Download failed" });
    }
  });

  return httpServer;
}
