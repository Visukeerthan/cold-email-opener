"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CandidateProfile,
  GenerateResponse,
  InputMode,
  OutreachTemplate,
} from "@/types";

const PROFILE_STORAGE_KEY = "rolereach_saved_profile_v1";
const CACHE_STORAGE_KEY = "rolereach_response_cache_v1";

const DEMO_PROFILE: CandidateProfile = {
  fullName: "Visu Keerthan Samidapogu",
  headline: "Full-Stack Software Engineer (Python, Django, Next.js, TypeScript)",
  skills:
    "Python, Django, DRF, FastAPI, TypeScript, React, Next.js, MySQL, PostgreSQL, Gemini API",
  projectsAndExperience:
    "Frontend Intern at StructAI (Next.js/React). Built RoleReach Studio / AI Outreach Opener (Next.js App Router, TypeScript, Zod, Cheerio, Gemini/Groq failover), Finance Data Processing & RBAC REST API (Python/DRF), and Typing Pro full-stack web app (Django/MySQL).",
  githubUrl: "https://github.com/Visukeerthan",
  availability: "Available immediately (Remote or Bengaluru relocation)",
};

export default function HomePage() {
  const [profile, setProfile] = useState<CandidateProfile>({
    fullName: "",
    headline: "",
    skills: "",
    projectsAndExperience: "",
    githubUrl: "",
    availability: "Available immediately",
  });
  const [savedBanner, setSavedBanner] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<InputMode>("hybrid");
  const [template, setTemplate] = useState<OutreachTemplate>("wellfound_note");
  const [targetRole, setTargetRole] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");

  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (storedProfile) {
        setProfile(JSON.parse(storedProfile));
      }
    } catch {
      // ignore storage parse errors
    }
  }, []);

  function handleSaveProfile() {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2000);
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingResume(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      const rawText = await response.text();
      let data: { profile?: CandidateProfile; error?: string };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          rawText.slice(0, 180) || "Server returned an unexpected non-JSON response."
        );
      }

      if (!response.ok || !data.profile) {
        throw new Error(data.error || "Failed to parse resume.");
      }

      setProfile(data.profile);
      setUploadedFileName(file.name);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data.profile));
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse uploaded file.");
    } finally {
      setParsingResume(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleLoadDemo() {
    setProfile(DEMO_PROFILE);
    setUploadedFileName(null);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(DEMO_PROFILE));
    setMode("url");
    setTemplate("wellfound_note");
    setTargetRole("Full-Stack Engineering Intern");
    setCompanyUrl("https://linear.app");
    setError(null);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOutput(null);
    setFromCache(false);

    const payload = {
      profile,
      mode,
      template,
      companyUrl: companyUrl.trim(),
      jobDescription: jobDescription.trim(),
      targetRole: targetRole.trim(),
      customInstruction: customInstruction.trim(),
    };

    const cacheKey = JSON.stringify(payload);

    try {
      const rawCache = localStorage.getItem(CACHE_STORAGE_KEY);
      const cacheMap: Record<string, GenerateResponse> = rawCache
        ? JSON.parse(rawCache)
        : {};

      if (cacheMap[cacheKey]) {
        setOutput(cacheMap[cacheKey]);
        setFromCache(true);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let data: GenerateResponse & { error?: string };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          rawText.slice(0, 180) || "Server returned an unexpected non-JSON response."
        );
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate outreach.");
      }

      setOutput(data);
      cacheMap[cacheKey] = data;
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheMap));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!output) return;
    const textToCopy = output.subject
      ? `Subject: ${output.subject}\n\n${output.content}`
      : output.content;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">RoleReach Studio</h1>
            <p className="text-sm text-zinc-400">
              Upload or save your resume once. Generate tailored outreach from any Company URL or Job Description.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadDemo}
            className="self-start sm:self-auto text-xs font-medium px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition"
          >
            Load Sample Resume & URL
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: SAVED RESUME PROFILE */}
          <section className="lg:col-span-5 bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3 h-fit">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                1. Saved Resume Profile
              </h2>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain"
                  onChange={handleResumeUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={parsingResume}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition"
                >
                  {parsingResume ? "Parsing PDF..." : "Upload Resume"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 font-medium transition"
                >
                  {savedBanner ? "Saved!" : "Save"}
                </button>
              </div>
            </div>

            {uploadedFileName && (
              <p className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/70 rounded-md px-2.5 py-1.5">
                Auto-filled & saved from: {uploadedFileName}
              </p>
            )}

            <input
              placeholder="Full Name"
              value={profile.fullName}
              onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              placeholder="Headline (e.g. Full-Stack Python & Next.js Developer)"
              value={profile.headline}
              onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              placeholder="Core Skills (comma-separated)"
              value={profile.skills}
              onChange={(e) => setProfile({ ...profile, skills: e.target.value })}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <textarea
              rows={5}
              placeholder="Paste key projects, internships & stack highlights from your resume..."
              value={profile.projectsAndExperience}
              onChange={(e) =>
                setProfile({ ...profile, projectsAndExperience: e.target.value })
              }
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              placeholder="GitHub or Portfolio URL"
              value={profile.githubUrl}
              onChange={(e) => setProfile({ ...profile, githubUrl: e.target.value })}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              placeholder="Availability (e.g. Immediate, Remote or Bengaluru)"
              value={profile.availability}
              onChange={(e) =>
                setProfile({ ...profile, availability: e.target.value })
              }
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </section>

          {/* RIGHT COLUMN: TARGET + TEMPLATE GENERATOR */}
          <section className="lg:col-span-7 space-y-4">
            <form
              onSubmit={handleGenerate}
              className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-4"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                2. Target Context & Template
              </h2>

              {/* Input Mode Switcher */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["url", "Company URL"],
                    ["jd", "Job Description"],
                    ["hybrid", "URL + JD"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                      mode === key
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Output Template Switcher */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["wellfound_note", "Wellfound Note"],
                    ["cold_email", "Cold Email"],
                    ["linkedin_dm", "LinkedIn DM"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTemplate(key)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                      template === key
                        ? "bg-zinc-100 border-white text-zinc-950"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <input
                required
                placeholder="Target Role (e.g. AI Engineer / Full-Stack Intern)"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />

              {(mode === "url" || mode === "hybrid") && (
                <input
                  placeholder="Company Website URL (e.g. linear.app)"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              )}

              {(mode === "jd" || mode === "hybrid") && (
                <textarea
                  rows={4}
                  placeholder="Paste the Job Description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              )}

              <input
                placeholder="Optional custom focus (e.g. Emphasize Python/Django or 2PM-10PM IST availability)"
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />

              {error && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm transition"
              >
                {loading ? "Generating Tailored Outreach..." : "Generate Outreach"}
              </button>
            </form>

            {/* GENERATED RESULT CARD */}
            {output && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-xs text-emerald-400 font-medium block">
                      Angle: {output.matchedAngle}
                    </span>
                    {fromCache && (
                      <span className="text-[11px] text-zinc-400">
                        Loaded instantly from client cache
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 shrink-0 transition"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                {output.subject && (
                  <div className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                    <span className="text-zinc-400">Subject: </span>
                    <span className="font-medium">{output.subject}</span>
                  </div>
                )}

                <pre className="whitespace-pre-wrap font-sans text-sm bg-zinc-950 border border-zinc-800 rounded-lg p-3 leading-relaxed">
                  {output.content}
                </pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}