# Licensing

LeagueSphere is free software under **AGPL-3.0-or-later**. This page explains
what that means in practice — for a league running its own instance, for a
company hosting it commercially, and for anyone forking it.

The authoritative texts are [LICENSE](../../../LICENSE) and
[NOTICE](../../../NOTICE). This page is the plain-language explanation; it is
not legal advice.

## The short version

| You want to… | Allowed? | What you have to do |
|---|---|---|
| Self-host LeagueSphere for your league, unmodified | ✅ | Nothing |
| Use it internally at a company, unmodified | ✅ | Nothing |
| Modify it for your own private use | ✅ | Nothing |
| Offer a **modified** version to users over a network | ✅ | Publish the source of that version (§13) |
| Sell hosting, support, customisation | ✅ | Honour the licence for any modified version you host |
| Fork it and publish your fork | ✅ | Publish the source; rebrand if you host it publicly |
| Take the code and ship it as a closed product | ❌ | The copyleft does not allow it |

The one condition that matters: **if you run a modified LeagueSphere as a
service, publish the source of the version your users are talking to.** No
permission needed, no fee, no approval process.

## What changed, and when

- **Releases up to and including v4.43.x** were released under
  **CC0-1.0** (public-domain dedication). That dedication is **irrevocable**:
  those releases are, and stay, free for any use with no conditions at all.
- **This release and every commit after it** are licensed under
  **AGPL-3.0-or-later**. It is a major release because the terms changed.
- No existing right is being taken back. The new licence governs future
  commits only. If you are on an old release and happy there, nothing about
  your situation changes.

## For a league or club

Self-hosting is free, forever. You need no account, no licence key and no
permission. Run it as shipped and you have no publication obligation at all.

If you patch it — a translation, a club-specific rule, a custom theme — and
only your own people use that instance, you still have nothing to publish.
AGPL §13 is about offering a modified version to users over a network; it is
not a "publish everything you touch" rule.

If you make your patched version available to other clubs as a service, see
the next section.

### Why copyleft helps a volunteer-run league

The point of the licence is simple: improvements made to the software come
back to the project instead of disappearing into a private fork. Sharing your
patch upstream is not required — publishing your modified source is, and that
is enough.

## For a commercial host

Commercial use is **explicitly permitted**. You can charge for hosting,
support, onboarding, customisation or an SLA, and you can run LeagueSphere
next to proprietary code of your own.

What you may not do is take this code, modify it, and run it as a closed
service. AGPL §13 requires that users interacting with your modified version
remotely are offered its **Corresponding Source** at no charge.

### Compliance checklist for a hosted modified version

1. Publish the **complete corresponding source** of the running version —
   your changes included. A public repository tag that matches the deployed
   image is the simplest form.
2. Offer it **from a network server** and link to it where users can see it —
   e.g. a "Source" link in the page footer and in `/about`.
3. Keep the **licence notices** intact and state which files you changed
   (§5). Do not remove copyright notices.
4. Pass on the licence: your users get the same AGPL rights you did.
5. Ship the third-party notices that come with the container images
   (`THIRD_PARTY_LICENSES`).
6. Rebrand: the licence does not grant the LeagueSphere name or logo. See
   [TRADEMARKS.md](../../../TRADEMARKS.md).

An unmodified image deployed as-is needs none of steps 1–3 beyond keeping the
existing notices — there is nothing extra to publish that is not already
public.

### What "corresponding source" includes

The preferred form for modification: Python sources, templates, frontend
`src/`, migrations, build scripts and configuration needed to produce the
running image. It does **not** require your database contents, your secret
keys, your users' data, or unrelated software that merely talks to
LeagueSphere over an API.

## For forks and downstream projects

- Fork freely, under the AGPL.
- Keep the licence and copyright notices.
- If you publish a hosted fork, rebrand — that is a trademark rule, not a
  licence restriction. [TRADEMARKS.md](../../../TRADEMARKS.md) has the details
  and the list of reserved marks.
- Say "based on LeagueSphere" if you like. Do not imply endorsement.

## For contributors

Contributions are accepted under AGPL-3.0-or-later with a
[DCO](https://developercertificate.org/) sign-off — `git commit -s` — and no
CLA. See [CONTRIBUTING.md](../../../CONTRIBUTING.md). Licensing metadata is
declared once in [REUSE.toml](../../../REUSE.toml) and checked by
`reuse lint` in CI.

## FAQ

**Can I sell LeagueSphere hosting?**
Yes. No permission and no revenue share. If you modify it, publish your
modified source.

**Do I have to publish my changes if I only use it internally?**
No. §13 triggers when users interact with your modified version remotely over
a network. If nobody outside the machine reaches it, there is nothing to
offer. As a rule of thumb: if a browser on another machine talks to it, treat
those people as remote users.

**Does a theme or translation count as a modification?**
If you distribute or host the modified version, yes — publish it. A private
club theme on a private instance does not trigger anything.

**Can I put my own proprietary code next to LeagueSphere?**
Yes. Separate programs that talk over an API or a database are not automatically
covered. Code that is combined into the same program — importing LeagueSphere
modules and shipping them together — is.

**What about plugins or extensions I write?**
If they are separate processes or communicate over a defined interface, they
can stay proprietary. If they are loaded into the LeagueSphere process and
form one program, they are covered.

**Do the Docker images change anything?**
They carry the licence and source labels, and include `THIRD_PARTY_LICENSES`.
The obligation is the same as for the source: publish the source of what you
run if you modified it.

**Why AGPL and not MIT or Apache-2.0?**
Those would let a hosted, modified LeagueSphere stay closed. The project wants
improvements to flow back to every league that self-hosts.

**Why not Elastic-2.0, BSL or a "source-available" licence?**
Those restrict commercial use. Selling hosting is allowed here; the
requirement is only that the source travels with the service.

**Is my old CC0 copy still usable?**
Yes. CC0 cannot be revoked. Releases up to v4.43.x stay public domain.

**Is there a CLA?**
No. You keep your copyright. The DCO is a statement that you may submit the
code, not a transfer of rights.

**What if I find someone violating the licence?**
Open an issue at
<https://github.com/dachrisch/leaguesphere/issues>. Historically the project
was CC0, so old releases impose nothing — enforcement only makes sense for
code published after the relicensing.

## Compatibility notes

AGPL-3.0-or-later is compatible with every dependency currently in the
repository. Last audited on **2026-10-26**:

- **Backend** (`pip-licenses` on the production dependency set): BSD-2/3-Clause,
  MIT, Apache-2.0, MPL-2.0, MIT-CMU, CC0-1.0, Zlib, 0BSD.
- **Frontend** (licence metadata from the `package-lock.json` files): MIT,
  Apache-2.0, ISC, MPL-2.0, BSD-2/3-Clause, BlueOak-1.0.0, CC-BY-4.0, CC0-1.0,
  0BSD.

No GPL-2.0-**only**, AGPL, SSPL or source-available dependency is present. A
GPL-2.0-only dependency would be incompatible with AGPL-3.0; review new
dependencies with that in mind, and re-run the audit when adding one:

```bash
uv run --with pip-licenses pip-licenses --format=plain --with-urls
npx license-checker --summary        # in any frontend app
```

