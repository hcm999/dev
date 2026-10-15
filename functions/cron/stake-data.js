import { neon } from '@neondatabase/serverless';
import { ethers } from 'ethers';

const CONFIG = {
  STAKING: "0x72212F35aC448FE7763aA1BFdb360193Fa098E52",
  LP_POOL: "0xa2f464a2462aed49b9b31eb8861bc6b0bbb0483f",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  BATCH_SIZE: 10,
  RETRY_LIMIT: 3,
  RETRY_DELAY: 1000
};

// ABI（从你的管理端复制）
const ABI_STAKING = [{"inputs":[{"internalType":"address","name":"marketingAddress_","type":"address"},{"internalType":"address","name":"devAddress_","type":"address"},{"internalType":"address","name":"threesevenAddress_","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"}],"name":"PRBMath_MulDiv18_Overflow","type":"error"},{"inputs":[{"internalType":"uint256","name":"x","type":"uint256"},{"internalType":"uint256","name":"y","type":"uint256"},{"internalType":"uint256","name":"denominator","type":"uint256"}],"name":"PRBMath_MulDiv_Overflow","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"reward","type":"uint256"},{"indexed":false,"internalType":"uint40","name":"timestamp","type":"uint40"},{"indexed":false,"internalType":"uint256","name":"index","type":"uint256"}],"name":"RewardPaid","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"index","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"stakeTime","type":"uint256"}],"name":"Staked","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"GANA","outputs":[{"internalType":"contract IGANA","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MIN_STAKE_USDT","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"back_Fee","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"balance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"devAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"isPreacher","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"market_Fee","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"marketingAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxStakeAmount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"network1In","outputs":[{"internalType":"uint256","name":"value","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint8","name":"index","type":"uint8"}],"name":"principalPlusRewardOfSlot","outputs":[{"internalType":"uint256","name":"reward","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"ratePerSec","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_gana","type":"address"}],"name":"setGANA","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint160","name":"_amount","type":"uint160"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"uint8","name":"_stakeIndex","type":"uint8"}],"name":"stake","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"stakeCount","outputs":[{"internalType":"uint256","name":"count","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"sync","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"t_supply","outputs":[{"internalType":"uint40","name":"stakeTime","type":"uint40"},{"internalType":"uint160","name":"tamount","type":"uint160"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"threesevenAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"threeseven_Fee","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"unstake","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"userIndex","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"userStakeRecord","outputs":[{"internalType":"uint40","name":"stakeTime","type":"uint40"},{"internalType":"uint160","name":"amount","type":"uint160"},{"internalType":"bool","name":"status","type":"bool"},{"internalType":"uint8","name":"stakeIndex","type":"uint8"}],"stateMutability":"view","type":"function"}];

const USDT_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const BSC_NODES = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed2.defibit.io',
  'https://bsc-dataseed1.ninicoin.io',
  'https://bsc-dataseed2.ninicoin.io',
  'https://rpc.ankr.com/bsc'
];

const STAKE_DURATIONS = {
  0: 86400,      // 1天
  1: 1296000,    // 15天
  2: 2592000     // 30天
};

async function callWithRetry(fn, retry = 0) {
  try {
    return await fn();
  } catch (e) {
    if (retry < CONFIG.RETRY_LIMIT) {
      await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * (retry + 1)));
      return callWithRetry(fn, retry + 1);
    }
    throw e;
  }
}

async function queryAddress(address, stakingContract, now) {
  const result = { active: [], all: [] };
  
  try {
    const count = Number(await callWithRetry(() => stakingContract.stakeCount(address)));
    
    for (let j = 0; j < count; j++) {
      try {
        const rec = await callWithRetry(() => stakingContract.userStakeRecord(address, j));
        const stakeTime = Number(rec[0]);
        const amount = rec[1];
        const isRedeemed = rec[2];
        const stakeIndex = Number(rec[3]);
        const amt = parseFloat(ethers.formatUnits(amount, 18));

        result.all.push({ address, amount: amt, stakeTime, stakeIndex, isRedeemed });

        if (!isRedeemed) {
          const unlockTime = stakeTime + STAKE_DURATIONS[stakeIndex];
          result.active.push({ address, amount: amt, stakeTime, stakeIndex, unlockTime, isRedeemed });
        }
      } catch (e) {}
    }
  } catch (e) { console.log(`查询地址失败: ${address}`); }
  
  return result;
}

async function getLPPoolBalance(provider) {
  try {
    const usdtContract = new ethers.Contract(CONFIG.USDT, USDT_ABI, provider);
    const balance = await usdtContract.balanceOf(CONFIG.LP_POOL);
    return parseFloat(ethers.formatUnits(balance, 18));
  } catch (error) {
    console.error('获取LP池余额失败:', error);
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: '未授权' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    let stakingContract;
    let provider;
    let connected = false;
    
    for (const node of BSC_NODES) {
      try {
        console.log(`尝试连接节点: ${node}`);
        provider = new ethers.JsonRpcProvider(node);
        await provider.getBlockNumber();
        stakingContract = new ethers.Contract(CONFIG.STAKING, ABI_STAKING, provider);
        console.log(`✅ 连接成功: ${node}`);
        connected = true;
        break;
      } catch (e) {
        console.log(`节点 ${node} 连接失败`);
      }
    }

    if (!connected) {
      throw new Error('无法连接到BSC网络');
    }

    const lpBalance = await getLPPoolBalance(provider);
    console.log(`LP池余额: ${lpBalance} USDT`);

    const { rows: addressRows } = await sql`SELECT address FROM stake_addresses`;
    const addresses = addressRows.map(row => row.address);
    
    if (addresses.length === 0) {
      return res.json({ success: true, message: '地址列表为空' });
    }

    console.log(`开始查询 ${addresses.length} 个地址...`);

    const now = Math.floor(Date.now() / 1000);
    const allRecords = [];
    const allActiveRecords = [];

    for (let i = 0; i < addresses.length; i += CONFIG.BATCH_SIZE) {
      const batch = addresses.slice(i, i + CONFIG.BATCH_SIZE);
      const results = await Promise.all(batch.map(addr => queryAddress(addr, stakingContract, now)));
      
      results.forEach(r => {
        allRecords.push(...r.all);
        allActiveRecords.push(...r.active);
      });
      
      console.log(`进度: ${Math.min(i + CONFIG.BATCH_SIZE, addresses.length)}/${addresses.length}`);
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`查询完成: ${allRecords.length} 条总记录, ${allActiveRecords.length} 条活跃记录`);

    for (const record of allRecords) {
      await sql`
        INSERT INTO stake_records (address, amount, stake_time, stake_index, is_redeemed)
        VALUES (${record.address}, ${record.amount}, ${record.stakeTime}, ${record.stakeIndex}, ${record.isRedeemed})
        ON CONFLICT (address, stake_time) 
        DO UPDATE SET is_redeemed = EXCLUDED.is_redeemed, updated_at = CURRENT_TIMESTAMP
      `;
    }

    const stats = {
      totalStaked: 0, totalStaked1d: 0, totalStaked15d: 0, totalStaked30d: 0,
      count1d: 0, count15d: 0, count30d: 0,
      unlock2d: 0, unlock7d: 0, unlock15d: 0
    };

    allActiveRecords.forEach(r => {
      stats.totalStaked += r.amount;
      if (r.stakeIndex === 0) { stats.totalStaked1d += r.amount; stats.count1d++; }
      else if (r.stakeIndex === 1) { stats.totalStaked15d += r.amount; stats.count15d++; }
      else { stats.totalStaked30d += r.amount; stats.count30d++; }
      
      const remain = r.unlockTime - now;
      if (remain <= 172800) stats.unlock2d += r.amount;
      if (remain <= 604800) stats.unlock7d += r.amount;
      if (remain <= 1296000) stats.unlock15d += r.amount;
    });

    const today = new Date().toISOString().split('T')[0];
    await sql`
      INSERT INTO stake_stats (date, total_staked, total_staked_1d, total_staked_15d, total_staked_30d,
        count_1d, count_15d, count_30d, unlock_2d, unlock_7d, unlock_15d, lp_withdrawable)
      VALUES (${today}, ${stats.totalStaked}, ${stats.totalStaked1d}, ${stats.totalStaked15d}, ${stats.totalStaked30d},
        ${stats.count1d}, ${stats.count15d}, ${stats.count30d}, ${stats.unlock2d}, ${stats.unlock7d}, ${stats.unlock15d}, ${lpBalance})
      ON CONFLICT (date) DO UPDATE SET
        total_staked = EXCLUDED.total_staked,
        total_staked_1d = EXCLUDED.total_staked_1d,
        total_staked_15d = EXCLUDED.total_staked_15d,
        total_staked_30d = EXCLUDED.total_staked_30d,
        count_1d = EXCLUDED.count_1d,
        count_15d = EXCLUDED.count_15d,
        count_30d = EXCLUDED.count_30d,
        unlock_2d = EXCLUDED.unlock_2d,
        unlock_7d = EXCLUDED.unlock_7d,
        unlock_15d = EXCLUDED.unlock_15d,
        lp_withdrawable = EXCLUDED.lp_withdrawable,
        updated_at = CURRENT_TIMESTAMP
    `;

    res.json({ success: true, addresses: addresses.length, records: allRecords.length, activeRecords: allActiveRecords.length, lpBalance, stats, timestamp: Date.now() });

  } catch (error) {
    console.error('自动更新失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
