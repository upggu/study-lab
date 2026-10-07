const port = process.env.API_PORT

if (!port) {
  throw new Error('API_PORT is required')
}

const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
  signal: AbortSignal.timeout(3_000),
})

if (!response.ok || (await response.text()) !== 'ok') {
  throw new Error(`API health check failed with HTTP ${response.status}`)
}
