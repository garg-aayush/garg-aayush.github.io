# A Brief Introduction to Claude Agent Skills

If you've been following X or LinkedIn for the last few weeks, you have probably noticed the buzz around Claude Skills (or Agent Skills), apart from all the fanfare moment around Claude Code. There are tweets and posts appreciating their simplicity, devs sharing custom skills for everything from document generation to API integrations. I would say the hype is well deserved and genuine.

I had been aware of [Claude Skills](https://www.claude.com/news/skills) when they launched in October 2025 (thanks to [Simon Willison's blog post](https://simonwillison.net/2025/Oct/16/claude-skills/)). However, I did not really dig into them until I came across [this Hugging Face blog post](https://huggingface.co/blog/hf-skills-training) where they used Claude Code to fine-tune an open-source LLM. They built [Hugging Face Skills](https://github.com/huggingface/skills) that let you do something like this `Fine-tune Qwen3-0.6B on the dataset open-r1/codeforces-cots` and Claude handles everything from GPU selection, script generation, job submission, progress monitoring and pushing the finished model to the Hub. That was a woah moment for me!

Skills deserve all the attention they are getting as they provide the domain knowledge that modern LLMs/Agents need despite their impressive general capabilities. They are simple folders with packaged expertise that agents can dynamically invoke for relevant requests.

In this post, I will explain what skills are, why they matter, and walk you through one of the skills I use daily a **simple image editing skill** as an example of how you can quickly build skills for your own use case.

![Image Editing Skill Example](/static/img/blog-2026-01-13/image-editing-skill-ex-1.png)

