import * as fs from 'fs';
import * as path from 'path';

export type PermissionTier = 'allow' | 'deny' | 'ask';

interface PermissionRule {
  tool: string;
  pattern?: string;
  tier: PermissionTier;
}

interface PermissionPolicy {
  rules: PermissionRule[];
}

export interface PermissionDecision {
  tier: PermissionTier;
  matchedRule?: PermissionRule;
}

function defaultPolicyPath(): string {
  return path.resolve(process.cwd(), 'permissions.json');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  // Support simple wildcard policies where '*' means any sequence.
  const normalized = pattern.replace(/:\*/g, '*');
  const regex = `^${escapeRegex(normalized).replace(/\\\*/g, '.*')}$`;
  return new RegExp(regex);
}

function ruleMatches(rule: PermissionRule, tool: string, command: string): boolean {
  if (rule.tool.toLowerCase() !== tool.toLowerCase()) {
    return false;
  }
  if (!rule.pattern) {
    return true;
  }
  return patternToRegex(rule.pattern).test(command);
}

function parsePolicy(raw: string): PermissionPolicy {
  const parsed = JSON.parse(raw) as Partial<PermissionPolicy>;
  if (!parsed.rules || !Array.isArray(parsed.rules)) {
    return { rules: [] };
  }

  const rules = parsed.rules.filter((rule): rule is PermissionRule => {
    return Boolean(rule && typeof rule.tool === 'string' && typeof rule.tier === 'string');
  });

  return { rules };
}

function splitShellSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\n/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function firstMatchingRule(rules: PermissionRule[], tool: string, command: string): PermissionRule | undefined {
  return rules.find((rule) => ruleMatches(rule, tool, command));
}

export function evaluatePermission(tool: string, command: string, policyPath?: string): PermissionDecision {
  const resolvedPolicyPath = policyPath || process.env['PERMISSIONS_FILE'] || defaultPolicyPath();

  if (!fs.existsSync(resolvedPolicyPath)) {
    return { tier: 'allow' };
  }

  try {
    const raw = fs.readFileSync(resolvedPolicyPath, 'utf8');
    const policy = parsePolicy(raw);

    const segments = splitShellSegments(command);
    const candidates = segments.length > 0 ? segments : [command];

    let askMatch: PermissionRule | undefined;
    for (const segment of candidates) {
      const match = firstMatchingRule(policy.rules, tool, segment);
      if (!match) continue;

      if (match.tier === 'deny') {
        return { tier: 'deny', matchedRule: match };
      }

      if (match.tier === 'ask' && !askMatch) {
        askMatch = match;
      }
    }

    if (askMatch) {
      return { tier: 'ask', matchedRule: askMatch };
    }

    return { tier: 'allow' };
  } catch {
    // Fail-open for malformed policy during local demos.
    return { tier: 'allow' };
  }
}