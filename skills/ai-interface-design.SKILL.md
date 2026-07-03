---
name: ai-interface-design
description: AI interface design guidance for product flows, agent UX, structured prompts, checkpoints, permissions, feedback loops, and output presentation.
---

# AI Interface Design

Use this skill when designing or reviewing AI product interfaces, agent workflows, prompt input controls, progress feedback, permission gates, checkpoint flows, shared-control patterns, or structured AI output presentation.

## Principles

- AI UX is not just a wrapper around a model; interface design determines whether users can understand, trust, and steer the system.
- Show what the agent is doing, what it needs, and what the user can safely control.
- Prefer explicit checkpoints for irreversible actions.
- Make generated output easy to verify, copy, revise, and act on.
- Use progressive disclosure: keep the default interface simple, but make reasoning, tools, sources, and state inspectable.

## Review Checklist

- Is the current system state visible?
- Can users interrupt, retry, undo, or branch?
- Are errors actionable instead of cryptic?
- Are permissions and side effects clear before execution?
- Does the interface support both quick use and deeper inspection?
