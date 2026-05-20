---
name: trader-agent
description: Create or activate a named Bolsa paper-trading agent. Use whenever the user wants to set up, start, or activate an agent before running strategies — e.g. "/trader-agent jane", "create an agent called momentum-bot", "start a new trader named X". The agent is the active session in Bolsa under which every subsequent thought, tool call, and trade is audit-logged for spectator viewing in the browser UI.
---

# Bolsa trader-agent

Bring a named paper-trading agent online in Bolsa. Subsequent `/strategy` invocations will run **under this agent**, attributing every reasoning step and tool call to it for the human spectator to follow in the `[A] Agent` tab.

## What "agent" means in Bolsa

V2 is single-session: Bolsa supports exactly ONE active agent at a time, tracked by `agent_state.active_session_id`. An "agent" in this system is:

- A **name** (human-chosen identifier).
- A **start timestamp** (set when the session is registered).
- The **audit log** that follows from there until `end_session`.

When the agent is active, the AGENT ACTIVE amber chip is visible in the Bolsa header, and the `[A] Agent` tab shows a live event stream. When it ends, the chip disappears and the log freezes.

## Input

A single name passed as the skill argument (e.g. `/trader-agent jane`) or extracted from the user's natural sentence.

Examples:
- `/trader-agent jane` → name = `jane`
- `create an agent named qqq-scalper` → name = `qqq-scalper`
- `start a trader called momentum-bot` → name = `momentum-bot`

**If no name is given, ASK ONE question** ("What should this agent be called?") and wait. Don't auto-generate; the name is human-meaningful and shows up in the UI.

**Name conventions** (light suggestions, not enforced):
- Lowercase, kebab-case (`jane-scalper`, `dca-bot`)
- Short — fits in the SESSION chip in the Agent tab (~30 chars)
- Descriptive of intent rather than implementation (`momentum-trader` > `agent-1`)

## What to do

1. **Check current state** by calling the bolsa MCP tool `get_session_state`. It returns `{ activeSessionId, shouldStop }`.

2. **Decide based on what's already active:**

   - If `activeSessionId` is **null**: proceed to step 3.
   - If `activeSessionId` is **set to the same name** the user just asked for: tell them "Agent `<name>` is already active" and stop. Don't re-register (that would reset the start timestamp and erase visible continuity).
   - If `activeSessionId` is **set to a different name** (`existing`): ASK the user one question — "Agent `<existing>` is currently active. End it and start a new one named `<requested>`? (y/n)". On `y`, call `end_session` first, then proceed. On `n`, abort and report no change.

3. **Register the new session** by calling `register_session` with the requested name via the bolsa MCP. This:
   - Sets `agent_state.active_session_id` to the name.
   - Resets `agent_state.should_stop` to `false` (cleans up any stale STOP from a prior session).
   - Writes a `session_start` event to `agent_events`.
   - Causes the browser UI to light up: AGENT ACTIVE chip, `[A] Agent` tab pulse dot, auto-switch to the Agent tab.

4. **Log an introductory thought** via `log_thought`. One sentence summarizing the agent's identity is enough. Example: `"Agent jane online and awaiting instructions."`. This gives the human spectator something to read instead of an empty event stream.

5. **Report to the user** in your reply, including:
   - "✓ Agent `<name>` is active."
   - A one-line state summary (call `get_account` cheaply — show cash and position count, e.g. "Cash $94,612, 2 positions held").
   - Next-step hint: "Use `/strategy <description>` to give it work. End it via the `[S] STOP` button in the browser or by calling `end_session` directly."

## What this skill does NOT do

- **It does not run strategies.** That's `/strategy`'s job.
- **It does not place trades.** It only registers a session.
- **It does not end agents.** The user does that from the UI (`[S] STOP`) or by explicitly invoking `end_session` via bolsa.
- **It does not reset positions.** Never call `reset_paper_account`.
- **It does not change positions.** The new agent inherits whatever positions / orders are already in the paper account.

## Edge cases

- **No name supplied**: ask once, wait.
- **Active session of the same name**: no-op + report.
- **Active session of different name**: confirm replacement first.
- **`shouldStop` is true on entry**: that's fine — `register_session` resets it. Mention in the report: "(Cleared a stale STOP flag from a prior session.)"
- **Bolsa MCP not connected**: report the failure clearly and stop. Don't try to fall back to direct Supabase calls.

## Worked example

User: `/trader-agent jane`

Your response (after the tool calls):

> ✓ Agent **jane** is active.
>
> Cash $94,612.91 · 2 positions (QQQ, VOO). Buying power $194,108.47.
>
> Use `/strategy <description>` to give Jane a strategy to run. Stop her any time via the `[S] STOP` button in the Bolsa browser UI.
