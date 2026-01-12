# Claude Skills Notes

## Video: [Claude Agent Skills Explained](https://www.youtube.com/watch?v=fOxC44g8vig)

### Question 1: What are skills?
Agent Skills are organized folders that package expertise that Claude can automatically invoke when relevant to the task at hand. These skills are portable across Claude Code, the API, and claude.ai.

### Question 2: How does Claude ensure the context window doesn't blow up due to skills?
Claude ensures the context window doesn't get overloaded through a process called **progressive disclosure**.

1. At startup, only the name and description of each installed skill are loaded into the system prompt. This consumes about 30 to 50 tokens per skill, making Claude aware of the skill's existence without loading its full content.
2. When a user's prompt matches a skill's description, Claude dynamically loads the full `skill.md` file into context.
3. If the skill references other files or scripts, they are progressively loaded and run only as needed.
4. This method allows you to install many different skills to perform complex tasks without bloating your context window.

### Question 3: How are skills different from Claude.md, MCP servers, and sub-agents?
Agent Skills differ from `claude.md` files, MCP Servers, and Subagents in their function and purpose:

#### Agent Skills vs. Claude.md
- **Agent Skills** teach Claude how to do specialized tasks and are portable expertise that work across any project. For example, a front-end design skill can teach Claude typography standards or animation patterns.
- **Claude.md** files tell Claude about a specific project. They live alongside your code in the repository and provide information like your tech stack, coding conventions, and repo structure. For instance, a `claude.md` file might state that a project uses Next.js and Tailwind.

#### Agent Skills vs. MCP Servers
- **Agent Skills** teach Claude what to do with data. For example, a database query skill can teach Claude your team's query optimization patterns.
- **MCP Servers** provide universal integration and a single protocol to connect Claude to external context sources like GitHub, Linear, and PostgreSQL. In essence, MCP connects to data.

#### Agent Skills vs. Subagents
- **Agent Skills** provide portable expertise that any agent can use. For example, both a front-end developer subagent and a UI reviewer subagent can load and use the same accessibility standard skill.
- **Subagents** are specialized AI assistants with fixed roles. Each subagent has its own context window, custom prompt, and specific tool permissions.


## Video Key Takeaways

This video introduces **Agent Skills**, a powerful way to customize and specialize AI agents. These skills have become an open industry standard adopted by various agents, including GitHub Copilot.

- **Simple Example Skill**: Demonstrates a skill for creating consistent weekly status reports. It shows how to define the name, description, and instructions within the Claude web app.
- **SKILL.md File**: At its core, an Agent Skill is a `skill.md` markdown file. It contains metadata (name and description) to help the agent decide when to use it, along with loaded instructions when activated.
- **How Skills Work**: While modern AI agents have general capabilities, skills provide specialized knowledge for specific tasks. They act as a package of instructions, scripts, and resources that lead to repeatable and consistent behavior.
- **Why Skills are Powerful**: Skills are portable across different agents and easily shared. This is enabled by a capable AI model and an execution environment that allows the agent to perform actions like reading/writing files, running code, and using local or cloud services.

## Resources
- [Claude Agent Skills Cookbook](https://platform.claude.com/cookbook/skills-notebooks-01-skills-introduction)
- [Claude Agent Skills Explained Video](https://www.youtube.com/watch?v=fOxC44g8vig)
- [Agent Skills Repo](https://github.com/agentskills/agentskills/)
- [Agent Skills](https://agentskills.io/integrate-skills)


## Example images
- https://www.rawpixel.com/image/6329319/png-sticker-public-domain
