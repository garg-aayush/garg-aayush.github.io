---
layout: post
title:  Baseline Evaluation of GPT-4o for Functional Representation Extraction
tags: ["LLMs", "GPT", "Evaluation", "VIGGO"]
mathjax: true
summary: In this blog post, I will walk through structured data extraction, specifically functional representation, using OpenAI's GPT-4o model.
---

### Introduction
Extracting structured data from unstructured texts allow us to condense the information present in the text. This representation then can be used for efficient indexing and other downstream RAG applications. 

I want to evaluate [GPT-4o](https://openai.com/index/hello-gpt-4o/) performance in extracting structural data, specifically, functional representation, from the unstructured domain-specific text. I will use [ViGGO dataset](https://huggingface.co/datasets/GEM/viggo) to evaluate it on custom evaluation criteria and will set it as baseline performance for that can be used for comparison in future work with other models such as **Claude**, **Gemini**, and **custom** fine-tuned open-source models.

### ViGGO Dataset
It is a video game domain opinions data-to-text generation dataset. Strictly speaking, it is intended to generate coherent conversational responses based on input functional representations (set of attributes and values).

However, I use the **reverse task**, where I **generate structured functional representations from the given text input**.

A typical ViGGO dataset example has the output structured functional representation consisting of a single function with attributes and attribute values.

```
Text:
You said that you liked Crysis. Do you often play first person games from Crytek Frankfurt?

Functional Representation:
verify_attribute(name[Crysis], developer[Crytek Frankfurt], rating[good], player_perspective[first person])
```

_Since I am not training/fine-tuning any model, I will only consider the ViGGO validation dataset for this exercise._


---
Thanks for reading! If you have any questions or feedback, please let me know on [Twitter](https://twitter.com/Aayush_ander) or [LinkedIn](https://www.linkedin.com/in/aayush-garg-8b26a734/).
