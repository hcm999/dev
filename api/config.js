// api/config.js
export const CONFIG = {
    STAKING: "0x72212F35aC448FE7763aA1BFdb360193Fa098E52",
    LP_POOL: "0xa2f464a2462aed49b9b31eb8861bc6b0bbb0483f",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    
    KV: {
        ADDRESS_KEY_PREFIX: 'address_list',
        LAST_UPDATE_PREFIX: 'last_update'
    },
    
    PROJECTS: ['alfa', 'gana', 'vd', 'atm', 'atmvip', 'dev'],
    
    // ✅ DEV 展示端访问控制
    DEV_ACCESS: {
        PASSWORD: 'dev-2025',
        RECEIVE_WALLET: '0x61431FCf367332F403742Bcc5cC32916141c8888',
        PRICE: {
            SINGLE: 5,
            MONTHLY: 15,
        },
        DURATION: {
            SINGLE: 86400,
            MONTHLY: 2592000,
        },
        CONTACT: {
            TG: '',
            WECHAT: '',
            QQ: '3751235417'
        }
    },
    
    ADMIN_TOKEN: 'dev-admin-2025-xK9mN2pQ7vL4bR8jH3fT6yW1sA5cD0eZ'
};

export const USDT_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];
