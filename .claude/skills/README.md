# EpiCase Agent Skills

Skills are cross-compatible: SKILL.md format works for both Claude Code and Codex CLI.

## Install skills

### Via Codex built-in installer:
```
$skill-installer install https://github.com/openai/skills/tree/main/skills/.curated/code-change-verification
```

### Via git clone (works for both Claude and Codex):
See docs/INSTALL_SKILLS_GUIDE.md for full instructions.

## Priority skills to install:
1. test-driven-development (obra/superpowers)
2. vibesec (BehiSecc) — secure coding
3. frontend-design (anthropic) — anti-AI-slop
4. debug-skill (AlmogBaku) — breakpoints
5. code-change-verification (openai/skills) — Codex built-in
