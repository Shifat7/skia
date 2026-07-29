# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting flow from the repository
Security tab when it is available. If that flow is unavailable, open a
public issue containing only a request for private follow-up; do not
include exploit details, secrets, personal data, or a proof of concept
in the issue. The maintainer should enable private vulnerability
reporting before runnable code is released.

## Scope

Skia is a documentation-only project with no runnable code. Security
vulnerabilities in the traditional sense (code execution, privilege
escalation, etc.) do not apply at this stage. However, the following
are in scope:

- Misleading or incorrect security claims in project documentation.
- Sensitive information (credentials, keys) accidentally included in
  repository files.
- Security-relevant design flaws in the proposed architecture that
  should be corrected before implementation begins.

## Response

The maintainer will acknowledge receipt of the report and work with
the reporter to resolve the issue. There is no guaranteed response
time, as this is a volunteer-maintained project.

## Future implementation

When Skia transitions from documentation to runnable code, this
policy will be updated to address:

- Input validation (git diff parsing, file reading, terminal input).
- File system operations (receipt writing, directory creation).
- Subprocess invocation (git commands).
- Dependency security (Tree-sitter, clap, serde).
