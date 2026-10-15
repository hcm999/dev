// api/gana-stake.js - GANA质押管理平台后端
import { ethers } from 'ethers';

export default async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { action, privateKey, stakeIndex, amount, orderId } = req.body;
  const { queryAction, address } = req.query;
  
  // ========== 配置（这些别人看不到） ==========
  const CONFIG = {
    STAKING: "0x72212F35aC448FE7763aA1BFdb360193Fa098E52",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    PAIR: "0xa2f464a2462aed49b9b31eb8861bc6b0bbb0483f",
    // 授权配置
    AUTH_ADMIN_PASSWORD: "GANA9120",
    AUTH_ADMIN_ADDRESSES: [
      "0xEa77e6769A87c394062919FBaEf4F3B71bC991a8",
      "0xBfC937728bc5F911c1446470A3627508A29dF808",
      "0x211402E8cF1c4117Bbe17e61Ee62F875E31f100B",
      "0x54Aeb4faF845e90DDA95C1966Ea151d8c431212a",
      "0x67f7eb9384f2AF616bF2Ec100E19eA774B48aba8"
    ],
    AUTH_PAYMENT_AMOUNT: 100,
    AUTH_PAYMENT_DAYS: 360,
    AUTH_PAYMENT_RECEIVER: "0x9728D428764F846E8DD62C34371db716A9228238"
  };
  
  const STAKE_DURATIONS = { 0: 86400, 1: 1296000, 2: 2592000 };
  const STAKE_DURATION_LABELS = { 0: "1天", 1: "15天", 2: "30天" };
  
  const ABI_STAKING = [
    "function stakeCount(address) view returns (uint256)",
    "function userStakeRecord(address, uint256) view returns (uint40, uint160, bool, uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function unstake(uint256 index) returns (uint256)",
    "function stake(uint160 amount, uint256 amountOutMin, uint8 stakeIndex) returns (bool)"
  ];
  
  const ABI_ERC20 = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function approve(address, uint256) returns (bool)",
    "function allowance(address, address) view returns (uint256)"
  ];
  
  const RPC_NODES = [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
  ];
  
  async function getProvider() {
    for (const url of RPC_NODES) {
      try {
        const provider = new ethers.JsonRpcProvider(url);
        await provider.getBlockNumber();
        return provider;
      } catch(e) {}
    }
    throw new Error('无可用RPC');
  }
  
  async function getWalletProvider(privateKey) {
    const provider = await getProvider();
    let pk = privateKey.trim();
    if (pk.startsWith('0x')) pk = pk.slice(2);
    if (pk.length !== 64) throw new Error('私钥格式错误');
    return new ethers.Wallet('0x' + pk, provider);
  }
  
  // 验证授权
  function isAdminAddress(address) {
    return CONFIG.AUTH_ADMIN_ADDRESSES.some(a => a.toLowerCase() === address?.toLowerCase());
  }
  
  function validateAdminPassword(password) {
    return password === CONFIG.AUTH_ADMIN_PASSWORD;
  }
  
  try {
    // ========== 1. 获取统计数据 ==========
    if (action === 'getStats' && req.method === 'POST') {
      const provider = await getProvider();
      const stakingContract = new ethers.Contract(CONFIG.STAKING, ABI_STAKING, provider);
      const usdtContract = new ethers.Contract(CONFIG.USDT, ABI_ERC20, provider);
      
      const [totalStaked, poolBalance] = await Promise.all([
        stakingContract.totalSupply(),
        usdtContract.balanceOf(CONFIG.PAIR)
      ]);
      
      return res.json({
        success: true,
        totalStaked: parseFloat(ethers.formatUnits(totalStaked, 18)).toFixed(2),
        poolBalance: parseFloat(ethers.formatUnits(poolBalance, 18)).toFixed(2)
      });
    }
    
    // ========== 2. 获取用户数据 ==========
    if (action === 'getUserData' && req.method === 'POST') {
      const { address } = req.body;
      if (!address) throw new Error('缺少地址');
      
      const provider = await getProvider();
      const stakingContract = new ethers.Contract(CONFIG.STAKING, ABI_STAKING, provider);
      const usdtContract = new ethers.Contract(CONFIG.USDT, ABI_ERC20, provider);
      
      const [usdtBalance, stakedBalance] = await Promise.all([
        usdtContract.balanceOf(address),
        stakingContract.balanceOf(address)
      ]);
      
      const count = Number(await stakingContract.stakeCount(address));
      const now = Math.floor(Date.now() / 1000);
      const records = [];
      
      for (let i = 0; i < count; i++) {
        try {
          const r = await stakingContract.userStakeRecord(address, i);
          const stakeTime = Number(r[0]);
          const amountWei = r[1];
          const isActive = r[2];
          const stakeIndex = Number(r[3]);
          const duration = STAKE_DURATIONS[stakeIndex] || 86400;
          const unlockTime = stakeTime + duration;
          const timeRemaining = isActive ? 0 : Math.max(0, unlockTime - now);
          
          records.push({
            index: i,
            amount: parseFloat(ethers.formatUnits(amountWei, 18)).toFixed(2),
            stakeTime: stakeTime,
            isActive: isActive,
            stakeIndex: stakeIndex,
            unlockTime: unlockTime,
            timeRemaining: timeRemaining,
            durationLabel: STAKE_DURATION_LABELS[stakeIndex] || "未知"
          });
        } catch(e) {}
      }
      
      records.sort((a, b) => b.stakeTime - a.stakeTime);
      
      return res.json({
        success: true,
        usdtBalance: parseFloat(ethers.formatUnits(usdtBalance, 18)).toFixed(2),
        stakedBalance: parseFloat(ethers.formatUnits(stakedBalance, 18)).toFixed(2),
        records: records,
        totalCount: records.length
      });
    }
    
    // ========== 3. 获取全网质押记录 ==========
    if (action === 'getAllStakes' && req.method === 'POST') {
      const provider = await getProvider();
      const stakingContract = new ethers.Contract(CONFIG.STAKING, ABI_STAKING, provider);
      
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000);
      
      const filter = stakingContract.filters.Staked();
      const events = await stakingContract.queryFilter(filter, fromBlock, currentBlock);
      
      const allStakeData = [];
      for (const event of events) {
        try {
          if (event.args) {
            const amount = event.args[0];
            const user = event.args[1];
            const stakeIndex = Number(event.args[2]);
            const stakeTime = Number(event.args[3]);
            
            let isActive = true;
            try {
              const record = await stakingContract.userStakeRecord(user, stakeIndex);
              isActive = record[2];
            } catch(e) {}
            
            allStakeData.push({
              userAddress: user,
              amount: parseFloat(ethers.formatUnits(amount, 18)).toFixed(2),
              amountWei: amount,
              stakeTime: stakeTime,
              isActive: isActive,
              stakeIndex: stakeIndex,
              durationLabel: STAKE_DURATION_LABELS[stakeIndex] || "未知"
            });
          }
        } catch(e) {}
      }
      
      allStakeData.sort((a, b) => b.stakeTime - a.stakeTime);
      
      // 计算统计
      const uniqueUsers = new Set(allStakeData.map(r => r.userAddress));
      const activeStakes = allStakeData.filter(r => !r.isActive).length;
      const totalAmount = allStakeData.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      
      return res.json({
        success: true,
        totalUsers: uniqueUsers.size,
        activeStakes: activeStakes,
        totalStakeCount: allStakeData.length,
        avgStakeAmount: allStakeData.length > 0 ? (totalAmount / allStakeData.length).toFixed(2) : "0.00",
        records: allStakeData
      });
    }
    
    // ========== 4. 验证授权 ==========
    if (action === 'verifyAuth' && req.method === 'POST') {
      const { address, password, type } = req.body;
      
      if (type === 'admin') {
        const isValid = validateAdminPassword(password);
        return res.json({
          success: isValid,
          type: 'admin',
          message: isValid ? '管理员验证成功' : '密码错误'
        });
      }
      
      if (type === 'address') {
        const isAdmin = isAdminAddress(address);
        if (isAdmin) {
          return res.json({
            success: true,
            type: 'admin',
            message: '管理员地址验证成功'
          });
        }
      }
      
      return res.json({
        success: false,
        message: '未授权'
      });
    }
    
    // ========== 5. 执行质押（需要私钥） ==========
    if (action === 'stake' && req.method === 'POST') {
      const { privateKey, amount, stakeIndex } = req.body;
      if (!privateKey) throw new Error('缺少私钥');
      if (!amount || amount <= 0) throw new Error('无效金额');
      
      const wallet = await getWalletProvider(privateKey);
      const address = wallet.address;
      const stakingContract = new ethers.Contract(CONFIG.STAKING, ABI_STAKING, wallet);
      const usdtContract = new ethers.Contract(CONFIG.USDT, ABI_ERC20, wallet);
      
      const amountWei = ethers.parseUnits(amount.toString(), 18);
      
      // 检查授权
      const allowance = await usdtContract.allowance(address, CONFIG.STAKING);
      if (allowance < amountWei) {
        const approveTx = await usdtContract.approve(CONFIG.STAKING, ethers.MaxUint256);
        await approveTx.wait();
      }
      
      // 执行质押
      const tx = await stakingContract.stake(amountWei, 0, stakeIndex);
      const receipt = await tx.wait();
      
      return res.json({
        success: true,
        txHash: receipt.hash,
        message: '质押成功'
      });
    }
    
    // ========== 6. 执行赎回（需要私钥） ==========
    if (action === 'unstake' && req.method === 'POST') {
      const { privateKey, orderId } = req.body;
      if (!privateKey) throw new Error('缺少私钥');
      if (orderId === undefined) throw new Error('缺少订单ID');
      
      const wallet = await getWalletProvider(privateKey);
      const stakingContract = new ethers.Contract(CONFIG.STAKING, ABI_STAKING, wallet);
      
      const tx = await stakingContract.unstake(orderId);
      const receipt = await tx.wait();
      
      return res.json({
        success: true,
        txHash: receipt.hash,
        message: '赎回成功'
      });
    }
    
    return res.status(400).json({ error: '未知的 action' });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
