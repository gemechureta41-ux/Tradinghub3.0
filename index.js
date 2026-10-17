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

To register for our VIP Master Class, click the button below.
`;
    ctx.replyWithHTML(welcomeText, Markup.inlineKeyboard([
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

    ctx.replyWithHTML("📝 Please enter your <b>Full Name</b>:", Markup.inlineKeyboard([
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
    ctx.editMessageText("📝 Please re-enter your Full Name:");
});

bot.action('start_reg_back', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_NAME' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("📝 Please enter your Full Name:");
});

bot.action('back_to_txid', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_TXID' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("📝 Please re-enter your payment Transaction ID:");
});

bot.action('back_to_method', async (ctx) => {
    await supabase.from('students').update({ step: 'AWAITING_PAYMENT_METHOD' }).eq('telegram_id', ctx.from.id);
    ctx.editMessageText("💳 Please select your preferred Payment Method:", Markup.inlineKeyboard([
        [Markup.button.callback('📲 Telebirr', 'pay_telebirr'), Markup.button.callback('📲 M-Pesa', 'pay_mpesa')],
        [Markup.button.callback('🔙 Back', 'back_to_name')]
    ]));
});

// ==========================================
// 3. TEXT INPUT HANDLER (Name, Phone, TxID)
// ==========================================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    try {
        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('*')
            .eq('telegram_id', userId)
            .single();

        if (fetchErr || !student || !student.step) return;

        // STEP 1: Full Name
        if (student.step === 'AWAITING_NAME') {
            if (text.length < 3) {
                return ctx.reply("❌ Please enter a valid full name.");
            }

            const { error: updateErr } = await supabase
                .from('students')
                .update({ full_name: text, step: 'AWAITING_PHONE' })
                .eq('telegram_id', userId);

            if (updateErr) {
                console.error("Database error updating name:", updateErr);
                return ctx.reply("❌ Error saving name. Please try /start again.");
            }
            
            return ctx.replyWithHTML("📱 Please enter your <b>Phone Number</b> (e.g., 0912345678 or 0712345678):", Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back', 'start_reg_back')]
            ]));
        }

        // STEP 2: Phone Number
        else if (student.step === 'AWAITING_PHONE') {
            const phoneRegex = /^(09|07)\d{8}\$/;
            if (!phoneRegex.test(text)) {
                return ctx.reply("❌ Invalid phone number! Please enter a 10-digit number starting with 09 or 07.");
            }

            await supabase.from('students').update({ phone_number: text, step: 'AWAITING_PAYMENT_METHOD' }).eq('telegram_id', userId);

            return ctx.replyWithHTML("💳 Please select your preferred <b>Payment Method</b> for the course fee of <b>3,599 ETB</b>:", Markup.inlineKeyboard([
                [Markup.button.callback('📲 Telebirr', 'pay_telebirr'), Markup.button.callback('📲 M-Pesa', 'pay_mpesa')],
                [Markup.button.callback('🔙 Back', 'back_to_name')]
            ]));
        }

        // STEP 3: Transaction ID
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

            return ctx.replyWithHTML("🖼️ Thank you! Now please send an image/photo of your <b>Payment Screenshot</b>:", Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back', 'back_to_txid')]
            ]));
        }
    } catch (err) {
        console.error("Error in text handler:", err);
    }
});

// ==========================================
// 4. PAYMENT METHOD SELECTION
// ==========================================
bot.action(['pay_telebirr', 'pay_mpesa'], async (ctx) => {
    const userId = ctx.from.id;
    const method = ctx.match[0] === 'pay_telebirr' ? 'Telebirr' : 'M-Pesa';

    await supabase.from('students').update({ 
        payment_method: method, 
        step: 'AWAITING_TXID' 
    }).eq('telegram_id', userId);

    const paymentInfo = method === 'Telebirr' 
        ? `📲 <b>Telebirr Payment Details:</b>\n• Account Number: <code>0917091612</code>\n• Account Name: <b>Gemechu</b>\n• Price: <b>3,599 ETB</b>`
        : `📲 <b>M-Pesa Payment Details:</b>\n• Account Number: <code>0717120607</code>\n• Account Name: <b>Gemechu</b>\n• Price: <b>3,599 ETB</b>`;

    ctx.replyWithHTML(`${paymentInfo}\n\nAfter completing your payment, please reply below with your <b>Transaction ID</b>:`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back', 'back_to_method')]
    ]));
});

// ==========================================
// 5. SCREENSHOT SUBMISSION & VERIFICATION
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
    const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "User");

    await supabase.from('students').update({
        username: username,
        screenshot_file_id: photoId,
        status: 'Pending',
        step: 'COMPLETED'
    }).eq('telegram_id', userId);

    ctx.replyWithHTML("⏳ <b>Payment Pending:</b>\nYour payment submission is currently under review. Your Transaction ID and proof of payment will be verified shortly. Once approved by the Admin, your VIP access link will be sent automatically!");

    await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
        caption: `📩 <b>NEW PAYMENT SUBMITTED FOR VERIFICATION!</b>\n\n👤 <b>Full Name:</b> ${student.full_name}\n🔗 <b>Username:</b> ${username}\n📱 <b>Phone:</b> ${student.phone_number}\n💳 <b>Method:</b> ${student.payment_method}\n📝 <b>TxID:</b> <code>${student.transaction_id}</code>`,
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
// 6. ADMIN APPROVAL & ONE-TIME VIP LINK GENERATION
// ==========================================
bot.action(/approve_(.+)/, async (ctx) => {
    const userId = ctx.match[1];

    try {
        await supabase.from('students').update({ status: 'Confirmed' }).eq('telegram_id', userId);

        // Single-use invite link generation (1-time use only)
        const inviteLink = await ctx.telegram.createChatInviteLink(VIP_CHANNEL_ID, {
            expire_date: Math.floor(Date.now() / 1000) + 86400, // 24 hours validity
            member_limit: 1 // Single-use constraint
        });

        const successMessage = `
🎉 <b>PAYMENT SUCCESSFUL & CONFIRMED!</b>

Congratulations!
Your payment has been successfully verified.

Welcome to <b>PriceAction SMC VIP Master Class</b>!

✅ Registration Completed  
✅ Payment Verified  
✅ VIP Access Ready  

👉 <b>One-Time VIP Channel Invite Link:</b>
${inviteLink.invite_link}

<i>Note: This link can only be used ONCE. Please join immediately!</i>

<i>Learn. Analyze. Trade.</i>
`;
        await ctx.telegram.sendMessage(userId, successMessage, { parse_mode: 'HTML' });
        await ctx.editMessageCaption((ctx.callbackQuery.message.caption || "") + "\n\nSTATUS: ✅ <b>CONFIRMED (Approved & Link Sent)</b>", { parse_mode: 'HTML' });
    } catch (err) {
        console.error("Approval error:", err);
        ctx.reply("❌ Error approving student access. Make sure the Bot is an Admin in the VIP Channel with 'Invite Users via Link' permission!");
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    
    await supabase.from('students').update({ status: 'Rejected' }).eq('telegram_id', userId);
    await ctx.telegram.sendMessage(userId, "❌ <b>PAYMENT REJECTED!</b>\n\nYour payment could not be verified in our records. Please make sure to provide a valid Transaction ID and Payment Screenshot by typing /start.");
    await ctx.editMessageCaption((ctx.callbackQuery.message.caption || "") + "\n\nSTATUS: ❌ <b>REJECTED</b>", { parse_mode: 'HTML' });
});

// ==========================================
// 7. EXPRESS SERVER
// ==========================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('PriceAction SMC FX Bot is running 24/7!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
bot.launch();
