#!/usr/bin/env node
/**
 * QA Gate — Standalone module + CLI
 *
 * Importable: validateForPublish(html, meta)
 * CLI: node qa-gate.js --post-id=123
 *      node qa-gate.js --html="<p>some content</p>"
 */
import { scanContent, thresholds } from './slop-detector.js';
import { fetchPost, check21DayRule } from './wp-client.js';

/**
 * Validate content for publishing.
 * @param {string} html - The HTML content to validate
 * @param {object} [meta] - Optional metadata (modified date, post ID)
 * @returns {{ approved: boolean, score: number, verdict: string, violations: array, maturation?: object, recommendation: string }}
 */
export function validateForPublish(html, meta = {}) {
  const scan = scanContent(html);

  const result = {
    approved: scan.verdict !== 'BLOCK',
    score: scan.score,
    verdict: scan.verdict,
    violations: scan.violations,
    recommendation: '',
  };

  // Check 21-day rule if modified date is provided
  if (meta.modified) {
    const maturation = check21DayRule(meta.modified);
    result.maturation = maturation;
    if (!maturation.eligible) {
      result.approved = false;
      result.recommendation = `21-day rule: only ${maturation.daysSinceUpdate} days since last edit. Wait ${21 - maturation.daysSinceUpdate} more days.`;
      return result;
    }
  }

  if (scan.verdict === 'BLOCK') {
    result.recommendation = `Content blocked: slop score ${scan.score} (threshold: ${thresholds.block}). Strip boilerplate sections before publishing.`;
  } else if (scan.verdict === 'WARN') {
    result.recommendation = `Warning: slop score ${scan.score}. Review flagged patterns before publishing.`;
  } else {
    result.recommendation = 'Content passes QA gate.';
  }

  return result;
}

// CLI mode
const args = process.argv.slice(2);
if (args.length > 0) {
  const postId = parseInt(args.find(a => a.startsWith('--post-id='))?.split('=')[1] || '0', 10);
  const rawHtml = args.find(a => a.startsWith('--html='))?.split('=').slice(1).join('=');

  (async () => {
    let html, meta = {};

    if (postId) {
      console.log(`Fetching post #${postId}...\n`);
      const post = await fetchPost(postId);
      html = post.content?.raw || post.content?.rendered || '';
      meta = { modified: post.modified, postId: post.id };
      console.log(`Title: ${post.title?.raw || post.title?.rendered}`);
      console.log(`Modified: ${post.modified}`);
    } else if (rawHtml) {
      html = rawHtml;
    } else {
      console.error('Usage: node qa-gate.js --post-id=123 or --html="<content>"');
      process.exit(1);
    }

    const result = validateForPublish(html, meta);

    console.log(`\nScore:          ${result.score}`);
    console.log(`Verdict:        ${result.verdict}`);
    console.log(`Approved:       ${result.approved}`);
    if (result.maturation) {
      console.log(`Days since edit: ${result.maturation.daysSinceUpdate}`);
      console.log(`21-day eligible: ${result.maturation.eligible}`);
    }
    console.log(`Recommendation: ${result.recommendation}`);

    if (result.violations.length > 0) {
      console.log(`\nViolations (${result.violations.length}):`);
      for (const v of result.violations) {
        console.log(`  [${v.category}] "${v.pattern}" (weight: ${v.weight}, count: ${v.count})`);
      }
    }

    process.exit(result.approved ? 0 : 1);
  })().catch(err => {
    console.error('QA Gate error:', err.message);
    process.exit(1);
  });
}
