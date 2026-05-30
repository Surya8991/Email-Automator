/**
 * Phase 1 security regressions. Each test pins a specific fix in place
 * so a future refactor that re-opens the issue fails CI.
 */
const te = require('../template-engine');

describe('template-engine: HTML escaping in body', () => {
  it('escapes < > & " \' in substituted values', () => {
    const out = te.personalizeMessage('<p>Hi {{name}}</p>', {
      name: `<img onerror="alert(1)" src=x> & 'a' "b"`
    }, false);
    // The actual attack vectors are the raw < and the unescaped quote that
    // would close an attribute. Both must be encoded.
    // No live tag survives — the `<` is encoded, so onerror= is inert text.
    expect(out).not.toMatch(/<img/);
    expect(out).toContain('&lt;img');
    expect(out).toContain('onerror=&quot;'); // ok: literal text inside an escaped tag
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;');
    expect(out).toContain('&#39;');
  });

  it('leaves the surrounding template HTML untouched', () => {
    const out = te.personalizeMessage('<p>Hello {{name}}</p>', { name: 'Jane' }, false);
    expect(out).toBe('<p>Hello Jane</p>');
  });
});

describe('template-engine: CRLF stripping in subject mode', () => {
  it('removes newlines from values used in subject lines', () => {
    const out = te.personalizeMessage('Hi {{name}}', {
      name: 'Jane\r\nBcc: attacker@evil.com'
    }, true);
    // The injection vector is the newline, not the literal "Bcc:" text.
    // With newlines gone the rest is just inert subject content.
    expect(out).not.toMatch(/[\r\n]/);
  });
});

describe('template-engine: assertNoCrlf', () => {
  it('throws on CR or LF', () => {
    expect(() => te.assertNoCrlf('to', 'a@b.co\r\nBcc: x@y')).toThrow(/Header injection/);
    expect(() => te.assertNoCrlf('subject', 'good subject')).not.toThrow();
  });
});

describe('template-engine: sanitizeUnsubText', () => {
  it('strips <script> and event handlers', () => {
    const out = te.sanitizeUnsubText('Click <script>alert(1)</script> <b onmouseover="x()">here</b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('<b>here</b>');
  });
  it('keeps safe http/mailto anchors only', () => {
    const ok = te.sanitizeUnsubText('Email <a href="mailto:a@b.co">us</a>');
    expect(ok).toContain('<a href="mailto:a@b.co">us</a>');
    const bad = te.sanitizeUnsubText('<a href="javascript:alert(1)">x</a>');
    expect(bad).not.toContain('javascript:');
  });
});

describe('email-sender: makeRawEmail header injection', () => {
  // We don't import the email-sender module here because doing so pulls in
  // googleapis (multi-second cold start). The guard inside makeRawEmail is
  // just te.assertNoCrlf — covered above — plus a static check that the
  // calls are wired up in source.
  it('source wires assertNoCrlf for to / from / subject in makeRawEmail', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'email-sender.js'), 'utf8');
    expect(src).toMatch(/assertNoCrlf\('from'/);
    expect(src).toMatch(/assertNoCrlf\('to'/);
    expect(src).toMatch(/assertNoCrlf\('subject'/);
  });
});

describe('db: getScheduledEmails requires user_id', () => {
  // We don't initialize the real DB here — just confirm the strict guard
  // throws BEFORE touching sql.js, which proves a caller that forgets the
  // arg cannot leak other users' rows.
  it('throws when called with no argument', () => {
    const db = require('../db');
    expect(() => db.getScheduledEmails()).toThrow(/user_id is required/);
    expect(() => db.getScheduledEmails(null)).toThrow(/user_id is required/);
  });
});

describe('OTP uses CSPRNG', () => {
  // Read server.js as text and confirm the legacy Math.random() OTP path is gone.
  // This is a regression guard, not a runtime test.
  it('does not contain Math.random()-based OTP generation', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(src).not.toMatch(/Math\.floor\(100000 \+ Math\.random\(\) \* 900000\)/);
    expect(src).toMatch(/crypto\.randomInt\(100000, 1000000\)/);
  });
});

describe('OAuth callback validates state', () => {
  it('server.js performs a timing-safe state comparison', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(src).toMatch(/req\.session\.oauthState/);
    expect(src).toMatch(/timingSafeEqual/);
  });
});

describe('SSE endpoint is authenticated', () => {
  it('server.js wires /api/progress through requireAuth and tags by uid', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(src).toMatch(/app\.get\('\/api\/progress', requireAuth/);
    // sendSSE must receive a uid as its first argument now (not a bare event).
    expect(src).toMatch(/function sendSSE\(uid, data\)/);
  });
});

describe('CSP enabled', () => {
  it('helmet contentSecurityPolicy is NOT disabled', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(src).not.toMatch(/contentSecurityPolicy:\s*false/);
    expect(src).toMatch(/contentSecurityPolicy:\s*\{/);
  });
});

describe('scheduler.backoffMs', () => {
  it('always falls inside the documented jitter window per attempt', () => {
    const { backoffMs } = require('../scheduler');
    const base = 60 * 1000; // matches config.RETRY_DELAY_MS
    const CAP = 30 * 60 * 1000;
    // Sample each attempt many times — assertion is on the WHOLE distribution,
    // not on any one Math.random() draw, so the test cannot flake.
    for (const attempt of [1, 2, 3, 5, 10]) {
      const expectedCenter = Math.min(CAP, base * Math.pow(2, attempt - 1));
      const lo = Math.max(1000, Math.floor(expectedCenter * 0.75));
      const hi = Math.ceil(expectedCenter * 1.25);
      for (let i = 0; i < 50; i++) {
        const v = backoffMs(attempt);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
  });
});
