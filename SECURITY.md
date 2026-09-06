# Security policy

Please report a vulnerability privately through GitHub's **Security → Report a vulnerability** flow for this repository. Do not open a public issue with an exploit, credential, private page content, or reproducible account data.

Include the affected package version, operating system, Brizo protocol version, impact, and the smallest safe reproduction. Remove tokens, cookies, form values, screenshots of private pages, and local paths that identify another person.

## Trust boundary

Brizo's bridge listens only on a local Unix socket or Windows named pipe. The descriptor token authenticates a local client to the running desktop process. Every created task receives another random capability that limits later calls to that one isolated session.

The public Runtime must not expose a network listener, raw remote-debugging port, general browser profile, or page-controlled Node API. A host must keep remote pages sandboxed with Node integration disabled and must enforce its own outbound network and permission policies in addition to Runtime checks.

Observations redact credential fields. Evidence records action type and deterministic state changes without retaining typed secrets or arbitrary page text. Navigation rejects local, private, link-local, metadata, credential-bearing, non-HTTP(S), and unsafe-port targets by default.

The CLI writes runtime descriptors, session capabilities, and screenshots under `~/.brizo` with current-user permissions. Users should remove captures they no longer need. `brizo uninstall` removes harness integrations but deliberately does not delete browser data or task captures.

Supported security fixes are made on the current minor line. There is no public bug bounty at this time.
