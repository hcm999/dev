import { CONFIG } from './config.js';
import { kvGet, kvSet } from './kv.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function handleUploadData(request, env) {
  if (request.method === 'GET') return handleGet(request, env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ success: false, error: 'Method not allowed' }, 405);
}

async function handlePost(request, env) {
  const { projectId, data } = await request.json();

  if (!projectId) return json({ success: false, error: '缺少projectId参数' }, 400);
  if (!CONFIG.PROJECTS.includes(projectId)) return json({ success: false, error: '无效的项目ID' }, 400);
  if (!data || !Array.isArray(data) || data.length === 0) {
    return json({ success: false, error: '请提供有效的data数组' }, 400);
  }

  const dataKey = `${projectId}:upload_data`;
  let existingItems = [];
  const existingData = await kvGet(env, dataKey);
  if (existingData) {
    existingItems = existingData?.items || [];
  }

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const newItems = data.map(value => ({
    value: value.trim(),
    uploadTime: now,
    date: today
  }));

  const uniqueMap = new Map();
  existingItems.forEach(item => {
    const key = item.value;
    if (!uniqueMap.has(key) || uniqueMap.get(key).uploadTime < item.uploadTime) {
      uniqueMap.set(key, item);
    }
  });
  newItems.forEach(item => {
    uniqueMap.set(item.value, item);
  });

  const allItems = Array.from(uniqueMap.values()).sort((a, b) => b.uploadTime - a.uploadTime);
  const savedData = {
    items: allItems,
    totalCount: allItems.length,
    lastUpdate: now,
    projectId
  };
  await kvSet(env, dataKey, savedData);

  const newUniqueValues = newItems.filter(item => {
    const e = uniqueMap.get(item.value);
    return e && e.uploadTime === now;
  });

  return json({
    success: true,
    message: '上传成功',
    uploadedCount: data.length,
    newCount: newUniqueValues.length,
    duplicateCount: data.length - newUniqueValues.length,
    totalCount: allItems.length,
    timestamp: now
  });
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) return json({ success: false, error: '缺少projectId参数' }, 400);
  if (!CONFIG.PROJECTS.includes(projectId)) return json({ success: false, error: '无效的项目ID' }, 400);

  const dataKey = `${projectId}:upload_data`;
  let data = await kvGet(env, dataKey);

  if (!data) {
    return json({
      success: true,
      data: { items: [], totalCount: 0, lastUpdate: null, projectId }
    });
  }

  return json({ success: true, data });
}
