require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const { getInvoices, markInvoicePaid, archiveInvoice, insertInvoice } = require("./db");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { extractInvoiceFromText } = require("./ai/invoiceExtractor");
const OpenAI = require("openai");

const PORT = process.env.PORT || 3002;
const app = express();

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginalName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${timestamp}-${safeOriginalName}`);
  },
});
const upload = multer({ storage });

const aiClient = (() => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set; AI summary will be unavailable.");
    return null;
  }
  return new OpenAI({ apiKey });
})();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/invoices", async (_req, res) => {
  try {
    const invoices = await getInvoices();
    res.json({ invoices });
  } catch (err) {
    console.error("Failed to fetch invoices", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/cashflow-summary", async (_req, res) => {
  try {
    const invoices = await getInvoices();

    const getInvoiceDueDate = (row) => {
      const raw = row.dueDate || row.due_date;
      if (!raw) return null;
      const parsed = new Date(raw);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const isPaidStatus = (row) => {
      const status = (row.status || "").trim().toLowerCase();
      return status === "paid";
    };

    const today = new Date();
    const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    let totalPaid = 0;
    let totalOutstanding = 0;
    const overdueInvoices = [];
    const dueSoonInvoices = [];
    const next30Invoices = [];

    invoices
      .filter((inv) => inv.archived !== 1 && inv.archived !== true)
      .forEach((inv) => {
        const amount = Number(inv.amount) || 0;
        const paid = isPaidStatus(inv);
        const dueDate = getInvoiceDueDate(inv);

        if (paid) {
          totalPaid += amount;
          return;
        }

        totalOutstanding += amount;

        if (!dueDate) return; // exclude from date-based buckets if no valid due date

        if (dueDate < today) {
          overdueInvoices.push(inv);
        } else if (dueDate >= today && dueDate <= sevenDaysFromNow) {
          dueSoonInvoices.push(inv);
          next30Invoices.push(inv);
        } else if (dueDate > sevenDaysFromNow && dueDate <= thirtyDaysFromNow) {
          next30Invoices.push(inv);
        }
      });

    const metrics = {
      totalOutstanding,
      totalPaid,
      countOverdue: overdueInvoices.length,
      countDueSoon: dueSoonInvoices.length,
    };

    let summary = "AI summary is temporarily unavailable. Metrics are still accurate.";

    if (aiClient) {
      if (totalOutstanding === 0) {
        return res.json({
          metrics,
          summary: "There are no outstanding invoices. Cashflow looks clear at the moment.",
        });
      }

      const largestOverdue = [...overdueInvoices]
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
        .slice(0, 3)
        .map((inv) => `${inv.supplier} — ${inv.amount} due ${inv.due_date || inv.dueDate || "unknown"}`);

      const dueSoonList = [...dueSoonInvoices]
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
        .slice(0, 3)
        .map((inv) => `${inv.supplier} — ${inv.amount} due ${inv.due_date || inv.dueDate || "unknown"}`);

      const next30Total = next30Invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

      const context = `
Metrics:
- Total outstanding (unpaid): ${totalOutstanding}
- Total paid: ${totalPaid}
- Overdue invoices: ${overdueInvoices.length}
- Due in next 7 days: ${dueSoonInvoices.length}
- Total due in next 30 days: ${next30Total}

Largest overdue (up to 3):
${largestOverdue.map((t, i) => `${i + 1}. ${t}`).join("\n") || "None"}

Due in next 7 days (up to 3):
${dueSoonList.map((t, i) => `${i + 1}. ${t}`).join("\n") || "None"}

Write 2-4 concise bullet points (or 2-3 short sentences) about upcoming cash out, overdue risk, and any spikes in the next 30 days. Use ONLY the data provided; do not invent invoices or amounts. Always express currency in GBP (£).`;

      try {
        const aiRes = await aiClient.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a financial analyst helping a business owner understand upcoming supplier payments and cashflow risks. Be concise and practical. Always express currency in GBP (£), never in $.",
            },
            { role: "user", content: context },
          ],
          temperature: 0.2,
        });
        const content = aiRes?.choices?.[0]?.message?.content;
        if (content && typeof content === "string") {
          summary = content.trim();
        }
      } catch (err) {
        console.error("AI cashflow summary failed:", err);
      }
    }

    return res.json({ metrics, summary });
  } catch (err) {
    console.error("Failed to generate cashflow summary", err);
    return res.status(500).json({ error: "Failed to generate cashflow summary" });
  }
});

app.post("/api/invoices/:id/mark-paid", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await markInvoicePaid(id);
    if (!updated) return res.status(404).json({ error: "Invoice not found" });
    res.json(updated);
  } catch (err) {
    console.error("Failed to mark invoice as paid", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/invoices/:id/archive", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await archiveInvoice(id);
    if (!updated) return res.status(404).json({ error: "Invoice not found" });
    res.json({ success: true, invoice: updated });
  } catch (err) {
    console.error("Failed to archive invoice", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/upload-invoice", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      console.warn("Upload attempted with no file");
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("Upload received:", {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      path: req.file.path,
      size: req.file.size,
    });

    const today = new Date();
    const due = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const toISO = (d) => d.toISOString().slice(0, 10);
    const weekLabelFromDate = (date) => `Week of ${date}`;

    const fallbackInvoice = {
      supplier: "Uploaded invoice",
      invoice_number: req.file.originalname,
      issue_date: toISO(today),
      due_date: toISO(due),
      amount: 0,
      status: "Upcoming",
      category: "Uncategorised",
      source: "Upload",
      week_label: weekLabelFromDate(toISO(due)),
      archived: 0,
    };

    let rawText = "";
    const mimetype = (req.file.mimetype || "").toLowerCase();
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const shouldTreatAsText =
      mimetype.startsWith("text/") ||
      mimetype === "application/octet-stream" ||
      ext === ".txt" ||
      ext === ".csv" ||
      ext === ".json";

    if (shouldTreatAsText) {
      try {
        rawText = await fs.promises.readFile(req.file.path, "utf8");
        console.log("Raw text source: plain text or extension-based text");
      } catch (readErr) {
        console.error("Text read failed, using fallback:", readErr);
        rawText = `Uploaded invoice file: ${req.file.originalname}. Extract key invoice details.`;
      }
    } else if (mimetype.includes("pdf")) {
      try {
        if (typeof pdfParse !== "function") {
          throw new Error("pdf-parse not available as a function");
        }
        const fileBuffer = await fs.promises.readFile(req.file.path);
        const pdfData = await pdfParse(fileBuffer);
        rawText = pdfData.text || "";
        console.log("Raw text source: PDF via pdf-parse");
      } catch (pdfErr) {
        console.error("PDF parse failed:", pdfErr);
        rawText = `Uploaded invoice file: ${req.file.originalname}. Extract key invoice details.`;
        console.log("Falling back to generic prompt text for PDF.");
      }
    } else {
      rawText = `Uploaded invoice file: ${req.file.originalname}. Extract key invoice details.`;
      console.log("Raw text source: generic fallback for non-text/non-PDF");
    }

    console.log("Raw text snippet:", rawText.slice(0, 400));

    const simpleExtract = (text) => {
      if (!text) return {};
      const lines = text.split(/\r?\n/);
      const findValue = (label) => {
        const line = lines.find((l) => l.toLowerCase().includes(label));
        if (!line) return undefined;
        const parts = line.split(/[:\-]/);
        return parts.length > 1 ? parts.slice(1).join(":").trim() : undefined;
      };
      const parseDate = (value) => {
        if (!value) return undefined;
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
      };
      const parseAmount = (value) => {
        if (!value) return undefined;
        const cleaned = value.replace(/[^0-9.\-]+/g, "");
        const num = parseFloat(cleaned);
        return Number.isNaN(num) ? undefined : num;
      };

      return {
        supplier: findValue("supplier"),
        invoice_number: findValue("invoice number") || findValue("invoice no") || findValue("inv"),
        issue_date: parseDate(findValue("issue date")),
        due_date: parseDate(findValue("due date")),
        amount: parseAmount(findValue("amount") || findValue("total") || findValue("balance")),
      };
    };

    const simpleResult = simpleExtract(rawText);

    let aiResult = null;
    try {
      aiResult = await extractInvoiceFromText(rawText);
      console.log("AI extraction result:", aiResult);
    } catch (err) {
      console.error("AI extraction failed:", err);
    }

    const mergedInvoice = { ...fallbackInvoice };

    if (simpleResult && typeof simpleResult === "object") {
      mergedInvoice.supplier = simpleResult.supplier?.trim() || mergedInvoice.supplier;
      mergedInvoice.invoice_number = simpleResult.invoice_number?.toString().trim() || mergedInvoice.invoice_number;
      mergedInvoice.issue_date = simpleResult.issue_date || mergedInvoice.issue_date;
      mergedInvoice.due_date = simpleResult.due_date || mergedInvoice.due_date;
      if (typeof simpleResult.amount === "number" && !Number.isNaN(simpleResult.amount)) {
        mergedInvoice.amount = simpleResult.amount;
      }
    }

    if (aiResult && typeof aiResult === "object") {
      mergedInvoice.supplier =
        (typeof aiResult.supplier === "string" && aiResult.supplier.trim()) || mergedInvoice.supplier;
      mergedInvoice.invoice_number =
        (aiResult.invoice_number && aiResult.invoice_number.toString().trim()) || mergedInvoice.invoice_number;
      mergedInvoice.issue_date = aiResult.issue_date || mergedInvoice.issue_date;
      mergedInvoice.due_date = aiResult.due_date || mergedInvoice.due_date;
      mergedInvoice.amount =
        typeof aiResult.amount === "number" && !Number.isNaN(aiResult.amount) ? aiResult.amount : mergedInvoice.amount;
      mergedInvoice.status =
        (typeof aiResult.status === "string" && aiResult.status.trim()) || mergedInvoice.status;
      mergedInvoice.category =
        (typeof aiResult.category === "string" && aiResult.category.trim()) || mergedInvoice.category;
      mergedInvoice.week_label = aiResult.due_date ? weekLabelFromDate(aiResult.due_date) : mergedInvoice.week_label;
    } else {
      console.error("AI extraction failed or returned null:", aiResult);
    }

    try {
      const inserted = await insertInvoice(mergedInvoice);
      return res.json({
        status: "ok",
        message: "File uploaded",
        file: {
          originalName: req.file.originalname,
          storedName: req.file.filename,
          storedPath: req.file.path,
          source: "Upload",
        },
        invoice: inserted,
      });
    } catch (err) {
      console.error("Upload insert error:", err);
      return res.status(500).json({ error: "Upload failed to save invoice" });
    }
  } catch (err) {
    console.error("Error in /api/upload-invoice:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Cashflow backend listening on http://127.0.0.1:${PORT}`);
});
