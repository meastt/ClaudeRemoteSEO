import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const patternsPath = path.join(__dirname, 'slop-patterns.json');
const patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));

const { thresholds, categories } = patternsData;

/**
 * Normalize Gutenberg block markers to plain HTML for scanning.
 */
function normalizeGutenberg(html) {
  return html.replace(/<!--\s*\/?wp:\w[\w/-]*\s*(?:\{[^}]*\})?\s*-->/g, '');
}

/**
 * Scan HTML content for slop patterns.
 * Returns { score, verdict, violations[] }.
 */
export function scanContent(html) {
  const normalized = normalizeGutenberg(html).toLowerCase();
  const violations = [];
  let score = 0;

  for (const [categoryName, category] of Object.entries(categories)) {
    const patternsToCheck = category.patterns || [];
    const headingPatterns = category.heading_patterns || [];

    // Check body patterns
    for (const pattern of patternsToCheck) {
      const regex = new RegExp(pattern, 'gi');
      const matches = normalized.match(regex);
      if (matches) {
        violations.push({
          category: categoryName,
          pattern,
          count: matches.length,
          weight: category.weight,
          points: category.weight,
        });
        score += category.weight;
      }
    }

    // Check heading patterns against <h2>/<h3> content
    if (headingPatterns.length > 0) {
      const headingRegex = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
      let match;
      while ((match = headingRegex.exec(normalized)) !== null) {
        const headingText = match[1].replace(/<[^>]+>/g, '').trim();
        for (const hp of headingPatterns) {
          if (new RegExp(hp, 'i').test(headingText)) {
            violations.push({
              category: categoryName,
              pattern: `heading: "${headingText}" matches "${hp}"`,
              count: 1,
              weight: category.weight,
              points: category.weight,
            });
            score += category.weight;
          }
        }
      }
    }
  }

  let verdict = 'CLEAN';
  if (score >= thresholds.block) verdict = 'BLOCK';
  else if (score >= thresholds.warn) verdict = 'WARN';

  return { score, verdict, violations };
}

/**
 * Identify the first boilerplate block in HTML content.
 * Splits on <h2>/<h3>, finds the first heading matching boilerplate patterns,
 * and marks everything from there to end as removable — preserving <!-- sources: --> blocks.
 */
export function identifyBoilerplateBlock(html) {
  const headingPatterns = categories.structural_markers?.heading_patterns || [];
  const boilerplatePatterns = categories.boilerplate_sections?.patterns || [];

  // Split content into sections by <h2> or <h3>
  const sectionRegex = /(<h[23][^>]*>)/gi;
  const parts = html.split(sectionRegex);

  // parts alternates between content and heading tags
  // Rebuild into sections: [{heading, content, startIndex}]
  const sections = [];
  let currentPos = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^<h[23]/i.test(part) && i + 1 < parts.length) {
      const headingTag = part;
      const content = parts[i + 1];
      sections.push({
        heading: headingTag + content.split(/(<h[23])/i)[0],
        startIndex: currentPos,
        rawHeading: headingTag,
      });
      currentPos += part.length;
      i++; // skip content part, we consumed it
      currentPos += parts[i].length;
    } else {
      currentPos += part.length;
    }
  }

  // Find the first section whose heading matches boilerplate patterns
  let infectStart = -1;

  for (const section of sections) {
    const headingText = section.rawHeading
      .replace(/<[^>]+>/g, '')
      .trim()
      .toLowerCase();

    // Check structural markers
    for (const hp of headingPatterns) {
      if (new RegExp(hp, 'i').test(headingText)) {
        infectStart = section.startIndex;
        break;
      }
    }
    if (infectStart >= 0) break;

    // Check if the section body is dense with boilerplate patterns
    const sectionLower = section.heading.toLowerCase();
    let hitCount = 0;
    for (const bp of boilerplatePatterns) {
      if (sectionLower.includes(bp)) hitCount++;
    }
    if (hitCount >= 3) {
      infectStart = section.startIndex;
      break;
    }
  }

  if (infectStart < 0) {
    return { found: false, cleanContent: html, removedContent: '' };
  }

  const beforeInfection = html.substring(0, infectStart).trimEnd();
  const infectedPortion = html.substring(infectStart);

  // Preserve <!-- sources: --> block if present in infected portion
  const sourcesMatch = infectedPortion.match(/<!--\s*sources?:[\s\S]*?-->/i);
  const sourcesBlock = sourcesMatch ? '\n\n' + sourcesMatch[0] : '';

  return {
    found: true,
    cleanContent: beforeInfection + sourcesBlock,
    removedContent: infectedPortion,
    infectStart,
  };
}

/**
 * Strip boilerplate from HTML content. Returns cleaned HTML.
 */
export function stripBoilerplate(html) {
  const result = identifyBoilerplateBlock(html);
  return result.cleanContent;
}

export { thresholds, categories };
