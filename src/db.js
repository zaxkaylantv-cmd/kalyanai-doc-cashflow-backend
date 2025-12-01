const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "..", "data", "cashflow.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier TEXT,
  invoice_number TEXT,
  issue_date TEXT,
  due_date TEXT,
  amount REAL,
  status TEXT,
  category TEXT,
  source TEXT,
  week_label TEXT,
  archived INTEGER DEFAULT 0
)`;

const seedInvoices = [
  {
    supplier: "Northwind Utilities",
    invoice_number: "NW-2025-001",
    issue_date: "2025-08-25",
    due_date: "2025-09-10",
    amount: 820,
    status: "Paid",
    category: "Utilities",
    source: "Email",
    week_label: "Week of 08 Sep 2025",
  },
  {
    supplier: "BrightHire",
    invoice_number: "BH-2025-002",
    issue_date: "2025-09-20",
    due_date: "2025-10-05",
    amount: 1840,
    status: "Paid",
    category: "Staff",
    source: "Email",
    week_label: "Week of 06 Oct 2025",
  },
  {
    supplier: "CloudNova",
    invoice_number: "CN-2025-003",
    issue_date: "2025-09-10",
    due_date: "2025-09-25",
    amount: 1200,
    status: "Paid",
    category: "Software",
    source: "Upload",
    week_label: "Week of 22 Sep 2025",
  },
  {
    supplier: "Streamline Legal",
    invoice_number: "SL-2025-004",
    issue_date: "2025-10-01",
    due_date: "2025-10-20",
    amount: 950,
    status: "Paid",
    category: "Other",
    source: "Upload",
    week_label: "Week of 13 Oct 2025",
  },
  {
    supplier: "Harbor Office",
    invoice_number: "HO-2025-005",
    issue_date: "2025-10-20",
    due_date: "2025-11-05",
    amount: 640,
    status: "Overdue",
    category: "Rent",
    source: "Email",
    week_label: "Week of 03 Nov 2025",
  },
  {
    supplier: "PixelOps Design",
    invoice_number: "PO-2025-006",
    issue_date: "2025-10-30",
    due_date: "2025-11-14",
    amount: 1200,
    status: "Overdue",
    category: "Marketing",
    source: "Upload",
    week_label: "Week of 10 Nov 2025",
  },
  {
    supplier: "Supplier X",
    invoice_number: "SX-2025-007",
    issue_date: "2025-11-05",
    due_date: "2025-11-24",
    amount: 3200,
    status: "Due soon",
    category: "Other",
    source: "Upload",
    week_label: "Week of 24 Nov 2025",
  },
  {
    supplier: "ClearLine Telecom",
    invoice_number: "CT-2025-008",
    issue_date: "2025-11-10",
    due_date: "2025-11-28",
    amount: 480,
    status: "Upcoming",
    category: "Utilities",
    source: "Email",
    week_label: "Week of 24 Nov 2025",
  },
  {
    supplier: "Lumina Analytics",
    invoice_number: "LA-2025-009",
    issue_date: "2025-11-20",
    due_date: "2025-12-06",
    amount: 2100,
    status: "Upcoming",
    category: "Software",
    source: "Email",
    week_label: "Week of 08 Dec 2025",
  },
  {
    supplier: "DemoCo",
    invoice_number: "DC-2025-010",
    issue_date: "2025-11-25",
    due_date: "2025-12-15",
    amount: 2500,
    status: "Upcoming",
    category: "Uncategorised",
    source: "Upload",
    week_label: "Week of 15 Dec 2025",
  },
  {
    supplier: "KALYAN AI",
    invoice_number: "KA-2026-011",
    issue_date: "2025-12-20",
    due_date: "2026-01-15",
    amount: 743,
    status: "unpaid",
    category: "Utilities",
    source: "Upload",
    week_label: "Week of 12 Jan 2026",
  },
  {
    supplier: "Kalyan AI Consulting",
    invoice_number: "KAC-2026-012",
    issue_date: "2026-01-10",
    due_date: "2026-02-10",
    amount: 1500,
    status: "Upcoming",
    category: "Services",
    source: "Upload",
    week_label: "Week of 09 Feb 2026",
  },
];

db.serialize(() => {
  db.run(CREATE_TABLE_SQL);
  db.get("SELECT COUNT(*) as count FROM invoices", (err, row) => {
    if (err) {
      console.error("Failed to read invoice count", err);
      return;
    }
    if (row.count === 0) {
      const stmt = db.prepare(
        `INSERT INTO invoices (supplier, invoice_number, issue_date, due_date, amount, status, category, source, week_label, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      );
      seedInvoices.forEach((inv) => {
        stmt.run(
          inv.supplier,
          inv.invoice_number,
          inv.issue_date,
          inv.due_date,
          inv.amount,
          inv.status,
          inv.category,
          inv.source,
          inv.week_label
        );
      });
      stmt.finalize();
      console.log("Seeded invoices table with demo data");
    }
  });
});

const getInvoices = () =>
  new Promise((resolve, reject) => {
    db.all("SELECT * FROM invoices WHERE archived = 0", (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const findInvoiceById = (id) =>
  new Promise((resolve, reject) => {
    db.get("SELECT * FROM invoices WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const markInvoicePaid = async (id) => {
  const existing = await findInvoiceById(id);
  if (!existing) return null;
  await new Promise((resolve, reject) => {
    db.run("UPDATE invoices SET status = 'Paid' WHERE id = ?", [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  return findInvoiceById(id);
};

const archiveInvoice = async (id) => {
  const existing = await findInvoiceById(id);
  if (!existing) return null;
  await new Promise((resolve, reject) => {
    db.run("UPDATE invoices SET archived = 1 WHERE id = ?", [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  return findInvoiceById(id);
};

const insertInvoice = async (invoice) =>
  new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO invoices (supplier, invoice_number, issue_date, due_date, amount, status, category, source, week_label, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.supplier,
        invoice.invoice_number,
        invoice.issue_date,
        invoice.due_date,
        invoice.amount,
        invoice.status,
        invoice.category,
        invoice.source,
        invoice.week_label,
        invoice.archived ?? 0,
      ],
      function (err) {
        if (err) return reject(err);
        const id = this.lastID;
        findInvoiceById(id)
          .then((row) => resolve(row))
          .catch(reject);
      },
    );
  });

module.exports = {
  getInvoices,
  markInvoicePaid,
  archiveInvoice,
  insertInvoice,
};
