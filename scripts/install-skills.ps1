# Install skills (cross-compatible for both Claude and Codex)
# Run from epicase/ root

Write-Host "=== Installing Skills ===" -ForegroundColor Cyan

# 1) VoltAgent (TDD, debugging, verification)
git clone --depth 1 https://github.com/VoltAgent/awesome-agent-skills.git _skills

$skills = @(
    @("skills/obra/test-driven-development/SKILL.md", "test-driven-development")
    @("skills/obra/systematic-debugging/SKILL.md", "systematic-debugging")
    @("skills/obra/verification-before-completion/SKILL.md", "verification-before-completion")
)
foreach ($pair in $skills) {
    $src = "_skills/$($pair[0])"
    if (Test-Path $src) {
        # Install to BOTH claude and codex
        Copy-Item $src ".claude/skills/$($pair[1]).md" -Force
        Copy-Item $src ".codex/skills/$($pair[1]).md" -Force
        Write-Host "  OK: $($pair[1])" -ForegroundColor Green
    }
}
Remove-Item -Recurse -Force _skills

# 2) Anthropic (frontend-design)
git clone --depth 1 https://github.com/anthropics/skills.git _anthropic
Copy-Item "_anthropic/skills/frontend-design/SKILL.md" ".claude/skills/frontend-design.md" -Force
Copy-Item "_anthropic/skills/frontend-design/SKILL.md" ".codex/skills/frontend-design.md" -Force
Write-Host "  OK: frontend-design" -ForegroundColor Green
Remove-Item -Recurse -Force _anthropic

# 3) VibeSec
git clone --depth 1 https://github.com/BehiSecc/vibesec.git _vibesec
if (Test-Path "_vibesec/SKILL.md") {
    Copy-Item "_vibesec/SKILL.md" ".claude/skills/vibesec.md" -Force
    Copy-Item "_vibesec/SKILL.md" ".codex/skills/vibesec.md" -Force
    Write-Host "  OK: vibesec" -ForegroundColor Green
}
Remove-Item -Recurse -Force _vibesec

# 4) OpenAI official skills (for Codex)
Write-Host "`nNote: Codex has built-in skill installer." -ForegroundColor Yellow
Write-Host 'Run in Codex: $skill-installer install code-change-verification' -ForegroundColor Yellow

Write-Host "`n=== Done! ===" -ForegroundColor Green
