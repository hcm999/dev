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
      default:
        return json({ success: false, error: '未知的action参数' }, 400);
    }
  } catch (error) {
    console.error('分批上传错误:', error);
    return json({ success: false, error: error.message }, 500);
  }
}

// 1. 初始化分批上传
async function handleInit(env, projectId, data) {
  const { totalRecords, totalAllRecords, timestamp } = data;

  console.log(`[${projectId}] 初始化上传: totalRecords=${totalRecords}, totalAllRecords=${totalAllRecords}`);

  const uploadId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;

  const sessionData = {
    uploadId,
    projectId,
    totalRecords,
    totalAllRecords,
    batches: [],
    startTime: Date.now(),
    lastUpdate: Date.now(),
    status: 'initialized',
    timestamp
  };

  const saved = await kvSet(env, sessionKey, sessionData, 7200);

  if (!saved) {
    console.error(`[${projectId}] 保存会话失败`);
    return json({ success: false, error: '保存上传会话失败' }, 500);
  }

  console.log(`[${projectId}] 初始化成功: ${uploadId}`);
  return json({ success: true, uploadId, message: '分批上传初始化成功' });
}

// 2. 接收分批数据
async function handleBatch(env, projectId, data) {
  const { uploadId, batchIndex, dataType, records } = data;

  console.log(`[${projectId}] 接收批次: uploadId=${uploadId}, batchIndex=${batchIndex}, dataType=${dataType}, records=${records?.length || 0}条`);

  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
  let session = await kvGet(env, sessionKey);

  if (typeof session === 'string') {
    try { session = JSON.parse(session); }
    catch (e) {
      console.error(`[${projectId}] 解析会话失败:`, e);
      return json({ success: false, error: '会话数据格式错误' }, 500);
    }
  }

  if (!session || typeof session !== 'object') {
    console.error(`[${projectId}] 会话不存在: ${sessionKey}`);
    return json({ success: false, error: '上传会话不存在或已过期' }, 404);
  }

  if (!Array.isArray(session.batches)) session.batches = [];

  const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${dataType}_${batchIndex}`;
  await kvSet(env, batchKey, { data: records, timestamp: Date.now() }, 7200);

  session.batches.push({
    batchIndex,
    dataType,
    recordCount: records.length,
    timestamp: Date.now()
  });
  session.lastUpdate = Date.now();
  await kvSet(env, sessionKey, session, 7200);

  console.log(`[${projectId}] 批次保存成功，总批次: ${session.batches.length}`);
  return json({ success: true, count: records.length, message: `第 ${batchIndex} 批数据接收成功` });
}

// 3. 完成上传并合并数据
async function handleFinalize(env, projectId, data) {
  const { uploadId, stats, addresses, finalTimestamp } = data;

  console.log(`[${projectId}] 开始完成上传: uploadId=${uploadId}`);

  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
  let session = await kvGet(env, sessionKey);

  if (typeof session === 'string') {
    try { session = JSON.parse(session); }
    catch (e) {
      console.error(`[${projectId}] 解析会话失败:`, e);
      return json({ success: false, error: '会话数据格式错误' }, 500);
    }
  }

  if (!session || typeof session !== 'object') {
    console.error(`[${projectId}] 上传会话不存在: ${sessionKey}`);
    return json({ success: false, error: '上传会话不存在或已过期' }, 404);
  }

  if (!Array.isArray(session.batches)) session.batches = [];
  console.log(`[${projectId}] 找到会话，共有 ${session.batches.length} 个批次`);

  let allRecords = [];
  let allAllRecords = [];

  for (const batch of session.batches) {
    const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${batch.dataType}_${batch.batchIndex}`;
    console.log(`[${projectId}] 读取批次: ${batchKey}`);

    let batchData = await kvGet(env, batchKey);

    if (typeof batchData === 'string') {
      try { batchData = JSON.parse(batchData); }
      catch (e) {
        console.error(`[${projectId}] 解析批次数据失败:`, e);
        continue;
      }
    }

    if (batchData && batchData.data) {
      if (batch.dataType === 'records') {
        allRecords.push(...batchData.data);
        console.log(`[${projectId}] records 批次 ${batch.batchIndex}: ${batchData.data.length}条`);
      } else if (batch.dataType === 'allRecords') {
        allAllRecords.push(...batchData.data);
        console.log(`[${projectId}] allRecords 批次 ${batch.batchIndex}: ${batchData.data.length}条`);
      }
    } else {
      console.warn(`[${projectId}] 批次数据不存在: ${batchKey}`);
    }
  }

  console.log(`[${projectId}] 合并完成: records ${allRecords.length}条, allRecords ${allAllRecords.length}条`);

  const dataKey = `${projectId}:staking_data`;
  const saveData = {
    stats,
    records: allRecords,
    allRecords: allAllRecords,
    addresses,
    lastUpdate: finalTimestamp
  };

  const saved = await kvSet(env, dataKey, saveData);

  if (!saved) {
    console.error(`[${projectId}] 保存到 KV 失败 [${dataKey}]`);
    return json({ success: false, error: '保存数据失败' }, 500);
  }

  console.log(`[${projectId}] 数据已保存 [${dataKey}]`);

  // 保存地址列表
  if (addresses && addresses.length > 0) {
    const addressKey = `${projectId}:${CONFIG.KV.ADDRESS_KEY_PREFIX}`;
    await kvSet(env, addressKey, { addresses, uploadTime: finalTimestamp });
    console.log(`[${projectId}] 地址列表已保存: ${addresses.length}个`);
  }

  // 保存最后更新时间
  const updateKey = `${projectId}:${CONFIG.KV.LAST_UPDATE_PREFIX}`;
  await kvSet(env, updateKey, finalTimestamp);
  console.log(`[${projectId}] 更新时间已保存`);

  // 清理临时数据
  await cleanupTempData(env, projectId, uploadId, session);

  console.log(`[${projectId}] 分批上传完成，共 ${allRecords.length} 条活跃记录`);
  return json({
    success: true,
    timestamp: finalTimestamp,
    recordCount: allRecords.length,
    message: '分批上传完成'
  });
}

// 清理临时数据
async function cleanupTempData(env, projectId, uploadId, session) {
  console.log(`[${projectId}] 开始清理临时数据...`);

  if (!session || !session.batches || !Array.isArray(session.batches)) {
    console.log(`[${projectId}] 没有需要清理的批次数据`);
    return;
  }

  for (const batch of session.batches) {
    const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${batch.dataType}_${batch.batchIndex}`;
    try {
      await kvDel(env, batchKey);
      console.log(`已删除批次: ${batchKey}`);
    } catch (error) {
      console.error('清理批次数据失败:', error);
    }
  }

  const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
  try {
    await kvDel(env, sessionKey);
    console.log(`已删除会话: ${sessionKey}`);
  } catch (error) {
    console.error('清理会话数据失败:', error);
  }
}
