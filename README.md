# Tailor

Tailor is a local-first resume tailoring app with a Vite React client and an Express backend.

The server supports multiple LLM providers through a single provider abstraction, so you can switch models by editing `.env` without changing application code.

## What It Does

- Upload a `.docx` resume
- Create a tailoring session from a manual job description, a job URL, or both
- Optionally enrich the prompt with job-page text and inferred company context
- Chat with the tailoring assistant to refine the result
- Download the tailored resume as a `.docx`

## Requirements

- Node.js 20+
- npm
- One of these provider setups:
  - Anthropic API key
  - OpenAI API key
  - Google Gemini API key
  - Ollama running locally

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Copy the environment template.

```bash
copy .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

3. Edit `.env` and choose a provider.

4. Start the app.

```bash
npm run dev
```

5. Open the app in your browser.

Default server port:

- `http://localhost:5000`

## Environment Variables

Core configuration:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-latest
ENABLE_ENRICHMENT=true
PORT=5000
```

Provider credentials:

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Selection behavior:

- If `LLM_PROVIDER` is omitted, Tailor defaults to `anthropic`
- If `LLM_MODEL` is omitted, Tailor uses a provider-specific default model
- If the selected provider is missing required configuration, the server returns a clear JSON error

## Provider Setup

### Anthropic

Use Anthropic when you want the default cloud setup.

Example `.env`:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-latest
ANTHROPIC_API_KEY=your_anthropic_key
ENABLE_ENRICHMENT=true
PORT=5000
```

Notes:

- `ANTHROPIC_API_KEY` is required
- `LLM_MODEL` can be changed if you want a different Anthropic model name

### OpenAI

Use OpenAI when you want to route all chat generation through the OpenAI chat completions API.

Example `.env`:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=your_openai_key
ENABLE_ENRICHMENT=true
PORT=5000
```

Notes:

- `OPENAI_API_KEY` is required
- The integration tests currently exercise the OpenAI provider path

### Gemini

Use Gemini if you want Google Generative Language API support.

Example `.env`:

```env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-1.5-flash
GOOGLE_API_KEY=your_google_api_key
ENABLE_ENRICHMENT=true
PORT=5000
```

Notes:

- `GOOGLE_API_KEY` is required
- If you use a different Gemini model, update `LLM_MODEL`

### Ollama

Use Ollama if you want a local no-cloud path.

Example `.env`:

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1
OLLAMA_BASE_URL=http://127.0.0.1:11434
ENABLE_ENRICHMENT=true
PORT=5000
```

Start Ollama locally before running Tailor.

Example commands:

```bash
ollama serve
ollama pull llama3.1
```

Notes:

- No API key is required for Ollama
- This is the recommended path for fully local use
- If you use a different local model, update `LLM_MODEL`

## No API Key Path

If you do not want to use a cloud provider, use Ollama.

Minimal local-only setup:

1. Install Ollama
2. Run `ollama serve`
3. Pull a model such as `llama3.1`
4. Set this in `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1
OLLAMA_BASE_URL=http://127.0.0.1:11434
ENABLE_ENRICHMENT=true
PORT=5000
```

5. Start Tailor with `npm run dev`

## Enrichment Behavior

Enrichment is optional and controlled by `ENABLE_ENRICHMENT`.

When enabled:

- User-provided job description remains the primary input
- If `jobUrl` is provided, Tailor tries to fetch and sanitize the page text
- Tailor also tries to infer a company homepage from the job URL when the origin looks like an approved company source
- Enrichment failures do not block session creation

When disabled:

- Tailor skips external enrichment fetches entirely

Disable it with:

```env
ENABLE_ENRICHMENT=false
```

## Useful Scripts

Development server:

```bash
npm run dev
```

Typecheck:

```bash
npm run check
```

Integration tests:

```bash
npm test
```

Production build:

```bash
npm run build
```

## API Error Examples

Missing provider key example:

```json
{
  "error": "OpenAI is selected, but OPENAI_API_KEY is missing. Add it to .env or choose a different LLM_PROVIDER."
}
```

Unsupported provider example:

```json
{
  "error": "Unsupported LLM_PROVIDER \"foo\". Supported values are anthropic, openai, ollama, gemini."
}
```

Provider request failure example:

```json
{
  "error": "OpenAI request failed: ..."
}
```

These errors are returned server-side so API keys never need to be exposed to the client.

## Testing Status

Current automated coverage includes:

- provider selection through `POST /api/sessions`
- reachable job URL enrichment prompt assembly
- unreachable job URL fallback behavior

Run the suite with:

```bash
npm test
```

## Troubleshooting

### The server says a provider key is missing

Check that:

- `LLM_PROVIDER` matches the provider you intend to use
- the matching key variable is set in `.env`
- you restarted the dev server after editing `.env`

### Ollama does not respond

Check that:

- `ollama serve` is running
- your chosen model is pulled locally
- `OLLAMA_BASE_URL` matches the local Ollama server address

### Session creation works but enrichment is missing

That can happen when:

- `ENABLE_ENRICHMENT=false`
- the job URL is unreachable
- the page returns no usable text after sanitization
- the company source is skipped because the URL looks like a job-board origin rather than a company origin

Session creation should still succeed in those cases.
