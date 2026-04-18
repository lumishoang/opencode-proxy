# OpenClawCode

OpenAI-compatible proxy for the OpenCode Zen API. Bridge OpenCode models to any OpenAI-compatible client.

## Architecture

```
Client (OpenAI SDK / OpenClaw / etc.) → Proxy (:8080) → OpenCode Zen API
```

## Quick Start

### Prerequisites

- Node.js 18+ (with native `fetch` support)
- An OpenCode API key

### Installation

```bash
npm install -g openclawcode
```

### Configuration

Create a `.env` file in your working directory (e.g., `~/.openclaw/.env`):

```env
OPENCODE_GO_API_KEY=your_api_key_here
PROXY_PORT=8080
OPENCODE_BASE_URL=https://opencode.ai/zen/go/v1
SESSION_TTL_MS=1800000
```

### Running

```bash
# From the directory containing .env
node $(npm root -g)/openclawcode/src/index.js

# Or with custom env vars
PROXY_PORT=3000 OPENCODE_GO_API_KEY=xxx node $(npm root -g)/openclawcode/src/index.js
```

### Verify

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/v1/models
```

## Usage with OpenAI SDK

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8080/v1',
  apiKey: 'not-needed',
});

const response = await client.chat.completions.create({
  model: 'qwen3.6-plus',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Available Models

Models are fetched dynamically from the OpenCode backend API. To list all available models:

```bash
curl http://127.0.0.1:8080/v1/models
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/models` | List available models |
| POST | `/v1/chat/completions` | Chat completion (OpenAI compatible) |
| GET | `/health` | Health check |
| POST | `/admin/clear-cache` | Clear session cache |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | `8080` | Port proxy listens on |
| `OPENCODE_BASE_URL` | `https://opencode.ai/zen/go/v1` | OpenCode Zen API URL |
| `OPENCODE_GO_API_KEY` | *(required)* | Your OpenCode API key |
| `SESSION_TTL_MS` | `1800000` | Session cache TTL (30 min) |
| `OPENCODE_PROXY_JSON_LIMIT_MB` | `200` | Max JSON body size (MB) |
| `OPENCODE_BACKEND_TIMEOUT_MS` | `90000` | Backend timeout (90s) |

## Session Cache

The proxy caches session IDs per conversation to maintain context between API calls.

- **TTL**: 30 minutes (configurable via `SESSION_TTL_MS`)
- **Key**: Based on the first user message content
- **Auto-cleanup**: Expired entries are automatically removed

## Features

- OpenAI-compatible API (`/v1/chat/completions`)
- Streaming support (SSE)
- Tool calling passthrough
- Session management with auto-cleanup
- Configurable timeouts and limits
- Loads `.env` from current working directory

## Limitations

- Token usage is not reported (always returns 0)
- System messages are forwarded as-is

## License

MIT
