# Task 015: Reliability, CI, and documentation repair

Status: complete.

## Initial audit

| Finding                                                                        | Verified current issue? | Evidence                                                                     | Action                                                                        |
| ------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AI history loaded oldest messages                                              | Yes                     | `list_ai_messages` ordered ascending before applying its limit               | Load newest bounded window and add paired cursor pagination                   |
| Successful provider call could leave a run active                              | Yes                     | Completion had no retry, lease, or compensation                              | Add leases, stale recovery, idempotent completion, retry, and compensation    |
| Provider calls lacked deadlines                                                | Yes                     | All OpenRouter calls used only the request signal                            | Add configurable text, vision, and PDF deadlines                              |
| Stream EOF was permissive                                                      | Yes                     | Browser dropped malformed events; provider accepted EOF without `[DONE]`     | Require one terminal event and flush decoders                                 |
| Vision cache mixed question-specific analysis                                  | Yes                     | Vision prompt included user text while cache key did not                     | Use generic question-independent analysis and bump prompt version             |
| CI was monolithic and incomplete                                               | Yes                     | One `quality` job omitted `test:ai-edge`; latest run failed in concurrency   | Split seven jobs and add bounded JWT clock-skew retry                         |
| Runtime metadata was public and detailed                                       | Yes                     | Unauthenticated GET returned provider/model/parser details                   | Return generic health publicly; gate details to authenticated development     |
| OpenRouter attribution was hardcoded                                           | Yes                     | All provider calls sent `https://council.local` and `Council`                | Make optional server configuration                                            |
| Current documentation contained stale plans and absolute model-security claims | Yes                     | README, architecture, runtime, and roadmap contradicted implemented behavior | Repair current-state documentation and add changelog                          |
| License/contribution language was ambiguous                                    | Yes                     | All-rights-reserved license coexisted with generic contribution rules        | Clarify current contribution status; license choice remains an owner decision |
| README screenshots were required                                               | No                      | Screenshots were optional and reliability work did not depend on them        | Deferred to avoid synthetic fixture and asset churn                           |

The baseline local suite passed before edits. GitHub CLI was available. The latest run on
`b77940f` failed specifically in the monolithic `quality` job during `test:concurrency` with
`PGRST303: JWT issued at future`; the workflow stopped before Playwright and did not run the AI Edge
integration command.

## Result

The current implementation now has deterministic newest-first AI pagination, recoverable run
leases, retry-idempotent completion, bounded provider deadlines, strict application/provider stream
termination, generic vision analysis caching, restricted runtime metadata, configurable OpenRouter
attribution, isolated CI jobs, and corrected public documentation. No product feature was added.
