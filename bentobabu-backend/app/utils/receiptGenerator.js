const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

/**
 * Format a Date object or ISO string to Indian Standard Time (Asia/Kolkata)
 */
function formatDateTime(dateInput) {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(dateInput) {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateInput) {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatBusinessPhone(rawPhone) {
  if (!rawPhone) return '+91 8584085669';
  const str = String(rawPhone).trim();
  // Strip duplicate leading +91 / 91
  const cleaned = str.replace(/^(\+?91[\s-]*)*/, '').trim();
  return `+91 ${cleaned || '8584085669'}`;
}

function formatCurrency(amount) {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `Rs. ${num.toFixed(2)}`;
}

/**
 * Generate a professional, branded PDF receipt buffer for a BentoBabu order.
 *
 * @param {Object} order - The populated Order document/object
 * @param {Object} settings - Merged business settings from AdminSettingsController
 * @returns {Promise<Buffer>}
 */
function generateOrderReceiptPdf(order, settings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
        info: {
          Title: `BentoBabu Receipt - ${order.orderNumber || order.id || 'Order'}`,
          Author: 'BentoBabu Central Kitchen',
          Subject: `Order Receipt for ${order.orderNumber}`,
          Keywords: 'BentoBabu, Receipt, Food Order, Healthy Bento',
          CreationDate: new Date(),
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Merge authoritative settings with immutable order receipt snapshot if present
      const snap = order.receipt && order.receipt.snapshot ? order.receipt.snapshot : {};

      let rawAddress =
        snap.businessAddress ||
        settings.BUSINESS_ADDRESS ||
        settings.KITCHEN_ADDRESS ||
        'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India';
      if (rawAddress.includes('700120')) {
        rawAddress = rawAddress.replace('700120', '700122');
      }

      let rawEmail = snap.supportEmail || settings.SUPPORT_EMAIL || 'bentobabuofficial@gmail.com';
      if (rawEmail === 'care@bentobabu.in' || rawEmail === 'support@bentobabu.in') {
        rawEmail = 'bentobabuofficial@gmail.com';
      }

      let rawPhone = snap.supportPhone || settings.SUPPORT_PHONE || '+91 8584085669';
      if (rawPhone.includes('98765') || rawPhone.includes('99999')) {
        if (!snap.supportPhone) {
          rawPhone = '+91 8584085669';
        }
      }
      const formattedPhone = formatBusinessPhone(rawPhone);

      let rawWebsite = snap.websiteUrl || settings.WEBSITE_URL || 'https://bentobabu.com';
      if (rawWebsite.includes('bentobabu.in')) {
        rawWebsite = rawWebsite.replace('bentobabu.in', 'bentobabu.com');
      }

      const activeSettings = {
        BUSINESS_NAME: snap.businessName || settings.BUSINESS_NAME || 'BentoBabu Central Kitchen',
        BUSINESS_ADDRESS: rawAddress,
        SUPPORT_EMAIL: rawEmail,
        SUPPORT_PHONE: formattedPhone,
        WEBSITE_URL: rawWebsite,
        FSSAI_STATUS: snap.fssaiStatus || settings.FSSAI_STATUS || 'APPLICATION_SUBMITTED',
        FSSAI_NUMBER:
          snap.fssaiNumber !== undefined && snap.fssaiNumber !== null
            ? String(snap.fssaiNumber).trim()
            : settings.FSSAI_NUMBER
            ? String(settings.FSSAI_NUMBER).trim()
            : '',
        GSTIN:
          snap.gstin !== undefined && snap.gstin !== null
            ? String(snap.gstin).trim()
            : settings.GSTIN
            ? String(settings.GSTIN).trim()
            : '',
      };

      const pageWidth = 595.28;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2; // 515.28

      // Palette
      const COLOR_PRIMARY = '#2B432B'; // Rich BentoBabu Forest Green
      const COLOR_ACCENT = '#966E38'; // Muted Gold / Warm Ochre
      const COLOR_TEXT = '#1E2B1E'; // Dark Charcoal
      const COLOR_MUTED = '#5A685A'; // Muted Slate Green
      const COLOR_BORDER = '#E2DCBE'; // Subtle Cream Border
      const COLOR_LIGHT_BG = '#F7F4EB'; // Light Ivory / Cream Background
      const COLOR_WHITE = '#FFFFFF';

      // 1. HEADER SECTION
      // ----------------------------------------------------
      const logoPaths = [
        path.join(__dirname, '../assets/bentobabu_logo.png'),
        path.join(__dirname, '../../../bentobabu-frontend/public/bentobabu_logo.png'),
        path.join(__dirname, '../../../bentobabu-admin/public/bentobabu_logo.png'),
      ];

      let logoLoaded = false;
      for (const p of logoPaths) {
        if (fs.existsSync(p)) {
          try {
            doc.image(p, margin, 40, { width: 130 });
            logoLoaded = true;
            break;
          } catch (e) {
            // Ignore logo read error, fall through to text branding
          }
        }
      }

      if (!logoLoaded) {
        doc
          .font('Helvetica-Bold')
          .fontSize(22)
          .fillColor(COLOR_PRIMARY)
          .text('BentoBabu', margin, 40);
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(COLOR_ACCENT)
          .text('Good Food. Better Living.', margin, 68);
      } else {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(COLOR_ACCENT)
          .text('Good Food. Better Living.', margin, 114, { width: 130, align: 'center' });
      }

      // Top Right: Document Title & Meta
      const hasGst = Boolean(activeSettings.GSTIN && String(activeSettings.GSTIN).trim());
      const docTitle = hasGst ? 'TAX INVOICE / RECEIPT' : 'ORDER RECEIPT';

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(COLOR_PRIMARY)
        .text(docTitle, margin, 40, { align: 'right', width: contentWidth });

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(COLOR_TEXT)
        .text(`Order #: ${order.orderNumber || order.id}`, margin, 62, {
          align: 'right',
          width: contentWidth,
        });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(COLOR_MUTED)
        .text(`Order Placed: ${formatDateTime(order.createdAt)}`, margin, 78, {
          align: 'right',
          width: contentWidth,
        })
        .text(`Receipt Generated: ${formatDateTime(new Date())}`, margin, 91, {
          align: 'right',
          width: contentWidth,
        });

      // Horizontal separator
      let currentY = 136;
      doc
        .strokeColor(COLOR_BORDER)
        .lineWidth(1)
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .stroke();

      currentY += 15;

      // 2. TWO-COLUMN ADDRESS & DETAILS BLOCK
      // ----------------------------------------------------
      const colWidth = (contentWidth - 20) / 2; // ~247.6
      const leftColX = margin;
      const rightColX = margin + colWidth + 20;

      // Left Column: Business & Kitchen Information
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(COLOR_PRIMARY)
        .text('BUSINESS & KITCHEN HUB', leftColX, currentY);

      let bY = currentY + 16;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLOR_TEXT)
        .text(activeSettings.BUSINESS_NAME || 'BentoBabu Central Kitchen', leftColX, bY);

      bY += 13;
      const kitchenAddress =
        activeSettings.BUSINESS_ADDRESS ||
        'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India';

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(COLOR_MUTED)
        .text(kitchenAddress, leftColX, bY, { width: colWidth, lineGap: 1.5 });

      bY = doc.y + 4;
      const supportEmail = activeSettings.SUPPORT_EMAIL || 'bentobabuofficial@gmail.com';
      const supportPhone = activeSettings.SUPPORT_PHONE;
      const website = activeSettings.WEBSITE_URL || 'https://bentobabu.com';

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLOR_MUTED)
        .text(`Email: ${supportEmail}`, leftColX, bY)
        .text(`Phone: ${supportPhone}`, leftColX, doc.y + 2)
        .text(`Web: ${website}`, leftColX, doc.y + 2);

      bY = doc.y + 8;

      // FSSAI compliance information
      const fssaiStatus = activeSettings.FSSAI_STATUS || 'APPLICATION_SUBMITTED';
      const fssaiNumber = activeSettings.FSSAI_NUMBER ? String(activeSettings.FSSAI_NUMBER).trim() : '';

      if (fssaiStatus === 'APPROVED' && fssaiNumber) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLOR_PRIMARY)
          .text(`FSSAI Lic. No: ${fssaiNumber}`, leftColX, bY);
        bY += 12;
      } else if (fssaiStatus === 'APPLICATION_SUBMITTED') {
        doc
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor(COLOR_ACCENT)
          .text('FSSAI: Application Submitted (Reg. In Progress)', leftColX, bY);
        bY += 12;
      }

      if (hasGst) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLOR_TEXT)
          .text(`GSTIN: ${activeSettings.GSTIN}`, leftColX, bY);
        bY += 12;
      }

      // Right Column: Customer & Delivery Details
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(COLOR_PRIMARY)
        .text('DELIVER TO', rightColX, currentY);

      let cY = currentY + 16;
      const addr = order.deliveryAddress || {};
      const customerName = addr.fullName || 'Valued Customer';
      const customerPhone = addr.phone || '';

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLOR_TEXT)
        .text(customerName, rightColX, cY);

      cY += 13;
      if (customerPhone) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(COLOR_MUTED)
          .text(`Phone: ${customerPhone}`, rightColX, cY);
        cY += 11;
      }

      const formattedAddr = [
        addr.addressLine,
        addr.landmark ? `Near ${addr.landmark}` : null,
        `${addr.city || 'Barrackpore'}, ${addr.state || 'West Bengal'} - ${addr.pincode || '700122'}`,
      ]
        .filter(Boolean)
        .join(', ');

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(COLOR_MUTED)
        .text(formattedAddr, rightColX, cY, { width: colWidth, lineGap: 1.5 });

      cY = doc.y + 4;
      if (order.deliverySlot && typeof order.deliverySlot === 'object') {
        const slotLabel = order.deliverySlot.label || `${order.deliverySlot.startTime || ''} - ${order.deliverySlot.endTime || ''}`;
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLOR_MUTED)
          .text(`Slot: ${slotLabel}`, rightColX, cY);
        cY += 11;
      }

      // Advance Y past both columns
      currentY = Math.max(bY, cY) + 12;

      // Horizontal separator
      doc
        .strokeColor(COLOR_BORDER)
        .lineWidth(1)
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .stroke();

      currentY += 14;

      // 3. ITEMIZED ORDER ITEMS TABLE
      // ----------------------------------------------------
      const colItemX = margin;
      const colItemW = 265;
      const colQtyX = colItemX + colItemW;
      const colQtyW = 45;
      const colPriceX = colQtyX + colQtyW;
      const colPriceW = 95;
      const colTotalX = colPriceX + colPriceW;
      const colTotalW = 110.28;

      // Table Header Bar
      const tableHeaderHeight = 22;
      doc
        .rect(margin, currentY, contentWidth, tableHeaderHeight)
        .fillColor(COLOR_PRIMARY)
        .fill();

      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(COLOR_WHITE)
        .text('ITEM DESCRIPTION', colItemX + 8, currentY + 6, { width: colItemW - 8 })
        .text('QTY', colQtyX, currentY + 6, { width: colQtyW, align: 'center' })
        .text('UNIT PRICE', colPriceX, currentY + 6, { width: colPriceW - 10, align: 'right' })
        .text('TOTAL', colTotalX, currentY + 6, { width: colTotalW - 10, align: 'right' });

      currentY += tableHeaderHeight;

      // Table Rows
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item, idx) => {
        // Page break check
        if (currentY > 700) {
          doc.addPage();
          currentY = 40;
          // Redraw table header on new page
          doc
            .rect(margin, currentY, contentWidth, tableHeaderHeight)
            .fillColor(COLOR_PRIMARY)
            .fill();
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor(COLOR_WHITE)
            .text('ITEM DESCRIPTION', colItemX + 8, currentY + 6, { width: colItemW - 8 })
            .text('QTY', colQtyX, currentY + 6, { width: colQtyW, align: 'center' })
            .text('UNIT PRICE', colPriceX, currentY + 6, { width: colPriceW - 10, align: 'right' })
            .text('TOTAL', colTotalX, currentY + 6, { width: colTotalW - 10, align: 'right' });
          currentY += tableHeaderHeight;
        }

        const isEven = idx % 2 === 1;
        const rowHeight = 22;

        if (isEven) {
          doc
            .rect(margin, currentY, contentWidth, rowHeight)
            .fillColor(COLOR_LIGHT_BG)
            .fill();
        }

        const itemName = item.productName || 'Bento Meal';
        const itemQty = item.quantity || 1;
        const itemUnitPrice = Number(item.unitPrice || 0);
        const itemSubtotal = Number(item.subtotal || itemUnitPrice * itemQty);

        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(COLOR_TEXT)
          .text(itemName, colItemX + 8, currentY + 6, { width: colItemW - 16, ellipsis: true })
          .text(String(itemQty), colQtyX, currentY + 6, { width: colQtyW, align: 'center' })
          .text(formatCurrency(itemUnitPrice), colPriceX, currentY + 6, { width: colPriceW - 10, align: 'right' })
          .font('Helvetica-Bold')
          .text(formatCurrency(itemSubtotal), colTotalX, currentY + 6, { width: colTotalW - 10, align: 'right' });

        // Thin row bottom border
        doc
          .strokeColor(COLOR_BORDER)
          .lineWidth(0.5)
          .moveTo(margin, currentY + rowHeight)
          .lineTo(pageWidth - margin, currentY + rowHeight)
          .stroke();

        currentY += rowHeight;
      });

      currentY += 12;

      // 4. SUMMARY & PAYMENT VERIFICATION SECTION
      // ----------------------------------------------------
      if (currentY > 640) {
        doc.addPage();
        currentY = 40;
      }

      const summaryYStart = currentY;
      const leftBoxWidth = 240;
      const rightBoxWidth = 245;
      const rightBoxX = pageWidth - margin - rightBoxWidth;

      // Left Box: Payment Details & Status
      const leftBoxHeight = 138;
      doc
        .rect(margin, summaryYStart, leftBoxWidth, leftBoxHeight)
        .fillColor(COLOR_LIGHT_BG)
        .strokeColor(COLOR_BORDER)
        .lineWidth(1)
        .fillAndStroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLOR_PRIMARY)
        .text('PAYMENT & TRANSACTION DETAILS', margin + 12, summaryYStart + 10);

      let payY = summaryYStart + 26;
      const isCod = order.paymentMethod === 'COD';
      const paymentMethodLabel = isCod ? 'CASH ON DELIVERY (COD)' : 'RAZORPAY ONLINE';
      const paymentStatus = order.paymentStatus || (isCod ? 'COD_PENDING' : 'PENDING');
      const isPaid = paymentStatus === 'PAID';

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(COLOR_MUTED)
        .text('Payment Method:', margin + 12, payY)
        .font('Helvetica-Bold')
        .fillColor(COLOR_TEXT)
        .text(paymentMethodLabel, margin + 85, payY);

      payY += 13;
      let statusColor = COLOR_PRIMARY;
      if (paymentStatus === 'PAID') statusColor = '#1B6B2B';
      else if (paymentStatus === 'FAILED' || paymentStatus === 'REFUND_FAILED') statusColor = '#A82525';
      else if (paymentStatus.includes('REFUND')) statusColor = '#8A5816';
      else if (paymentStatus === 'PENDING' || paymentStatus === 'COD_PENDING') statusColor = '#8C713B';

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(COLOR_MUTED)
        .text('Payment Status:', margin + 12, payY)
        .font('Helvetica-Bold')
        .fillColor(statusColor)
        .text(paymentStatus.replace(/_/g, ' '), margin + 85, payY);

      payY += 13;
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(COLOR_MUTED)
        .text('Order Status:', margin + 12, payY)
        .font('Helvetica-Bold')
        .fillColor(COLOR_PRIMARY)
        .text(String(order.orderStatus || 'CONFIRMED').replace(/_/g, ' '), margin + 85, payY);

      payY += 13;
      const pDetails = order.paymentDetails || {};
      if (!isCod) {
        if (pDetails.razorpayPaymentId) {
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLOR_MUTED)
            .text('Transaction ID:', margin + 12, payY)
            .font('Helvetica-Bold')
            .fillColor(COLOR_TEXT)
            .text(pDetails.razorpayPaymentId, margin + 85, payY, { width: leftBoxWidth - 95, ellipsis: true });
          payY += 12;
        } else if (isPaid) {
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLOR_MUTED)
            .text('Transaction ID:', margin + 12, payY)
            .font('Helvetica-Bold')
            .fillColor(COLOR_TEXT)
            .text('Online Payment Verified', margin + 85, payY);
          payY += 12;
        } else {
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLOR_MUTED)
            .text('Transaction ID:', margin + 12, payY)
            .font('Helvetica-Oblique')
            .fillColor(COLOR_MUTED)
            .text('Not Applicable (Pending / Failed)', margin + 85, payY);
          payY += 12;
        }

        if (pDetails.razorpayOrderId) {
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor(COLOR_MUTED)
            .text(`Razorpay Order ID: ${pDetails.razorpayOrderId}`, margin + 12, payY, { width: leftBoxWidth - 24, ellipsis: true });
          payY += 11;
        }
      } else {
        // COD Orders: NEVER invent a transaction ID
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(COLOR_MUTED)
          .text('Transaction ID:', margin + 12, payY)
          .font('Helvetica')
          .fillColor(COLOR_TEXT)
          .text('Cash on Delivery', margin + 85, payY);
        payY += 12;

        const codNotice = isPaid
          ? 'Cash collected and verified upon delivery.'
          : 'Payment to be collected by rider upon delivery.';
        doc
          .font('Helvetica-Oblique')
          .fontSize(7)
          .fillColor(COLOR_MUTED)
          .text(codNotice, margin + 12, payY, { width: leftBoxWidth - 24 });
        payY += 11;
      }

      // Payment Timestamp (IST) derived strictly from verified database records
      let paymentTimestamp = null;
      if (isPaid) {
        if (isCod) {
          paymentTimestamp = pDetails.collectedAt || pDetails.cashCollection?.collectedAt;
          if (!paymentTimestamp && Array.isArray(order.statusHistory)) {
            const deliveredEntry = order.statusHistory.find((s) => s.status === 'DELIVERED');
            if (deliveredEntry && deliveredEntry.changedAt) paymentTimestamp = deliveredEntry.changedAt;
          }
        } else {
          paymentTimestamp = pDetails.paidAt;
          if (!paymentTimestamp && Array.isArray(order.statusHistory)) {
            const confirmedEntry = order.statusHistory.find((s) => s.status === 'CONFIRMED');
            if (confirmedEntry && confirmedEntry.changedAt) paymentTimestamp = confirmedEntry.changedAt;
          }
        }
        if (!paymentTimestamp) {
          paymentTimestamp = order.updatedAt || order.createdAt;
        }

        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(COLOR_MUTED)
          .text(`Paid: ${formatDateTime(paymentTimestamp)} (IST)`, margin + 12, payY);
        payY += 11;
      } else {
        const pendingNote = isCod ? 'Payment: Pending Collection (On Delivery)' : 'Payment: Pending / Incomplete';
        doc
          .font('Helvetica-Oblique')
          .fontSize(7)
          .fillColor(COLOR_MUTED)
          .text(pendingNote, margin + 12, payY);
        payY += 11;
      }

      if (order.cancellationReason || order.orderStatus === 'CANCELLED') {
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor('#A82525')
          .text(
            `Notice: Order Cancelled${order.cancellationReason ? ` (${order.cancellationReason})` : ''}`,
            margin + 12,
            payY,
            { width: leftBoxWidth - 24 }
          );
      }

      // Right Box: Financial Breakdown
      let rightY = summaryYStart;
      const labelW = 135;
      const valW = 100;

      const addSummaryRow = (label, valueStr, isBold = false, isAccent = false) => {
        doc
          .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(isBold ? 9.5 : 8.5)
          .fillColor(isAccent ? COLOR_PRIMARY : COLOR_TEXT)
          .text(label, rightBoxX, rightY, { width: labelW })
          .text(valueStr, rightBoxX + labelW, rightY, { width: valW, align: 'right' });
        rightY += 16;
      };

      const itemTotal = Number(order.itemTotal || 0);
      const couponDiscount = Number(order.couponDiscount || 0);
      const deliveryCharge = Number(order.deliveryCharge || 0);
      const taxAmount = Number(order.taxAmount || 0);
      const grandTotal = Number(order.grandTotal || 0);

      addSummaryRow('Item Subtotal:', formatCurrency(itemTotal));

      if (couponDiscount > 0) {
        addSummaryRow('Coupon Discount:', `- ${formatCurrency(couponDiscount)}`, false, true);
      }

      addSummaryRow(
        'Delivery Charge:',
        deliveryCharge === 0 ? 'FREE' : formatCurrency(deliveryCharge)
      );

      if (taxAmount > 0) {
        addSummaryRow('Taxes & Food Cess:', formatCurrency(taxAmount));
      }

      // Grand Total Highlight
      rightY += 2;
      doc
        .strokeColor(COLOR_PRIMARY)
        .lineWidth(1.5)
        .moveTo(rightBoxX, rightY)
        .lineTo(pageWidth - margin, rightY)
        .stroke();

      rightY += 6;
      doc
        .rect(rightBoxX - 6, rightY - 3, rightBoxWidth + 6, 26)
        .fillColor(COLOR_LIGHT_BG)
        .fill();

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(COLOR_PRIMARY)
        .text('GRAND TOTAL:', rightBoxX, rightY + 4, { width: labelW })
        .text(formatCurrency(grandTotal), rightBoxX + labelW, rightY + 4, {
          width: valW,
          align: 'right',
        });

      // 5. FOOTER
      // ----------------------------------------------------
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);

        const footerY = 780;
        doc
          .strokeColor(COLOR_BORDER)
          .lineWidth(0.75)
          .moveTo(margin, footerY)
          .lineTo(pageWidth - margin, footerY)
          .stroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(COLOR_PRIMARY)
          .text('Thank you for choosing BentoBabu!', margin, footerY + 8, {
            align: 'center',
            width: contentWidth,
          });

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(COLOR_MUTED)
          .text(
            'Mindful Indian Bento & Clean Meal Boxes • Good Food. Better Living. • Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India',
            margin,
            footerY + 20,
            { align: 'center', width: contentWidth }
          );

        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(COLOR_MUTED)
          .text(`Page ${i + 1} of ${totalPages}`, margin, footerY + 31, {
            align: 'right',
            width: contentWidth,
          });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateOrderReceiptPdf,
};
