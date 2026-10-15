import { CONFIG } from './config.js';
import { kvGet } from './kv.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function handleAuth(request, env) {
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const { address, password } = await request.json();
  if (!address || !password) return json({ success: false, error: '缺少参数' }, 400);

  const A = CONFIG.DEV_ACCESS;
  if (password !== A.PASSWORD) {
    return json({ success: false, error: '密码错误', code: 'INVALID_PASSWORD' }, 401);
  }

  const addr = address.toLowerCase();
  const wlData = await kvGet(env, 'dev:whitelist');
  const whitelist = wlData?.items || [];
  const item = whitelist.find(w => w.address.toLowerCase() === addr);

  if (!item) {
    return json({
      success: false,
      error: '你的地址不在白名单',
      code: 'NOT_IN_WHITELIST',
      payInfo: {
        receiveWallet: A.RECEIVE_WALLET,
        price: A.PRICE,
        duration: A.DURATION,
        contact: A.CONTACT
      }
    }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  if (item.expireAt && item.expireAt > 0 && item.expireAt < now) {
    return json({
      success: false,
      error: '访问已过期',
      code: 'EXPIRED',
      expireAt: item.expireAt,
      payInfo: {
        receiveWallet: A.RECEIVE_WALLET,
        price: A.PRICE,
        duration: A.DURATION,
        contact: A.CONTACT
      }
    }, 403);
  }

  return json({
    success: true,
    address: addr,
    type: item.type || 'unknown',
    expireAt: item.expireAt || 0,
    expireAtText: item.expireAt ? new Date(item.expireAt * 1000).toLocaleString('zh-CN') : '永久',
    note: item.note || ''
  });
}
