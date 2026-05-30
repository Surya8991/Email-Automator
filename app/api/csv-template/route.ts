// Starter CSV — open in Excel/Sheets, fill it in, upload via /contacts → Import.
// Column headers are flexible (the importer fuzz-matches "Email" / "E-mail" /
// "email_id" etc.), but using the exact headers below is the safe path.
//
//   Email     — REQUIRED. The only column the importer truly needs. Must
//               be a valid address. Rows missing it are skipped silently.
//   Name      — recruiter / contact name. Used in {{name}} placeholder.
//   Company   — used in {{company}} placeholder.
//   Role / Title  — used in {{role_name}} placeholder.
//   LinkedIn  — stored as `source_url`; informational only.
//   Phone     — informational.
//   Platform  — where you found them (LinkedIn, Naukri, Wellfound, …).
//   Tags      — comma-separated (no spaces around commas), e.g. "vc,seo,a".
//               Filter by tag in /contacts; enroll campaigns by tag.
//   Notes     — freeform.
export function GET() {
  const rows = [
    // header
    'Name,Company,Role / Title,Email,LinkedIn,Phone,Platform,Tags,Notes',
    // realistic samples covering the common shapes
    'Priya Sharma,Acme Corp,Talent Acquisition Lead,priya.sharma@acme.com,https://linkedin.com/in/priyasharma,+91 98765 43210,LinkedIn,"recruiter,priority",Connected on LinkedIn after Q3 announcement',
    'Rahul Mehta,TechFlow Labs,Engineering Manager,rahul@techflow.io,,,Wellfound,"hiring-manager,startup","Referred by Ankit; wants Go background"',
    'Sara Khan,GrowthCo,VP Marketing,sara@growth.co,https://linkedin.com/in/sarakhan,,Naukri,"vp,marketing","Posted role on 28 May"',
    'Vikram Singh,Bharat Pay,Recruiter,vikram.singh@bharatpay.in,,+91 99887 76655,Hirist,recruiter,Fintech',
    'Anonymous, ,, hr@example.com,,,LinkedIn,inbound,Minimal row — only email required',
  ]
  const csv = rows.join('\n') + '\n'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contacts_sample.csv"',
    },
  })
}
