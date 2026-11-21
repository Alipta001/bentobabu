const assert = require('assert');
const {
  sanitizeProductDescription,
  stripHtmlTags,
  sanitizeStyle,
  ALLOWED_TAGS,
} = require('../app/utils/sanitizeHtml');

console.log('--- Starting Rich Text Product Description Sanitizer Tests ---');

// 1. Basic formatting preservation
{
  const input = '<h2>Chef Selection</h2><p>Handcrafted with <strong>fresh</strong> herbs and <em>pure ghee</em>.</p>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(
    sanitized,
    '<h2>Chef Selection</h2><p>Handcrafted with <strong>fresh</strong> herbs and <em>pure ghee</em>.</p>',
    'Should preserve allowed semantic tags (h2, p, strong, em)'
  );
  console.log('✓ Preserves allowed semantic tags (h2, p, strong, em)');
}

// 2. Underline, bold (b), italic (i), br
{
  const input = '<p><b>Hot</b> &amp; <i>delicious</i><br><u>Guaranteed fresh</u></p>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(
    sanitized,
    '<p><b>Hot</b> &amp; <i>delicious</i><br><u>Guaranteed fresh</u></p>',
    'Should preserve b, i, u, br'
  );
  console.log('✓ Preserves b, i, u, br');
}

// 3. Lists (ul, ol, li)
{
  const input = '<ul><li>Organic millets</li><li>Locally sourced dal</li></ul><ol><li>Wash</li><li>Steam</li></ol>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(
    sanitized,
    '<ul><li>Organic millets</li><li>Locally sourced dal</li></ul><ol><li>Wash</li><li>Steam</li></ol>',
    'Should preserve unordered and ordered lists'
  );
  console.log('✓ Preserves lists (ul, ol, li)');
}

// 4. Highlight marks and spans with safe classes and styles
{
  const input = '<p><mark class="bento-highlight-gold">Turmeric Infused</mark> <span class="bento-highlight-green" style="color: #354B35; background-color: #EAF1EA;">Eco-harvested</span></p>';
  const sanitized = sanitizeProductDescription(input);
  assert.ok(sanitized.includes('class="bento-highlight-gold"'), 'Should preserve safe highlight class');
  assert.ok(sanitized.includes('class="bento-highlight-green"'), 'Should preserve safe highlight class');
  assert.ok(sanitized.includes('color: #354B35'), 'Should preserve safe style color');
  assert.ok(sanitized.includes('background-color: #EAF1EA'), 'Should preserve safe style background-color');
  console.log('✓ Preserves safe classes and safe style declarations');
}

// 5. Strips <script> and executable content
{
  const input = '<script>alert("HACKED");</script><p>Delicious Bento</p><script src="https://evil.com/xss.js"></script>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(sanitized, '<p>Delicious Bento</p>', 'Should completely strip script tags and their content');
  console.log('✓ Strips <script> tags and executable payloads completely');
}

// 6. Strips <iframe>, <object>, <embed>, <svg>, <form>
{
  const input = '<iframe src="https://evil.com"></iframe><object data="test"></object><svg onload="alert(1)"><circle r="10"/></svg><p>Clean Meal</p>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(sanitized, '<p>Clean Meal</p>', 'Should strip iframes, objects, embeds, and svgs');
  console.log('✓ Strips iframes, objects, embeds, and svgs');
}

// 7. Strips event handlers (onclick, onerror, onload, onmouseover)
{
  const input = '<p onclick="alert(1)" onmouseover="stealCookies()">Fresh Food</p><img src="x" onerror="alert(2)">';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(sanitized, '<p>Fresh Food</p>', 'Should strip all event handlers and unapproved void tags');
  console.log('✓ Strips all inline event handlers (onclick, onmouseover, onerror)');
}

// 8. Strips dangerous styles with url(), javascript: or expressions
{
  const input = '<span style="background-image: url(\'javascript:alert(1)\'); color: #354B35;">Styled</span>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(sanitized, '<span>Styled</span>', 'Should reject style attributes with url() or javascript:');
  console.log('✓ Rejects dangerous CSS styles containing url() or javascript:');
}

// 9. Strips unapproved HTML tags while preserving text content
{
  const input = '<div><h3>Section</h3><div><a href="https://example.com">Visit us</a> for <font color="red">great taste</font>!</div></div>';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(
    sanitized,
    '<h3>Section</h3>Visit us for great taste!',
    'Should strip div, a, font tags while preserving their inner text'
  );
  console.log('✓ Strips unapproved tags while safely preserving text content');
}

// 10. Backward-compatible with plain text
{
  const input = 'Traditional homemade Bento meal.\nFreshly prepared every morning with organic ingredients.';
  const sanitized = sanitizeProductDescription(input);
  assert.strictEqual(sanitized, input, 'Should leave plain text untouched');
  console.log('✓ Leaves legacy plain text untouched');
}

// 11. Handles null, undefined, empty inputs
{
  assert.strictEqual(sanitizeProductDescription(null), '');
  assert.strictEqual(sanitizeProductDescription(undefined), '');
  assert.strictEqual(sanitizeProductDescription('   '), '');
  console.log('✓ Safely handles null, undefined, and empty string inputs');
}

// 12. stripHtmlTags utility test
{
  const html = '<h2>Title</h2><p>Paragraph with <strong>bold</strong> text &amp; more.</p>';
  const plain = stripHtmlTags(html);
  assert.strictEqual(plain, 'Title Paragraph with bold text & more.');
  console.log('✓ stripHtmlTags correctly strips all tags and decodes entities');
}

console.log('--- All 12 Rich Text Sanitization Tests Passed Successfully! ---');
