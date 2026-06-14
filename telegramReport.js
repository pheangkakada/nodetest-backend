require("dotenv").config();

const TELEGRAM_REPORT_BOT_TOKEN =
    process.env.TELEGRAM_REPORT_BOT_TOKEN;

const TELEGRAM_REPORT_CHAT_ID =
    process.env.TELEGRAM_REPORT_CHAT_ID;

/**
 * Send Daily Shift Report to Telegram
 * @param {Array} invoices
 */
async function sendDailyReport(invoices) {
    if (
        !TELEGRAM_REPORT_BOT_TOKEN ||
        !TELEGRAM_REPORT_CHAT_ID
    ) {
        console.log("⚠️ Telegram report credentials missing");
        return;
    }

    // Filter only paid invoices
    const paidInvoices = invoices.filter(
        (inv) => inv.status === "paid"
    );

    const totalOrders = paidInvoices.length;

    // Cashier / shift owner
    const shiftOwner =
        invoices.length > 0
            ? invoices[0].createdBy || "Staff"
            : "N/A";

    // No sales today
    if (totalOrders === 0) {
        await sendToTelegram(`
📊 <b>SHIFT SALES REPORT</b>
👤 <b>Cashier:</b> ${shiftOwner}
📅 <b>Date:</b> ${new Date().toLocaleDateString()}
━━━━━━━━━━━━━━━━━━━━
<i>No completed sales for this shift.</i>
        `);

        return;
    }

    // Totals
    let totalRevenue = 0;
    let totalDiscount = 0;

    let cashTotal = 0;
    let cardTotal = 0;
    let deliveryTotal = 0;

    const itemCounts = {};

    paidInvoices.forEach((inv) => {
        const invoiceNet = parseFloat(inv.total || 0);

        const invoiceSub = parseFloat(
            inv.subtotal || invoiceNet
        );

        totalRevenue += invoiceNet;

        // Discount calculation
        totalDiscount += invoiceSub - invoiceNet;

        // Payment method grouping
        const method = (
            inv.paymentMethod || "cash"
        ).toLowerCase();

        if (method === "cash") {
            cashTotal += invoiceNet;
        } else if (
            method === "card" ||
            method === "aba"
        ) {
            cardTotal += invoiceNet;
        } else {
            deliveryTotal += invoiceNet;
        }

        // Count sold items
        if (inv.items) {
            inv.items.forEach((item) => {
                const qty = item.quantity || 1;

                itemCounts[item.name] =
                    (itemCounts[item.name] || 0) + qty;
            });
        }
    });

    // Top 5 items
    const topItemsText = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
            ([name, qty]) =>
                `▫️ ${name}: <b>${qty} sold</b>`
        )
        .join("\n");

    // Date formatting
    const dateStr = new Date().toLocaleDateString(
        "en-US",
        {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        }
    );

    // Final Telegram message
    const message = `
📊 <b>SHIFT SALES REPORT</b> 📊
👤 <b>Cashier:</b> ${shiftOwner}
📅 <b>Date:</b> ${dateStr}

━━━━━━━━━━━━━━━━━━━━
💰 <b>Net Revenue:</b>
<code>$${totalRevenue.toFixed(2)}</code>

🎁 <b>Discounts:</b>
<code>-$${totalDiscount.toFixed(2)}</code>

🧾 <b>Total Orders:</b>
<code>${totalOrders}</code>

━━━━━━━━━━━━━━━━━━━━
💵 <b>Cash:</b>
<code>$${cashTotal.toFixed(2)}</code>

💳 <b>ABA/Card:</b>
<code>$${cardTotal.toFixed(2)}</code>

🛵 <b>Delivery:</b>
<code>$${deliveryTotal.toFixed(2)}</code>

━━━━━━━━━━━━━━━━━━━━
🏆 <b>TOP 5 ITEMS:</b>

${topItemsText || "<i>No item data</i>"}
`.trim();

    // Send message
    await sendToTelegram(message);
}

/**
 * Send Telegram Message
 */
async function sendToTelegram(htmlMessage) {
    const url = `https://api.telegram.org/bot${TELEGRAM_REPORT_BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_REPORT_CHAT_ID,
                text: htmlMessage,
                parse_mode: "HTML",
            }),
        });

        if (response.ok) {
            console.log(
                "✅ Shift report sent to Telegram"
            );
        } else {
            const errorData = await response.json();

            console.error(
                "❌ Telegram API Error:",
                errorData
            );
        }
    } catch (error) {
        console.error(
            "❌ Failed to connect to Telegram:",
            error
        );
    }
}

module.exports = { sendDailyReport };
