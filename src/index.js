#!/usr/bin/env node

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config();

const app = express();

// ─── Config ───────────────────────────────────────────────────────
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1';
const OPENCODE_API_KEY = process.env.OPENCODE_GO_API_KEY || '';
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080');
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || String(30 * 60 * 1000));
const PROXY_JSON_LIMIT_MB = parseInt(process.env.OPENCODE_PROXY_JSON_LIMIT_MB || '200');
const BACKEND_TIMEOUT_MS = parseInt(process.env.OPENCODE_BACKEND_TIMEOUT_MS || '90000');

app.use(express.json({ limit: `${PROXY_JSON_LIMIT_MB}mb` }));

// ─── Session Cache ────────────────────────────────────────────────
// conversationId → { sessionId, messages[], lastAccess }
const sessionCache = new Map();

function getOrCreateSession(conversationId) {
  const cached = sessionCache.get(conversationId);
  if (cached && (Date.now() - cached.lastAccess) < SESSION_TTL_MS) {
    cached.lastAccess = Date.now();
    return cached;
  }
  for (const [key, val] of sessionCache.entries()) {
    if ((Date.now() - val.lastAccess) >= SESSION_TTL_MS) sessionCache.delete(key);
  }
  const entry = { sessionId: uuidv4(), messages: [], lastAccess: Date.now() };
  sessionCache.set(conversationId, entry);
  return entry;
}

function extractAssistantText(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

// ─── Helpers ──────────────────────────────────────────────────────
async function forwardToOpenCode(path, body, stream = false) {
  const url = `${OPENCODE_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

  try {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCODE_API_KEY}`,
      ...(stream ? { Accept: 'text/event-stream' } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  } finally {
    clearTimeout(timeout);
  }
}

// ─── GET /v1/models ───────────────────────────────────────────────
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'glm-5', object: 'model', created: Date.now(), owned_by: 'zhipuai' },
      { id: 'glm-5.1', object: 'model', created: Date.now(), owned_by: 'zhipuai' },
      { id: 'kimi-k2.5', object: 'model', created: Date.now(), owned_by: 'moonshotai' },
      { id: 'mimo-v2-pro', object: 'model', created: Date.now(), owned_by: 'xiaomi' },
      { id: 'mimo-v2-omni', object: 'model', created: Date.now(), owned_by: 'xiaomi' },
      { id: 'minimax-m2.5', object: 'model', created: Date.now(), owned_by: 'minimax' },
      { id: 'minimax-m2.7', object: 'model', created: Date.now(), owned_by: 'minimax' },
      { id: 'qwen3.5-plus', object: 'model', created: Date.now(), owned_by: 'qwen' },
      { id: 'qwen3.6-plus', object: 'model', created: Date.now(), owned_by: 'qwen' },
    ],
  });
});

// ─── POST /v1/chat/completions ────────────────────────────────────
app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream, temperature, max_tokens, top_p, tools, tool_choice, response_format, stop } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: { message: 'messages array is required', type: 'invalid_request_error' } });
  }

  // Build conversation key from first user message
  const firstUserMsg = messages.find(m => m.role === 'user');
  let conversationKey = uuidv4();
  if (firstUserMsg?.content) {
    const textContent = typeof firstUserMsg.content === 'string'
      ? firstUserMsg.content
      : Array.isArray(firstUserMsg.content)
        ? firstUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join(' ')
        : '';
    conversationKey = textContent.substring(0, 100) || uuidv4();
  }
  const conversationId = `conv_${conversationKey}`;

  const sessionEntry = getOrCreateSession(conversationId);

  // Build the request body for OpenCode Go (OpenAI-compatible) - forward ALL tool calling params
  const forwardBody = {
    model: model || 'qwen3.6-plus',
    messages: messages,
    stream: !!stream,
    ...(temperature !== undefined && { temperature }),
    ...(max_tokens !== undefined && { max_tokens }),
    ...(top_p !== undefined && { top_p }),
    ...(tools && Array.isArray(tools) && { tools }),
    ...(tool_choice && { tool_choice }),
    ...(response_format && { response_format }),
    ...(stop && { stop }),
  };

  console.log(`[proxy] chat.completions model=${forwardBody.model} stream=${!!stream} messages=${Array.isArray(messages) ? messages.length : 0} tools=${Array.isArray(tools) ? tools.length : 0}`);

  try {
    if (stream) {
      // ─── Streaming: forward and bridge SSE ────────────────────
      const opencodeRes = await forwardToOpenCode('/chat/completions', forwardBody, true);

      if (!opencodeRes.ok) {
        const errData = await opencodeRes.json().catch(() => ({}));
        return res.status(opencodeRes.status).json(errData);
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = opencodeRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') {
                res.write('data: [DONE]\n\n');
              } else {
                try {
                  const chunk = JSON.parse(dataStr);
                  // Pass through tool_calls delta if present
                  if (chunk.choices?.[0]?.delta?.tool_calls) {
                    console.log(`[proxy] stream tool_calls delta`);
                  }
                  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                } catch {
                  res.write(`${line}\n`);
                }
              }
            }
          }
        }
      } catch (readErr) {
        console.error('Stream read error:', readErr.message);
      }
      res.end();

    } else {
      // ─── Non-streaming: forward and return ────────────────────
      const opencodeRes = await forwardToOpenCode('/chat/completions', forwardBody);
      const data = await opencodeRes.json();

      const firstChoice = data?.choices?.[0]?.message;
      const contentText = typeof firstChoice?.content === 'string' ? firstChoice.content : '';
      const reasoningText = typeof firstChoice?.reasoning_content === 'string' ? firstChoice.reasoning_content : '';
      console.log(
        `[proxy] upstream status=${opencodeRes.status} hasChoices=${Array.isArray(data?.choices)} ` +
        `contentLen=${contentText.length} reasoningLen=${reasoningText.length}`
      );

      if (!opencodeRes.ok) {
        return res.status(opencodeRes.status).json(data);
      }

      res.json(data);
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    const isAbort = err?.name === 'AbortError';
    res.status(502).json({
      error: {
        message: isAbort
          ? `OpenCode proxy timeout after ${BACKEND_TIMEOUT_MS}ms`
          : `OpenCode proxy error: ${err.message}`,
        type: isAbort ? 'proxy_timeout' : 'proxy_error',
      },
    });
  }
});

// ─── Health check ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    backend: OPENCODE_BASE_URL,
    hasApiKey: !!OPENCODE_API_KEY,
    sessionCacheSize: sessionCache.size,
  });
});

// ─── Clear session cache ──────────────────────────────────────────
app.post('/admin/clear-cache', (req, res) => {
  sessionCache.clear();
  res.json({ status: 'ok', message: 'Session cache cleared' });
});

// ─── Start ────────────────────────────────────────────────────────
app.listen(PROXY_PORT, () => {
  console.log(`OpenCode Proxy running on port ${PROXY_PORT}`);
  console.log(`  Backend: ${OPENCODE_BASE_URL}`);
  console.log(`  API Key: ${OPENCODE_API_KEY ? 'set' : 'NOT SET'}`);
  console.log(`  JSON Limit: ${PROXY_JSON_LIMIT_MB}mb`);
  console.log(`  Backend Timeout: ${BACKEND_TIMEOUT_MS}ms`);
  console.log(`  Health: http://127.0.0.1:${PROXY_PORT}/health`);
});
