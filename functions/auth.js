// api/auth.js
import { CONFIG } from './config.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const { address, password } = req.body;

        if (!address || !password) {
            return res.status(400).json({ success: false, error: '缺少参数' });
        }

        // ✅ 统一的配置读取（带默认值防御）
        const A = CONFIG.DEV_ACCESS || {
            PASSWORD: 'dev-2025',
            RECEIVE_WALLET: '0x61431FCf367332F403742Bcc5cC32916141c8888',
            PRICE: { SINGLE: 5, MONTHLY: 15 },
            DURATION: { SINGLE: 86400, MONTHLY: 2592000 },
            CONTACT: { TG: '', WECHAT: '', QQ: '3751235417' }
        };

        // 1. 密码校验
        if (password !== A.PASSWORD) {
            return res.status(401).json({ success: false, error: '密码错误', code: 'INVALID_PASSWORD' });
        }

        const addr = address.toLowerCase();

        // 2. 白名单 + 过期校验
        const wlData = await getFromKV('dev:whitelist');
        const whitelist = wlData?.items || [];
        const item = whitelist.find(w => w.address.toLowerCase() === addr);

        if (!item) {
            return res.status(403).json({
                success: false,
                error: '你的地址不在白名单',
                code: 'NOT_IN_WHITELIST',
                payInfo: {
                    receiveWallet: A.RECEIVE_WALLET,
                    price: A.PRICE,
                    duration: A.DURATION,
                    contact: A.CONTACT
                }
            });
        }

        // 3. 过期校验
        const now = Math.floor(Date.now() / 1000);
        if (item.expireAt && item.expireAt > 0 && item.expireAt < now) {
            return res.status(403).json({
                success: false,
                error: '访问已过期',
                code: 'EXPIRED',
                expireAt: item.expireAt,
                payInfo: {
                    receiveWallet: A.RECEIVE_WALLET,
                    price: A.PRICE,
                    duration: A.DURATION,
                    contact: A.CONTACT
                }
            });
        }

        // 4. 校验通过
        return res.status(200).json({
            success: true,
            address: addr,
            type: item.type || 'unknown',
            expireAt: item.expireAt || 0,
            expireAtText: item.expireAt ? new Date(item.expireAt * 1000).toLocaleString('zh-CN') : '永久',
            note: item.note || ''
        });

    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
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
    } catch (e) {
        console.error('KV read error:', e);
        return null;
    }
}
