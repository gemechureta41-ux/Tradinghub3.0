require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.BOT_TOKEN || "8961524303:AAFcln9Hfkmh5_4nA_JoRGdXfpAKRNcNPKA";
const ADMIN_ID = process.env.ADMIN_ID || "5558713786";
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || "-1004305147982";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERROR: SUPABASE_URL and SUPABASE_KEY are required!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// User registration state management in-memory
const userSteps = {};

// Background safe-saver (Non-blocking)
function saveUserData(userId, dataObj) {
    supabase.from('students').upsert({
        telegram_id: userId,
        ...dataObj
    }, { onConflict: 'telegram_id' }).then(({ error }) => {
        if (error) console.error("Supabase Save Error:", error.message);
    }).catch(e => console.error("Supabase Exception:", e));
}

// Helper function to sanitize and validate phone numbers
function normalizePhoneNumber(text) {
    let cleaned = text.replace(/[\s\-\+\(\)]/g, '');
    if (cleaned.startsWith('251')) {
        cleaned = '0' + cleaned.slice(3);
    }
    const phoneRegex = /^(09|07)\d{8}\$/;
    if (phoneRegex.test(cleaned)) {
        return cleaned;
    }
    return null;
}

// ==========================================
// 1. START COMMAND
// ==========================================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = null;

    try {
        const { data: existing } = await supabase
            .from('students')
            .select('*')
            .eq('telegram_id', userId)
            .single();

        if (existing && existing.status === 'Confirmed') {
            return ctx.reply("🎉 Your payment was previously verified! You already have access to the VIP Channel.");
        }
    } catch (err) {
        console.log("New user starting...");
    }

    const welcomeText = `
🔥 <b>WELCOME TO PRICEACTION SMC FX!</b> 🔥

Welcome to our VIP Forex Master Class!

📚 <b>What You Will Learn:</b>
• Price Action Strategies
• Smart Money Concepts (SMC)
• Risk Management Strict Rules
• Trading Psychology & Mindset
• Weekly Live Trading Sessions

💰 <b>Course Fee:</b> 3,599 ETB

To start your registration & payment, click the button below.
`;
    ctx.replyWithHTML(welcomeText, Markup.inlineKeyboard([
        [Markup.button.callback('📝 REGISTER & PAY NOW', 'start_registration')]
    ]));
});

// ==========================================
// 2. REGISTRATION NAVIGATION
// ==========================================
bot.action('start_registration', async (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = { step: 'AWAITING_NAME' };

    saveUserData(userId, { step: 'AWAITING_NAME', status: 'Registering' });

    ctx.replyWithHTML("📝 Please enter your <b>Full Name</b>:", Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel Registration', 'cancel_reg')]
    ]));
});

bot.action('cancel_reg', async (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = null;
    saveUserData(userId, { step: 'CANCELLED' });
    ctx.editMessageText("❌ Your registration has been canceled. Type /start to try again.");
});

bot.action('start_reg_back', async (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = { step: 'AWAITING_NAME' };
    saveUserData(userId, { step: 'AWAITING_NAME' });
    ctx.editMessageText("📝 Please enter your Full Name:");
});

bot.action('back_to_name', async (ctx) => {
    const userId = ctx.from.id;
    if (!userSteps[userId]) userSteps[userId] = {};
    userSteps[userId].step = 'AWAITING_NAME';
    saveUserData(userId, { step: 'AWAITING_NAME' });
    ctx.editMessageText("📝 Please re-enter your Full Name:");
});

bot.action('back_to_txid', async (ctx) => {
    const userId = ctx.from.id;
    if (!userSteps[userId]) userSteps[userId] = {};
    userSteps[userId].step = 'AWAITING_TXID';
    saveUserData(userId, { step: 'AWAITING_TXID' });
    ctx.editMessageText("📝 Please re-enter your payment Transaction ID:");
});

bot.action('back_to_method', async (ctx) => {
    const userId = ctx.from.id;
    if (!userSteps[userId]) userSteps[userId] = {};
    userSteps[userId].step = 'AWAITING_PAYMENT_METHOD';
    saveUserData(userId, { step: 'AWAITING_PAYMENT_METHOD' });
    ctx.editMessageText("💳 Please select your preferred Payment Method for <b>3,599 ETB</b>:", Markup.inlineKeyboard([
        [Markup.button.callback('📲 Telebirr', 'pay_telebirr'), Markup.button.callback('📲 M-Pesa', 'pay_mpesa')],
        [Markup.button.callback('🔙 Back', 'back_to_name')]
    ]));
});

// ==========================================
// 3. TEXT HANDLER (Name, Phone, TxID)
// ==========================================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    let session = userSteps[userId];

    // Fallback check from database if session lost
    if (!session || !session.step) {
        try {
            const { data: dbUser } = await supabase.from('students').select('*').eq('telegram_id', userId).single();
            if (dbUser && dbUser.step) {
                session = { step: dbUser.step, ...dbUser };
                userSteps[userId] = session;
            }
        } catch(e) {}
    }

    if (!session || !session.step) return;

    // STEP 1: Name Input
    if (session.step === 'AWAITING_NAME') {
        if (text.length < 3) {
            return ctx.reply("❌ Please enter a valid full name.");
        }

        userSteps[userId] = { ...userSteps[userId], full_name: text, step: 'AWAITING_PHONE' };
        saveUserData(userId, { full_name: text, step: 'AWAITING_PHONE' });

        return ctx.replyWithHTML("📱 Please enter your <b>Phone Number</b> (e.g., 0912345678 or 0712345678):", Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'start_reg_back')]
        ]));
    }

    // STEP 2: Phone Input
    else if (session.step === 'AWAITING_PHONE') {
        const validPhone = normalizePhoneNumber(text);
        if (!validPhone) {
            return ctx.reply("❌ Invalid phone number! Please enter a valid 10-digit Ethiopian number starting with 09 or 07.");
        }

        userSteps[userId] = { ...userSteps[userId], phone_number: validPhone, step: 'AWAITING_PAYMENT_METHOD' };
        saveUserData(userId, { phone_number: validPhone, step: 'AWAITING_PAYMENT_METHOD' });

        return ctx.replyWithHTML("💳 Please select your preferred <b>Payment Method</b> for the course fee of <b>3,599 ETB</b>:", Markup.inlineKeyboard([
            [Markup.button.callback('📲 Telebirr', 'pay_telebirr'), Markup.button.callback('📲 M-Pesa', 'pay_mpesa')],
            [Markup.button.callback('🔙 Back', 'back_to_name')]
        ]));
    }

    // STEP 3: TxID Input
    else if (session.step === 'AWAITING_TXID') {
        if (text.length < 5) {
            return ctx.reply("❌ Transaction ID is too short. Please enter a valid Transaction ID.");
        }

        userSteps[userId] = { ...userSteps[userId], transaction_id: text, step: 'AWAITING_SCREENSHOT' };
        saveUserData(userId, { transaction_id: text, step: 'AWAITING_SCREENSHOT' });

        return ctx.replyWithHTML("🖼️ Thank you! Now please send an image/photo of your <b>Payment Screenshot</b>:", Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'back_to_txid')]
        ]));
    }
});

// ==========================================
// 4. PAYMENT METHOD SELECTION
// ==========================================
bot.action(['pay_telebirr', 'pay_mpesa'], async (ctx) => {
    const userId = ctx.from.id;
    const method = ctx.match[0] === 'pay_telebirr' ? 'Telebirr' : 'M-Pesa';

    if (!userSteps[userId]) userSteps[userId] = {};
    userSteps[userId].payment_method = method;
    userSteps[userId].step = 'AWAITING_TXID';

    saveUserData(userId, { payment_method: method, step: 'AWAITING_TXID' });

    const paymentInfo = method === 'Telebirr' 
        ? `📲 <b>Telebirr Payment Details:</b>\n• Account Number: <code>0917091612</code>\n• Account Name: <b>Gemechu</b>\n• Price: <b>3,599 ETB</b>`
        : `📲 <b>M-Pesa Payment Details:</b>\n• Account Number: <code>0717120607</code>\n• Account Name: <b>Gemechu</b>\n• Price: <b>3,599 ETB</b>`;

    ctx.replyWithHTML(`${paymentInfo}\n\nAfter completing your payment, please reply below with your <b>Transaction ID</b>:`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back', 'back_to_method')]
    ]));
});

// ==========================================
// 5. SCREENSHOT SUBMISSION
// ==========================================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSteps[userId] || {};

    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "User");

    const fullName = session.full_name || "User";
    const phone = session.phone_number || "N/A";
    const payMethod = session.payment_method || "N/A";
    const txId = session.transaction_id || "N/A";

    saveUserData(userId, {
        username: username,
        screenshot_file_id: photoId,
        status: 'Pending',
        step: 'COMPLETED'
    });

    userSteps[userId] = null;

    ctx.replyWithHTML("⏳ <b>Payment Pending Verification:</b>\nYour payment submission is currently under review. Once approved by the Admin, your VIP access link will be sent automatically!");

    await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
        caption: `📩 <b>NEW PAYMENT SUBMITTED!</b>\n\n👤 <b>Full Name:</b> ${fullName}\n🔗 <b>Username:</b> ${username}\n📱 <b>Phone:</b> ${phone}\n💳 <b>Method:</b> ${payMethod}\n📝 <b>TxID:</b> <code>${txId}</code>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Approve (Confirm)', `approve_${userId}`),
                Markup.button.callback('❌ Reject', `reject_${userId}`)
            ]
        ])
    });
});

// ==========================================
// 6. ADMIN APPROVAL & LINK SENT
// ==========================================
bot.action(/approve_(.+)/, async (ctx) => {
    const userId = ctx.match[1];

    try {
        saveUserData(userId, { status: 'Confirmed' });

        const inviteLink = await ctx.telegram.createChatInviteLink(VIP_CHANNEL_ID, {
            expire_date: Math.floor(Date.now() / 1000) + 86400,
            member_limit: 1
        });

        const successMessage = `
🎉 <b>PAYMENT SUCCESSFUL & CONFIRMED!</b>

Congratulations! Your payment has been successfully verified.

Welcome to <b>PriceAction SMC VIP Master Class</b>!

✅ Registration Completed  
✅ Payment Verified  
✅ VIP Access Ready  

👉 <b>Your VIP Channel Invite Link:</b>
${inviteLink.invite_link}

<i>Note: This link can only be used ONCE. Please join immediately!</i>
`;
        await ctx.telegram.sendMessage(userId, successMessage, { parse_mode: 'HTML' });
        await ctx.editMessageCaption((ctx.callbackQuery.message.caption || "") + "\n\nSTATUS: ✅ <b>CONFIRMED & LINK SENT</b>", { parse_mode: 'HTML' });
    } catch (err) {
        console.error("Approval error:", err);
        ctx.reply("❌ Error approving user. Check if Bot is Admin in VIP Channel!");
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    saveUserData(userId, { status: 'Rejected' });
    await ctx.telegram.sendMessage(userId, "❌ <b>PAYMENT REJECTED!</b>\n\nYour payment could not be verified. Please try again by typing /start.");
    await ctx.editMessageCaption((ctx.callbackQuery.message.caption || "") + "\n\nSTATUS: ❌ <b>REJECTED</b>", { parse_mode: 'HTML' });
});

// ==========================================
// 7. SERVER LAUNCH
// ==========================================
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('PriceAction SMC FX Bot is running 24/7!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
bot.launch();
