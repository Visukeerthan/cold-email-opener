# Cold Email Opener

A fast, zero-friction tool that scrapes any company's website and generates a personalized 3-line cold email opener tailored to its founder.

**Live Demo:** https://cold-email-opener-one.vercel.app

## Features
- **Noise-Free Scraping:** Fetches homepage HTML with an 8-second timeout and strips scripts, styles, navigation, and footers via `cheerio` (cutting 95%+ of raw page noise).
- **Multiple Outbound Angles:** Switch between **Standard**, **Partnership**, and **Peer** intents using cached scrape results—no redundant network calls.
- **Built-In Cost & Token Transparency:** Displays input/output token counts and estimated run cost per generation.

## Tech Stack
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **HTML Parsing:** Cheerio
- **AI Model:** Google Gemini Flash API
- **Deployment:** Vercel

## Run Locally

1. **Clone the repository**
   ```bash
   git clone [https://github.com/Visukeerthan/cold-email-opener.git](https://github.com/Visukeerthan/cold-email-opener.git)
   cd cold-email-opener
