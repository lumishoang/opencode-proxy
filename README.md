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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/chat/completions` | Chat completion (streaming + non-streaming) |
| GET | `/health` | Health check |
| POST | `/admin/clear-cache` | Clear session cache |
