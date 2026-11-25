# RoleReach Studio

An AI-powered outreach studio built with **Next.js App Router** and **TypeScript** that parses your resume once and generates grounded, role-specific outreach (**Wellfound Notes**, **Cold Emails**, and **LinkedIn DMs**) from any company website URL or job description.

---

## Key Features

- **Automated PDF & Text Resume Parsing (`/api/parse-resume`):** Extracts raw text from uploaded `.pdf`, `.txt`, or `.md` resumes using `pdf2json` and maps it into a strictly validated candidate profile persisted in `localStorage`.
- **Multi-Provider AI Failover (`/api/generate`):** Routes generation through **Google Gemini (`gemini-3.8-flash`)** with automatic, zero-downtime failover to **Groq** (`GET /openai/v1/models` dynamic model discovery) when primary endpoints hit `503`/`429` capacity spikes.
- **3 Outreach Modes & 3 Templates:**
  - **Context Modes:** Company URL scraping (`cheerio`), pasted Job Description, or Hybrid (`URL + JD`).
  - **Templates:** High-signal Wellfound application note (90–130 words), founder cold email with subject line, and <280-character LinkedIn DM.
- **End-to-End Runtime Validation:** Enforces request and LLM JSON output contracts at runtime with **Zod** (`GenerateRequestSchema`, `GenerateResponseSchema`, `CandidateProfileSchema`) and caches identical queries client-side for instant reloads.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack), React, TypeScript
- **Validation & Parsing:** Zod, `pdf2json`, Cheerio
- **AI Providers:** `@google/generative-ai` (Gemini) + Groq REST API (dynamic model discovery & failover)
- **Styling:** Tailwind CSS

---

## Project Structure

```text
├── app/
│   ├── api/
│   │   ├── generate/route.ts       # Context assembly, Gemini -> Groq failover & Zod output validation
│   │   └── parse-resume/route.ts   # PDF
