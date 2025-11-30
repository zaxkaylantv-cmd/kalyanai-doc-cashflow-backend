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
    supplier: "Aurora Marketing",
    invoice_number: "AM-9021",
    issue_date: "2024-11-01",
    due_date: "2024-11-30",
    amount: 3100,
    status: "Overdue",
    category: "Marketing",
    source: "Upload",
    week_label: "Week of 02 Dec – 08 Dec",
  },
  {
    supplier: "Northwind Utilities",
    invoice_number: "NW-1120",
    issue_date: "2024-10-18",
    due_date: "2024-12-05",
    amount: 860,
    status: "Overdue",
    category: "Utilities",
    source: "Upload",
    week_label: "Week of 02 Dec – 08 Dec",
  },
  {
    supplier: "BrightHire",
    invoice_number: "BH-2221",
    issue_date: "2024-11-12",
    due_date: "2024-12-06",
    amount: 1840,
    status: "Due soon",
    category: "Staff",
    source: "Email",
    week_label: "Week of 02 Dec – 08 Dec",
  },
  {
    supplier: "CloudNova",
    invoice_number: "CN-3488",
    issue_date: "2024-11-05",
    due_date: "2024-12-04",
    amount: 1200,
    status: "Upcoming",
    category: "Software",
    source: "Email",
    week_label: "Week of 02 Dec – 08 Dec",
  },
  {
    supplier: "Streamline Legal",
    invoice_number: "SL-5099",
    issue_date: "2024-11-08",
    due_date: "2024-12-08",
    amount: 950,
    status: "Upcoming",
    category: "Other",
    source: "Upload",
    week_label: "Week of 02 Dec – 08 Dec",
  },
  {
    supplier: "Harbor Office",
    invoice_number: "HO-7782",
    issue_date: "2024-10-25",
    due_date: "2024-12-10",
    amount: 640,
    status: "Paid",
    category: "Rent",
    source: "Email",
    week_label: "Week of 09 Dec – 15 Dec",
  },
  {
    supplier: "PixelOps Design",
    invoice_number: "PO-1199",
    issue_date: "2024-11-15",
    due_date: "2024-12-14",
    amount: 1200,
    status: "Upcoming",
    category: "Marketing",
    source: "Upload",
    week_label: "Week of 09 Dec – 15 Dec",
  },
  {
    supplier: "Supplier X",
    invoice_number: "SX-3301",
    issue_date: "2024-11-10",
    due_date: "2024-12-14",
    amount: 3200,
    status: "Due soon",
    category: "Other",
    source: "Upload",
    week_label: "Week of 09 Dec – 15 Dec",
  },
  {
    supplier: "ClearLine Telecom",
    invoice_number: "CT-5543",
    issue_date: "2024-11-09",
    due_date: "2024-12-09",
    amount: 480,
    status: "Upcoming",
    category: "Utilities",
    source: "Email",
    week_label: "Week of 02 Dec – 08 Dec",
  },
  {
    supplier: "Lumina Analytics",
    invoice_number: "LA-6611",
    issue_date: "2024-11-05",
    due_date: "2024-12-12",
    amount: 2100,
    status: "Upcoming",
    category: "Software",
    source: "Email",
    week_label: "Week of 09 Dec – 15 Dec",
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
