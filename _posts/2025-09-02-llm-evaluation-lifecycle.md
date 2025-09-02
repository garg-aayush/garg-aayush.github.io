---
layout: post
title:  "What I Learned in Lecture 1: LLM Evaluation Lifecycle"
tags: ["LLMs", "Evaluation"]
mathjax: true
summary: In this blog post, I will discuss the key ideas/insights I learnt around the "Three Gulfs", the systematic evaluation and improvement of LLM-application.
---

Recently I enrolled in [AI Evals for Engineers and PMs](https://maven.com/parlance-labs/evals), a course by [Hamel](https://hamel.dev/) and [Shreya](https://www.sh-reya.com/) that’s refreshingly LLM application evaluation-centric. Instead of abstract benchmarks, it teaches you how to systematically evaluate and improve LLM-powered products. As the they put it, the goal is to:

> “Master the principles and practices of application-centric LLM evaluation to systematically improve AI-driven products.”

In this first blog of what I hope will be a multi-part series 🤞, I’ll walk through my key takeaways from **Lecture 1**. 

# Key Takeaways

## 1. Evaluation isn’t Optional but Fundamental

Anyone who has built or worked with LLM pipelines knows that their outputs are open-ended, subjective, and unstructured (unless you enforce it). If you rely on ad-hoc checks, which I have been guilty of, often leads to knee-jerk fixes. Moreover, it completely miss the long-term need of continuous tracking which is essential for your pipeline reliability, safety, and usefulness. This is why **_Evaluation_—the systematic measurement of an LLM pipeline quality—is critical!**

## 2. The Three Gulfs
The below image beautifully captures and categorizes all challenges associated with any LLM application:
![Three gulfs](/static/img/blog-2025-09-03/three-gulfs.png)

* **Gulf of Comprehension**: This is a result of limited understanding of the input data (user queries) and the pipeline’s outputs (behavior). Bridging it requires examining examples to identify common failure modes. This brings it own challenge: _"How to manually review every input or output to identify failure modes?"_.

* **Gulf of Specification**: It refers to the difficulty of translating a user’s high-level intent into unambiguous pricise instructions for the LLM. Bridging it requires writing detailed prompts that captures "true intent" which in itself is challenging due to _ambiguous nature of natural language._

* **Gulf of Generalizaton**: This is due to LLMs unexpected and inconsistent behavior on new or unusual (out of distribution) inputs. Bridging it requires a good understanding of your LLM model capabilities. This leads to the question: _"How to improve LLM model?"_

## 3. Analyze → Measure → Improve Lifecycle

Hamel and Shreya introduced a structured way to bridge the above gulfs: **Analyze → Measure → Improve** lifecycle. 

![Analyze → Measure → Improve Lifecycle](/static/img/blog-2025-09-03/pitfalls.png)

However, the most important takeaways for me was not what each phase means but the **pitfalls** that often derail them:

| Phase    | Pitfalls                                                                 | Notes                                                                 |
|----------|--------------------------------------------------------------------------|----------------------------------------------------------------------|
| **Analyze** | Outsourcing annotation; looking at too few examples and forming shaky hypotheses | This is where you learn the most. Spend **~75–80%** of your time here—good analysis sets up everything else. |
| **Measure** | Misaligned or poorly designed LLM judges; “overfitting” by testing judges on the same examples used in the judge prompt | In this phase, you need the rigor of data science. **NEVER** leak test data into judge prompts. |
| **Improve** | Prematurely jumping to fixes; defaulting to the most complex solution first (fine-tuning, bigger models) | **Start simple**. Prompt tweaks and improvements often go a long way before heavier changes are needed. |


## 4. Always Remember LLMs Core Strengths and Weaknesses
When we write prompts it’s easy to ignore that LLMs are non-deterministic, prompt-sensitive and can confidently hallucinate. Thus, always remember: **_“LLMs are powerful but imperfect components. Leverage strengths, anticipate weaknesses.”_**

![LLM Strengths vs. Weaknesses](/static/img/blog-2025-09-03/llm-strengths-weaknesses.jpg)


## 5. Craft Precise Prompts and Refine Iteratively
## 6. Reference-based vs Reference-Free Metrics
