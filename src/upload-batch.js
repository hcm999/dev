// src/upload-batch.js
  try {
    switch (action) {
      case 'init':     return await handleInit(env, projectId, data);
      case 'batch':    return await handleBatch(env, projectId, data);
      case 'finalize': return await handleFinalize(env, projectId, data);
      default: return json({ success: false, error: '未知的action参数' }, 400);
    }
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

// 1. 初始化分批上传
async function handleInit(projectId, data, res) {
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
    
    console.log(`[${projectId}] 保存会话到KV: ${sessionKey}`);
    const saved = await saveToKV(sessionKey, sessionData, 7200);
    
    if (!saved) {
        console.error(`[${projectId}] 保存会话失败`);
        return res.status(500).json({ 
            success: false, 
            error: '保存上传会话失败' 
        });
    }
    
    console.log(`[${projectId}] 初始化成功: ${uploadId}`);
    
    res.json({ 
        success: true, 
        uploadId,
        message: '分批上传初始化成功'
    });
}

// 2. 接收分批数据
async function handleBatch(projectId, data, res) {
    const { uploadId, batchIndex, dataType, records } = data;
    
    console.log(`[${projectId}] 接收批次: uploadId=${uploadId}, batchIndex=${batchIndex}, dataType=${dataType}, records=${records?.length || 0}条`);
    
    const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
    let session = await getFromKV(sessionKey);
    
    // 如果 session 是字符串，尝试解析它
    if (typeof session === 'string') {
        try {
            session = JSON.parse(session);
            console.log(`[${projectId}] 成功解析会话字符串`);
        } catch (e) {
            console.error(`[${projectId}] 解析会话失败:`, e);
            return res.status(500).json({ 
                success: false, 
                error: '会话数据格式错误' 
            });
        }
    }
    
    if (!session || typeof session !== 'object') {
        console.error(`[${projectId}] 会话不存在或格式错误: ${sessionKey}`);
        return res.status(404).json({ 
            success: false, 
            error: '上传会话不存在或已过期' 
        });
    }
    
    // 确保 session.batches 是数组
    if (!Array.isArray(session.batches)) {
        session.batches = [];
    }
    
    const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${dataType}_${batchIndex}`;
    await saveToKV(batchKey, {
        data: records,
        timestamp: Date.now()
    }, 7200);
    
    session.batches.push({
        batchIndex,
        dataType,
        recordCount: records.length,
        timestamp: Date.now()
    });
    session.lastUpdate = Date.now();
    await saveToKV(sessionKey, session, 7200);
    
    console.log(`[${projectId}] 批次保存成功，总批次: ${session.batches.length}`);
    
    res.json({ 
        success: true, 
        count: records.length,
        message: `第 ${batchIndex} 批数据接收成功`
    });
}

// 3. 完成上传并合并数据
async function handleFinalize(projectId, data, res) {
    const { uploadId, stats, addresses, finalTimestamp } = data;
    
    console.log(`[${projectId}] 开始完成上传: uploadId=${uploadId}`);
    
    const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
    let session = await getFromKV(sessionKey);
    
    // 如果 session 是字符串，尝试解析它
    if (typeof session === 'string') {
        try {
            session = JSON.parse(session);
            console.log(`[${projectId}] 成功解析会话字符串`);
        } catch (e) {
            console.error(`[${projectId}] 解析会话失败:`, e);
            return res.status(500).json({ 
                success: false, 
                error: '会话数据格式错误' 
            });
        }
    }
    
    if (!session || typeof session !== 'object') {
        console.error(`[${projectId}] 上传会话不存在: ${sessionKey}`);
        return res.status(404).json({ 
            success: false, 
            error: '上传会话不存在或已过期' 
        });
    }
    
    // 确保 session.batches 是数组
    if (!Array.isArray(session.batches)) {
        session.batches = [];
    }
    
    console.log(`[${projectId}] 找到会话，共有 ${session.batches.length} 个批次`);
    
    let allRecords = [];
    let allAllRecords = [];
    
    for (const batch of session.batches) {
        const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${batch.dataType}_${batch.batchIndex}`;
        console.log(`[${projectId}] 读取批次: ${batchKey}`);
        
        let batchData = await getFromKV(batchKey);
        
        // 如果 batchData 是字符串，尝试解析它
        if (typeof batchData === 'string') {
            try {
                batchData = JSON.parse(batchData);
            } catch (e) {
                console.error(`[${projectId}] 解析批次数据失败:`, e);
                continue;
            }
        }
        
        if (batchData && batchData.data) {
            if (batch.dataType === 'records') {
                allRecords.push(...batchData.data);
                console.log(`[${projectId}] 读取 records 批次 ${batch.batchIndex}: ${batchData.data.length}条`);
            } else if (batch.dataType === 'allRecords') {
                allAllRecords.push(...batchData.data);
                console.log(`[${projectId}] 读取 allRecords 批次 ${batch.batchIndex}: ${batchData.data.length}条`);
            }
        } else {
            console.warn(`[${projectId}] 批次数据不存在: ${batchKey}`);
        }
    }
    
    console.log(`[${projectId}] 合并完成: records ${allRecords.length}条, allRecords ${allAllRecords.length}条`);
    
    // 保存主数据
    const dataKey = `${projectId}:staking_data`;
    const saveData = {
        stats,
        records: allRecords,
        allRecords: allAllRecords,
        addresses,
        lastUpdate: finalTimestamp
    };
    
    console.log(`[${projectId}] 准备保存到 KV [${dataKey}]`);
    
    const saved = await saveToKV(dataKey, saveData);
    
    if (!saved) {
        console.error(`[${projectId}] ❌ 保存到 KV 失败 [${dataKey}]`);
        return res.status(500).json({ 
            success: false, 
            error: '保存数据失败' 
        });
    }
    
    console.log(`[${projectId}] ✅ 数据已保存到 KV [${dataKey}]`);
    
    // 保存地址列表
    if (addresses && addresses.length > 0) {
        const addressKey = `${projectId}:${CONFIG.KV.ADDRESS_KEY_PREFIX}`;
        await saveToKV(addressKey, {
            addresses,
            uploadTime: finalTimestamp
        });
        console.log(`[${projectId}] ✅ 地址列表已保存: ${addresses.length}个`);
    }
    
    // 保存最后更新时间
    const updateKey = `${projectId}:${CONFIG.KV.LAST_UPDATE_PREFIX}`;
    await saveToKV(updateKey, finalTimestamp);
    console.log(`[${projectId}] ✅ 更新时间已保存`);
    
    // 清理临时数据
    await cleanupTempData(projectId, uploadId, session);
    
    console.log(`[${projectId}] ✅ 分批上传完成，共 ${allRecords.length} 条活跃记录`);
    
    res.json({ 
        success: true, 
        timestamp: finalTimestamp,
        recordCount: allRecords.length,
        message: '分批上传完成'
    });
}

// KV存储辅助函数
async function saveToKV(key, data, ttl = null) {
    if (!process.env.DEVKV_KV_REST_API_URL || !process.env.DEVKV_KV_REST_API_TOKEN) {
        console.log('未配置KV存储，跳过保存');
        return false;
    }
    
    try {
        let url = `${process.env.DEVKV_KV_REST_API_URL}/set/${key}`;
        
        if (ttl) {
            url += `?ex=${ttl}`;
        }
        
        const body = JSON.stringify(JSON.stringify(data));
        console.log(`正在保存到 KV: ${key}, 数据大小: ${body.length} 字节`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEVKV_KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`KV保存失败 [${key}]:`, errorText);
            return false;
        }
        
        console.log(`✅ KV保存成功 [${key}]`);
        return true;
    } catch (error) {
        console.error('KV保存错误:', error);
        return false;
    }
}

async function getFromKV(key) {
    if (!process.env.DEVKV_KV_REST_API_URL || !process.env.DEVKV_KV_REST_API_TOKEN) {
        return null;
    }
    
    try {
        const url = `${process.env.DEVKV_KV_REST_API_URL}/get/${key}`;
        console.log(`正在从KV读取: ${key}`);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${process.env.DEVKV_KV_REST_API_TOKEN}`
            }
        });
        
        if (!response.ok) {
            console.log(`KV读取失败 [${key}]: ${response.status}`);
            return null;
        }
        
        const result = await response.json();
        console.log(`✅ KV读取成功 [${key}]`);
        
        // 返回解析后的数据
        return result.result ? JSON.parse(result.result) : null;
    } catch (error) {
        console.error('KV读取失败:', error);
        return null;
    }
}

async function cleanupTempData(projectId, uploadId, session) {
    console.log(`[${projectId}] 开始清理临时数据...`);
    
    if (!session || !session.batches || !Array.isArray(session.batches)) {
        console.log(`[${projectId}] 没有需要清理的批次数据`);
        return;
    }
    
    for (const batch of session.batches) {
        const batchKey = `${BATCH_PREFIX}${projectId}:${uploadId}:${batch.dataType}_${batch.batchIndex}`;
        try {
            const url = `${process.env.DEVKV_KV_REST_API_URL}/del/${batchKey}`;
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.DEVKV_KV_REST_API_TOKEN}`
                }
            });
            console.log(`已删除批次: ${batchKey}`);
        } catch (error) {
            console.error('清理批次数据失败:', error);
        }
    }
    
    const sessionKey = `${BATCH_PREFIX}${projectId}:${uploadId}`;
    try {
        const url = `${process.env.DEVKV_KV_REST_API_URL}/del/${sessionKey}`;
        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEVKV_KV_REST_API_TOKEN}`
            }
        });
        console.log(`已删除会话: ${sessionKey}`);
    } catch (error) {
        console.error('清理会话数据失败:', error);
    }
}
