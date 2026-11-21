import { NextResponse } from 'next/server';
import { scrapeWebsite, ScrapedSite } from '../../../lib/scraper';

const ANGLE_INSTRUCTIONS: Record<string, string> = {
  standard:
    'Line 1: A concrete, specific observation from their website (what they built, who it is for, or a specific feature). Line 2: A specific operational or growth bottleneck implied by their product/stage. Line 3: A natural, low-friction question to start a conversation.',
  partnership:
    'Intent: Partnership / Ecosystem Collab. Line 1: Specific observation about their product workflow or target user from the site. Line 2: A concrete integration or co-distribution opportunity for teams using their product. Line 3: A casual question to explore a lightweight collab.',
  peer:
    'Intent: Peer / Founder-to-Founder Note (zero sales pitch). Line 1: Sharp observation about a specific positioning wedge or feature on their site. Line 2: An interesting product or scaling trade-off implied by that choice. Line 3: A genuine peer-level question about how they are approaching it.',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawUrl = body?.url;
    const angle =
      typeof body?.angle === 'string' && ANGLE_INSTRUCTIONS[body.angle]
        ? body.angle
        : 'standard';

    if (!rawUrl || typeof rawUrl !== 'string') {
      return NextResponse.json({ error: 'Please enter a website URL.' }, { status: 400 });
    }

    // 1. CODE: Use cached scrape if switching angles, otherwise scrape fresh
    const site: ScrapedSite = body?.cachedSite?.domain
      ? body.cachedSite
      : await scrapeWebsite(rawUrl);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is missing in environment variables.' },
        { status: 500 }
      );
    }

    // 2. CODE: Discover active Flash/text models available on this API key
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const listData = await listRes.json();

    const availableModels: string[] = (listData?.models || [])
      .filter(
        (m: any) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          /flash|pro|gemma/i.test(m.name)
      )
      .map((m: any) => m.name.replace(/^models\//, ''))
      .sort((a: string, b: string) => {
        const score = (name: string) =>
          name.includes('flash-lite') ? 0 : name.includes('flash') ? 1 : 2;
        return score(a) - score(b);
      });

    const candidateModels =
      availableModels.length > 0 ? availableModels.slice(0, 4) : ['gemini-3.8-flash'];

    // 3. MODEL: Reason over cleaned site copy to write a 3-line founder cold email opener
    const prompt = `You are writing a high-converting cold email opener to a startup founder based ONLY on their website copy below.

Rules:
- Output EXACTLY 3 short lines separated by single line breaks.
- ${ANGLE_INSTRUCTIONS[angle]}
- Never use generic praise like "Love what you're building".
- Total length under 55 words. Plain text only. No subject line, no greeting ("Hi"), no sign-off.

Website (${site.domain}):
Title: ${site.title}
Meta Description: ${site.metaDescription}
Key Headings: ${site.headings.join(' | ')}
Body Copy: ${site.bodyText}`;

    let data: Record<string, any> = {};
    let usedModel = candidateModels[0];
    let succeeded = false;

    for (const model of candidateModels) {
      usedModel = model;
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8000),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: angle === 'standard' ? 0.4 : 0.6,
              },
            }),
          }
        );

        data = await geminiRes.json();
        if (geminiRes.ok) {
          succeeded = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!succeeded) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            `Tried models (${candidateModels.join(', ')}), all failed or timed out.`,
        },
        { status: 502 }
      );
    }

    const opener = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!opener) {
      return NextResponse.json({ error: 'Model returned an empty response.' }, { status: 502 });
    }

    // 4. CODE: Calculate token usage & per-run cost ($0.15/1M in, $0.60/1M out)
    const usage = data?.usageMetadata || {};
    const inputTokens = usage.promptTokenCount ?? Math.ceil(prompt.length / 4);
    const outputTokens = usage.candidatesTokenCount ?? Math.ceil(opener.length / 4);
    const estimatedCostUsd = (inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000;

    return NextResponse.json({
      domain: site.domain,
      title: site.title,
      opener,
      angle,
      usedCache: Boolean(body?.cachedSite?.domain),
      siteData: site,
      telemetry: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimatedCostUsd.toFixed(6),
        rawHtmlChars: site.rawHtmlChars,
        cleanedChars: site.cleanedChars,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}