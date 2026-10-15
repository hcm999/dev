// src/index.js
import { CONFIG } from './config.js';
import { handleAuth } from './auth.js';
import { handleAdmin } from './admin.js';
import { handleUploadData } from './upload-data.js';
import { handleUploadBatch } from './upload-batch.js';
import { handleProjectData } from './project-data.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, X-Access-Password, X-Access-Address',
};

// 短路径 → 实际 HTML 文件
const PAGE_MAP = {
  '/':          '/index.html',
  '/admin':     '/admin.html',
  '/dev':       '/devstake.html',
  '/devstake':  '/devlend.html',
  '/dev123':    '/devdao123.html',
  '/devdao':    '/devdao.html',
  '/devsj':     '/devsj.html',
  '/dev-admin': '/dev-admin.html',
  '/ck':        '/atmck.html',
  '/sc':        '/atmsc1121.html',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      // ============ API 路由 ============
      if (path === '/api/auth')         return await handleAuth(request, env);
      if (path === '/api/admin')        return await handleAdmin(request, env);
      if (path === '/api/upload-data')  return await handleUploadData(request, env);
      if (path === '/api/upload-batch') return await handleUploadBatch(request, env);
      if (path === '/api' || path === '/api/') return await handleProjectData(request, env);
      if (path.startsWith('/api/'))     return await handleProjectData(request, env);

      // ============ 静态页面 ============
      // 1. 短路径映射
      if (PAGE_MAP[path]) {
        const assetUrl = new URL(PAGE_MAP[path], url.origin);
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }

      // 2. 带 .html 的直接返回
      // 3. 其它静态资源（.js/.css/.png 等）也交给 ASSETS
      return env.ASSETS.fetch(request);

    } catch (err) {
      console.error('Worker error:', err);
      return json({ success: false, error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    console.log('Cron fired at', new Date().toISOString());
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
