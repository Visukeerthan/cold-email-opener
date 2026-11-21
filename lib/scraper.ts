import * as cheerio from 'cheerio';

export interface ScrapedSite {
  domain: string;
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
  rawHtmlChars: number;
  cleanedChars: number;
}

export async function scrapeWebsite(rawUrl: string): Promise<ScrapedSite> {
  // 1. Normalize & validate URL
  const trimmed = rawUrl.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('Invalid website URL. Try something like linear.app');
  }

  // 2. Fetch HTML with an 8-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Website took too long to respond (>8s).');
    }
    throw new Error('Could not reach website. Check the domain and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Website returned HTTP ${response.status} (likely blocking scrapers).`);
  }

  const html = await response.text();

  // 3. Strip non-content tags deterministically
  const $ = cheerio.load(html);
  $('script, style, nav, footer, noscript, iframe, svg, header').remove();

  const title = $('title').text().replace(/\s+/g, ' ').trim();
  const metaDescription =
    $('meta[name="description"]').attr('content')?.replace(/\s+/g, ' ').trim() ||
    $('meta[property="og:description"]').attr('content')?.replace(/\s+/g, ' ').trim() ||
    '';

  const headings = $('h1, h2, h3')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((text) => text.length > 2 && text.length < 140)
    .slice(0, 10);

  const bodyText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);

  // 4. Guardrail: catch blank JS-rendered SPAs before calling the LLM
  if (bodyText.length < 40 && !metaDescription) {
    throw new Error(
      'No readable text extracted—this site likely renders purely via client-side JavaScript.'
    );
  }

  const cleanedSummary = `${title}\n${metaDescription}\n${headings.join(' | ')}\n${bodyText}`;

  return {
    domain: parsedUrl.hostname.replace(/^www\./, ''),
    url: parsedUrl.toString(),
    title: title || parsedUrl.hostname,
    metaDescription,
    headings,
    bodyText,
    rawHtmlChars: html.length,
    cleanedChars: cleanedSummary.length,
  };
}