# Security policy

## Reporting a vulnerability

Report it privately through GitHub: **Security, Report a vulnerability** on this repository. Do not open a
public issue or pull request for it.

Include what you found, how to reproduce it and the commit you saw it in. You will get an answer within
three working days.

## What is checked automatically

Every pull request and push to `main` runs [`ci.yml`](.github/workflows/ci.yml): type check, lint, tests,
the static build, and a secret scan (gitleaks, over the whole history). Actions are pinned to a commit and
the workflow has read-only permissions.
