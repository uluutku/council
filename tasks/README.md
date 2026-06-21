# Task workflow

One task should represent one coherent, reviewable change. A task must not silently expand scope;
new requirements belong in the current task only when explicitly added, otherwise they require a
later task.

Task specifications must state database and RLS changes explicitly, including when there are
none. Security-sensitive changes require negative tests that prove unauthorized behavior is
denied, not only positive happy-path tests.

Completed task files should be retained as project history. They record scope, locked decisions,
acceptance criteria, and the reason behind implementation boundaries.
