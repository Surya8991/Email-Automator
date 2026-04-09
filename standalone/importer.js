const XLSX = require('xlsx');
const fs = require('fs');
const csv = require('csv-parser');
const { isValidEmail } = require('./template-engine');
const config = require('./config');

function importExcel(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const targetSheet = sheetName || wb.SheetNames.find(n => n.includes('Contacts') || n.includes('contacts')) || wb.SheetNames.find(n => n.includes('Job Tracker') || n.includes('Tracker')) || wb.SheetNames[0];
  const ws = wb.Sheets[targetSheet];
  if (!ws) throw new Error('Sheet "' + targetSheet + '" not found. Available: ' + wb.SheetNames.join(', '));
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  return { rows, sheetName: targetSheet, allSheets: wb.SheetNames };
}

function importCsv(filePath) {
  // Read raw lines first, detect header row, then parse
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return Promise.resolve([]);

  // Find the header row — first line that contains "Name" or "Email" or "Company"
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('name') && (lower.includes('email') || lower.includes('company'))) {
      headerIdx = i;
      break;
    }
  }

  // Rebuild CSV without the title rows above headers
  const csvContent = lines.slice(headerIdx).join('\n');
  return new Promise((resolve, reject) => {
    const rows = [];
    const { Readable } = require('stream');
    Readable.from(csvContent)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function parseContactsFromRows(rows, headerRowIndex) {
  headerRowIndex = headerRowIndex || 0;
  // Auto-detect header row (first row with "Name" or "Email" or "Company")
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const joined = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (joined.includes('name') || joined.includes('email') || joined.includes('company')) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = rows[headerRowIndex] || [];
  const headerMap = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    headerMap[key] = i;
  });

  // Map headers to our fields
  const findCol = (...candidates) => {
    for (const c of candidates) {
      for (const key in headerMap) {
        if (key.includes(c)) return headerMap[key];
      }
    }
    return -1;
  };

  const nameCol = findCol('name');
  const companyCol = findCol('company');
  const roleCol = findCol('role', 'title', 'job_title', 'job');
  const emailCol = findCol('email', 'e_mail');
  const linkedinCol = findCol('linkedin');
  const phoneCol = findCol('phone');
  const platformCol = findCol('platform');
  const notesCol = findCol('notes', 'note');

  const contacts = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const email = emailCol >= 0 ? String(row[emailCol] || '').trim() : '';
    if (!email || !isValidEmail(email)) continue;

    contacts.push({
      recruiter_name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
      company: companyCol >= 0 ? String(row[companyCol] || '').trim() : '',
      job_title: roleCol >= 0 ? String(row[roleCol] || '').trim() : '',
      recruiter_email: email,
      source_url: linkedinCol >= 0 ? String(row[linkedinCol] || '').trim() : '',
      platform: platformCol >= 0 ? String(row[platformCol] || '').trim() : '',
      notes: phoneCol >= 0 && row[phoneCol] ? 'Phone: ' + String(row[phoneCol]).trim() : (notesCol >= 0 ? String(row[notesCol] || '').trim() : ''),
      status: 'Not Applied',
      email_status: 'Imported from Contacts'
    });
  }
  return contacts;
}

function parseCsvContacts(csvRows) {
  return csvRows.filter(row => {
    const email = row.email || row.Email || row.recruiter_email || row['Recruiter Email'] || '';
    return email && isValidEmail(email.trim());
  }).map(row => ({
    recruiter_name: row.name || row.Name || row.recruiter_name || row['Recruiter Name'] || '',
    company: row.company || row.Company || '',
    job_title: row.role || row.Role || row.job_title || row['Job Title'] || row['Role / Title'] || '',
    recruiter_email: (row.email || row.Email || row.recruiter_email || row['Recruiter Email'] || '').trim(),
    source_url: row.linkedin || row.LinkedIn || row.source_url || '',
    platform: row.platform || row.Platform || row['Platform Met'] || '',
    notes: row.phone ? 'Phone: ' + row.phone : (row.notes || row.Notes || ''),
    status: 'Not Applied',
    email_status: 'Imported from Contacts'
  }));
}

module.exports = { importExcel, importCsv, parseContactsFromRows, parseCsvContacts };
