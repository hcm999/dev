import { CONFIG } from './config.js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb'
        },
        maxDuration: 30
    },
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'GET') {
        return handleGet(req, res);
    }
    
    if (req.method === 'POST') {
        return handlePost(req, res);
    }
    
    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

// 处理上传 - 追加模式 + 去重
async function handlePost(req, res) {
    try {
        const { projectId, data } = req.body;
        
        if (!projectId) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少projectId参数' 
            });
        }
        
        if (!CONFIG.PROJECTS.includes(projectId)) {
            return res.status(400).json({ 
                success: false, 
                error: '无效的项目ID' 
            });
        }
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: '请提供有效的data数组' 
            });
        }
        
        console.log(`[${projectId}] 收到数据上传: ${data.length}条`);
        
        const dataKey = `${projectId}:upload_data`;
        
        // 获取现有数据
        let existingItems = [];
        const existingData = await getDataFromKV(dataKey);
        
        if (existingData) {
            let parsedData = existingData;
            if (typeof parsedData === 'string') {
                try {
                    parsedData = JSON.parse(parsedData);
                } catch (e) {
                    console.error('解析现有数据失败:', e);
                }
            }
            existingItems = parsedData?.items || [];
            console.log(`[${projectId}] 现有数据: ${existingItems.length}条`);
        }
        
        // 新数据添加时间戳和日期
        const now = Date.now();
        const today = new Date(now).toISOString().slice(0, 10);
        const newItems = data.map(value => ({
            value: value.trim(),
            uploadTime: now,
            date: today
        }));
        
        // ========== 去重逻辑 ==========
        // 使用 Map 来去重，key 是数据值，保留最新的记录
        const uniqueMap = new Map();
        
        // 先添加现有数据
        existingItems.forEach(item => {
            const key = item.value;
            // 如果已存在，比较时间，保留最新的
            if (!uniqueMap.has(key) || uniqueMap.get(key).uploadTime < item.uploadTime) {
                uniqueMap.set(key, item);
            }
        });
        
        // 再添加新数据（新数据会覆盖旧数据）
        newItems.forEach(item => {
            const key = item.value;
            // 新数据直接覆盖（因为新数据时间是最新的）
            uniqueMap.set(key, item);
        });
        
        // 统计去重情况
        const existingCount = existingItems.length;
        const newCount = newItems.length;
        const uniqueCount = uniqueMap.size;
        const duplicateCount = newCount - (uniqueCount - (existingCount - (existingCount - uniqueMap.size)));
        
        console.log(`[${projectId}] 去重前: 原有${existingCount}条, 新增${newCount}条`);
        console.log(`[${projectId}] 去重后: 共${uniqueCount}条, 去除了${existingCount + newCount - uniqueCount}条重复`);
        
        // 转换为数组并按上传时间倒序排序（最新的在前）
        const allItems = Array.from(uniqueMap.values()).sort((a, b) => b.uploadTime - a.uploadTime);
        
        // 保存到KV
        const savedData = {
            items: allItems,
            totalCount: allItems.length,
            lastUpdate: now,
            projectId: projectId
        };
        
        await saveToKV(dataKey, savedData);
        
        // 计算本次实际新增的数量（新数据中不重复的数量）
        const newUniqueValues = newItems.filter(item => {
            // 检查是否在去重后唯一Map中，且上传时间等于本次上传时间
            const existingInMap = uniqueMap.get(item.value);
            return existingInMap && existingInMap.uploadTime === now;
        });
        
        console.log(`✅ [${projectId}] 数据保存成功，累计 ${allItems.length} 条（本次实际新增 ${newUniqueValues.length} 条，重复 ${newItems.length - newUniqueValues.length} 条）`);
        
        res.status(200).json({
            success: true,
            message: `上传成功`,
            uploadedCount: data.length,           // 本次提交的数量
            newCount: newUniqueValues.length,     // 实际新增的数量（去重后）
            duplicateCount: data.length - newUniqueValues.length,  // 重复的数量
            totalCount: allItems.length,          // 服务器总数量
            timestamp: now
        });
        
    } catch (error) {
        console.error('上传错误:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// 处理获取
async function handleGet(req, res) {
    try {
        const { projectId } = req.query;
        
        if (!projectId) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少projectId参数' 
            });
        }
        
        if (!CONFIG.PROJECTS.includes(projectId)) {
            return res.status(400).json({ 
                success: false, 
                error: '无效的项目ID' 
            });
        }
        
        const dataKey = `${projectId}:upload_data`;
        let data = await getDataFromKV(dataKey);
        
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.error('解析数据失败:', e);
            }
        }
        
        if (!data) {
            return res.status(200).json({
                success: true,
                data: {
                    items: [],
                    totalCount: 0,
                    lastUpdate: null,
                    projectId: projectId
                }
            });
        }
        
        res.status(200).json({
            success: true,
            data: data
        });
        
    } catch (error) {
        console.error('获取数据错误:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// 保存到KV
async function saveToKV(dataKey, data) {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.log('未配置KV存储，跳过保存');
        return false;
    }
    
    try {
        const url = `${process.env.KV_REST_API_URL}/set/${dataKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(JSON.stringify(data))
        });
        
        if (!response.ok) {
            console.error(`KV保存失败 [${dataKey}]:`, await response.text());
            return false;
        }
        
        console.log(`✅ 数据已保存到KV [${dataKey}]`);
        return true;
    } catch (error) {
        console.error('KV保存错误:', error);
        return false;
    }
}

// 从KV获取数据
async function getDataFromKV(dataKey) {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.log('未配置KV存储');
        return null;
    }
    
    try {
        const url = `${process.env.KV_REST_API_URL}/get/${dataKey}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            console.error(`KV获取失败 [${dataKey}]:`, await response.text());
            return null;
        }
        
        const result = await response.json();
        const rawData = result.result;
        
        if (!rawData) {
            return null;
        }
        
        try {
            return JSON.parse(rawData);
        } catch (e) {
            return rawData;
        }
    } catch (error) {
        console.error('KV获取错误:', error);
        return null;
    }
}
