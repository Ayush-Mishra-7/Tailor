import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  Upload,
  FileText,
  Send,
  Download,
  Loader2,
  ChevronRight,
  Briefcase,
  MessageSquare,
  ArrowLeft,
  Sun,
  Moon,
  CheckCircle2,
  Link as LinkIcon,
} from "lucide-react";
import type { Resume, Session, ChatMessage } from "@shared/schema";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type Step = "upload" | "job" | "chat";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages]);

  // Fetch existing resumes
  const { data: resumes = [] } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  // Upload resume
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/resumes/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json() as Promise<Resume>;
    },
    onSuccess: (resume) => {
      setSelectedResume(resume);
      setStep("job");
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "Resume uploaded", description: resume.filename });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  // Create session
  const createSessionMutation = useMutation({
    mutationFn: async (data: {
      resumeId: number;
      jobUrl?: string;
      jobDescription: string;
      companyName?: string;
      jobTitle?: string;
    }) => {
      const res = await apiRequest("POST", "/api/sessions", data);
      return res.json() as Promise<Session>;
    },
    onSuccess: (session) => {
      setCurrentSession(session);
      setStep("chat");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    },
  });

  // Chat
  const chatMutation = useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: number; message: string }) => {
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/chat`, { message });
      return res.json() as Promise<Session>;
    },
    onSuccess: (session) => {
      setCurrentSession(session);
      setChatInput("");
    },
    onError: (err: Error) => {
      toast({ title: "Message failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const handleCreateSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedResume) return;
    const fd = new FormData(e.currentTarget);
    createSessionMutation.mutate({
      resumeId: selectedResume.id,
      jobUrl: fd.get("jobUrl") as string,
      jobDescription: fd.get("jobDescription") as string,
      companyName: fd.get("companyName") as string,
      jobTitle: fd.get("jobTitle") as string,
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession || !chatInput.trim()) return;
    chatMutation.mutate({ sessionId: currentSession.id, message: chatInput.trim() });
  };

  const handleDownload = async () => {
    if (!currentSession) return;
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${currentSession.id}/download`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tailored_resume_${currentSession.companyName || "company"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const messages: ChatMessage[] = currentSession
    ? JSON.parse(currentSession.messages)
    : [];

  // Strip the first user message (it's the system context) for display
  const displayMessages = messages.slice(1);

  const formatAssistantMessage = (content: string) => {
    // Remove the tailored_resume tags for display
    const cleaned = content
      .replace(/<tailored_resume>[\s\S]*?<\/tailored_resume>/g, "")
      .trim();
    return cleaned;
  };

  const startOver = () => {
    setStep("upload");
    setSelectedResume(null);
    setCurrentSession(null);
    setChatInput("");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              Resume Tailor
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {step !== "upload" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={startOver}
                data-testid="button-start-over"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Start over
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              data-testid="button-theme-toggle"
              className="w-8 h-8"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Steps indicator */}
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-2 w-full">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`flex items-center gap-1.5 ${step === "upload" ? "text-primary font-medium" : "text-foreground"}`}
          >
            {step !== "upload" ? (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload
          </span>
          <ChevronRight className="w-3 h-3" />
          <span
            className={`flex items-center gap-1.5 ${step === "job" ? "text-primary font-medium" : step === "chat" ? "text-foreground" : ""}`}
          >
            {step === "chat" ? (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            ) : (
              <Briefcase className="w-4 h-4" />
            )}
            Job Details
          </span>
          <ChevronRight className="w-3 h-3" />
          <span
            className={`flex items-center gap-1.5 ${step === "chat" ? "text-primary font-medium" : ""}`}
          >
            <MessageSquare className="w-4 h-4" />
            Tailor
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl mx-auto px-4 py-4 w-full">
        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Upload your resume</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-upload"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={handleFileChange}
                    data-testid="input-file-upload"
                  />
                  {uploadMutation.isPending ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Parsing your resume...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Click to upload a .docx file</p>
                      <p className="text-xs text-muted-foreground">
                        Your resume will be parsed and used as the base for tailoring
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {resumes.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Or use a previous upload</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {resumes.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-2.5 rounded-md border border-border hover-elevate flex items-center gap-3 transition-colors"
                      onClick={() => {
                        setSelectedResume(r);
                        setStep("job");
                      }}
                      data-testid={`button-resume-${r.id}`}
                    >
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{r.filename}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 2: Job Details */}
        {step === "job" && selectedResume && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Target job details</CardTitle>
              <p className="text-sm text-muted-foreground">
                Using: {selectedResume.filename}
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSession} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className="text-sm">
                      Company name
                    </Label>
                    <Input
                      id="companyName"
                      name="companyName"
                      placeholder="e.g. Cisco"
                      data-testid="input-company-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="jobTitle" className="text-sm">
                      Job title
                    </Label>
                    <Input
                      id="jobTitle"
                      name="jobTitle"
                      placeholder="e.g. Software Engineer"
                      data-testid="input-job-title"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jobUrl" className="text-sm">
                    Job posting URL (optional)
                  </Label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="jobUrl"
                      name="jobUrl"
                      placeholder="https://..."
                      className="pl-9"
                      data-testid="input-job-url"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jobDescription" className="text-sm">
                    Job description *
                  </Label>
                  <Textarea
                    id="jobDescription"
                    name="jobDescription"
                    placeholder="Paste the full job description here..."
                    rows={10}
                    required
                    className="resize-y text-sm"
                    data-testid="textarea-job-description"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={createSessionMutation.isPending}
                  className="w-full"
                  data-testid="button-start-tailoring"
                >
                  {createSessionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Start tailoring"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Chat / Tailoring */}
        {step === "chat" && currentSession && (
          <div className="flex flex-col gap-4">
            {/* Session info */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {currentSession.companyName && (
                  <span className="font-medium text-foreground">
                    {currentSession.companyName}
                  </span>
                )}
                {currentSession.jobTitle && (
                  <span>
                    {currentSession.companyName ? " — " : ""}
                    {currentSession.jobTitle}
                  </span>
                )}
              </div>
              {currentSession.tailoredText && (
                <Button
                  onClick={handleDownload}
                  size="sm"
                  data-testid="button-download"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Download .docx
                </Button>
              )}
            </div>

            {/* Chat messages */}
            <Card className="flex-1">
              <CardContent className="p-4">
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  {displayMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                        data-testid={`message-${msg.role}-${i}`}
                      >
                        <div className="whitespace-pre-wrap">
                          {msg.role === "assistant"
                            ? formatAssistantMessage(msg.content)
                            : msg.content}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(chatMutation.isPending || createSessionMutation.isPending) && (
                    <div className="flex gap-3 justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Thinking...
                        </div>
                      </div>
                    </div>
                  )}

                  {currentSession.tailoredText && (
                    <div className="flex gap-3 justify-start">
                      <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 max-w-[85%]">
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          <CheckCircle2 className="w-4 h-4" />
                          Tailored resume ready
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Click "Download .docx" above to get your file. You can also
                          continue chatting to request changes.
                        </p>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              </CardContent>
            </Card>

            {/* Chat input */}
            <form onSubmit={handleSendChat} className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  currentSession.tailoredText
                    ? "Request changes or ask questions..."
                    : "Answer questions to help tailor your resume..."
                }
                disabled={chatMutation.isPending}
                className="flex-1 text-sm"
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                size="icon"
                disabled={chatMutation.isPending || !chatInput.trim()}
                data-testid="button-send-chat"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 mt-auto">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-center">
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
