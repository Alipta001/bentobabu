const assert = require('assert');

// Simple Node test runner for textFormat logic
function stripHtmlTags(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isHtmlContent(str) {
  if (!str || typeof str !== 'string') return false;
  return /<[a-z][\s\S]*>/i.test(str);
}

console.log('--- Starting Frontend Text & HTML Format Tests ---');

// 1. stripHtmlTags
{
  const input = '<h2>Steamed Millet Idlis</h2><p>Served with <strong>sambar</strong> &amp; chutney.</p>';
  const output = stripHtmlTags(input);
  assert.strictEqual(output, 'Steamed Millet Idlis Served with sambar & chutney.');
  console.log('✓ stripHtmlTags strips tags and unescapes entities');
}

// 2. stripHtmlTags with plain text
{
  const input = 'Simple homemade bento.';
  const output = stripHtmlTags(input);
  assert.strictEqual(output, 'Simple homemade bento.');
  console.log('✓ stripHtmlTags preserves plain text');
}

// 3. isHtmlContent
{
  assert.strictEqual(isHtmlContent('<p>Hello</p>'), true);
  assert.strictEqual(isHtmlContent('<h2>Title</h2>'), true);
  assert.strictEqual(isHtmlContent('<ul><li>item</li></ul>'), true);
  assert.strictEqual(isHtmlContent('Simple text without tags'), false);
  assert.strictEqual(isHtmlContent('Price: 5 < 10 but not html'), false);
  console.log('✓ isHtmlContent accurately distinguishes HTML markup from plain text');
}

console.log('--- All Frontend Text Format Tests Passed! ---');
