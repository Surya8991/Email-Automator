// A blank CSV with our expected headers — users can fill it in Excel and
// then upload via /contacts → Import. Same fields v1 documented.
export function GET() {
  const csv =
    'Name,Company,Role / Title,Email,LinkedIn,Phone,Platform Met,Notes\n' +
    'John Doe,Acme Corp,HR Manager,john@acme.com,https://linkedin.com/in/johndoe,+91 98765 43210,LinkedIn,Sample row\n' +
    'Jane Smith,TechCo,CTO,jane@techco.com,,,,'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=contacts_template.csv',
    },
  })
}
