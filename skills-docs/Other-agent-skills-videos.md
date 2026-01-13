# Other Agent Skills/Claude Skills videos

## Introduction to Agent Skills — 1. Why Agent Skills
Link: https://www.youtube.com/watch?v=gCyZGZCoWh0

* **Simple Example:** The video demonstrates creating a skill for a "Weekly Status Report" to consistently format emails. This involves setting up a name, description, and detailed instructions for the agent to follow.
* **The SKILL.md File:** At its core, an Agent Skill is a markdown file (skill.md) containing metadata (name, description) and instructions. The description helps the agent determine when to use the skill, and the instructions guide its actions.
* **How Skills Work:** While modern AI agents have strong general capabilities, they lack specialized knowledge. Skills provide this by packaging instructions, scripts, templates, or other resources. When a relevant request is made, the agent loads the skill and follows its guidance, ensuring repeatable and consistent behavior.
* **Why Skills are Powerful:** Skills are portable, meaning they can be used across different agents (e.g., Code, GitHub Copilot). They can also be easily shared with others, ensuring consistent behavior across teams or communities.
* **Adoption and Open Standard:** Agent Skills were initially introduced by Entropic and became an open standard on December 18th. GitHub quickly adopted them, and many other agents are following suit, indicating rapid industry adoption.
* **Recap:** Skills augment an AI agent's general intelligence with specialized domain knowledge. They are easy to create without coding and allow agents to customize capabilities like text generation, code execution, and file creation to specific needs.
* The series will further explore various uses of skills, including document templates, data analysis, graphics editing, API connections, and cross-agent portability.


## Introduction to Agent Skills — 2. Agentic Templating with Assets and Scripts
Link: https://www.youtube.com/watch?v=7LtCEJ4sfSE&t
The video "Introduction to Agent Skills — 2. Agentic Templating with Assets and Scripts" by Eleanor Berger explains how to use agent skills with assets and scripts to automate document creation from templates.

Key takeaways from the video:

* **Agent Skills Overview:** Agent skills are a new format for customizing AI agents, allowing them to perform specialized tasks. They are essentially folders or zip files containing instructions that teach an agent new capabilities.
* **Assets and Scripts:** Skills can include more than just instructions; they can also contain assets (files like templates, images, documents, or configuration files) and scripts (code for complex actions).
* **Agentic Templating Mechanism:** The video demonstrates creating an agentic templating mechanism for generating invoices. The fixed parts of the invoice (template, logo, layout) remain consistent, while variable details (client, line items, amounts) are intelligently filled in by the agent.
* **Creating a Skill with a Template:** A Word document template with markers (e.g., curly brackets) is used to indicate parts to be replaced. The agent is instructed to collect information from the user, ask for missing details, and produce a PDF. The agent then writes a Python script to handle the technical work of opening the Word document, finding placeholders, and replacing them.
* **Using the Skill:** Once the skill is created, the user can provide the necessary information, and the agent uses the skill to generate a complete, ready-to-send PDF invoice.
* **Skill Portability:** The video highlights that agent skills are portable and can run in different environments, such as the Claude web app or locally with Claude Code, maintaining consistent behavior.
* **Agentic Advantage:** This approach allows non-developers to create complex automation. The agent handles the coding and structural organization, freeing the user to focus on describing what they want. It also enables collaborative behavior, with the agent handling ambiguities and clarifying questions from the user.




> Since Anthropic released [Agent Skills](https://agentskills.io) as an open standard in December 2025, they are rapidly becoming available across different coding agents including GitHub Copilot, Codex CLI, Cursor and more. **Write a skill once, use it anywhere.**