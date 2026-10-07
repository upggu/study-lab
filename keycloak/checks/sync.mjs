// Run the LDAP synchronisation that configuration alone does not do: a full user sync of the
// samba-ad provider and, when the lab-groups mapper exists, a group sync. This is an operation
// (Admin REST POST), not a declaration, which is why it is separate from ./lab.sh apply.

import fs from 'node:fs'

const keycloak = 'https://keycloak.keycloak.test:30080'
const password = fs.readFileSync('/run/secrets/keycloak-admin-password', 'utf8').trimEnd()

const tokenResponse = await fetch(`${keycloak}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'lab-admin', password }),
})
if (!tokenResponse.ok) throw new Error(`admin login failed: HTTP ${tokenResponse.status}`)
const token = (await tokenResponse.json()).access_token

async function admin(path, method = 'GET') {
  const response = await fetch(`${keycloak}/admin/realms/study${path}`, {
    method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`${method} ${path} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

const providers = (await admin('/components?type=org.keycloak.storage.UserStorageProvider')).filter((item) => item.name === 'samba-ad')
if (providers.length !== 1) throw new Error('the samba-ad provider is not applied yet (./lab.sh apply ldap)')
const provider = providers[0]

const users = await admin(`/user-storage/${provider.id}/sync?action=triggerFullSync`, 'POST')
console.log(`user sync: added=${users.added} updated=${users.updated} removed=${users.removed} failed=${users.failed}`)

const mappers = (await admin(`/components?parent=${provider.id}&type=org.keycloak.storage.ldap.mappers.LDAPStorageMapper`))
  .filter((item) => item.name === 'lab-groups')
if (mappers.length === 1) {
  const groups = await admin(`/user-storage/${provider.id}/mappers/${mappers[0].id}/sync?direction=fedToKeycloak`, 'POST')
  console.log(`group sync: added=${groups.added} updated=${groups.updated} removed=${groups.removed} failed=${groups.failed}`)
  await admin('/clear-user-cache', 'POST')
  console.log('user cache cleared so the next login re-reads group membership')
} else {
  console.log('group sync: skipped (no lab-groups mapper; apply the groups stage first)')
}
