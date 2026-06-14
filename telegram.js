require("dotenv").config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Formats and sends a clean invoice notification to Telegram
 */
async function sendInvoiceNotification(invoice) {
    if (!TELEGRAM_CHAT_ID || !TELEGRAM_BOT_TOKEN) {
        console.log("⚠️ Telegram credentials missing");
        return;
    }

    // Format items
    let itemsText = '';

    if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach((item) => {
            const itemQty = item.quantity || 1;
            const lineTotal = ((item.price || 0) * itemQty).toFixed(2);

            itemsText += `▫️ <b>${itemQty}x</b> ${item.name} — <code>$${lineTotal}</code>\n`;
        });
    } else {
        itemsText = '<i>No items</i>\n';
    }

    // Safe values
    const subtotal = invoice.subtotal || invoice.total || 0;
    const discount = invoice.discount || 0;
    const total = invoice.total || 0;
    const cashier = invoice.createdBy || 'Staff';
    const invoiceId = invoice.invoiceId || invoice._id || 'N/A';

    const orderType = invoice.table
        ? `Table ${invoice.table}`
        : 'Takeaway';

    // Payment method formatting
    let payment = invoice.paymentMethod || 'Cash';

    if (payment.toLowerCase() === 'card') {
        payment = 'ABA / Card';
    } else {
        payment =
            payment.charAt(0).toUpperCase() +
            payment.slice(1);
    }

    // Telegram message
    const message = `
🟢 <b>NEW ORDER: #${invoiceId}</b>
━━━━━━━━━━━━━━━━━━━━
🍽 <b>Type:</b> ${orderType}
💳 <b>Payment:</b> ${payment}
👤 <b>Cashier:</b> ${cashier}

🛒 <b>ITEMS:</b>
${itemsText}
━━━━━━━━━━━━━━━━━━━━
🧾 Subtotal:  <code>$${subtotal.toFixed(2)}</code>
🎁 Discount: <code>-$${discount.toFixed(2)}</code>
💰 <b>TOTAL:</b>   <code>$${total.toFixed(2)}</code>
`.trim();

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
            }),
        });

        if (response.ok) {
            console.log(`✅ Invoice #${invoiceId} sent to Telegram`);
        } else {
            const errorData = await response.json();
            console.error("❌ Telegram API Error:", errorData);
        }
    } catch (error) {
        console.error("❌ Failed to connect to Telegram:", error);
    }
}

module.exports = { sendInvoiceNotification };
