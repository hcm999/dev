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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    
    try {
        const { projectId, stats, records, allRecords, addresses } = req.body;
        
        // 验证项目ID
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
        
        if (!records || !allRecords) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid data format' 
            });
        }
        
        console.log(`[${projectId}] 收到数据: ${records.length}条活跃记录, ${allRecords.length}条总记录`);
        
        // 使用项目ID作为key前缀保存主数据
        const dataKey = `${projectId}:staking_data`;
        const saved = await saveToKV(dataKey, {
            stats,
            records,
            allRecords,
            addresses,
            lastUpdate: Date.now()
        });
        
        // 保存地址列表（按项目隔离）
        if (addresses && addresses.length > 0) {
            await saveAddressesToKV(projectId, addresses);
        }
        
        // 保存最后更新时间（按项目隔离）
        await saveLastUpdateToKV(projectId);
        
        res.status(200).json({
            success: true,
            saved: saved,
            recordCount: records.length,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('上传错误:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

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

async function saveAddressesToKV(projectId, addresses) {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return;
    
    try {
        // 地址列表按项目隔离
        const addressKey = `${projectId}:${CONFIG.KV.ADDRESS_KEY_PREFIX}`;
        const url = `${process.env.KV_REST_API_URL}/set/${addressKey}`;
        
        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(JSON.stringify({
                addresses,
                uploadTime: Date.now()
            }))
        });
        
        console.log(`✅ 已保存 ${addresses.length} 个地址到KV [${addressKey}]`);
    } catch (error) {
        console.error('保存地址错误:', error);
    }
}

async function saveLastUpdateToKV(projectId) {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return;
    
    try {
        const updateKey = `${projectId}:${CONFIG.KV.LAST_UPDATE_PREFIX}`;
        const url = `${process.env.KV_REST_API_URL}/set/${updateKey}`;
        
        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(JSON.stringify(Date.now()))
        });
    } catch (error) {
        console.error('保存更新时间错误:', error);
    }
}
