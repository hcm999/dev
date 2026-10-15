import { CONFIG } from './config.js';
import { kvGet, kvSet } from './kv.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function handleAdmin(request, env) {
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const token = request.headers.get('x-admin-token');
  if (token !== CONFIG.ADMIN_TOKEN) return json({ success: false, error: '无权访问' }, 401);

  const body = await request.json();
  const { action, ...data } = body;

  try {
    switch (action) {
      case 'listWhitelist':   return await listWhitelist(env);
      case 'addWhitelist':    return await addWhitelist(env, data);
      case 'removeWhitelist': return await removeWhitelist(env, data);
      case 'activate':        return await activate(env, data);
      case 'deactivate':      return await deactivate(env, data);
      case 'listPayments':    return await listPayments(env, data);
      default: return json({ success: false, error: '未知 action' }, 400);
    }
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

async function listWhitelist(env) {
  const data = await kvGet(env, 'dev:whitelist');
  const items = data?.items || [];
  const now = Math.floor(Date.now() / 1000);
  const enriched = items.map(i => ({
    ...i,
    isActive: !i.expireAt || i.expireAt === 0 || i.expireAt > now,
    remainDays: i.expireAt ? Math.max(0, Math.ceil((i.expireAt - now) / 86400)) : '∞'
  }));
  return json({ success: true, items: enriched });
}

async function addWhitelist(env, { address, expireAt, type, note }) {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return json({ success: false, error: '无效地址' }, 400);
  }
  const addr = address.toLowerCase();
  const data = await kvGet(env, 'dev:whitelist');
  let items = data?.items || [];
  const idx = items.findIndex(i => i.address.toLowerCase() === addr);
  const record = {
    address: addr,
    type: type || 'manual',
    expireAt: expireAt || 0,
    note: note || '',
    addedAt: Math.floor(Date.now() / 1000)
  };
  if (idx >= 0) items[idx] = record;
  else items.push(record);
  const ok = await kvSet(env, 'dev:whitelist', { items, lastUpdate: Date.now() });
  if (!ok) return json({ success: false, error: '保存失败' }, 500);
  return json({ success: true, record });
}

async function removeWhitelist(env, { address }) {
  if (!address) return json({ success: false, error: '缺少地址' }, 400);
  const addr = address.toLowerCase();
  const data = await kvGet(env, 'dev:whitelist');
  let items = data?.items || [];
  const before = items.length;
  items = items.filter(i => i.address.toLowerCase() !== addr);
  const ok = await kvSet(env, 'dev:whitelist', { items, lastUpdate: Date.now() });
  if (!ok) return json({ success: false, error: '保存失败' }, 500);
  return json({ success: true, removed: before - items.length });
}

async function activate(env, { address, plan, note }) {
  if (!address) return json({ success: false, error: '缺少地址' }, 400);
  const addr = address.toLowerCase();
  const A = CONFIG.DEV_ACCESS;
  const now = Math.floor(Date.now() / 1000);

  let duration = 0;
  if (plan === 'single') duration = A.DURATION.SINGLE;
  else if (plan === 'monthly') duration = A.DURATION.MONTHLY;
  else if (plan === 'permanent') duration = 0;
  else return json({ success: false, error: '无效套餐' }, 400);

  const wlData = await kvGet(env, 'dev:whitelist');
  let items = wlData?.items || [];
  const idx = items.findIndex(i => i.address.toLowerCase() === addr);
  const expireAt = duration === 0 ? 0 : now + duration;

  const record = {
    address: addr,
    type: plan || 'manual',
    expireAt,
    note: note || '',
    addedAt: idx >= 0 ? items[idx].addedAt : now,
    lastActivatedAt: now
  };
  if (idx >= 0) items[idx] = { ...items[idx], ...record };
  else items.push(record);

  const ok = await kvSet(env, 'dev:whitelist', { items, lastUpdate: Date.now() });
  if (!ok) return json({ success: false, error: '保存白名单失败' }, 500);

  const payKey = `dev:payments:${addr}`;
  const payData = await kvGet(env, payKey);
  const history = payData?.history || [];
  history.push({
    plan,
    amount: plan === 'single' ? A.PRICE.SINGLE : plan === 'monthly' ? A.PRICE.MONTHLY : 0,
    activateAt: now,
    expireAt,
    note: note || ''
  });
  await kvSet(env, payKey, { history, lastUpdate: Date.now() });

  return json({ success: true, record, history });
}

async function deactivate(env, { address }) {
  if (!address) return json({ success: false, error: '缺少地址' }, 400);
  const addr = address.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const wlData = await kvGet(env, 'dev:whitelist');
  let items = wlData?.items || [];
  const idx = items.findIndex(i => i.address.toLowerCase() === addr);
  if (idx < 0) return json({ success: false, error: '地址不在白名单' }, 404);
  items[idx].expireAt = now - 1;
  const ok = await kvSet(env, 'dev:whitelist', { items, lastUpdate: Date.now() });
  if (!ok) return json({ success: false, error: '保存失败' }, 500);
  return json({ success: true });
}

async function listPayments(env, { address }) {
  if (!address) return json({ success: false, error: '缺少地址' }, 400);
  const addr = address.toLowerCase();
  const data = await kvGet(env, `dev:payments:${addr}`);
  return json({ success: true, history: data?.history || [] });
}
