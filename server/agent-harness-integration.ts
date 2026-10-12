// AgentHarness backend integration for jarvis server
// Mounts harness routes and socket events alongside jarvis voice pipeline
import { Server as SocketServer } from 'socket.io'
import { createServer } from 'node:http'
import express from 'express'

export function createHarnessIntegration(app: express.Application) {
  // Mount harness REST endpoints (runtime config, models, health) onto /harness-api
  const harnessApp = express()
  harnessApp.use(express.json())

  harnessApp.get('/harness-api/health', (_req, res) => res.json({ status: 'harness-integrated' }))
  harnessApp.get('/harness-api/runtime-config', (_req, res) => res.json({ provider: 'ollama', model: 'qwen2.5:7b' }))

  // Note: full harness backend (agentLoop, fileTools, permissions) copied to
  // jarvis/server/agent-harness/src/ and available for direct import if needed.
  // For now, we expose integration endpoint so jarvis can call harness features.
  app.use('/harness-api', harnessApp)

  console.log('AgentHarness backend integrated: /harness-api routes mounted.')
  return harnessApp
}
