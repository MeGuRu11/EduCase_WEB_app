# Install full agents from agency-agents repo
# Run from epicase/ root

Write-Host "=== Installing Claude Code agents ===" -ForegroundColor Cyan
git clone --depth 1 https://github.com/msitarzewski/agency-agents.git _agents_repo

$claude_agents = @{
    "engineering/engineering-backend-architect.md"   = ".claude/agents/backend-architect.md"
    "engineering/engineering-security-engineer.md"   = ".claude/agents/security-engineer.md"
    "engineering/engineering-code-reviewer.md"       = ".claude/agents/code-reviewer.md"
    "engineering/engineering-database-optimizer.md"  = ".claude/agents/database-optimizer.md"
    "engineering/engineering-software-architect.md"  = ".claude/agents/software-architect.md"
    "specialized/agents-orchestrator.md"             = ".claude/agents/orchestrator.md"
}

foreach ($src in $claude_agents.Keys) {
    Copy-Item "_agents_repo/$src" $claude_agents[$src] -Force
    Write-Host "  Claude: $($claude_agents[$src])" -ForegroundColor Green
}

Write-Host "`n=== Installing Codex subagents ===" -ForegroundColor Cyan

# Codex uses VoltAgent/awesome-codex-subagents (.toml format)
git clone --depth 1 https://github.com/VoltAgent/awesome-codex-subagents.git _codex_agents

$codex_agents = @(
    "frontend-developer.toml",
    "api-tester.toml",
    "typescript-specialist.toml",
    "react-developer.toml"
)
foreach ($agent in $codex_agents) {
    $src = Get-ChildItem -Path "_codex_agents" -Recurse -Filter $agent | Select-Object -First 1
    if ($src) {
        Copy-Item $src.FullName ".codex/agents/$agent" -Force
        Write-Host "  Codex: .codex/agents/$agent" -ForegroundColor Green
    }
}

Remove-Item -Recurse -Force _agents_repo, _codex_agents
Write-Host "`nDone!" -ForegroundColor Green
