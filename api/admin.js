// api/admin.js
import { CONFIG } from './config.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // 鉴权：管理员 token
    const token = req.headers['x-admin-token'];
    if (token !== CONFIG.ADMIN_TOKEN) {
        return res.status(401).json({ success: false, error: '无权访问' });
    }

    try {
        const { action, ...data } = req.body;

        switch (action) {
            case 'listWhitelist':   return await listWhitelist(res);
            case 'addWhitelist':    return await addWhitelist(data, res);
            case 'removeWhitelist': return await removeWhitelist(data, res);
            case 'activate':        return await activate(data, res);
            case 'deactivate':      return await deactivate(data, res);
            case 'listPayments':    return await listPayments(data, res);
            default:
                return res.status(400).json({ success: false, error: '未知 action' });
        }
    } catch (error) {
        console.error('Admin error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ✅ 统一的配置读取（带默认值防御）
function getAccessConfig() {
    return CONFIG.DEV_ACCESS || {
        PASSWORD: 'dev-2025',
        RECEIVE_WALLET: '0x61431FCf367332F403742Bcc5cC32916141c8888',
        PRICE: { SINGLE: 5, MONTHLY: 15 },
        DURATION: { SINGLE: 86400, MONTHLY: 2592000 },
        CONTACT: { TG: '', WECHAT: '', QQ: '3751235417' }
    };
}

// ====== 白名单操作 ======
async function listWhitelist(res) {
    const data = await getFromKV('dev:whitelist');
    const items = data?.items || [];
    const now = Math.floor(Date.now() / 1000);
    const enriched = items.map(i => ({
        ...i,
        isActive: !i.expireAt || i.expireAt === 0 || i.expireAt > now,
        remainDays: i.expireAt ? Math.max(0, Math.ceil((i.expireAt - now) / 86400)) : '∞'
    }));
    return res.json({ success: true, items: enriched });
}

async function addWhitelist({ address, expireAt, type, note }, res) {
    if (!address || !address.startsWith('0x') || address.length !== 42) {
        return res.status(400).json({ success: false, error: '无效地址' });
    }
    const addr = address.toLowerCase();
    const data = await getFromKV('dev:whitelist');
    let items = data?.items || [];

    const idx = items.findIndex(i => i.address.toLowerCase() === addr);
    const record = {
        address: addr,
        type: type || 'manual',
        expireAt: expireAt || 0,
        note: note || '',
        addedAt: Math.floor(Date.now() / 1000)
    };

    if (idx >= 0) items[idx] = record;
    else items.push(record);

    const saved = await saveToKV('dev:whitelist', { items, lastUpdate: Date.now() });
    if (!saved) return res.status(500).json({ success: false, error: '保存失败' });
    return res.json({ success: true, record });
}

async function removeWhitelist({ address }, res) {
    if (!address) return res.status(400).json({ success: false, error: '缺少地址' });
    const addr = address.toLowerCase();
    const data = await getFromKV('dev:whitelist');
    let items = data?.items || [];
    const before = items.length;
    items = items.filter(i => i.address.toLowerCase() !== addr);
    const saved = await saveToKV('dev:whitelist', { items, lastUpdate: Date.now() });
    if (!saved) return res.status(500).json({ success: false, error: '保存失败' });
    return res.json({ success: true, removed: before - items.length });
}

// ====== 付费激活 ======
async function activate({ address, plan, note }, res) {
    if (!address) return res.status(400).json({ success: false, error: '缺少地址' });
    const addr = address.toLowerCase();

    const A = getAccessConfig();

    const now = Math.floor(Date.now() / 1000);
    let duration = 0;
    let type = plan;

    if (plan === 'single') duration = A.DURATION.SINGLE;
    else if (plan === 'monthly') duration = A.DURATION.MONTHLY;
    else if (plan === 'permanent') duration = 0;
    else return res.status(400).json({ success: false, error: '无效套餐' });

    // 更新白名单（含过期时间）
    const wlData = await getFromKV('dev:whitelist');
    let items = wlData?.items || [];
    const idx = items.findIndex(i => i.address.toLowerCase() === addr);
    const expireAt = duration === 0 ? 0 : now + duration;

    const record = {
        address: addr,
        type: type || 'manual',
        expireAt,
        note: note || '',
        addedAt: idx >= 0 ? items[idx].addedAt : now,
        lastActivatedAt: now
    };

    if (idx >= 0) items[idx] = { ...items[idx], ...record };
    else items.push(record);

    const saved = await saveToKV('dev:whitelist', { items, lastUpdate: Date.now() });
    if (!saved) {
        console.error('❌ 白名单保存失败');
        return res.status(500).json({ success: false, error: '保存白名单失败' });
    }

    // 记录付费历史
    const payKey = `dev:payments:${addr}`;
    const payData = await getFromKV(payKey);
    const history = payData?.history || [];
    history.push({
        plan,
        amount: plan === 'single' ? A.PRICE.SINGLE : plan === 'monthly' ? A.PRICE.MONTHLY : 0,
        activateAt: now,
        expireAt,
        note: note || ''
    });

    await saveToKV(payKey, { history, lastUpdate: Date.now() });

    return res.json({ success: true, record, history });
}

async function deactivate({ address }, res) {
    if (!address) return res.status(400).json({ success: false, error: '缺少地址' });
    const addr = address.toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    const wlData = await getFromKV('dev:whitelist');
    let items = wlData?.items || [];
    const idx = items.findIndex(i => i.address.toLowerCase() === addr);
    if (idx < 0) return res.status(404).json({ success: false, error: '地址不在白名单' });

    items[idx].expireAt = now - 1;
    const saved = await saveToKV('dev:whitelist', { items, lastUpdate: Date.now() });
    if (!saved) return res.status(500).json({ success: false, error: '保存失败' });
    return res.json({ success: true });
}

async function listPayments({ address }, res) {
    if (!address) return res.status(400).json({ success: false, error: '缺少地址' });
    const addr = address.toLowerCase();
    const payKey = `dev:payments:${addr}`;
    const data = await getFromKV(payKey);
    return res.json({ success: true, history: data?.history || [] });
}

// ====== KV 工具（只用 DEVKV_ 前缀）======
async function saveToKV(key, data) {
    const baseUrl = process.env.DEVKV_KV_REST_API_URL;
    const token = process.env.DEVKV_KV_REST_API_TOKEN;

    if (!baseUrl || !token) {
        console.error('❌ KV 环境变量缺失: DEVKV_KV_REST_API_URL / DEVKV_KV_REST_API_TOKEN');
        return false;
    }

    try {
        const url = `${baseUrl}/set/${key}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(JSON.stringify(data))
        });
        if (!response.ok) {
            console.error(`❌ KV save failed [${key}]:`, await response.text());
            return false;
        }
        console.log(`✅ KV save OK [${key}]`);
        return true;
    } catch (e) {
        console.error('❌ KV save error:', e);
        return false;
    }
}

async function getFromKV(key) {
    const baseUrl = process.env.DEVKV_KV_REST_API_URL;
    const token = process.env.DEVKV_KV_REST_API_TOKEN;
    if (!baseUrl || !token) {
        console.error('❌ KV 环境变量缺失');
        return null;
    }

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
