import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { createServer, request, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.DATA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tailor-tests-")), "integration.db");
process.env.NODE_ENV = "test";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

let registerRoutes: typeof import("../server/routes").registerRoutes;
let storage: typeof import("../server/storage").storage;
let db: typeof import("../server/storage").db;
let closeStorage: typeof import("../server/storage").closeStorage;
let resumes: typeof import("../shared/schema").resumes;
let sessions: typeof import("../shared/schema").sessions;

before(async () => {
  ({ registerRoutes } = await import("../server/routes"));
  ({ storage, db, closeStorage } = await import("../server/storage"));
  ({ resumes, sessions } = await import("../shared/schema"));
});

beforeEach(() => {
  db.delete(sessions).run();
  db.delete(resumes).run();

  process.env.LLM_PROVIDER = "openai";
  process.env.LLM_MODEL = "gpt-4o-mini";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ENABLE_ENRICHMENT = "true";
});

after(() => {
  closeStorage();

  const configuredPath = process.env.DATA_DB_PATH;
  if (configuredPath && fs.existsSync(configuredPath)) {
    fs.rmSync(path.dirname(configuredPath), { recursive: true, force: true });
  }
});

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const server = createServer(app);
  await registerRoutes(server, app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function postJson<TResponse>(url: string, payload: unknown): Promise<{ statusCode: number; body: TResponse }> {
  const parsedUrl = new URL(url);
  const requestBody = JSON.stringify(payload);

  return await new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let responseText = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseText += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: JSON.parse(responseText) as TResponse,
          });
        });
      },
    );

    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
}

async function getJson<TResponse>(url: string): Promise<{ statusCode: number; body: TResponse }> {
  const parsedUrl = new URL(url);

  return await new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: "GET",
      },
      (res) => {
        let responseText = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseText += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: JSON.parse(responseText) as TResponse,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function getBinary(url: string): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}> {
  const parsedUrl = new URL(url);

  return await new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: "GET",
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

function createResume() {
  return storage.createResume({
    filename: "resume.docx",
    rawText: "Jane Doe\nEngineer\nBuilt internal platforms and developer tooling.",
    filePath: "uploads/test-resume.docx",
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

function installFetchMock(resolver: (call: FetchCall) => Promise<Response> | Response): {
  calls: FetchCall[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    const call = { url, init };
    calls.push(call);
    return resolver(call);
  };

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function isExampleCompanyRoot(url: string): boolean {
  return url === "https://jobs.example.com" || url === "https://jobs.example.com/";
}

test("POST /api/sessions uses the selected OpenAI provider", async () => {
  process.env.ENABLE_ENRICHMENT = "false";

  const resume = createResume();
  const fetchMock = installFetchMock(async ({ url, init }) => {
    if (url === "https://api.openai.com/v1/chat/completions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.model, "gpt-4o-mini");
      assert.equal(body.messages[1].role, "user");

      return jsonResponse({
        choices: [{ message: { content: "<tailored_resume>Tailored content</tailored_resume>" } }],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await postJson<any>(`${baseUrl}/api/sessions`, {
        resumeId: resume.id,
        jobDescription: "Looking for a platform engineer with TypeScript experience.",
        companyName: "Acme",
        jobTitle: "Platform Engineer",
    });

    assert.equal(response.statusCode, 200);

    const session = response.body;
    assert.equal(session.status, "completed");
    assert.equal(session.tailoredText, "Tailored content");
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0]?.url, "https://api.openai.com/v1/chat/completions");
  } finally {
    fetchMock.restore();
    await stopTestServer(server);
  }
});

test("POST /api/sessions includes reachable job URL enrichment in the prompt", async () => {
  const resume = createResume();
  let capturedPrompt = "";

  const fetchMock = installFetchMock(async ({ url, init }) => {
    if (url === "https://jobs.example.com/roles/123") {
      return textResponse(`
        <html>
          <body>
            <h1>Senior Platform Engineer</h1>
            <p>Work on TypeScript APIs and distributed tooling.</p>
          </body>
        </html>
      `);
    }

    if (isExampleCompanyRoot(url)) {
      return textResponse(`
        <html>
          <body>
            <h1>Example Co</h1>
            <p>Example Co builds developer infrastructure products.</p>
          </body>
        </html>
      `);
    }

    if (url === "https://api.openai.com/v1/chat/completions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      capturedPrompt = body.messages[1].content;

      return jsonResponse({
        choices: [{ message: { content: "Need one clarification first." } }],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await postJson<any>(`${baseUrl}/api/sessions`, {
        resumeId: resume.id,
        jobDescription: "Looking for a backend engineer.",
        jobUrl: "https://jobs.example.com/roles/123",
        companyName: "Example Co",
        jobTitle: "Senior Platform Engineer",
    });

    assert.equal(response.statusCode, 200);
    assert.match(capturedPrompt, /\[JOB URL EXTRACTED CONTEXT\]/);
    assert.match(capturedPrompt, /TypeScript APIs and distributed tooling/);
    assert.match(capturedPrompt, /\[COMPANY CONTEXT \(Example Co\)\]/);
    assert.match(capturedPrompt, /developer infrastructure products/);
  } finally {
    fetchMock.restore();
    await stopTestServer(server);
  }
});

test("POST /api/sessions falls back gracefully when the job URL is unreachable", async () => {
  const resume = createResume();

  const fetchMock = installFetchMock(async ({ url }) => {
    if (url === "https://jobs.example.com/roles/unreachable") {
      throw new Error("connect ECONNREFUSED");
    }

    if (isExampleCompanyRoot(url)) {
      return textResponse("<html><body><p>Company overview available.</p></body></html>");
    }

    if (url === "https://api.openai.com/v1/chat/completions") {
      return jsonResponse({
        choices: [{ message: { content: "Need clarification, but session is valid." } }],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await postJson<any>(`${baseUrl}/api/sessions`, {
        resumeId: resume.id,
        jobDescription: "Looking for an engineer comfortable with APIs.",
        jobUrl: "https://jobs.example.com/roles/unreachable",
        companyName: "Example Co",
    });

    assert.equal(response.statusCode, 200);

    const session = response.body;
    const metadata = JSON.parse(session.enrichmentMetadata);

    assert.equal(metadata.jobUrl.status, "failed");
    assert.equal(metadata.companyContext.status, "success");
    assert.equal(metadata.overallStatus, "partial");
    assert.equal(session.messages.includes("Need clarification, but session is valid."), true);
  } finally {
    fetchMock.restore();
    await stopTestServer(server);
  }
});

test("POST /api/sessions/:id/chat continues the session and stores the assistant reply", async () => {
  process.env.ENABLE_ENRICHMENT = "false";

  const resume = createResume();
  const fetchMock = installFetchMock(async ({ url, init }) => {
    if (url === "https://api.openai.com/v1/chat/completions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const conversation = body.messages as Array<{ role: string; content: string }>;

      if (conversation.length === 2) {
        return jsonResponse({
          choices: [{ message: { content: "I need one clarification before tailoring." } }],
        });
      }

      assert.equal(conversation.at(-1)?.content, "I led the migration to TypeScript across two services.");

      return jsonResponse({
        choices: [{ message: { content: "<tailored_resume>Tailored resume after clarification</tailored_resume>" } }],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const createdSession = await postJson<any>(`${baseUrl}/api/sessions`, {
      resumeId: resume.id,
      jobDescription: "Looking for a platform engineer with strong TypeScript experience.",
      companyName: "Acme",
    });

    assert.equal(createdSession.statusCode, 200);
    assert.equal(createdSession.body.status, "active");

    const chattedSession = await postJson<any>(`${baseUrl}/api/sessions/${createdSession.body.id}/chat`, {
      message: "I led the migration to TypeScript across two services.",
    });

    assert.equal(chattedSession.statusCode, 200);
    assert.equal(chattedSession.body.status, "completed");
    assert.equal(chattedSession.body.tailoredText, "Tailored resume after clarification");

    const messages = JSON.parse(chattedSession.body.messages) as Array<{ role: string; content: string }>;
    assert.equal(messages.at(-2)?.content, "I led the migration to TypeScript across two services.");
    assert.equal(messages.at(-1)?.content, "<tailored_resume>Tailored resume after clarification</tailored_resume>");
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
    await stopTestServer(server);
  }
});

test("GET /api/sessions/:id/download returns a docx file for completed sessions", async () => {
  process.env.ENABLE_ENRICHMENT = "false";

  const resume = createResume();
  const fetchMock = installFetchMock(async ({ url }) => {
    if (url === "https://api.openai.com/v1/chat/completions") {
      return jsonResponse({
        choices: [{
          message: {
            content: "<tailored_resume># SUMMARY\nBuilt reliable API platforms\n- Led migrations\n- Improved developer tooling</tailored_resume>",
          },
        }],
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const createdSession = await postJson<any>(`${baseUrl}/api/sessions`, {
      resumeId: resume.id,
      jobDescription: "Looking for a backend engineer who can improve internal tooling.",
      companyName: "Acme",
    });

    assert.equal(createdSession.statusCode, 200);
    assert.equal(createdSession.body.status, "completed");

    const fetchedSession = await getJson<any>(`${baseUrl}/api/sessions/${createdSession.body.id}`);
    assert.equal(fetchedSession.statusCode, 200);
    assert.equal(fetchedSession.body.tailoredText.includes("SUMMARY"), true);

    const download = await getBinary(`${baseUrl}/api/sessions/${createdSession.body.id}/download`);
    assert.equal(download.statusCode, 200);
    assert.equal(download.headers["content-type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.match(String(download.headers["content-disposition"]), /attachment; filename="tailored_resume_/);
    assert.equal(download.body.subarray(0, 2).toString("utf8"), "PK");
    assert.equal(download.body.length > 100, true);
  } finally {
    fetchMock.restore();
    await stopTestServer(server);
  }
});
