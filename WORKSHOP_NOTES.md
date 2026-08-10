# AI Vibe Coding Workshop Notes — Taiwan MLB Tracker

## Core lesson

AI can write code quickly, but humans still need to define the right problem, challenge assumptions, validate results, and decide what matters next.

## What happened in this project

1. We started with a simple idea: build a Taiwan MLB Tracker.
2. AI created the initial website structure and deployment pipeline.
3. The first version looked correct but only had names and static assumptions.
4. Human validation caught missing real game data.
5. We discovered that a player should not be modeled as a fixed league level.
6. We changed the model from `player = fixed level` to `player = stable identity + dynamic status`.
7. We learned that API data must be validated, sorted, and interpreted rather than blindly displayed.
8. We decided to preserve working code, change one behavior at a time, deploy, test, and iterate.

## Reusable framework

### 1. Define the outcome
What should the user be able to know or do?

### 2. Identify the source of truth
Where does the reliable data come from? API, database, file, SaaS system, etc.

### 3. Separate stable identity from dynamic state
Keep only durable identifiers in code. Fetch changing facts dynamically whenever possible.

### 4. Build one data path first
Prove one end-to-end flow before scaling to every user, product, region, or data source.

### 5. Validate with real-world checks
Compare the application against known reality. Do not assume a successful API response means the product is correct.

### 6. Fix the model, not just the symptom
If multiple records fail for the same reason, correct the architecture instead of patching each record manually.

### 7. Iterate safely
Keep working code, change one behavior, deploy, test, then continue.

## Workshop quote

> In the AI era, our job is shifting from writing every line of code to defining the right problem, challenging assumptions, validating the outcome, and deciding what to build next.

## Strong prompt pattern

When asking an AI coding agent to build a data application:

> First identify the source of truth and the stable identifiers. Avoid hard-coding changing business data. Define the business logic and acceptance criteria before writing code. Build one working end-to-end data path, test it against reality, then scale. Preserve existing working functionality unless a change is required.

## MLB Tracker example architecture

`Player ID -> MLB/MiLB data sources -> normalize -> validate -> sort -> select latest -> website`

Later the same normalized data can feed:

`Website + LINE notifications + reports`

This is the beginning of a reusable AI application pattern, not just a sports website.
