---
paths:
  - "posts/**"
---

# Blog Posts: Workflow

## Branching
- **Always work on the `blog-posts` branch** when writing a new blog post, never commit directly to `master`
- **Commit locally at important checkpoints** on the `blog-posts` branch while drafting
- Only after the user has tested locally and confirms: **push to remote -> create PR to `master` -> merge -> `git checkout master && git pull`**
- After merging, update `blog-posts` and `tools` branches to match `master`

## Creating a New Post
1. Create the post as `posts/YYYY-MM-DD-title/index.qmd` (always use the directory format, not single `.qmd` files)
2. Store images in `static/img/blog-YYYY-MM-DD/` matching the post date
3. Convert images to JPEG with good quality before adding to the post
4. Use standard YAML frontmatter: `title`, `tags`, `date`, `permalink`, `description`, and optionally `mathjax: true`
5. After writing, run `quarto render posts/YYYY-MM-DD-title/index.qmd` to verify it renders correctly
