## Summary
<!-- What changed and why. Link the issue this closes, e.g. "Closes #1945". -->

## Test plan
<!-- Check off what you actually ran. See CLAUDE.md § Testing & Verification. -->
- [ ] Backend: `pytest` passes
- [ ] Frontend: `npm run test:run` passes (in each app touched)
- [ ] Backend formatted: `black .`
- [ ] Frontend lint: `npm run eslint` (zero errors)
- [ ] Verified on stage: `./container/deploy.sh stage`, then checked at [stage.leaguesphere.app](https://stage.leaguesphere.app)
- [ ] New/changed queries checked for N+1s (`assertNumQueries` updated if the count changed)

## Infra / deployment changes
<!-- Delete this section if the PR doesn't touch Ansible, docker-compose, or env config. -->
- [ ] Changes are in Ansible playbooks/scripts, not manual edits
- [ ] Validated on `servyy-test.lxd` before targeting production
- [ ] No secrets committed in plaintext (git-crypt-encrypted files stay encrypted in the diff)

## Notes for reviewers
<!-- Anything that isn't obvious from the diff: tradeoffs, follow-ups, things you're unsure about. -->
