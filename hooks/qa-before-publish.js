/**
 * OpenClaw before_tool_call hook — QA Gate
 *
 * Intercepts wordpress_rest POST/PUT calls, runs the slop detector
 * on the content field, and blocks if the score >= 10.
 *
 * Hook signature (OpenClaw v2026.3.2):
 *   export default async function({ runId, toolCallId, agentId, toolName, method, payload, context })
 *   Returns: { block: boolean, reason?: string, context?: object }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanContent } from '../tools/slop-detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.join(__dirname, '..', 'tools', 'audit-logs');

export default async function qaBeforePublish({ runId, toolCallId, agentId, toolName, method, payload, context }) {
  // Only intercept POST/PUT on wordpress_rest
  const upperMethod = (method || '').toUpperCase();
  if (toolName !== 'wordpress_rest' || (upperMethod !== 'POST' && upperMethod !== 'PUT')) {
    return { block: false };
  }

  // Extract content from payload
  const content = payload?.content || payload?.body?.content || '';
  if (!content) {
    return { block: false };
  }

  const result = scanContent(content);

  // Log the result
  const logEntry = {
    timestamp: new Date().toISOString(),
    runId,
    toolCallId,
    agentId,
    method: upperMethod,
    score: result.score,
    verdict: result.verdict,
    violationCount: result.violations.length,
    violations: result.violations,
  };

  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(AUDIT_DIR, `hook-${timestamp}.json`),
      JSON.stringify(logEntry, null, 2)
    );
  } catch {
    // Non-fatal — don't block publish due to logging failure
  }

  if (result.verdict === 'BLOCK') {
    return {
      block: true,
      reason: `QA Gate: slop score ${result.score} (threshold: 10). ${result.violations.length} violation(s) detected.`,
    };
  }

  if (result.verdict === 'WARN') {
    return {
      block: false,
      context: {
        qa_warning: true,
        qa_score: result.score,
        qa_violations: result.violations,
      },
    };
  }

  return { block: false };
}
