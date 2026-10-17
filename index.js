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
    console.error("❌ ERROR: SUPABASE_URL and SUPABASE_KEY environment variables are required!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// 1. WELCOME & START COMMAND
// ==========================================
bot.start(async (ctx) => {
    const userId = ctx.from.id;

    const { data: existing } = await supabase
        .from('students')
        .select('*')
        .eq('telegram_id', userId)
        .single();

    if (existing && existing.status === 'Confirmed') {
        return ctx.reply("🎉 Your payment was previously verified! You already have access to the VIP Channel.");
    }

    const welcomeText = `
🔥 **WELCOME TO PRICEACTION_SMC FX!** 🔥

Welcome to our VIP Forex Master Class!

📚 **What You Will Learn:**
• Price Action Strategies
• Smart Money Concepts (SMC)
• Risk Management Strict Rules
• Trading Psychology & Mindset
• Weekly Live Trading Sessions

To register for our VIP Master Class, click the button below.
`;
    ctx.replyWithMarkdown(welcomeText, Markup.inlineKeyboard([
        [Markup.button.callback('📝 REGISTER NOW', 'start_registration')]
    ]));
});

// ==========================================
// 2. REGISTRATION FLOW & NAVIGATION
// ==========================================
bot.action('start_registration', async (ctx) => {
    const userId = ctx.from.id;

    await supabase.from('students').upsert({
        telegram_id: userId,
        step: 'AWAITING_NAME',
        status: 'Registering'
    }, { onConflict: 'telegram_id' });

    ctx.reply("📝 Please enter your **Full Name**:", Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel Registration', 'cancel_reg')]
    ]));
});

bot.action('cancel_reg', async (ctx) => {
    const userId = ctx.from.id;
    await supabase.from('students').delete().eq('telegram_id', userId);
    ctx.editMessageText("❌ Your registration has been canceled. Type /start to try again.");
});

bot.action('back_to_name', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_NAME' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("📝 Please re-enter your **Full Name**:");
});

bot.action('start_reg_back', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_NAME' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("📝 Please enter your **Full Name**:");
});

bot.action('back_to_txid', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_TXID' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("📝 Please re-enter your payment **Transaction ID**:");
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('telegram_id', userId)
        .single();

    if (!student || !student.step) return;

    if (student.step === 'AWAITING_NAME') {
        if (text.length < 3) {
            return ctx.reply("❌ Please enter a valid full name.");
        }
        await supabase.from('students').update({ full_name: text, step: 'AWAITING_PHONE' }).eq('telegram_id', userId);
        
        return ctx.reply("📱 Please enter your **Phone Number** (e.g., 0912345678):", Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'start_reg_back')]
        ]));
    }
    else if (student.step === 'AWAITING_PHONE') {
        const phoneRegex = /^(09|07)\d{8}$/;
        if (!phoneRegex.test(text)) {
            return ctx.reply("❌ Invalid phone number! Please enter a 10-digit number starting with 09 or 07.");
        }

        await supabase.from('students').update({ phone_number: text, step: 'AWAITING_PAYMENT_METHOD' }).eq('telegram_id', userId);

        return ctx.reply("💳 Please select your preferred **Payment Method**:", Markup.inlineKeyboard([
            [Markup.button.callback('📲 Telebirr', 'pay_telebirr'), Markup.button.callback('📲 M-Pesa', 'pay_mpesa')],
            [Markup.button.callback('🔙 Back', 'back_to_name')]
        ]));
    }
    else if (student.step === 'AWAITING_TXID') {
        if (text.length < 5) {
            return ctx.reply("❌ Transaction ID is too short. Please enter a valid Transaction ID.");
        }

        const { data: existingTx } = await supabase
            .from('students')
            .select('*')
            .eq('transaction_id', text)
            .single();

        if (existingTx) {
            return ctx.reply("⚠️ This Transaction ID has already been registered! Please check and enter the correct Transaction ID.");
        }

        await supabase.from('students').update({ transaction_id: text, step: 'AWAITING_SCREENSHOT' }).eq('telegram_id', userId);

        return ctx.reply("🖼️ Thank you! Now please send an image/photo of your **Payment Screenshot**:", Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'back_to_txid')]
        ]));
    }
});

bot.action('back_to_method', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_PAYMENT_METHOD' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("💳 Please select your preferred **Payment Method**:", Markup.inlineKeyboard([
        [Markup.button.callback('📲 Telebirr', 'pay_telebirr'), Markup.button.callback('📲 M-Pesa', 'pay_mpesa')]
    ]));
});

// ==========================================
// 3. PAYMENT METHOD SELECTION
// ==========================================
bot.action(['pay_telebirr', 'pay_mpesa'], async (ctx) => {
    const userId = ctx.from.id;
    const method = ctx.match[0] === 'pay_telebirr' ? 'Telebirr' : 'M-Pesa';

    await supabase.from('students').update({ 
        payment_method: method, 
        step: 'AWAITING_TXID' 
    }).eq('telegram_id', userId);

    const paymentInfo = method === 'Telebirr' 
        ? `📲 **Telebirr Payment Details:**\n• Account Number: \`0917091612\`\n• Account Name: **Gemechu**\n• Price: **3,599 ETB**`
        : `📲 **M-Pesa Payment Details:**\n• Account Number: \`0717120607\`\n• Account Name: **Gemechu**\n• Price: **3,599 ETB**`;

    ctx.replyWithMarkdown(`\${paymentInfo}\n\nAfter completing your payment, please reply below with your **Transaction ID**:`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back', 'back_to_method')]
    ]));
});

// ==========================================
// 4. SCREENSHOT SUBMISSION & VERIFICATION
// ==========================================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;

    const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('telegram_id', userId)
        .single();

    if (!student || student.step !== 'AWAITING_SCREENSHOT') {
        return ctx.reply("Please complete the initial registration steps first by typing /start.");
    }

    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const username = ctx.from.username ? `@\${ctx.from.username}` : (ctx.from.first_name || "User");

    await supabase.from('students').update({
        username: username,
        screenshot_file_id: photoId,
        status: 'Pending',
        step: 'COMPLETED'
    }).eq('telegram_id', userId);

    ctx.reply("⏳ **Payment Pending:**\nYour payment submission is currently under review. Your Transaction ID and proof of payment will be verified shortly. Once approved by the Admin, your VIP access link will be sent automatically!");

    await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
        caption: `📩 **NEW PAYMENT SUBMITTED FOR VERIFICATION!**\n\n👤 **Full Name:** ${student.full_name}\n🔗 **Username:** ${username}\n📱 **Phone:** ${student.phone_number}\n💳 **Method:** ${student.payment_method}\n📝 **TxID:** \`${student.transaction_id}\``,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Approve (Confirm)', `approve_${userId}`),
                Markup.button.callback('❌ Reject', `reject_${userId}`)
            ]
        ])
    });
});

// ==========================================
// 5. ADMIN APPROVAL & VIP LINK GENERATION
// ==========================================
bot.action(/approve_(.+)/, async (ctx) => {
    const userId = ctx.match[1];

    try {
        await supabase.from('students').update({ status: 'Confirmed' }).eq('telegram_id', userId);

        const inviteLink = await ctx.telegram.createChatInviteLink(VIP_CHANNEL_ID, {
            expire_date: Math.floor(Date.now() / 1000) + 86400,
            member_limit: 1
        });

        const successMessage = `
🎉 **PAYMENT SUCCESSFUL!**

Congratulations!
Your payment has been verified successfully.

Welcome to **PriceAction_SMC VIP Master Class**!

✅ Registration Completed  
✅ Payment Verified  
✅ VIP Access Ready  

👉 **VIP Channel Invite Link:** ${inviteLink.invite_link}

*Learn. Analyze. Trade.*
`;
        await ctx.telegram.sendMessage(userId, successMessage, { parse_mode: 'Markdown' });
        await ctx.editMessageCaption((ctx.callbackQuery.message.caption || "") + "\n\nSTATUS: ✅ **CONFIRMED**", { parse_mode: 'Markdown' });
    } catch (err) {
        console.error(err);
        ctx.reply("❌ Error approving student access.");
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    
    await supabase.from('students').update({ status: 'Rejected' }).eq('telegram_id', userId);
    await ctx.telegram.sendMessage(userId, "❌ **PAYMENT REJECTED!**\n\nYour payment could not be verified in our records. Please make sure to provide a valid Transaction ID and Payment Screenshot by typing /start.");
    await ctx.editMessageCaption((ctx.callbackQuery.message.caption || "") + "\n\nSTATUS: ❌ **REJECTED**", { parse_mode: 'Markdown' });
});

// ==========================================
// 6. EXPRESS SERVER & ADMIN API
// ==========================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('PriceAction SMC FX Bot is running 24/7!');
});

app.get('/admin/stats', async (req, res) => {
    const { data: students, error } = await supabase.from('students').select('*');
    if (error) return res.status(500).json(error);

    const stats = {
        total_registered_students: students.length,
        total_confirmed_payments: students.filter(s => s.status === 'Confirmed').length,
        pending_payments: students.filter(s => s.status === 'Pending').length,
        rejected_payments: students.filter(s => s.status === 'Rejected').length,
        telebirr_payments: students.filter(s => s.payment_method === 'Telebirr').length,
        mpesa_payments: students.filter(s => s.payment_method === 'M-Pesa').length
    };

    res.json(stats);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
bot.launch();
