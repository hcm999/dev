export async function kvGet(env, key) {
  if (env.KV) {
    const val = await env.KV.get(key, 'json');
    return val;
  }
  const baseUrl = env.DEVKV_KV_REST_API_URL;
  const token = env.DEVKV_KV_REST_API_TOKEN;
  if (!baseUrl || !token) return null;
  const res = await fetch(`${baseUrl}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const r = await res.json();
  return r.result ? JSON.parse(r.result) : null;
}

export async function kvSet(env, key, data, ttl = null) {
  if (env.KV) {
    await env.KV.put(key, JSON.stringify(data), ttl ? { expirationTtl: ttl } : {});
    return true;
  }
  const baseUrl = env.DEVKV_KV_REST_API_URL;
  const token = env.DEVKV_KV_REST_API_TOKEN;
  if (!baseUrl || !token) return false;
  const url = `${baseUrl}/set/${key}${ttl ? `?ex=${ttl}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(data))
  });
  return res.ok;
}

export async function kvDel(env, key) {
  if (env.KV) {
    await env.KV.delete(key);
    return true;
  }
  const baseUrl = env.DEVKV_KV_REST_API_URL;
  const token = env.DEVKV_KV_REST_API_TOKEN;
  if (!baseUrl || !token) return false;
  const res = await fetch(`${baseUrl}/del/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}
