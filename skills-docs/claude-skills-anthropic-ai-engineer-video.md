# Don't Build Agents, Build Skills Instead
**Speakers:** Barry Zhang & Mahesh Murag (Anthropic)  
**Video:** [YouTube Link](https://www.youtube.com/watch?v=CEvIs9y1uog)

## 1. The Core Problem: Why Agents Fail
*   **Lack of Expertise:** Current agents are often "brilliant generalists" (the "Mahesh" archetype) but lack the deep, domain-specific knowledge required for consistent real-world execution (the "Barry" archetype).
*   **Universal Interface:** Code has emerged as a universal interface for agents to interact with the digital world, more than just a specific use case.
*   **Contextual Blindness:** Agents struggle to absorb human expertise, lack upfront context, and don't naturally learn over time.

## 2. The Solution: Skills
*   **Definition:** Composable procedural knowledge packaged as simple folders of scripts.
*   **Advantages over Tools:** Unlike traditional tools, skills are self-documenting, modifiable on the fly, and only loaded when needed, protecting the context window through progressive disclosure.
*   **Efficiency:** Saving repeatedly used scripts into skills prevents the model from "re-inventing the wheel" for every task.

## 3. The Evolving Ecosystem
*   **Foundational Skills:** General-purpose or broad domain capabilities (e.g., handling professional office documents). d
*   **Third-Party Skills:** Software-specific expertise built by partners (e.g., Browserbase for automation, Notion for workspace understanding).
*   **Enterprise Skills:** Custom-built internal knowledge (e.g., org-specific best practices, internal APIs, or code styles).

## 4. Trends and Future Synergy
*   **MCP Synergy:** Skills provide the *expertise* (procedural logic), while MCP provides the *connectivity* (access to data/systems).
*   **Non-Technical Creators:** A shift toward subject matter experts (finance, legal, recruiting) building their own skills without needing deep coding knowledge.
*   **Software Maturity:** Moving toward treating skills like production software—with versioning, dependencies, testing, and evaluation.

## 5. The Vision: Continuous Learning
*   **Transferable Memory:** Skills provide a tangible way for agents to "learn" by writing down successful patterns for future use.
*   **Collective Knowledge:** An evolving knowledge base where feedback makes every agent across an organization better over time.
*   **The OS Analogy:**
    *   **Models:** Processors (raw power).
    *   **Agent Runtime:** Operating System (orchestration).
    *   **Skills:** Applications (domain expertise encoded as software).

## Transcript

0:21 All right, good morning and thank you
0:22 for having us again. Last time we were
0:25 here, we're still figuring out what an
0:26 agent even is. Today, many of us are
0:29 using agents on a daily basis. But we
0:32 still notice gaps. We still have slots,
0:34 right? Agents have intelligence and
0:36 capabilities, but not always expertise
0:38 that we need for real work. I'm Barry.
0:41 This is Mahes. We created agent skills.
0:44 In this talk, we'll show you why we
0:46 stopped building agents and started
0:48 building skills instead.
0:51 A lot of things have changed since our
0:53 last talk. MCP became the standard for
0:55 agent connectivity. Cloud Code, our
0:57 first coding agent, launched to the
0:59 world and our cloud agent SDK now
1:02 provides a production ready agent out of
1:03 the box. We have a more mature ecosystem
1:06 and we're moving towards a new paradigm
1:08 for agents. That paradigm is a tighter
1:11 coupling between the model and a runtime
1:13 environment.
1:15 Put simply, we think code is all we
1:18 need.
1:20 We used to think agents in different
1:22 domains will look very different. Each
1:23 one will need its own tools and
1:25 scaffolding and that means we'll have a
1:27 separate agent for each use case for
1:29 each domain. Well, customization is
1:31 still important for each domain. The
1:34 agent underneath is actually more
1:35 universal than we thought.
1:38 What we realized is that code is not
1:40 just a use case but the universal
142 interface to the digital world.
1:44 After we built cloud code, we realized
1:46 that cloud code is actually a general
1:48 purpose agent.
1:50 Think about generating a financial
1:52 report. The model can call the API to
1:54 pull in data and do research. It can
1:56 organize that data in the file system.
1:58 It can analyze it with Python and then
2:00 synthesize the insight in old file
2:02 format all through code. The core
2:04 scaffolding can suddenly become as thin
2:06 as just bash and file system which is
2:09 great and really scalable. But we very
2:11 quickly run into a different problem
2:14 and that problem is domain expertise.
2:16 Who do you want doing your taxes? Is it
2:18 going to be Mahesh, the 300 IQ
2:20 mathematical genius, or is it Barry, an
2:22 experienced tax professional, right? I
2:24 would pick Barry every time. I don't
2:26 want Mahesh to figure out the 2025 tax
2:29 code from first principles. I need
2:30 consistent execution from from a domain
2:33 expert. As agents today are a lot like
2:35 Mahes. They're brilliant, but they lack
2:37 expertise.
2:42 They can do no more slow. They can do
2:44 amazing things when you really put in
2:46 the effort and give proper guidance, but
2:48 they're often missing the important
2:50 context up front. They can't really
2:51 absorb your expertise super well, and
2:53 they don't learn over time.
2:56 That's why we created agent skills.
3:00 Skills are organized collections of
3:02 files that package composable procedural
3:04 knowledge for agents.
3:07 In other words, they're folders. This
3:10 simplicity is deliberate. We want
3:12 something that anyone human or agent can
3:14 create and use as long as they have a
3:16 computer. These also work with what you
3:19 already have. You can version them in
3:20 Git, you can throw them in Google Drive
3:22 and you can zip them up and share with
3:24 your team. We have used files for uh as
3:27 a primitive for decades and we like
3:29 them. So why change now?
3:33 Because of that skills can also include
3:35 a lot of scripts as tools. Traditional
3:37 tools have pretty obvious problems. Some
3:39 tools have poorly written instructions
3:41 and are pretty ambiguous and when the
3:43 model is struggling, it can't really
3:45 make a change to the tool. So, it's just
3:46 kind of stuck with a code start problem
3:49 and they always live in the context
3:50 window. Code solves some of these
3:52 issues. It's self-documenting. It is
3:54 modifiable and can live in the file
3:56 system until they're really needed and
3:58 used. Here's an example of a script
4:02 inside of a skill. We kept seeing Claude
4:04 write the same Python script over and
4:06 over again to apply styling to slides.
4:08 So we just ask cloud to save it inside
4:10 of the skill as a tool for his version
4:12 for his future self. Now we can just run
4:15 the script and that makes everything a
4:17 lot more consistent and a lot more
4:18 efficient.
4:21 At this point skills can contain a lot
4:23 of information and we want to protect
4:25 the context window so that we can fit in
4:27 hundreds of skills and make them truly
4:29 composable. That's why skills are
4:31 progressively disclosed. At runtime,
4:34 only this metadata is shown to the model
4:36 just to indicate that he has the skill.
4:39 When an agent needs to use a skill, it
4:41 can read in the rest of the skill.md,
4:43 which contains the core instruction and
4:45 directory for the rest of the folder.
4:48 Everything else is just organized for
4:51 ease of access. So that's all skills
4:54 are. They're organized folders with
4:56 scripts as tools.
4:59 Since our launch five weeks ago, this
5:02 very simple design has translated into a
5:04 very quickly growing ecosystem of
5:06 thousands of skills. And we've seen this
5:08 be split across a couple of different
5:10 types of skills. There are foundational
5:12 skills, third party skills created by
5:15 partners in the ecosystem, and skills
5:17 built within an enterprise and within
5:19 teams.
5:21 To start, foundational skills are those
5:24 that give agents new general
5:26 capabilities or domain specific
5:28 capabilities that it didn't have before.
5:31 We ourselves with our launch built
5:33 document skills that give Claude the
5:35 ability to create and edit professional
5:37 quality office documents. We're also
5:40 really excited to see people like
5:42 Cadence build scientific research skills
5:45 that give Claude new capabilities like
5:47 EHR data analysis and using common
5:50 Python bioinformatics libraries better
5:52 than it could before.
5:56 We've also seen partners in the
5:57 ecosystem build skills that help Claude
5:59 better with their own software and their
6:01 own products. Browserbase is a pretty
6:04 good example of this. They built a skill
6:06 for their open- source browser
6:08 automation tooling, stage hand. And now
6:10 Claude equipped that this skill and with
6:13 stage hand can now go navigate the web
6:16 and use a browser more effectively to
6:18 get work done.
6:19 And notion launched a bunch of skills
6:21 that help claude better understand your
6:23 notion workspace and do deep research
6:26 over your entire workspace.
6:30 And I think where I've seen the most
6:31 excitement and traction with skills is
6:33 within large enterprises. These are
6:36 company and team specific skills built
6:38 for an organization.
6:41 We've been talking to Fortune 100s that
6:43 are using skills as a way to teach
6:45 agents about their organizational best
6:47 practices and the weird and unique ways
6:49 that they use this bespoke internal
6:51 software.
6:53 We're also talking to really large
6:55 developer productivity teams. These are
6:57 teams serving thousands or even tens of
6:59 thousands of developers in an
7:01 organization that are using skills as a
7:03 way to deploy agents like cloud code and
7:06 teach them about code style best
7:07 practices and other ways that they want
7:09 their developers to work internally.
7:12 So all of these different types of
7:13 skills are created and consumed by
7:15 different people inside of an
7:17 organization or in the world. But what
7:19 they have in common is anyone can create
7:21 them and they give agents the new
7:23 capabilities that they didn't have
7:25 before.
7:28 So, as this ecosystem has grown, we've
7:30 started to observe a couple of
7:32 interesting trends. First, skills are
7:34 starting to get more complex. The most
7:37 basic skill today can still be a
7:39 skill.md markdown file with some prompts
7:42 and some really basic instructions, but
7:44 we're starting to see skills that
7:45 package software, executables, binaries,
7:49 files, code, scripts, assets, and a lot
7:51 more. And a lot of the skills that are
7:53 being built today might take minutes or
7:55 hours to build and put into an agent.
7:58 But we think that increasingly much like
8:50 a lot of the software we use today,
8:02 these skills might take weeks or months
8:04 to build and be maintained.
8:08 We're also seeing that this ecosystem of
8:10 skills is complementing the existing
8:12 ecosystem of MCP servers that was built
8:14 up over the course of this year.
8:16 Developers are using and building skills
8:19 that orchestrate workflows of multiple
8:21 MCP tools stitched together to do more
8:24 complex things with external data and
8:26 connectivity. And in these cases, MCP
8:29 MCP is providing the connection to the
8:31 outside world while skills are providing
8:33 the expertise.
8:37 And finally, and I think most excitingly
8:38 for me personally, is we're seeing
8:40 skills that are being built by people
8:42 that aren't technical. These are people
8:44 in functions like finance, recruiting,
8:46 accounting, legal, and a lot more. Um,
8:50 and I think this is pretty early
8:51 validation of our initial idea that
8:54 skills help people that aren't doing
8:56 coding work extend these general agents
8:59 and they make these agents more
9:00 accessible for the day-to-day of what
9:02 these people are working on.
9:07 So tying this all together, let's talk
9:08 about how these all fit into this
9:10 emerging architecture of general agents.
9:13 First, we think this architecture is
9:15 converging on a couple of things. The
9:17 first is this agent loop that helps
9:20 manage the the model's internal context
9:22 and manages what tokens are going in and
9:24 out. And this is coupled with a runtime
9:26 environment that provides the agent with
9:28 a file system and the ability to read
9:31 and write code.
9:34 This agent, as many of us have done
9:36 throughout this year, can be connected
9:37 to MCP servers. And these are tools and
9:40 data from the outside world that make
9:42 the the agent more relevant and more
9:44 effective.
9:46 And now we can give the same agent a
9:48 library of hundreds or thousands of
9:51 skills that it can decide to pull into
9:53 context only at runtime when it's
9:55 deciding to work on a particular task.
9:58 Today, giving an agent a new capability
10:01 in a new domain might just involve
10:03 equipping it with the right set of MCP
10:05 servers and the right library of skills.
10:09 And this emerging pattern of an agent
10:12 with an MCP server and a set of skills
10:14 is something that's already helping us
10:16 at Enthropic deploy Claude to new
10:17 verticals. Just after we launched skills
10:20 5 weeks ago, we immediately launched new
10:22 offerings in financial services and life
10:25 sciences. And each of these came with a
10:27 set of MCP servers and a set of skills
10:29 that immediately make Claude more
10:31 effective for professionals in each of
10:33 these domains.
10:37 We're also starting to think about some
10:38 of the other open questions and areas
10:40 that we want to focus on for how skills
10:42 evolve in the future as they start to
10:45 become more complex. We really want to
10:47 support developers, enterprises, and
10:49 other skill builders by starting to
10:52 treat skills like we treat software.
10:54 This means exploring testing and
10:56 evaluation, better tooling to make sure
10:59 that these agents are loading and
11:01 triggering skills at the right time and
11:03 for the right task, and tooling to help
11:06 measure the output quality of an agent
11:08 equipped with the skill to make sure
11:10 that's on par with what the agent is
11:12 supposed to be doing.
11:14 We'd also like to focus on versioning.
11:16 as a skill evolves and the resulting
11:18 agent behavior uh evolves, we want this
11:21 to be uh clearly tracked and to have a
11:23 clear lineage over time.
11:26 And finally, we'd also like to explore
11:28 skills that can explicitly depend on and
11:30 refer to either other skills, MCP
11:33 servers, and dependencies and packages
11:35 within the agents environment. We think
11:37 that this is going to make agents a lot
11:39 more predictable in different runtime
11:41 environments. and the composability of
11:43 multiple skills together will help
11:45 agents like Claude elicit even more
11:47 complex and relevant behavior from these
11:49 agents.
11:51 Overall, these set of things should
11:53 hopefully make skills easier to build
11:55 and easier to integrate into agent
11:56 products, even those besides claude.
12:02 Finally, a huge part of the value of
12:04 skills we think is going to come from
12:06 sharing and distribution. Barry and I
12:09 think a lot about the future of
12:11 companies that are deploying these
12:12 agents at scale. And the vision that
12:15 excites us most is one of a collecting
12:18 and collective and evolving knowledge
12:20 base of capabilities that's curated by
12:23 people and agents inside of an
12:25 organization. We think skills are a big
12:28 step towards this vision. They provide
12:30 the procedural knowledge for your agents
12:32 to do useful things. And as you interact
12:35 with an agent and give it feedback and
12:38 more institutional knowledge, it starts
12:40 to get better and all of the agents
12:42 inside your team and your org get better
12:44 as well. And when someone joins your
12:47 team and starts using Claude for the
12:48 first time, it already knows what your
12:50 team cares about. It knows about your
12:52 day-to-day and it knows about how to be
12:54 most effective for the work that you're
12:55 doing.
12:56 And as this grows and this ecosystem
12:58 starts to develop even more, this was
13:00 going to this compounding value is going
13:02 to extend outside of just your organ
13:04 into the broader community. So just like
13:06 when someone else across the world
13:08 builds an MCP server that makes your
13:09 agent more useful, a skill built by
13:11 someone else in the community will help
13:13 make your own agents more capable,
13:15 reliable, and useful as well.
13:20 This vision of a evolving knowledge base
13:22 gets even more powerful when claw starts
13:24 to create these skills. We design skills
13:27 specifically as a concrete steps towards
13:29 uh continuous learning.
13:31 When you first start using cloud, this
13:33 standardized format gives a very
13:35 important guarantee. Anything that cloud
13:37 writes down can be used efficiently by a
13:39 future version of itself. This makes the
13:42 learning actually transferable.
13:44 As you build up the context skills makes
13:46 the concept of memory more tangible.
13:49 They don't capture everything. They
13:51 don't capture every type of information.
13:52 Just procedural knowledge that cloud can
13:54 use on specific tasks.
13:57 When you have worked with cloud for
13:59 quite a while, the flexibility of skills
14:01 matters even more. Cloud can acquire new
14:04 capabilities instantly, evolve them as
14:06 needed, and then drop the ones that
14:08 become obsolete. This is what we have
14:10 always known. The power of in in context
14:12 learning makes this a lot more cost-
14:14 effective for information that change on
14:16 daily basis.
14:18 Our goal is that claude on day 30 of
14:20 working with you is going to be a lot
14:22 better on cloud on day one. CL can
14:24 already create skills for you today
14:26 using our skill creator skill and we're
14:28 going to continue pushing in that
14:29 direction.
14:33 We're going to conclude by comparing the
14:35 agent stack to what we have already seen
14:37 computing.
14:38 In a rough analogy, models are like
14:41 processors. Both require massive
14:44 investment and contain immense
14:46 potential, but only so useful by
14:48 themselves.
14:50 Then we start building operating system.
14:52 The OS made processors far more valuable
14:54 by orchestrating the processes,
14:56 resources, and data around the
14:58 processor. In AI, we believe that agent
15:00 runtime is starting to play this role.
15:02 We're all trying to build the cleanest,
15:04 most efficient, and most scalable uh
15:06 abstractions to get the right tokens in
15:09 and out of the model.
15:11 But once we have a platform, the real
15:13 value comes from applications. A few
15:16 companies build uh processors and
15:18 operating systems, but millions of
15:20 developers like us have built software
15:23 that encoded domain expertise and our
15:25 unique points of view. We hope that
15:27 skills can help us open up this layer
15:30 for everyone. This is where we get
15:32 creative and solve concrete problem for
15:34 ourselves, for each other, and for the
15:35 world just by putting stuff in the
15:37 folder. So skills are just the starting
15:39 point.
15:42 To close out, we think we're now
15:44 converging on this general architecture
15:46 for general agents. We've created skills
15:48 as a new paradigm for shipping and
15:51 sharing new capabilities. So we think
15:53 it's time to stop rebuilding agents and
15:55 start building skills instead. And if
15:57 you're excited about this, come work
15:59 with us and start building some skills
16:01 today. Thank you.