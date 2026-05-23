const { parseContactsFromRows, parseCsvContacts } = require('../importer');

describe('parseContactsFromRows', () => {
  it('auto-detects the header row and maps columns', () => {
    const rows = [
      ['My Contact Sheet', '', '', ''],          // title row to skip
      ['Name', 'Company', 'Role', 'Email'],      // header row
      ['Jane Doe', 'Acme', 'Engineer', 'jane@acme.com'],
      ['John Roe', 'Globex', 'Manager', 'john@globex.com']
    ];
    const contacts = parseContactsFromRows(rows);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({
      recruiter_name: 'Jane Doe',
      company: 'Acme',
      job_title: 'Engineer',
      recruiter_email: 'jane@acme.com',
      status: 'Not Applied'
    });
  });

  it('skips rows with missing or invalid emails', () => {
    const rows = [
      ['Name', 'Email'],
      ['Has Email', 'ok@x.com'],
      ['No Email', ''],
      ['Bad Email', 'nope@']
    ];
    const contacts = parseContactsFromRows(rows);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].recruiter_email).toBe('ok@x.com');
  });

  it('stores phone as a note when a phone column exists', () => {
    const rows = [
      ['Name', 'Email', 'Phone'],
      ['Pat', 'pat@x.com', '555-1234']
    ];
    const contacts = parseContactsFromRows(rows);
    expect(contacts[0].notes).toBe('Phone: 555-1234');
  });
});

describe('parseCsvContacts', () => {
  it('maps object rows from varied header casings', () => {
    const csvRows = [
      { Name: 'Jane', Company: 'Acme', 'Job Title': 'Eng', Email: 'jane@acme.com' },
      { name: 'john', company: 'Globex', role: 'Mgr', email: 'john@globex.com' }
    ];
    const contacts = parseCsvContacts(csvRows);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({ recruiter_name: 'Jane', recruiter_email: 'jane@acme.com' });
    expect(contacts[1]).toMatchObject({ recruiter_name: 'john', job_title: 'Mgr' });
  });

  it('filters out rows lacking a valid email', () => {
    const csvRows = [
      { Name: 'Good', Email: 'good@x.com' },
      { Name: 'NoEmail' },
      { Name: 'Bad', Email: 'bad@' }
    ];
    const contacts = parseCsvContacts(csvRows);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].recruiter_email).toBe('good@x.com');
  });

  it('uses phone as a note when present', () => {
    const csvRows = [{ Name: 'Pat', Email: 'pat@x.com', phone: '555-9' }];
    expect(parseCsvContacts(csvRows)[0].notes).toBe('Phone: 555-9');
  });
});
