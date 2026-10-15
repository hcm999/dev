export default {
  // 处理 HTTP 请求（静态页面 + API）
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 头，让 Vercel 前端能跨域调
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 按路径分发 API
    // 原来 functions/gana-stake.js 的逻辑
    if (url.pathname === '/gana-stake') {
      return handleGanaStake(request, env, corsHeaders);
    }
    // 原来 functions/admin.js 的逻辑
    if (url.pathname === '/admin') {
      return handleAdmin(request, env, corsHeaders);
    }
    // 原来 functions/auth.js 的逻辑
    if (url.pathname === '/auth') {
      return handleAuth(request, env, corsHeaders);
    }
    // 原来 functions/config.js 的逻辑
    if (url.pathname === '/config') {
      return handleConfig(request, env, corsHeaders);
    }

    // 其他路径（比如 /data/*、/proxy/*）走原来的重定向
    // 或者直接交给静态资源
    return env.ASSETS.fetch(request);
  },

  // 定时采集
  async scheduled(event, env, ctx) {
    // 采集逻辑写这里，把数据写入 D1
    await collectData(env);
  }
};

// 各个 API 的处理函数
async function handleGanaStake(request, env, corsHeaders) {
  // 把原来 functions/gana-stake.js 的逻辑搬过来
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleAdmin(request, env, corsHeaders) {
  // 把原来 functions/admin.js 的逻辑搬过来
}

async function handleAuth(request, env, corsHeaders) {
  // 把原来 functions/auth.js 的逻辑搬过来
}

async function handleConfig(request, env, corsHeaders) {
  // 把原来 functions/config.js 的逻辑搬过来
}

// 采集函数
async function collectData(env) {
  // 采集逻辑，写入 D1
}
