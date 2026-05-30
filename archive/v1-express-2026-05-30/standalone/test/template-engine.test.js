const te = require('../template-engine');

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(te.isValidEmail('a@b.co')).toBe(true);
    expect(te.isValidEmail('  user@example.com  ')).toBe(true);
  });
  it('rejects empty / null / malformed', () => {
    expect(te.isValidEmail('')).toBe(false);
    expect(te.isValidEmail(null)).toBe(false);
    expect(te.isValidEmail('x@')).toBe(false);
    expect(te.isValidEmail('no-at-sign')).toBe(false);
    expect(te.isValidEmail(123)).toBe(false);
  });
});

describe('personalizeMessage', () => {
  it('substitutes placeholders (skipHtmlWrap)', () => {
    expect(te.personalizeMessage('Hi {{name}}', { name: 'Jane' }, true)).toBe('Hi Jane');
  });
  it('tolerates whitespace inside braces', () => {
    expect(te.personalizeMessage('Hi {{ name }}', { name: 'Jo' }, true)).toBe('Hi Jo');
  });
  it('replaces missing values with empty string', () => {
    expect(te.personalizeMessage('Hi {{name}}', { name: '' }, true)).toBe('Hi');
  });
  it('wraps plain text in <p> when not skipping and no html present', () => {
    const out = te.personalizeMessage('Para one\n\nPara two', {}, false);
    expect(out).toContain('<p>Para one</p>');
    expect(out).toContain('<p>Para two</p>');
  });
  it('does not double-wrap content that already has html', () => {
    const out = te.personalizeMessage('<p>Hello</p>', {}, false);
    expect(out).toBe('<p>Hello</p>');
  });
  it('returns empty string for falsy template', () => {
    expect(te.personalizeMessage('', {}, true)).toBe('');
  });
});

describe('stripHtml', () => {
  it('removes tags and decodes basic entities', () => {
    expect(te.stripHtml('<p>Hi&nbsp;&amp;&lt;there&gt;</p>')).toBe('Hi &<there>');
  });
  it('returns empty string for falsy input', () => {
    expect(te.stripHtml('')).toBe('');
    expect(te.stripHtml(null)).toBe('');
  });
});
