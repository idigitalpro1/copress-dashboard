# Hermes Linear/Kanban Run

Generated: 2026-05-14T08:16:06.593Z
Model: ollama/hermes3:8b
Source: PROV-501 through PROV-508

# Hermes Packet: CoNews.Press Rollout Execution Plan

Status: ready, blocked only by Linear auth refresh
Generated: 2026-05-14

## Subagent Allocation Table

| Issue ID | Title | Phase | Priority | Owner | Next Action |
|---|---|---|---|---|---|
| PROV-501 | Add SATCOM CoNews ownership board cards | Foundation | High | Codex/Claude | Create and populate the SATCOM rollout ownership board with thumbnails, status, owner, next action, and blocker. |
| PROV-502 | Create town rollout data source | Foundation | High | Codex/Claude | Generate `conews-town-rollout.json` and `conews-shoplocal-schema.json`. |
| PROV-503 | Add Shop Local directory schema export | Foundation | High | Codex/Claude | Export `shoplocal-schema.csv` and `shoplocal-schema.json`. |
| PROV-504 | Create SEO pillar template pack | Editorial | Medium | Codex/Claude | Build the SEO pillar templates for gov, schools, shop, events, features, giving, and LTO. |
| PROV-505 | Add contributor onboarding CTA pattern | Editorial | High | Codex/Claude | Implement a prominent upload CTA at the top of relevant contributor pages linking to reviewed onboarding path. |
| PROV-506 | Create advertiser campaign kit page | Launch | Medium | Codex/Claude | Develop an advertiser campaign kit explaining tiers, creative specs, CTA, and reporting promise without exposing secrets. |
| PROV-507 | Prototype weekly edition payload | Launch | High | Codex/Claude | Render a static/sample payload for one Morrison/Red Rocks weekly edition without sending live email. |
| PROV-508 | Add progress monitor card to SATCOM | Launch | Medium | Codex/Claude | Link the SATCOM dashboard to the latest packet, progress log, and blocker status. |

## Linear/Kanban Execution Order

1. PROV-501
2. PROV-502
3. PROV-503
4. PROV-504
5. PROV-505
6. PROV-506
7. PROV-507
8. PROV-508

Blockers:
- Linear auth refresh for issue creation.
- MCP hooks are not green, so use file progress hooks and a Codex/Claude handoff.

Dependencies:
- PROV-502 blocks PROV-501, PROV-504, and PROV-507.
- PROV-503 blocks PROV-506.
- PROV-501 blocks PROV-508.
- PROV-505 can run after review of onboarding link policy.

## File-Output Plan

| File | Location | Purpose |
|---|---|---|
| conews-town-rollout.json | /Users/Ace/workspace/02_Output/conews_buildout/data/ | Town rollout data source. |
| conews-shoplocal-schema.json | /Users/Ace/workspace/02_Output/conews_buildout/data/ | Shop Local directory schema export. |
| shoplocal-schema.csv | /Users/Ace/workspace/02_Output/conews_buildout/data/ | CSV version of the Shop Local directory schema export. |
| next_sprint_kanban.json | /Users/Ace/workspace/02_Output/conews_buildout/next_sprint_kanban.json | Kanban JSON for the next sprint. |

## Hermes Next Actions in Planning Mode

1. Create a concrete Hermes run packet with:
   - A 50-subagent allocation table mapped to PROV-501 through PROV-508.
   - A Linear/Kanban execution order with blockers and dependencies.
   - A file-output plan for `/Users/Ace/workspace/02_Output/conews_buildout/agents/`.
   - What Hermes should do next in planning mode.
   - What Codex/Claude should do next in implementation mode.
   - Stop conditions and safety gates.
   - A short progress block to append to `hermes_conews_progress.md`.

2. Update the SATCOM ownership board with thumbnails, status, owner, next action, and blocker for each of the eight rollout sites.

3. Generate `conews-town-rollout.json` and `conews-shoplocal-schema.json` for use in the foundation phase.

4. Export `shoplocal-schema.csv` and `shoplocal-schema.json` for use in the foundation phase.

5. Create the SEO pillar templates for gov, schools, shop, events, features, giving, and LTO for use in the editorial phase.

6. Implement a prominent upload CTA at the top of relevant contributor pages linking to reviewed onboarding path after review of onboarding link policy.

7. Develop an advertiser campaign kit explaining tiers, creative specs, CTA, and reporting promise without exposing secrets for use in the launch phase.

8. Render a static/sample payload for one Morrison/Red Rocks weekly edition without sending live email for use in the launch phase.

9. Link the SATCOM dashboard to the latest packet, progress log, and blocker status for use in the launch phase.

## Codex/Claude Next Actions in Implementation Mode

1. Create and populate the SATCOM rollout ownership board with thumbnails, status, owner, next action, and blocker after PROV-501 is completed.

2. Generate `conews-town-rollout.json` and `conews-shoplocal-schema.json` for use in the foundation phase after PROV-502 is completed.

3. Export `shoplocal-schema.csv` and `shoplocal-schema.json` for use in the foundation phase after PROV-503 is completed.

4. Build the SEO pillar templates for gov, schools, shop, events, features, giving, and LTO for use in the editorial phase after PROV-504 is completed.

5. Implement a prominent upload CTA at the top of relevant contributor pages linking to reviewed onboarding path after review of onboarding link policy and PROV-505 is completed.

6. Develop an advertiser campaign kit explaining tiers, creative specs, CTA, and reporting promise without exposing secrets for use in the launch phase after PROV-506 is completed.

7. Render a static/sample payload for one Morrison/Red Rocks weekly edition without sending live email for use in the launch phase after PROV-507 is completed.

8. Link the SATCOM dashboard to the latest packet, progress log, and blocker status for use in the launch phase after PROV-508 is completed.

## Stop Conditions and Safety Gates

1. Linear auth refresh success before creating issues.
2. MCP hooks are green before running production operations.
3. Review each action item for risk and dependencies before starting.
4. Use file progress hooks to verify outputs before deploys.
5. Append progress blocks to `hermes_conews_progress.md` after each major step.

## Progress Block

Append to `hermes_conews_progress.md`:

```
## 2026-05-14 10:00 - Hermes Packet Created
- Changed: Linear/Kanban plan, subagent allocation, file-output plan.
- Decisions: Keep Hermes stable, use Qwen for curation only.
- Blockers: Linear auth refresh.
- Next: Create issues in order with dependencies and blockers noted.
- Files proposed or created: next_sprint_kanban.json
- Deploy URL:
- Smoke: Not applicable at this stage.
```
