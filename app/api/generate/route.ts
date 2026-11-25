import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  GenerateRequestSchema,
  GenerateResponseSchema,
  type OutreachTemplate,
} from "@/types";
import { scrapeWebsite } from "@/lib/scraper";

const geminiKey = process.env.GEMINI_API_KEY || "";
const groqKey = process.env.GROQ_API_KEY || "";
const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;

const TEMPLATE_GUIDELINES: Record<OutreachTemplate, string> = {
  wellfound_note:
    "Write a concise, high-signal Wellfound application note (90-130 words). Directly answer why this specific company/product is interesting, map 1-2 real projects/internships from the candidate's profile to their stack, and include GitHub/availability cleanly. Zero generic flattery.",
  cold_email:
    "Write a crisp cold outreach email to the founder or hiring lead (110-150 words) plus a sharp, non-clickbait subject line. Lead with a concrete observation about their product or role, connect the candidate's shipped work, and end with a low-friction ask.",
  linkedin_dm:
    "Write a punchy LinkedIn connection note / DM strictly under 280 characters. Mention one specific company/role detail and one concrete proof point from the candidate's profile.",
};

async function callGemini(prompt: string): Promise<string> {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");

  const model = genAI.getGenerativeModel({
    model: "gemini-3.8-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

const EXCLUDED_GROQ_TAGS = ["whisper", "guard", "tts", "vision", "embed"];

async function getAvailableGroqModels(): Promise<string[]> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${groqKey}` },
    });
    if (!res.ok) return ["llama-3.1-8b-instant"];
    const data = await res.json();
    const ids: string[] = (data.data || [])
      .map((m: { id: string }) => m.id)
      .filter(
        (id: string) =>
          !EXCLUDED_GROQ_TAGS.some((tag) => id.toLowerCase().includes(tag))
      );

    const large = ids.filter((id) => id.includes("70b") || id.includes("32b"));
    const fast = ids.filter((id) => id.includes("8b") || id.includes("instant"));
    const rest = ids.filter((id) => !large.includes(id) && !fast.includes(id));
    const ordered = [...large, ...fast, ...rest];

    return ordered.length > 0 ? ordered : ["llama-3.1-8b-instant"];
  } catch {
    return ["llama-3.1-8b-instant"];
  }
}

async function callGroq(prompt: string): Promise<string> {
  if (!groqKey) throw new Error("GROQ_API_KEY not configured");

  const models = await getAvailableGroqModels();
  let lastError = "No active Groq models available.";

  for (const modelId of models.slice(0, 3)) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        response_format: { type: "json_object" },
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content:
              "You are a technical career strategist. Always respond with valid JSON matching the exact requested schema.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) return content;
    } else {
      lastError = `Groq API error (${response.status}): ${await response.text()}`;
    }
  }

  throw new Error(lastError);
}

async function generateWithFailover(prompt: string): Promise<string> {
  if (geminiKey) {
    try {
      return await callGemini(prompt);
    } catch (geminiErr) {
      if (!groqKey) throw geminiErr;
      return await callGroq(prompt);
    }
  }

  if (groqKey) {
    return await callGroq(prompt);
  }

  throw new Error("Missing API keys: set GEMINI_API_KEY or GROQ_API_KEY in .env.local.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = GenerateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input fields." },
        { status: 400 }
      );
    }

    const {
      profile,
      mode,
      template,
      companyUrl,
      jobDescription,
      targetRole,
      customInstruction,
    } = parsed.data;

    let scrapedContext = "";
    let scrapedDomain = "";

    if ((mode === "url" || mode === "hybrid") && companyUrl.trim()) {
      const scraped = await scrapeWebsite(companyUrl);
      scrapedDomain = scraped.domain;
      scrapedContext = `COMPANY WEBSITE (${scraped.url}):
- Domain: ${scraped.domain}
- Title: ${scraped.title}
- Meta Description: ${scraped.metaDescription}
- Key Headings: ${scraped.headings.join(" | ")}
- Page Copy: ${scraped.bodyText.slice(0, 2800)}`;
    }

    const jdContext =
      (mode === "jd" || mode === "hybrid") && jobDescription.trim()
        ? `JOB DESCRIPTION:\n${jobDescription.slice(0, 3500)}`
        : "";

    const prompt = `You are a technical career strategist helping a software engineer write grounded, authentic outreach.
Strict Rule: Never invent skills, companies, or projects not present in the Candidate Profile.

CANDIDATE PROFILE:
- Name: ${profile.fullName}
- Headline: ${profile.headline}
- Skills: ${profile.skills}
- Projects & Experience: ${profile.projectsAndExperience}
- GitHub / Portfolio: ${profile.githubUrl || "Not provided"}
- Availability: ${profile.availability}

TARGET ROLE: ${targetRole}
${scrapedContext}
${jdContext}
${customInstruction ? `CUSTOM FOCUS: ${customInstruction}` : ""}

TEMPLATE INSTRUCTIONS:
${TEMPLATE_GUIDELINES[template]}

Return valid JSON matching this exact structure:
{
  "subject": "Email subject line (populate for cold_email, empty string otherwise)",
  "content": "Ready-to-send outreach message",
  "matchedAngle": "1 short sentence explaining which company/JD detail was paired with which candidate project or skill"
}`;

    const rawJson = await generateWithFailover(prompt);
    const validated = GenerateResponseSchema.safeParse(JSON.parse(rawJson));

    if (!validated.success) {
      return NextResponse.json(
        { error: "Received unexpected response shape from AI model. Please retry." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...validated.data,
      scrapedDomain,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate outreach.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}