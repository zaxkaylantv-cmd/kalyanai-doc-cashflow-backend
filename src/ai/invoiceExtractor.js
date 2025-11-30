require("dotenv").config();
const OpenAI = require("openai");

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY is not set; skipping AI extraction.");
    return null;
  }
  return new OpenAI({ apiKey });
}

async function extractInvoiceFromText(rawText) {
  const client = getClient();
  if (!client) return null;
  try {
    const systemPrompt = `
You are an invoice extraction engine. Use ONLY the information explicitly present in the provided text.
Never invent or guess supplier names, invoice numbers, dates, or amounts.
For any field that is missing, unclear, or ambiguous in the text, set it to null.
Dates may appear in formats like YYYY-MM-DD, DD/MM/YYYY, or "15 Nov 2025". Output dates strictly as YYYY-MM-DD or null.
Return pure JSON only, no extra text.`;
    const userPrompt = `
Extract this JSON:
{
  "supplier": string or null,
  "invoice_number": string or null,
  "issue_date": string or null,   // YYYY-MM-DD
  "due_date": string or null,     // YYYY-MM-DD
  "amount": number or null,
  "status": string or null,       // e.g. "Upcoming", "Due soon", "Overdue", "Paid"
  "category": string or null
}
If a field is not present in the text, set it to null. Do not guess.

TEXT:
${rawText || ""}`;

    // Instruction: do not hallucinate; missing fields must be null; output pure JSON only.
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const content = response?.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch (err) {
      console.error("Failed to parse AI invoice JSON", err, content);
      return null;
    }
  } catch (err) {
    console.error("OpenAI extraction error", err);
    return null;
  }
}

module.exports = {
  extractInvoiceFromText,
};
