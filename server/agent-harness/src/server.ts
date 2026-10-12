import 'dotenv/config';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config, isValidProvider, updateRuntimeConfig } from './config.js';
import { createLLMClient } from './llmClient.js';
import { runAgentLoop } from './agentLoop.js';
import type { ProviderConfig, SessionState } from './types.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

let runtimeConfig: ProviderConfig = { ...config };
let llmClient = createLLMClient(runtimeConfig);

function emitRuntimeConfig() {
  io.emit('runtime-config', {
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
  });
}

async function listModelsForProvider(provider: ProviderConfig['provider']): Promise<string[]> {
  const rootUrl = runtimeConfig.baseURL.replace(/\/v1\/?$/, '');
  const response = await axios.get<{ models?: Array<{ name?: string }> }>(`${rootUrl}/api/tags`);
  return (response.data.models ?? [])
    .map((item) => item.name?.trim())
    .filter((name): name is string => Boolean(name));
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: runtimeConfig.provider, model: runtimeConfig.model });
});

app.get('/api/runtime-config', (_req, res) => {
  res.json({ provider: runtimeConfig.provider, model: runtimeConfig.model });
});

app.post('/api/runtime-config', (req, res) => {
  try {
    const { provider, model } = req.body as { provider?: string; model?: string };

    if (provider !== undefined && !isValidProvider(provider)) {
      res.status(400).json({ error: `Invalid provider "${provider}".` });
      return;
    }

    runtimeConfig = updateRuntimeConfig(runtimeConfig, { provider, model });
    llmClient = createLLMClient(runtimeConfig);
    emitRuntimeConfig();

    res.json({ provider: runtimeConfig.provider, model: runtimeConfig.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const queryProvider = req.query['provider'];
    const provider = typeof queryProvider === 'string' && isValidProvider(queryProvider)
      ? queryProvider
      : runtimeConfig.provider;
    const models = await listModelsForProvider(provider);

    res.json({ provider, models, currentModel: runtimeConfig.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-'));
  const session: SessionState = { workspace, history: [], promptQueue: [], isRunning: false };

  socket.emit('system-message', `Session started. Workspace: ${workspace}`);
  socket.emit('system-message', `Provider: ${runtimeConfig.provider} | Model: ${runtimeConfig.model}`);
  socket.emit('runtime-config', { provider: runtimeConfig.provider, model: runtimeConfig.model });
  socket.emit('agent-status', 'Idle');

  socket.on('user-prompt', (prompt: string) => {
    if (session.isRunning) {
      // Inject mid-run: queue it and let the agent loop pick it up
      session.promptQueue.push(prompt);
      socket.emit('agent-status', 'Steering...');
      return;
    }
    session.isRunning = true;
    runAgentLoop(socket, llmClient, session, prompt, runtimeConfig.model).finally(() => {
      session.isRunning = false;
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      socket.emit('system-error', `Unexpected error: ${message}`);
      socket.emit('agent-status', 'Idle');
    });
  });

  socket.on('disconnect', () => {
    try {
      fs.rmSync(workspace, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });
});

httpServer.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Provider: ${runtimeConfig.provider} | Model: ${runtimeConfig.model} | Native tools: ${runtimeConfig.supportsNativeTools}`);
});
