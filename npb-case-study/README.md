# Taiwan NPB Tracker — Case Study

Small NPB extension under Taiwan MLB Tracker.

## Goal
Track five important Taiwanese players in Japanese professional baseball using the same comparison philosophy as the MLB project while pointing the data layer to NPB sources.

## Initial players
- 古林睿煬
- 孫易磊
- 林安可
- 張峻瑋
- 陳睦衡

## V1 scope
- Today / latest appearance
- Season stats
- Player level/status: 一軍 / 二軍 / 育成 / 支配下
- Recent trend
- League-average comparison when reliable data exists
- Development events: promotion, demotion, role change, registration status

## Design principle
Reuse the MLB Tracker product logic and visual language where useful, but do not assume MLB data/API structures. NPB has its own data-source and league-level constraints.

## Data principle
- NPB/Japanese professional baseball data is the source domain.
- Prefer official NPB/team/league sources.
- Do not mix MLB data into NPB player statistics.
- If a metric cannot be sourced reliably, show unavailable rather than inventing it.

## Project relationship
This is a small sub-project / case study under Taiwan MLB Tracker, not a separate full platform yet.

## Project OS
Before implementation, use `PROJECT_STATE.md` in this folder and apply the parent project's cross-device and version-control rules.
