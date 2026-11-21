'use client';

import { useState } from 'react';

interface GenerateResult {
  domain: string;
  title: string;
  opener: string;
  angle: string;
  usedCache: boolean;
  siteData: {
    domain: string;
    url: string;
    title: string;
    metaDescription: string;
    headings: string[];
    bodyText: string;
    rawHtmlChars: number;
    cleanedChars: number;
  };
  telemetry: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: string;
    rawHtmlChars: number;
    cleanedChars: number;
  };
}

const SAMPLE_URLS = ['linear.app', 'resend.com', 'cal.com'];

const ANGLES = [
  { id: 'standard', label: 'Standard' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'peer', label: 'Peer / Feedback' },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showContext, setShowContext] = useState(false);

  async function runGenerate(targetUrl: string, angle = 'standard', reuseCache = false) {
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError('');
    setCopied(false);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          angle,
          cachedSite: reuseCache && result ? result.siteData : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to generate opener.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setShowContext(false);
    runGenerate(url, 'standard', false);
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.opener);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const reductionPct = result
    ? Math.max(
        0,
        Math.round(
          (1 - result.telemetry.cleanedChars / Math.max(result.telemetry.rawHtmlChars, 1)) * 100
        )
      )
    : 0;

  const lineCount = result
    ? result.opener.split('\n').filter((l) => l.trim().length > 0).length
    : 0;
  const wordCount = result ? result.opener.trim().split(/\s+/).length : 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Founder Cold Email Opener</h1>
          <p className="text-sm text-zinc-400">
            Paste a company website to extract live positioning and draft a 3-line founder opener.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="e.g. linear.app"
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-lg bg-white text-zinc-950 font-medium px-5 py-2.5 text-sm hover:bg-zinc-200 disabled:opacity-40 transition cursor-pointer"
          >
            {loading && !result ? 'Drafting...' : 'Generate'}
          </button>
        </form>

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Try:</span>
          {SAMPLE_URLS.map((sample) => (
            <button
              key={sample}
              type="button"
              disabled={loading}
              onClick={() => {
                setUrl(sample);
                setResult(null);
                setShowContext(false);
                runGenerate(sample, 'standard', false);
              }}
              className="rounded border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-zinc-300 hover:border-zinc-700 hover:text-white transition cursor-pointer"
            >
              {sample}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                    {result.domain}
                  </p>
                  <span className="text-[11px] text-zinc-500">
                    · {lineCount} lines · {wordCount} words
                  </span>
                </div>
                <p className="text-sm font-medium text-zinc-200 truncate">{result.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Quick question about ${result.domain}`)}&body=${encodeURIComponent(result.opener)}`}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Open in Mail
                </a>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-md bg-zinc-100 text-zinc-950 px-3 py-1.5 text-xs font-medium hover:bg-zinc-300 transition cursor-pointer"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {ANGLES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={loading}
                    onClick={() => runGenerate(result.siteData.url || url, a.id, true)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      result.angle === a.id
                        ? 'bg-zinc-800 text-white border border-zinc-600'
                        : 'bg-zinc-950/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {result.usedCache && (
                <span className="text-[11px] text-emerald-400/90 font-mono">
                  ⚡ Cached scrape (0ms fetch)
                </span>
              )}
            </div>

            <div className="whitespace-pre-line rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-4 text-sm leading-relaxed text-zinc-100">
              {loading ? 'Refining angle...' : result.opener}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-zinc-800/60 bg-zinc-950/50 px-3 py-2">
                <span className="block text-zinc-500">Tokens (In / Out)</span>
                <span className="font-mono text-zinc-200">
                  {result.telemetry.inputTokens} / {result.telemetry.outputTokens}
                </span>
              </div>
              <div className="rounded-md border border-zinc-800/60 bg-zinc-950/50 px-3 py-2">
                <span className="block text-zinc-500">Est. Cost / Run</span>
                <span className="font-mono text-emerald-400">
                  ${result.telemetry.estimatedCostUsd}
                </span>
              </div>
              <div className="rounded-md border border-zinc-800/60 bg-zinc-950/50 px-3 py-2">
                <span className="block text-zinc-500">Code Noise Cut</span>
                <span className="font-mono text-zinc-200">{reductionPct}% HTML stripped</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowContext(!showContext)}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                {showContext
                  ? '▾ Hide extracted site context (code output)'
                  : '▸ Inspect extracted site context fed to model'}
              </button>

              {showContext && (
                <div className="mt-2 rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-3 text-xs text-zinc-400 space-y-1.5">
                  {result.siteData.metaDescription && (
                    <p>
                      <span className="text-zinc-500">Meta:</span> {result.siteData.metaDescription}
                    </p>
                  )}
                  {result.siteData.headings.length > 0 && (
                    <p>
                      <span className="text-zinc-500">Headings:</span>{' '}
                      {result.siteData.headings.slice(0, 5).join(' · ')}
                    </p>
                  )}
                  <p className="line-clamp-3">
                    <span className="text-zinc-500">Clean body snippet:</span>{' '}
                    {result.siteData.bodyText.slice(0, 320)}...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
} 