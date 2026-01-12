# Claude Skills → Agent Skills: A Quick Summary

## Timeline

| Date | Event |
|------|-------|
| **October 2025** | Anthropic launches "Skills" as a Claude-specific feature |
| **December 18, 2025** | Anthropic publishes Agent Skills as an **open standard** |

## What Are They?

Skills are **folders containing a SKILL.md file** with instructions, scripts, and resources that teach AI agents how to perform specific tasks. They use **progressive disclosure**—only the name and description are loaded initially (~30-50 tokens), with full content loaded only when needed.

## Claude Skills vs Agent Skills

**Technically identical.** The only difference is scope:

- **Claude Skills** = Anthropic's implementation within Claude products
- **Agent Skills** = The open standard (at [agentskills.io](https://agentskills.io)) that any AI platform can adopt

## Who's Adopted It?

- OpenAI (ChatGPT, Codex CLI)
- Microsoft (VS Code Copilot)
- GitHub Copilot
- Various community tools

## Where to Find Skills

| Resource | URL |
|----------|-----|
| Open Standard Spec | [agentskills.io](https://agentskills.io) |
| Anthropic's Repo | [github.com/anthropics/skills](https://github.com/anthropics/skills) |
| Community Marketplace | [skillsmp.com](https://skillsmp.com) (25,000+ skills) |
| Smithery | [smithery.ai/skills](https://smithery.ai/skills) (15,000+ skills) |

## Key Insight

Skills follow the same playbook as MCP (Model Context Protocol)—Anthropic builds it for Claude first, then opens it as an industry standard.