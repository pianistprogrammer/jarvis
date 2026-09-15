import http from 'node:http'
import type { Duplex } from 'node:stream'
import type { Express } from 'express'
import { config } from './config.js'

const prefix = '/browser-ui'
const auth = `Basic ${Buffer.from(`${config.browserUser}:${config.browserPassword}`).toString('base64')}`

export function mountBrowserProxy(app: Express) {
  app.use(prefix, (req, res) => {
    const upstream = http.request({ host: '127.0.0.1', port: new URL(config.browserUiUrl).port || 3010, path: req.url || '/', method: req.method, headers: { ...req.headers, host: '127.0.0.1', authorization: auth } }, (response) => {
      res.writeHead(response.statusCode || 502, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.status(502); res.end() })
    req.pipe(upstream)
  })
}

export function attachBrowserUpgrade(server: http.Server) {
  server.on('upgrade', (req, socket: Duplex, head) => {
    if (!req.url?.startsWith(prefix)) return
    const upstream = http.request({ host: '127.0.0.1', port: new URL(config.browserUiUrl).port || 3010, path: req.url.slice(prefix.length) || '/', method: 'GET', headers: { ...req.headers, host: '127.0.0.1', authorization: auth } })
    upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      const headers = Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`)
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`)
      if (head.length) upstreamSocket.unshift(head)
      if (upstreamHead.length) socket.unshift(upstreamHead)
      upstreamSocket.pipe(socket).pipe(upstreamSocket)
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  })
}
