---
name: skill-flag
description: Security scanner for Clawdbot/OpenClaw skills. Scans for malicious patterns, backdoors, credential theft, prompt injection, and security risks. Produces risk-scored reports (0-100) with detection across 8 threat categories.
---

# Skill Flag

Security scanning tool for Clawdbot/OpenClaw skills - identifies malicious patterns and vulnerabilities across installed skill packages.

## Detection Categories

| Priority | Category |
|----------|----------|
| Critical | Data exfiltration |
| Critical | Backdoors |
| Critical | Credential theft |
| High | Prompt injection |
| High | Dangerous code execution |
| Medium | Persistence mechanisms |
| Medium | Code obfuscation |
| Low | Suspicious imports and network activity |

## Risk Scoring

Skills receive scores from 0-100:

| Score | Rating |
|-------|--------|
| 0-20 | Clean |
| 21-40 | Low Risk |
| 41-60 | Medium Risk |
| 61-80 | High Risk |
| 81-100 | Critical |

## Usage

### Scan all installed skills

```
"Scan all my skills for security issues"
```

### Scan a specific skill

```
"Check the [skill-name] skill for malicious patterns"
```

### Pre-install scan

```
"Scan this skill before I install it"
```

## Output

Reports are saved to `skills/skill-flag/reports/`.

## False Positives

Some legitimate patterns may be flagged:
- Price trackers genuinely need API access
- Email tools require network connectivity
- File managers perform expected file operations

Human judgment is recommended when reviewing flagged items.
