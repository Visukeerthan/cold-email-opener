import { NextResponse } from "next/server";
import PDFParser from "pdf2json";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CandidateProfileSchema } from "@/types";

const geminiKey = process.env.GEMINI_API_KEY || "";
const groqKey = process.env.GROQ_API_KEY || "";
const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;

const EXCLUDED_GROQ_TAGS = ["whisper", "guard", "tts", "vision", "embed"];

function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true);

    parser.on("pdfParser_dataError", (errData: unknown) => {
      const msg =
        errData && typeof errData === "object" && "parserError" in errData
          ? String((errData as { parserError: unknown }).parserError)
          : "Failed to read PDF structure.";
      reject(new Error(msg));
    });

    parser.on("pdfParser_dataReady", () => {
      resolve(parser.getRawTextContent());
    });

    parser.parseBuffer(buffer);
  });
}

async function extractWithGroq(prompt: string): Promise<string> {
  const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${groqKey}` },
  });
  const modelsData = modelsRes.ok ? await modelsRes.json() : { data: [] };
  const ids: string[] = (modelsData.data || [])
    .map((m: { id: string }) => m.id)
    .filter(
      (id: string) =>
        !EXCLUDED_GROQ_TAGS.some((tag) => id.toLowerCase().includes(tag))
    );

  const modelId =
    ids.find((id) => id.includes("70b") || id.includes("32b")) ||
    ids[0] ||
    "llama-3.1-8b-instant";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You extract structured candidate profile JSON from resumes. Never fabricate details.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq resume parse error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function extractWithGemini(prompt: string): Promise<string> {
  if (!genAI) throw new Error("GEMINI_API_KEY missing");
  const model = genAI.getGenerativeModel({
    model: "gemini-3.8-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please attach a PDF or TXT resume file." },
        { status: 400 }
      );
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 4 MB." },
        { status: 400 }
      );
    }

    let rawText = "";

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      rawText = await extractPdfText(buffer);
    } else if (
      file.type.startsWith("text/") ||
      file.name.toLowerCase().endsWith(".txt") ||
      file.name.toLowerCase().endsWith(".md")
    ) {
      rawText = await file.text();
    } else {
      return NextResponse.json(
        { error: "Unsupported format. Upload a PDF or TXT resume." },
        { status: 400 }
      );
    }

    if (rawText.trim().length < 40) {
      return NextResponse.json(
        { error: "Could not read enough text from this file. Try a text-based PDF." },
        { status: 422 }
      );
    }

    const prompt = `Extract structured candidate details from this resume text. Do not invent anything not present in the text.

RESUME TEXT:
${rawText.slice(0, 8000)}

Return valid JSON matching this exact schema:
{
  "fullName": "Candidate's full name",
  "headline": "Concise 1-line developer headline based on their stack and experience",
  "skills": "Comma-separated list of technical skills, languages, frameworks, and tools",
  "projectsAndExperience": "Concise, high-signal summary (400-700 chars) of internships, work experience, and top shipped projects with tech stacks",
  "githubUrl": "GitHub or portfolio URL if found, otherwise empty string",
  "availability": "Availability or location preference if mentioned, otherwise 'Available immediately'"
}`;

    let jsonString = "";
    if (groqKey) {
      try {
        jsonString = await extractWithGroq(prompt);
      } catch (err) {
        if (!geminiKey) throw err;
        jsonString = await extractWithGemini(prompt);
      }
    } else if (geminiKey) {
      jsonString = await extractWithGemini(prompt);
    } else {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY or GEMINI_API_KEY on server." },
        { status: 500 }
      );
    }

    const validated = CandidateProfileSchema.safeParse(JSON.parse(jsonString));
    if (!validated.success) {
      return NextResponse.json(
        { error: "Could not structure resume fields cleanly. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ profile: validated.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse resume file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}