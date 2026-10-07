// kagent-lab 8장 — backend가 지켜야 할 invocation 불변조건의 executable test.
// 실제 구현에서는 in-memory Set 대신 DB transaction과 IdP principal을 사용한다.
// Agent Card 조회, invoke, stream 재연결, approval 응답 각각에서 같은 authorization 함수를 다시 호출한다.
import assert from 'node:assert/strict';
import test from 'node:test';

type Principal = { issuer: string; subject: string };
const key = (p: Principal) => `${p.issuer}\u0000${p.subject}`;

const allowed: Principal = { issuer: 'https://idp.example', subject: 'user-a' };
const denied: Principal = { issuer: 'https://idp.example', subject: 'user-b' };
const sameSubOtherIssuer: Principal = { issuer: 'https://other-idp.example', subject: 'user-a' };

const invokeGrants = new Set([`${key(allowed)}\u0000backend-reader`]);
const sessions = new Map<string, string>();

function authorizeInvoke(principal: Principal, agent: string) {
  if (!invokeGrants.has(`${key(principal)}\u0000${agent}`)) {
    throw new Error('invoke denied');
  }
}

function assertSessionOwner(principal: Principal, sessionId: string) {
  const owner = sessions.get(sessionId);
  if (owner && owner !== key(principal)) throw new Error('session owner mismatch');
  sessions.set(sessionId, key(principal));
}

test('허용 principal만 backend-reader를 호출한다', () => {
  assert.doesNotThrow(() => authorizeInvoke(allowed, 'backend-reader'));
  assert.throws(() => authorizeInvoke(denied, 'backend-reader'));
});

test('같은 sub라도 issuer가 다르면 다른 principal이다', () => {
  assert.throws(() => authorizeInvoke(sameSubOtherIssuer, 'backend-reader'));
});

test('다른 사용자의 session ID를 재사용하지 못한다', () => {
  assertSessionOwner(allowed, 'session-1');
  assert.throws(() => assertSessionOwner(denied, 'session-1'));
});
