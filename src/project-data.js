import { CONFIG } from './config.js';
import { kvGet } from './kv.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function handleProjectData(request, env) {
  if (request.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405);
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) return json({ success: false, error: '缺少projectId参数' }, 400);
  if (!CONFIG.PROJECTS.includes(projectId)) return json({ success: false, error: '无效的项目ID' }, 400);

  if (projectId === 'dev') {
    const adminToken = request.headers.get('x-admin-token');
    const isAdmin = adminToken === CONFIG.ADMIN_TOKEN;

    if (!isAdmin) {
      const password = request.headers.get('x-access-password');
      const address = (request.headers.get('x-access-address') || '').toLowerCase();
      const A = CONFIG.DEV_ACCESS;

      if (password !== A.PASSWORD) {
        return json({ success: false, error: '密码错误', code: 'INVALID_PASSWORD' }, 401);
      }
      if (!address) return json({ success: false, error: '缺少地址', code: 'NO_ADDRESS' }, 403);

      const wlData = await kvGet(env, 'dev:whitelist');
      const items = wlData?.items || [];
      const item = items.find(i => i.address.toLowerCase() === address);
      if (!item) return json({ success: false, error: '地址不在白名单', code: 'NOT_IN_WHITELIST' }, 403);

      const now = Math.floor(Date.now() / 1000);
      if (item.expireAt && item.expireAt > 0 && item.expireAt < now) {
        return json({ success: false, error: '访问已过期', code: 'EXPIRED' }, 403);
      }
    }
  }

  const dataKey = `${projectId}:staking_data`;
  const data = await kvGet(env, dataKey);

  return json({
    success: true,
    data: data || { stats: null, records: [], allRecords: [], lastUpdate: null },
    timestamp: Date.now()
  });
}
