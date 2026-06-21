# Security policy

## Supported version

Council is pre-release and built one milestone at a time. Security fixes are applied to the latest
commit on `main`. There are no published releases yet.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability
reporting on this repository, or contact the repository owner privately. Include the affected route
or database function, reproduction steps, and the potential impact.

## Scope

Council is server-readable, not end-to-end encrypted, and trusted server infrastructure can read
messages and media by design. That is a stated property, not a vulnerability. Authorization is
enforced by PostgreSQL row-level security and a small set of security-definer functions; reports
that show a way around those, that leak another user's data, or that disclose whether one user
blocked another are in scope.

The threat model and privacy decisions are documented in [docs/SECURITY.md](docs/SECURITY.md).
Council has not had an independent security audit and is not production-ready.
