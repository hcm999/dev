// auth.js
import { CONFIG } from './config.js';
import { kvGet } from './kv.js';
import { verifyMessage } from 'viem';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function handleAuth(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  // 1. 取参数（新增 signature / message）
  const { address, password, signature, message } = await request.json();
  if (!address || !password) return json({ success: false, error: '缺少参数' }, 400);

  const A = CONFIG.DEV_ACCESS;

  // 2. 密码校验（保留）
  if (password !== A.PASSWORD) {
    return json({ success: false, error: '密码错误', code: 'INVALID_PASSWORD' }, 401);
  }

  const addr = address.toLowerCase();

  // ============================================================
  // 3. 【新增】签名校验
  // ============================================================
  if (!signature || !message) {
    return json({ success: false, error: '需要签名', code: 'NEED_SIGNATURE' }, 401);
  }

  // 3.1 消息里必须包含请求地址（防止拿 A 的签名冒充 B）
  if (!message.toLowerCase().includes(addr)) {
    return json({ success: false, error: '消息地址不匹配', code: 'INVALID_SIGNATURE' }, 401);
  }

  // 3.2 校验签发时间，5 分钟内有效（防重放）
  const timeMatch = message.match(/签发时间[:：]\s*(.+)/);
  if (!timeMatch) {
    return json({ success: false, error: '消息格式错误', code: 'INVALID_SIGNATURE' }, 401);
  }
  const signedAt = new Date(timeMatch[1].trim()).getTime();
  if (!signedAt || Number.isNaN(signedAt)) {
    return json({ success: false, error: '时间解析失败', code: 'INVALID_SIGNATURE' }, 401);
  }
  if (Date.now() - signedAt > 5 * 60 * 1000) {
    return json({ success: false, error: '签名已过期', code: 'SIGNATURE_EXPIRED' }, 401);
  }
  if (signedAt - Date.now() > 60 * 1000) {
    // 允许 1 分钟时钟偏差，防止未来时间
    return json({ success: false, error: '签名时间异常', code: 'INVALID_SIGNATURE' }, 401);
  }

  // 3.3 验签
  let ok = false;
  try {
    ok = await verifyMessage({
      address: addr,          // viem 接受小写或 checksum 地址
      message,
      signature,
    });
  } catch (e) {
    return json({ success: false, error: '签名解析失败', code: 'INVALID_SIGNATURE' }, 401);
  }

  if (!ok) {
    return json({ success: false, error: '签名验证失败', code: 'INVALID_SIGNATURE' }, 401);
  }
  // ============================================================
  // 签名校验结束
  // ============================================================

  // 4. 白名单校验（原逻辑，保持不变）
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

  // 5. 过期校验（原逻辑，保持不变）
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

  // 6. 成功返回（原逻辑，保持不变）
  return json({
    success: true,
    address: addr,
    type: item.type || 'unknown',
    expireAt: item.expireAt || 0,
    expireAtText: item.expireAt ? new Date(item.expireAt * 1000).toLocaleString('zh-CN') : '永久',
    note: item.note || ''
  });
}
