# OpenCode Proxy

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
git clone https://github.com/lumis/opencode-proxy.git
cd opencode-proxy
npm install
```

### Configuration

```bash
cp .env.example .env
# Edit .env and add your API key
```

### Running

```bash
# Development
npm run dev

# Production
npm start

# Or with custom port and backend
./start.sh 8080 https://opencode.ai/zen/go/v1
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
  apiKey: 'not-needed', // API key is configured in .env
});

const response = await client.chat.completions.create({
  model: 'qwen3.6-plus',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Available Models

- `glm-5` / `glm-5.1` (ZhipuAI)
- `kimi-k2.5` (MoonshotAI)
- `mimo-v2-pro` / `mimo-v2-omni` (Xiaomi)
- `minimax-m2.5` / `minimax-m2.7` (MiniMax)
- `qwen3.5-plus` / `qwen3.6-plus` (Qwen)

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

## Systemd Service

```bash
# Edit the service file with your user and path
sed -i "s/YOUR_USER/$(whoami)/" opencode-proxy.service
sed -i "s|/path/to/opencode-proxy|$(pwd)|" opencode-proxy.service

sudo cp opencode-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now opencode-proxy
```

## Features

- OpenAI-compatible API (`/v1/chat/completions`)
- Streaming support (SSE)
- Tool calling passthrough
- Session management with auto-cleanup
- Configurable timeouts and limits

## Limitations

- Token usage is not reported (always returns 0)
- System messages are forwarded as-is

## License

MIT
