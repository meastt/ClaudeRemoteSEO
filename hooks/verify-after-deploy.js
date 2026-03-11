/**
 * OpenClaw after_tool_call hook — Post-Deploy Verification
 *
 * Intercepts wordpress_rest POST/PUT calls that target the Code Snippets API.
 * After the call completes, immediately verifies the front-end still returns
 * HTTP 200. If not, deactivates the snippet that was just created/modified
 * and logs the rollback.
 *
 * Hook signature (OpenClaw v2026.3.2+):
 *   export default async function({ runId, toolCallId, agentId, toolName, method, payload, result, context })
 *   Returns: { alert?: string, context?: object }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.join(__dirname, '..', 'tools', 'audit-logs');

const CODE_SNIPPETS_RE = /\/wp-json\/code-snippets\/v1\/snippets/i;
const SITE_URL = 'https://tigertribe.net';
const VERIFY_TIMEOUT_MS = 15000;
const VERIFY_RETRIES = 2;
const VERIFY_RETRY_DELAY_MS = 3000;

/**
 * HTTP GET with timeout (no external deps).
 */
async function httpGet(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return { status: res.status, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deactivate a Code Snippet by ID via the REST API.
 */
async function deactivateSnippet(snippetId, auth) {
  const url = `${SITE_URL}/wp-json/code-snippets/v1/snippets/${snippetId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ active: false }),
  });
  return { status: res.status, ok: res.ok };
}

/**
 * Extract snippet ID from the request URL or response payload.
 */
function extractSnippetId(payload, result) {
  const urlMatch = (payload?.url || '').match(/\/snippets\/(\d+)/);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  if (result?.data?.id) return result.data.id;
  if (result?.id) return result.id;
  return null;
}

function logAudit(entry) {
  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(AUDIT_DIR, `deploy-verify-${ts}.json`),
      JSON.stringify(entry, null, 2)
    );
  } catch {
    // Non-fatal
  }
}

export default async function verifyAfterDeploy({ runId, toolCallId, agentId, toolName, method, payload, result, context }) {
  const upperMethod = (method || '').toUpperCase();

  if (toolName !== 'wordpress_rest') return {};
  if (upperMethod !== 'POST' && upperMethod !== 'PUT') return {};

  const requestUrl = payload?.url || payload?.endpoint || '';
  if (!CODE_SNIPPETS_RE.test(requestUrl)) return {};

  const snippetId = extractSnippetId(payload, result);
  const snippetName = result?.data?.name || result?.name || `snippet-${snippetId || 'unknown'}`;

  let frontendOk = false;
  let lastStatus = null;

  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt++) {
    if (attempt > 1) {
      await new Promise(r => setTimeout(r, VERIFY_RETRY_DELAY_MS));
    }
    try {
      const check = await httpGet(SITE_URL, VERIFY_TIMEOUT_MS);
      lastStatus = check.status;
      if (check.ok) {
        frontendOk = true;
        break;
      }
    } catch (err) {
      lastStatus = `error: ${err.message}`;
    }
  }

  const auditEntry = {
    timestamp: new Date().toISOString(),
    runId, toolCallId, agentId,
    action: 'deploy-verify',
    snippetId, snippetName,
    method: upperMethod,
    frontendStatus: lastStatus,
    frontendOk,
  };

  if (frontendOk) {
    auditEntry.verdict = 'PASS';
    logAudit(auditEntry);
    return {};
  }

  let rollbackResult = 'no_snippet_id';
  if (snippetId) {
    try {
      const auth = payload?.headers?.Authorization || context?.auth_header || '';
      const rb = await deactivateSnippet(snippetId, auth);
      rollbackResult = rb.ok ? 'success' : `failed_${rb.status}`;
    } catch (err) {
      rollbackResult = `error: ${err.message}`;
    }
  }

  auditEntry.verdict = 'ROLLBACK';
  auditEntry.rollbackResult = rollbackResult;
  logAudit(auditEntry);

  const alertMsg = [
    `🚨 Deploy Verification FAILED — Auto-Rollback`,
    ``,
    `Snippet: ${snippetName} (ID: ${snippetId || '?'})`,
    `Front-end status: ${lastStatus}`,
    `Rollback: ${rollbackResult}`,
    ``,
    `The Code Snippet was deactivated because the site returned ${lastStatus} after deployment.`,
    `Review the snippet code for PHP errors before reactivating.`,
  ].join('\n');

  return {
    alert: alertMsg,
    context: {
      deploy_verification_failed: true,
      rollback_snippet_id: snippetId,
      rollback_result: rollbackResult,
      frontend_status: lastStatus,
    },
  };
}
