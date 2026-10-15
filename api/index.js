// api/index.js
import { CONFIG } from './config.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { projectId } = req.query;

        if (!projectId) {
            return res.status(400).json({ success: false, error: '缺少projectId参数' });
        }

        if (!CONFIG.PROJECTS.includes(projectId)) {
            return res.status(400).json({ success: false, error: '无效的项目ID' });
        }

        // ✅ 只有 dev 项目加访问控制
        if (projectId === 'dev') {
            // ✅ 管理员后门：带 X-Admin-Token 直接跳过所有校验
            const adminToken = req.headers['x-admin-token'];
            const isAdmin = adminToken === CONFIG.ADMIN_TOKEN;

            if (!isAdmin) {
                const password = req.headers['x-access-password'];
                const address = (req.headers['x-access-address'] || '').toLowerCase();

                const A = CONFIG.DEV_ACCESS || { PASSWORD: 'dev-2025' };

                if (password !== A.PASSWORD) {
                    return res.status(401).json({ success: false, error: '密码错误', code: 'INVALID_PASSWORD' });
                }
                if (!address) {
                    return res.status(403).json({ success: false, error: '缺少地址', code: 'NO_ADDRESS' });
                }

                const wlData = await getFromKV('dev:whitelist');
                const items = wlData?.items || [];
                const item = items.find(i => i.address.toLowerCase() === address);

                if (!item) {
                    return res.status(403).json({ success: false, error: '地址不在白名单', code: 'NOT_IN_WHITELIST' });
                }

                const now = Math.floor(Date.now() / 1000);
                if (item.expireAt && item.expireAt > 0 && item.expireAt < now) {
                    return res.status(403).json({ success: false, error: '访问已过期', code: 'EXPIRED' });
                }
            }
        }

        const dataKey = `${projectId}:staking_data`;
        const data = await getStoredData(dataKey);

        res.status(200).json({
            success: true,
            data: data || { stats: null, records: [], allRecords: [], lastUpdate: null },
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ✅ KV 读取（用 DEVKV_ 前缀）
async function getStoredData(dataKey) {
    const baseUrl = process.env.DEVKV_KV_REST_API_URL;
    const token = process.env.DEVKV_KV_REST_API_TOKEN;
    if (!baseUrl || !token) return null;

    try {
        const url = `${baseUrl}/get/${dataKey}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return null;
        const result = await response.json();
        return result.result ? JSON.parse(result.result) : null;
    } catch (error) { return null; }
}

async function getFromKV(key) {
    const baseUrl = process.env.DEVKV_KV_REST_API_URL;
    const token = process.env.DEVKV_KV_REST_API_TOKEN;
    if (!baseUrl || !token) return null;

    try {
        const url = `${baseUrl}/get/${key}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return null;
        const result = await response.json();
        return result.result ? JSON.parse(result.result) : null;
    } catch (error) { return null; }
}
