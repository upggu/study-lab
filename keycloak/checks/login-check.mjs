// Login checks for each lab stage. Runs inside the Compose network as a scripted browser:
// it follows the real Authorization Code + PKCE redirects, posts the Keycloak login form, and
// reads the app session and API results. It never changes Keycloak configuration.
//
//   node login-check.mjs base|app-a|sso|api|ldap|groups|broker

import fs from 'node:fs'

const keycloak = 'https://keycloak.keycloak.test:30080'
const apps = { 'app-a': 'https://app-a.keycloak.test:30081', 'app-b': 'https://app-b.keycloak.test:30082' }
const api = 'http://api:3000'

function assert(condition, message) { if (!condition) throw new Error(message) }
function secret(name) {
  const value = fs.readFileSync(`/run/secrets/${name}`, 'utf8').trimEnd()
  assert(value, `secret file is empty: ${name}`)
  return value
}

// --- a tiny cookie jar that honours Path (two realms on one host set same-named cookies) ----
class Jar {
  cookies = new Map()
  store(response, url) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';').map((part) => part.trim())
      const separator = pair.indexOf('=')
      if (separator <= 0) continue
      const path = attributes.find((item) => item.toLowerCase().startsWith('path='))?.slice(5) || '/'
      this.cookies.set(`${pair.slice(0, separator)}|${path}`, { name: pair.slice(0, separator), value: pair.slice(separator + 1), path })
    }
  }
  header(url) {
    const pathname = new URL(url).pathname
    return [...this.cookies.values()]
      .filter((cookie) => pathname.startsWith(cookie.path))
      .map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  }
}

async function request(url, jar = new Jar(), options = {}) {
  const headers = new Headers(options.headers)
  const cookie = jar.header(url)
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(url, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  jar.store(response, url)
  return response
}

function loginFormAction(html) {
  const form = (html.match(/<form\b[^>]*>/gi) ?? []).find((tag) => /\bid=["']kc-form-login["']/i.test(tag))
  const action = form?.match(/\baction=["']([^"']+)["']/i)?.[1]
  assert(action, 'Keycloak login form was not found')
  return action.replaceAll('&amp;', '&')
}

// Start at the app: /login must redirect to Keycloak with Code + PKCE S256 and the exact callback.
async function startLogin(app, appJar, keycloakJar, extraParams = {}) {
  const response = await request(`${apps[app]}/login`, appJar)
  assert(response.status === 302, `${app} /login did not redirect`)
  const url = new URL(response.headers.get('location'))
  assert(url.origin === keycloak, `${app} sent the browser to ${url.origin}, not Keycloak`)
  assert(url.searchParams.get('redirect_uri') === `${apps[app]}/callback`, `${app} redirect_uri is wrong`)
  assert(url.searchParams.get('response_type') === 'code', `${app} response_type is not code`)
  assert(url.searchParams.get('code_challenge_method') === 'S256', `${app} does not use PKCE S256`)
  for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value)
  // Keycloak may redirect once more before showing a form (kc_idp_hint sends the browser to the partner IdP).
  let page = await request(url, keycloakJar)
  for (let hop = 0; hop < 5 && [302, 303].includes(page.status); hop += 1) {
    const location = page.headers.get('location')
    assert(location?.startsWith(keycloak), `redirected outside the lab before any login form: ${location}`)
    page = await request(location, keycloakJar)
  }
  return page
}

// Follow Keycloak's redirects until the browser lands on the app callback, then read the app session.
async function finishLogin(app, appJar, keycloakJar, response) {
  for (let hop = 0; hop < 10; hop += 1) {
    const location = response.headers.get('location')
    assert([302, 303].includes(response.status) && location, `login stopped on HTTP ${response.status} (an interactive page?)`)
    if (location.startsWith(apps[app])) {
      const callback = await request(location, appJar)
      assert(callback.status === 302, `${app} callback failed with HTTP ${callback.status}`)
      const session = await (await request(`${apps[app]}/session`, appJar)).json()
      assert(session.authenticated, `${app} session is not authenticated`)
      return session
    }
    assert(location.startsWith(keycloak), `redirected outside the lab: ${location}`)
    response = await request(location, keycloakJar)
  }
  throw new Error('too many redirects')
}

async function passwordLogin(app, username, password, keycloakJar = new Jar(), extraParams = {}) {
  const appJar = new Jar()
  const form = await startLogin(app, appJar, keycloakJar, extraParams)
  assert(form.status === 200, `expected the Keycloak login form, got HTTP ${form.status}`)
  const submitted = await request(loginFormAction(await form.text()), keycloakJar, {
    method: 'POST', body: new URLSearchParams({ username, password, credentialId: '' }),
  })
  assert(submitted.status === 302, `${username}: credentials were rejected`)
  const session = await finishLogin(app, appJar, keycloakJar, submitted)
  assert(session.username === username, `${app} session belongs to ${session.username}, expected ${username}`)
  return { appJar, keycloakJar }
}

async function wrongPasswordIsRejected(username, extraParams = {}) {
  const keycloakJar = new Jar()   // fresh browser: no SSO session that could skip the password
  const form = await startLogin('app-a', new Jar(), keycloakJar, extraParams)
  assert(form.status === 200, 'no login form for the wrong-password check')
  const submitted = await request(loginFormAction(await form.text()), keycloakJar, {
    method: 'POST', body: new URLSearchParams({ username, password: 'definitely-wrong', credentialId: '' }),
  })
  assert(submitted.status === 200, `${username}: a wrong password was not rejected`)
}

async function apiResults(login) {
  const claims = await (await request(`${apps['app-a']}/api/claims`, login.appJar)).json()
  assert(claims.iss === `${keycloak}/realms/study`, `token issuer is ${claims.iss}`)
  assert([].concat(claims.aud).includes('lab-api'), 'access token audience lacks lab-api')
  const user = (await request(`${apps['app-a']}/api/user`, login.appJar)).status
  const admin = (await request(`${apps['app-a']}/api/admin`, login.appJar)).status
  return { claims, user, admin }
}

function expectApi(username, results, expectedUser, expectedAdmin) {
  assert(results.user === expectedUser && results.admin === expectedAdmin,
    `${username}: expected /api/user=${expectedUser} /api/admin=${expectedAdmin}, observed ${results.user}/${results.admin}`)
}

const check = process.argv[2]
switch (check) {
  case 'base': {
    const discovery = await (await fetch(`${keycloak}/realms/study/.well-known/openid-configuration`)).json()
    assert(discovery.issuer === `${keycloak}/realms/study`, `issuer is ${discovery.issuer}`)
    console.log(`base: realm study exists, issuer=${discovery.issuer}`)
    break
  }
  case 'app-a': {
    await passwordLogin('app-a', 'local-user', secret('local-user-password'))
    await wrongPasswordIsRejected('local-user')
    console.log('app-a: local-user logged in with Code+PKCE S256; wrong password rejected')
    break
  }
  case 'sso': {
    const first = await passwordLogin('app-a', 'local-user', secret('local-user-password'))
    const appBJar = new Jar()
    const response = await startLogin('app-b', appBJar, first.keycloakJar)
    assert(response.status === 302, 'app-b asked for credentials again: the Keycloak SSO session was not reused')
    const session = await finishLogin('app-b', appBJar, first.keycloakJar, response)
    assert(session.username === 'local-user', 'app-b session has the wrong user')
    console.log('sso: credentials entered once at app-a; app-b logged in from the same Keycloak session')
    break
  }
  case 'api': {
    assert((await request(`${api}/user`)).status === 401, 'API without a token did not return 401')
    const results = await apiResults(await passwordLogin('app-a', 'local-user', secret('local-user-password')))
    expectApi('local-user', results, 200, 403)
    assert(results.claims.realm_access.roles.includes('app-user'), 'local-user token lacks app-user')
    console.log('api: no token=401, local-user /api/user=200 /api/admin=403, aud=lab-api')
    break
  }
  case 'ldap': {
    for (const [username, file] of [['alice', 'samba-alice-password'], ['bob', 'samba-bob-password']]) {
      const results = await apiResults(await passwordLogin('app-a', username, secret(file)))
      await wrongPasswordIsRejected(username)
      console.log(`ldap: ${username} logged in via LDAPS bind; /api/user=${results.user} /api/admin=${results.admin} (no roles yet)`)
    }
    break
  }
  case 'groups': {
    for (const [username, file, admin, groups] of [
      ['alice', 'samba-alice-password', 200, ['/api-admins', '/app-users']],
      ['bob', 'samba-bob-password', 403, ['/app-users']],
    ]) {
      const results = await apiResults(await passwordLogin('app-a', username, secret(file)))
      expectApi(username, results, 200, admin)
      const observed = [...results.claims.groups].sort()
      assert(JSON.stringify(observed) === JSON.stringify(groups), `${username}: groups claim ${JSON.stringify(observed)}`)
      console.log(`groups: ${username} groups=${observed.join(',')} /api/user=200 /api/admin=${admin}`)
    }
    break
  }
  case 'broker': {
    // kc_idp_hint skips the Keycloak login page and goes straight to the partner IdP, which is
    // what a browser does when it clicks the "Partner SSO" button.
    const hint = { kc_idp_hint: 'partner-idp' }
    for (const [username, file, admin] of [['carol', 'partner-carol-password', 200], ['dave', 'partner-dave-password', 403]]) {
      const results = await apiResults(await passwordLogin('app-a', username, secret(file), new Jar(), hint))
      expectApi(username, results, 200, admin)
      console.log(`broker: ${username} authenticated at partner-idp, study issued the token; /api/user=200 /api/admin=${admin}`)
    }
    await wrongPasswordIsRejected('carol', hint)
    console.log('broker: wrong partner password rejected by partner-idp')
    break
  }
  default:
    console.error('usage: node login-check.mjs base|app-a|sso|api|ldap|groups|broker')
    process.exit(2)
}
