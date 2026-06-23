# Security policy

## Supported version

Council is pre-release and built one milestone at a time. Security fixes are applied to the latest
commit on `main`. There are no published releases yet.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability
reporting on this repository, or contact the repository owner privately. Include the affected route
or database function, reproduction steps, and the potential impact.

## Scope

Council encrypts connections in transit, relies on platform encryption for stored data at rest,
and protects private content with authentication, Row Level Security, narrow database functions,
and private storage. Trusted infrastructure processes content for product features, so Council
does not claim end-to-end encryption. Reports that bypass these controls, expose another user's
data, or disclose whether one user blocked another are in scope.

The threat model and privacy decisions are documented in [docs/SECURITY.md](docs/SECURITY.md).
