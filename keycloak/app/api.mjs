import express from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

const issuer = requiredEnvironment('OIDC_ISSUER')
const audience = requiredEnvironment('OIDC_AUDIENCE')
const port = Number(requiredEnvironment('API_PORT'))

const discoveryUrl = new URL(
  `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
)
const discoveryResponse = await fetch(discoveryUrl, {
  signal: AbortSignal.timeout(10_000),
})
if (!discoveryResponse.ok) {
  throw new Error(`OIDC discovery failed with HTTP ${discoveryResponse.status}`)
}

const metadata = await discoveryResponse.json()
if (metadata.issuer !== issuer || typeof metadata.jwks_uri !== 'string') {
  throw new Error('OIDC discovery returned an unexpected issuer or JWKS URI')
}

const jwksUrl = new URL(metadata.jwks_uri)
if (jwksUrl.protocol !== 'https:' || jwksUrl.origin !== new URL(issuer).origin) {
  throw new Error('OIDC discovery returned an untrusted JWKS origin')
}

const keySet = createRemoteJWKSet(jwksUrl)
const app = express()
app.disable('x-powered-by')

app.get('/healthz', (_request, response) => {
  response.type('text/plain').send('ok')
})

app.get('/claims', authenticate, (request, response) => {
  const claims = request.tokenClaims
  response.set('cache-control', 'no-store').json({
    iss: claims.iss,
    aud: claims.aud,
    exp: claims.exp,
    groups: Array.isArray(claims.groups) ? claims.groups : [],
    realm_access: {
      roles: Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : [],
    },
  })
})

async function authenticate(request, response, next) {
  const authorization = request.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    response.status(401).json({ error: 'invalid_token' })
    return
  }

  try {
    const { payload } = await jwtVerify(authorization.slice(7), keySet, {
      algorithms: ['RS256'],
      issuer,
      audience,
    })
    if (typeof payload.exp !== 'number') {
      throw new Error('access token has no numeric expiration')
    }
    request.tokenClaims = payload
    next()
  } catch (error) {
    console.warn(`access token rejected: ${error?.code ?? error?.name ?? 'Error'}`)
    response.status(401).json({ error: 'invalid_token' })
  }
}

function requireRealmRole(role) {
  return (request, response, next) => {
    const roles = request.tokenClaims?.realm_access?.roles
    if (!Array.isArray(roles) || !roles.includes(role)) {
      response.status(403).json({ error: 'insufficient_role' })
      return
    }
    next()
  }
}

app.get('/user', authenticate, requireRealmRole('app-user'), (request, response) => {
  response.json({
    allowed: true,
    subject: request.tokenClaims.sub,
    username: request.tokenClaims.preferred_username,
    requiredRole: 'app-user',
  })
})

app.get('/admin', authenticate, requireRealmRole('api-admin'), (_request, response) => {
  response.json({ allowed: true, requiredRole: 'api-admin' })
})

app.use((error, _request, response, _next) => {
  console.error(`API request failed: ${error?.name ?? 'Error'}`)
  response.status(500).json({ error: 'api_error' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Lab API listening on port ${port}`)
})
