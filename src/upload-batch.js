// src/upload-batch.js
import { CONFIG } from './config.js';
import { kvGet, kvSet, kvDel } from './kv.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const BATCH_PREFIX = 'temp:batch:';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function handleUploadBatch(request, env) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const { action, projectId, ...data } = await request.json();

  if (!projectId || !CONFIG.PROJECTS.includes(projectId)) {
    return json({ success: false, error: '无效的项目ID' }, 400);
  }

  try {
    switch (action) {
      case 'init':
        return await handleInit(env, projectId, data);
      case 'batch':
        return await handleBatch(env, projectId, data);
      case 'finalize':
        return await handleFinalize(env, projectId, data);
      case 'incremental':                    // 👈 新增：增量上传通道
        return await handleIncremental(env, projectId, data);
      default:
        return json({ success: false, error: '未知的action参数' }, 400);
    }
  } catch (error) {
    console.error('上传错误:', error);
    return json({ success: false, error: error.message }, 500);
  }
}

// ==========================================
// 1. 初始化分批上传（保留原逻辑）
// ==========================================
async function handleInit(env, projectId, data) {
  const { totalRecords, totalAllRecords, timestamp } = data;
  console.log(`[${projectId}] 初始化上传: totalRecords=${totalRecords}, totalAllRecords=${totalAllRecords}`);

  const uploadId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;

  const sessionData = {
    uploadId, projectId, totalRecords, totalAllRecords,
    batches: [], startTime: Date.now(), lastUpdate: Date.now(),
    status: 'initialized', timestamp
  };

  const saved = await kvSet(env, sessionKey, sessionData, 7200);
  if (!saved) return json({ success: false, error: '保存上传会话失败' }, 500);

  return json({ success: true, uploadId, message: '分批上传初始化成功' });
}

// ==========================================
// 2. 接收分批数据（保留原逻辑）
// ==========================================
async function handleBatch(env, projectId, data) {
  const { uploadId, batchIndex, dataType, records } = data;
  console.log(`[${projectId}] 接收批次: uploadId=${uploadId}, batchIndex=${batchIndex}, dataType=${dataType}, records=${records?.length || 0}条`);

  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
  let session = await kvGet(env, sessionKey);

  if (typeof session === 'string') {
    try { session = JSON.parse(session); } catch (e) { return json({ success: false, error: '会话数据格式错误' }, 500); }
  }
  if (!session || typeof session !== 'object') return json({ success: false, error: '上传会话不存在或已过期' }, 404);
  if (!Array.isArray(session.batches)) session.batches = [];

  const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${dataType}_${batchIndex}`;
  await kvSet(env, batchKey, { data: records, timestamp: Date.now() }, 7200);

  session.batches.push({ batchIndex, dataType, recordCount: records.length, timestamp: Date.now() });
  session.lastUpdate = Date.now();
  await kvSet(env, sessionKey, session, 7200);

  return json({ success: true, count: records.length, message: `第 ${batchIndex} 批数据接收成功` });
}

// ==========================================
// 3. 完成分批上传（保留原逻辑）
// ==========================================
async function handleFinalize(env, projectId, data) {
  const { uploadId, stats, addresses, finalTimestamp } = data;
  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
  let session = await kvGet(env, sessionKey);

  if (typeof session === 'string') {
    try { session = JSON.parse(session); } catch (e) { return json({ success: false, error: '会话数据格式错误' }, 500); }
  }
  if (!session || typeof session !== 'object') return json({ success: false, error: '上传会话不存在或已过期' }, 404);
  if (!Array.isArray(session.batches)) session.batches = [];

  let allRecords = [], allAllRecords = [];
  for (const batch of session.batches) {
    const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${batch.dataType}_${batch.batchIndex}`;
    let batchData = await kvGet(env, batchKey);
    if (typeof batchData === 'string') {
      try { batchData = JSON.parse(batchData); } catch (e) { continue; }
    }
    if (batchData && batchData.data) {
      if (batch.dataType === 'records') allRecords.push(...batchData.data);
      else if (batch.dataType === 'allRecords') allAllRecords.push(...batchData.data);
    }
  }

  const dataKey = `${projectId}:staking_data`;
  const saveData = { stats, records: allRecords, allRecords: allAllRecords, addresses, lastUpdate: finalTimestamp };

  const saved = await kvSet(env, dataKey, saveData);
  if (!saved) return json({ success: false, error: '保存数据失败' }, 500);

  if (addresses && addresses.length > 0) {
    await kvSet(env, `${projectId}:${CONFIG.KV.ADDRESS_KEY_PREFIX}`, { addresses, uploadTime: finalTimestamp });
  }
  await kvSet(env, `${projectId}:${CONFIG.KV.LAST_UPDATE_PREFIX}`, finalTimestamp);
  await cleanupTempData(env, projectId, uploadId, session);

  return json({ success: true, timestamp: finalTimestamp, recordCount: allRecords.length, message: '分批上传完成' });
}

// ==========================================
// 4. 全新：增量上传（精准合并 + 极低写入）
// ==========================================
async function handleIncremental(env, projectId, data) {
  const { newActive, newAll, changed, stats, addresses, lastUploadedOrderId } = data;
  console.log(`[${projectId}] 增量上传: 新活跃=${(newActive||[]).length}, 新历史=${(newAll||[]).length}, 变化=${(changed||[]).length}`);

  const dataKey = `${projectId}:staking_data`;
  let existing = await kvGet(env, dataKey);

  if (typeof existing === 'string') {
    try { existing = JSON.parse(existing); } catch (e) { existing = null; }
  }
  if (!existing || typeof existing !== 'object') {
    existing = { records: [], allRecords: [], stats: {}, addresses: [], lastUpdate: null };
  }

  // 建立 Map 用于覆盖合并
  const allMap = new Map((existing.allRecords || []).map(r => [r.orderId, r]));
  const activeMap = new Map((existing.records || []).map(r => [r.orderId, r]));

  // 1. 全新订单
  for (const r of (newAll || [])) allMap.set(r.orderId, r);
  for (const r of (newActive || [])) activeMap.set(r.orderId, r);

  // 2. 状态变化订单（比如之前活跃，现在变成已赎回）
  for (const r of (changed || [])) {
    allMap.set(r.orderId, r);
    if (r.status !== 1) activeMap.delete(r.orderId);
    else activeMap.set(r.orderId, r);
  }

  // 3. 组装并排序
  const records = Array.from(activeMap.values()).filter(r => r.status === 1);
  const allRecords = Array.from(allMap.values()).sort((a, b) => (a.orderId || 0) - (b.orderId || 0));

  const saveData = {
    stats: stats || existing.stats,
    records,
    allRecords,
    addresses: addresses || existing.addresses || [],
    lastUploadedOrderId: lastUploadedOrderId || existing.lastUploadedOrderId || 0,
    lastUpdate: Date.now(),
  };

  const saved = await kvSet(env, dataKey, saveData);
  if (!saved) return json({ success: false, error: '保存数据失败' }, 500);

  if (addresses && addresses.length > 0) {
    await kvSet(env, `${projectId}:${CONFIG.KV.ADDRESS_KEY_PREFIX}`, { addresses, uploadTime: Date.now() });
  }
  await kvSet(env, `${projectId}:${CONFIG.KV.LAST_UPDATE_PREFIX}`, Date.now());

  return json({
    success: true, message: '增量上传成功',
    newActiveCount: (newActive || []).length,
    newAllCount: (newAll || []).length,
    changedCount: (changed || []).length,
    totalActive: records.length,
    totalAll: allRecords.length,
    lastUploadedOrderId: saveData.lastUploadedOrderId,
    timestamp: Date.now(),
  });
}

// ==========================================
// 5. 清理临时数据（保留原逻辑）
// ==========================================
async function cleanupTempData(env, projectId, uploadId, session) {
  if (!session || !session.batches || !Array.isArray(session.batches)) return;
  for (const batch of session.batches) {
    const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${batch.dataType}_${batch.batchIndex}`;
    try { await kvDel(env, batchKey); } catch (error) {}
  }
  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
  try { await kvDel(env, sessionKey); } catch (error) {}
}
