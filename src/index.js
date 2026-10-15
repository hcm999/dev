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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      if (path === '/api/auth')         return await handleAuth(request, env);
      if (path === '/api/admin')        return await handleAdmin(request, env);
      if (path === '/api/upload-data')  return await handleUploadData(request, env);
      if (path === '/api/upload-batch') return await handleUploadBatch(request, env);
      if (path === '/api' || path === '/api/') return await handleProjectData(request, env);
      if (path.startsWith('/api/'))     return await handleProjectData(request, env);

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
