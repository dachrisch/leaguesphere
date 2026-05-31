# Changelog

## [3.22.4](https://github.com/dachrisch/leaguesphere/compare/v3.22.3...v3.22.4) (2026-05-31)


### Bug Fixes

* add concurrency group to release-please-automerge workflow ([4aa04be](https://github.com/dachrisch/leaguesphere/commit/4aa04beaa3b378993d0fb25b083a2668185b28d3))
* add error handling to automerge polling for malformed API responses ([92d9406](https://github.com/dachrisch/leaguesphere/commit/92d9406b4be4d49dadce55f8c1651cd5a6eef0a1))
* add error handling to automerge polling for malformed API responses ([31d8c97](https://github.com/dachrisch/leaguesphere/commit/31d8c9718e766b5d4ca54f68fde17465404163b0))

## [3.22.3](https://github.com/dachrisch/leaguesphere/compare/v3.22.2...v3.22.3) (2026-05-31)


### Bug Fixes

* add proper check sequencing to release-please workflows ([fb9a8d0](https://github.com/dachrisch/leaguesphere/commit/fb9a8d03627d89a543e08a300b3e3016c42e6b0d))
* optimize database connection pooling to fix max_user_connections limit ([6bb3978](https://github.com/dachrisch/leaguesphere/commit/6bb397840a0e04f921c6cd73ee9eb3b7a8c963e7))
* resolve release-please workflow race condition preventing __init__.py updates ([a6e0c16](https://github.com/dachrisch/leaguesphere/commit/a6e0c16ef91b3d0fd3926152f360ec7544246576))


### Documentation

* add release-please workflow fix guide ([72504cf](https://github.com/dachrisch/leaguesphere/commit/72504cfe2d776d1b145dd90f975c0166b1cad433))
* add release-please workflow race condition analysis to reports ([a1a4f1d](https://github.com/dachrisch/leaguesphere/commit/a1a4f1d9701c9f0a9b18ed484a1cbe894f164231))

## [3.22.2](https://github.com/dachrisch/leaguesphere/compare/v3.22.1...v3.22.2) (2026-05-31)


### Bug Fixes

* optimize database connection pooling for shared hosting ([#1259](https://github.com/dachrisch/leaguesphere/issues/1259)) ([1c71852](https://github.com/dachrisch/leaguesphere/commit/1c71852f92ede46a7d23eefa475e8d6638d3033d))

## [3.22.1](https://github.com/dachrisch/leaguesphere/compare/v3.22.0...v3.22.1) (2026-05-31)


### Bug Fixes

* increase gunicorn workers to resolve intermittent 404 errors under load ([aa87590](https://github.com/dachrisch/leaguesphere/commit/aa875908e438dc8a030d6c71ca083706e8dde722))

## [3.22.0](https://github.com/dachrisch/leaguesphere/compare/v3.21.4...v3.22.0) (2026-05-31)


### Features

* add dev-server project skill for local development with test database ([3fe143e](https://github.com/dachrisch/leaguesphere/commit/3fe143ea86ae848bac5fc76ff2d8a63d25ea48b9))
* add project skill for running tests with proper setup ([356b12a](https://github.com/dachrisch/leaguesphere/commit/356b12a651732d2f780d413500294cc197519a6e))
* add static file directories for gamedays and officials modules ([c316b4e](https://github.com/dachrisch/leaguesphere/commit/c316b4e300d0a2df46deca4f3fbb8c1813066593))


### Bug Fixes

* add select_related to TemplateApplication query in usage endpoint ([ac156b8](https://github.com/dachrisch/leaguesphere/commit/ac156b87014c09e8abe0bd1b40225bf9191b1caf))
* correct designer_state relationship after rebase ([e32bcc4](https://github.com/dachrisch/leaguesphere/commit/e32bcc4cd12b619924c55a2bbe60d48c8265777e))
* optimize database queries - add select_related and prefetch_related to prevent N+1 issues ([867cafe](https://github.com/dachrisch/leaguesphere/commit/867cafe3997e761e2161b69587d43b45b78d34c6))
* optimize game progress prefetch to only load home team results ([7dad705](https://github.com/dachrisch/leaguesphere/commit/7dad7051c208910291ebaafc3c96723736df7711))
* optimize journey progress serializer to avoid redundant queries on prefetched data ([98797ca](https://github.com/dachrisch/leaguesphere/commit/98797ca320bf2da400f05814489733fada4a52a8))
* optimize more N+1 queries in game result serializers and views ([7ecf288](https://github.com/dachrisch/leaguesphere/commit/7ecf288b33301a232cd48c8eb10098180e102398))
* revert pytest.ini to use league_manager.settings.dev ([6652b2d](https://github.com/dachrisch/leaguesphere/commit/6652b2df3f1def8705be1aa9ad8442c6a05c64cb))


### Performance Improvements

* Eliminate TieBreakStep N+1 queries in LeagueRuleset ([a2de648](https://github.com/dachrisch/leaguesphere/commit/a2de648ca731da54d6a968a8990bffd3fbdfc1d0))
* **gamedays:** consolidate defense statistic queries to eliminate N+1 pattern ([dedc286](https://github.com/dachrisch/leaguesphere/commit/dedc2867d20e9651df76c5ac1b52809c2d11abd7))
* **gamedays:** consolidate defense statistic queries to eliminate N+1 pattern ([306466d](https://github.com/dachrisch/leaguesphere/commit/306466d4b5970ab1ec7763e7b8c4c5c9d0826d45))
* Optimize N+1 query patterns in gameday and officials views ([fddbf03](https://github.com/dachrisch/leaguesphere/commit/fddbf034f8a046d6a6114301e89ce5e94239683f))


### Documentation

* add query markers to gameday designer integration tests and fix conftest ([71fdf46](https://github.com/dachrisch/leaguesphere/commit/71fdf46de3ecb7da3260d9c22a38cdace2afe2dc))
* establish infrastructure performance policy with automated query checking ([fb3e835](https://github.com/dachrisch/leaguesphere/commit/fb3e8356ec1dd015cbaf84f4cbf7ffbdf4f58fdd))

## [3.21.4](https://github.com/dachrisch/leaguesphere/compare/v3.21.3...v3.21.4) (2026-05-30)


### Documentation

* clarify standard release workflow - just merge PR, release-please handles versioning ([c524dd9](https://github.com/dachrisch/leaguesphere/commit/c524dd9e8c776f2c1c7e1e755e7611547bf4feed))
* improve CLAUDE.md with recent features and optimization patterns ([53c4f22](https://github.com/dachrisch/leaguesphere/commit/53c4f227e4f009909222a46b8ae22a6daed9f2f6))
* remove duplication - infrastructure-policy references contributor guide for release workflow ([8f83579](https://github.com/dachrisch/leaguesphere/commit/8f83579b937e2b3e6c743f748bc1e6dfcf4d8e6e))
* remove duplication between contributor-guide and coding-standards ([84fb93c](https://github.com/dachrisch/leaguesphere/commit/84fb93c322922b77ab94fad32b0e38846607a01e))
* update contributor guide maintenance section - replace outdated bump2version with release-please automation ([7db263f](https://github.com/dachrisch/leaguesphere/commit/7db263f882f13c827ad8b036ca734d74b9fe99cc))
* update infrastructure policy with release-please workflow ([e66a4f8](https://github.com/dachrisch/leaguesphere/commit/e66a4f8b8a9deb4c1e7a0788fb98609c13b882cd))
* update README.md - replace outdated dev documentation with guide references ([4dabbd2](https://github.com/dachrisch/leaguesphere/commit/4dabbd2333119b4879deb687b8fab1e5d497cb8d))

## [3.21.3](https://github.com/dachrisch/leaguesphere/compare/v3.21.2...v3.21.3) (2026-05-30)


### Bug Fixes

* escape sequences in regex patterns ([6933fe6](https://github.com/dachrisch/leaguesphere/commit/6933fe6acfb3f6a3f47b9ee15bba5f6cf7ee9f98))


### Performance Improvements

* **gamedays:** batch query optimization and HTTP-level ETag caching ([69d5144](https://github.com/dachrisch/leaguesphere/commit/69d514486ee98dd7c3a3cde137dc294351f566a5))
* **gamedays:** batch query optimization and HTTP-level ETag caching ([d794980](https://github.com/dachrisch/leaguesphere/commit/d7949802ab143df6e3ecbf8538b6ea0e8f91a893))

## [3.21.2](https://github.com/dachrisch/leaguesphere/compare/v3.21.1...v3.21.2) (2026-05-30)


### Bug Fixes

* add explicit ordering to second query in semifinal test ([5ea76aa](https://github.com/dachrisch/leaguesphere/commit/5ea76aaa7048b1b8051a6a2dc112fa39ace73cf3))
* correct index names in database index optimization migrations ([f7a71f1](https://github.com/dachrisch/leaguesphere/commit/f7a71f18a6354794c6ee7b79a1ab233efbc9f2f3))
* sort gamedays by date ascending, then by name ([6b44523](https://github.com/dachrisch/leaguesphere/commit/6b44523a951061be68579d9acc9cd19489c8c524))
* sort gamedays by date then name in template view ([270d1d4](https://github.com/dachrisch/leaguesphere/commit/270d1d4dfd661274304313406a25e396327c0e77))
* use portable sed syntax for cross-platform compatibility ([4e8a091](https://github.com/dachrisch/leaguesphere/commit/4e8a091ba2e6eca60cd735fde9b38d91761f2166))


### Performance Improvements

* optimize database indexes ([42f0ee5](https://github.com/dachrisch/leaguesphere/commit/42f0ee55ae40facca1314c5f00c7e06a5f7bca96))
* optimize database indexes by removing ineffective primary key first pattern ([4b3564d](https://github.com/dachrisch/leaguesphere/commit/4b3564d5f15e95097689803b3ab47b191000c2e0))

## [3.21.1](https://github.com/dachrisch/leaguesphere/compare/v3.21.0...v3.21.1) (2026-05-29)


### Bug Fixes

* **deps:** update dependency eslint to v10.4.1 ([f5cb2a5](https://github.com/dachrisch/leaguesphere/commit/f5cb2a5f8f2213e2bf22b39778a205c819d7c2bd))
* **deps:** update dependency eslint to v10.4.1 ([f255611](https://github.com/dachrisch/leaguesphere/commit/f255611ce58d2efc356242501cd4a3fc4886b162))

## [3.21.0](https://github.com/dachrisch/leaguesphere/compare/v3.20.4...v3.21.0) (2026-05-29)


### Features

* **master:** Display Passcheck Names in Statistics ([#1244](https://github.com/dachrisch/leaguesphere/issues/1244)) ([a269e45](https://github.com/dachrisch/leaguesphere/commit/a269e45d4df781511a0ee67b7801d07049c9aeb7))

## [3.20.4](https://github.com/dachrisch/leaguesphere/compare/v3.20.3...v3.20.4) (2026-05-29)


### Bug Fixes

* **deps:** update dependency web-vitals to v5.3.0 ([#1241](https://github.com/dachrisch/leaguesphere/issues/1241)) ([d47869d](https://github.com/dachrisch/leaguesphere/commit/d47869dd02ed4c769c4e02204e2d84b5c37cbadf))

## [3.20.3](https://github.com/dachrisch/leaguesphere/compare/v3.20.2...v3.20.3) (2026-05-29)


### Bug Fixes

* **deps:** update dependency web-vitals to v5.3.0 ([#1240](https://github.com/dachrisch/leaguesphere/issues/1240)) ([2c63787](https://github.com/dachrisch/leaguesphere/commit/2c6378786dffba1556e866bb0f212f32fb9d520e))

## [3.20.2](https://github.com/dachrisch/leaguesphere/compare/v3.20.1...v3.20.2) (2026-05-29)


### Bug Fixes

* **deps:** update dependency react-router-dom to v7.16.0 ([#1238](https://github.com/dachrisch/leaguesphere/issues/1238)) ([1990bb0](https://github.com/dachrisch/leaguesphere/commit/1990bb08fedbec5008631aaf89d7363ddf2720be))

## [3.20.1](https://github.com/dachrisch/leaguesphere/compare/v3.20.0...v3.20.1) (2026-05-28)


### Bug Fixes

* Displaying gamedays of the current day ([#1236](https://github.com/dachrisch/leaguesphere/issues/1236)) ([e570125](https://github.com/dachrisch/leaguesphere/commit/e570125726aba1d217d92b421cbb1e5502a1a34a))

## [3.20.0](https://github.com/dachrisch/leaguesphere/compare/v3.19.13...v3.20.0) (2026-05-27)


### Features

* add entrypoint.staging.sh for prod DB sync on container restart ([713baa0](https://github.com/dachrisch/leaguesphere/commit/713baa00e6df80d830cc5cd46b2dbdf7db7c604f))
* dynamic live/upcoming status for today's gamedays ([b3339b4](https://github.com/dachrisch/leaguesphere/commit/b3339b42cd44f0eba6c866ac23aa760c0597d48d))
* improve dashboard terminology, section headers, and progress visualization ([95e62d7](https://github.com/dachrisch/leaguesphere/commit/95e62d7117f2dfb6750827e06b0c9b46abc4c115))
* show 'UPCOMING' status for today's gamedays until first game starts ([f3995fd](https://github.com/dachrisch/leaguesphere/commit/f3995fd837a24c754fa7239ed341742103536dd0))


### Bug Fixes

* add game count to gamesScheduled translation strings ([c03feb6](https://github.com/dachrisch/leaguesphere/commit/c03feb6a186e1c2d16c6ec9bfd531e9dba6a5ffa))
* resolve 'stale' status for finished gamedays and fix 'played' stats translation ([96de390](https://github.com/dachrisch/leaguesphere/commit/96de390e88d90800b0dec5fea3a07ef7eb7a0098))
* standardize game count labels to 'num games X' format ([16aa488](https://github.com/dachrisch/leaguesphere/commit/16aa488c64892376485ac4527f5c5ec1acba9f1e))
* sync package-lock.json files after rebase ([919496c](https://github.com/dachrisch/leaguesphere/commit/919496cb02524148f00f122b1b18def5cfeb486a))

## [3.19.13](https://github.com/dachrisch/leaguesphere/compare/v3.19.12...v3.19.13) (2026-05-27)


### Bug Fixes

* **deps:** update dependency webpack-cli to v7.0.3 ([#1233](https://github.com/dachrisch/leaguesphere/issues/1233)) ([cb3b1fe](https://github.com/dachrisch/leaguesphere/commit/cb3b1fecd899186f11d54940f14ae25d26d5e6cb))

## [3.19.12](https://github.com/dachrisch/leaguesphere/compare/v3.19.11...v3.19.12) (2026-05-27)


### Bug Fixes

* **deps:** update dependency django-autocomplete-light to v4.0.1 ([#1231](https://github.com/dachrisch/leaguesphere/issues/1231)) ([399aabc](https://github.com/dachrisch/leaguesphere/commit/399aabc9c38846ab22d53cdfb46ce7fd84daf490))

## [3.19.11](https://github.com/dachrisch/leaguesphere/compare/v3.19.10...v3.19.11) (2026-05-26)


### Bug Fixes

* **deps:** update dependency i18next to v26.3.0 ([#1230](https://github.com/dachrisch/leaguesphere/issues/1230)) ([939fbe7](https://github.com/dachrisch/leaguesphere/commit/939fbe709970b67b376e96fb69b0dfa8646e76f3))
* **deps:** update dependency typescript-eslint to v8.60.0 ([#1229](https://github.com/dachrisch/leaguesphere/issues/1229)) ([bdad9f2](https://github.com/dachrisch/leaguesphere/commit/bdad9f28e184461d1069413179870499daf77cc2))
* **deps:** update dependency webpack to v5.107.2 ([#1227](https://github.com/dachrisch/leaguesphere/issues/1227)) ([59b7345](https://github.com/dachrisch/leaguesphere/commit/59b73451d40106c9b43c23121888de3a7294dd8b))
* sync league_manager version to 3.19.10 ([0cfff49](https://github.com/dachrisch/leaguesphere/commit/0cfff495ca6258473a049f119b1c5f49773fe95f))

## [3.19.10](https://github.com/dachrisch/leaguesphere/compare/v3.19.9...v3.19.10) (2026-05-25)


### Bug Fixes

* **deps:** update babel monorepo to v7.29.7 ([#1225](https://github.com/dachrisch/leaguesphere/issues/1225)) ([8a49954](https://github.com/dachrisch/leaguesphere/commit/8a4995403e630ef875c00c4d02bcf0e373f6b141))

## [3.19.9](https://github.com/dachrisch/leaguesphere/compare/v3.19.8...v3.19.9) (2026-05-25)


### Bug Fixes

* **deps:** lock file maintenance ([#1223](https://github.com/dachrisch/leaguesphere/issues/1223)) ([ae0e973](https://github.com/dachrisch/leaguesphere/commit/ae0e973cba6b58870e74a14421dd7cfacff4ded4))

## [3.19.8](https://github.com/dachrisch/leaguesphere/compare/v3.19.7...v3.19.8) (2026-05-21)


### Bug Fixes

* **deps:** update dependency vite to v8.0.14 ([#1219](https://github.com/dachrisch/leaguesphere/issues/1219)) ([9780079](https://github.com/dachrisch/leaguesphere/commit/9780079aea6484228b61e52c0037b347b99f3ad1))
* **deps:** update dependency vite to v8.0.14 ([#1220](https://github.com/dachrisch/leaguesphere/issues/1220)) ([c98083b](https://github.com/dachrisch/leaguesphere/commit/c98083b10c8b84886d70e950d95a8035d0d43377))
* **deps:** update dependency webpack to v5.107.0 ([#1217](https://github.com/dachrisch/leaguesphere/issues/1217)) ([e7318bc](https://github.com/dachrisch/leaguesphere/commit/e7318bc0a05ad0b603cc1b6599f9c665e1b1f6ad))
* **deps:** update dependency webpack to v5.107.1 ([#1221](https://github.com/dachrisch/leaguesphere/issues/1221)) ([38138af](https://github.com/dachrisch/leaguesphere/commit/38138af2ea2430c69d4b418b21b876c64bd4e849))

## [3.19.7](https://github.com/dachrisch/leaguesphere/compare/v3.19.6...v3.19.7) (2026-05-20)


### Bug Fixes

* **deps:** update vitest monorepo to v4.1.7 ([#1215](https://github.com/dachrisch/leaguesphere/issues/1215)) ([bd810a6](https://github.com/dachrisch/leaguesphere/commit/bd810a6dc910f90c3c62ba29ab98eadee25b5179))

## [3.19.6](https://github.com/dachrisch/leaguesphere/compare/v3.19.5...v3.19.6) (2026-05-19)


### Bug Fixes

* add release test marker ([3c45129](https://github.com/dachrisch/leaguesphere/commit/3c451294c168e140425433043e00c45b3486e61c))
* configure release-please component for root project ([0b4197e](https://github.com/dachrisch/leaguesphere/commit/0b4197e9d396fcf241cd438355f9046d751f34cf))
* force release pipeline test ([cc7c99c](https://github.com/dachrisch/leaguesphere/commit/cc7c99cacb3e22ac73404346978a845c01a5dfa4))
* synchronize manifest version with latest release tag ([126b9ce](https://github.com/dachrisch/leaguesphere/commit/126b9ceebb855d0f4e06f1da8c281f1a50f4b012))
* test release pipeline - trigger version bump and full CI workflow ([b0bdcef](https://github.com/dachrisch/leaguesphere/commit/b0bdcef15e4a6c512da4f3d14da7b6730d6b7fc4))
* test release pipeline - verify end-to-end workflow ([6ec0193](https://github.com/dachrisch/leaguesphere/commit/6ec0193e2e21e419ee35f474c6edec6b69dda1c1))
* test release pipeline detection ([11f6ec4](https://github.com/dachrisch/leaguesphere/commit/11f6ec47cb97efaac274f151c7fcd91c397c3847))
* test release pipeline detection ([a41fa73](https://github.com/dachrisch/leaguesphere/commit/a41fa73608380a771db855a61aba0ed5436727d7))
* use packages format to properly map root path component ([7b42a1c](https://github.com/dachrisch/leaguesphere/commit/7b42a1ca30e0c06db574a62af70af4879d7d1aa1))

## [3.19.5](https://github.com/dachrisch/leaguesphere/compare/v3.19.4...v3.19.5) (2026-05-19)


### Bug Fixes

* add release test marker ([3c45129](https://github.com/dachrisch/leaguesphere/commit/3c451294c168e140425433043e00c45b3486e61c))
* clear cache in liveticker test to prevent flakiness ([59f8e43](https://github.com/dachrisch/leaguesphere/commit/59f8e43dd63f139d542b94f297b95a4f32ef00ea))
* configure release-please component for root project ([0b4197e](https://github.com/dachrisch/leaguesphere/commit/0b4197e9d396fcf241cd438355f9046d751f34cf))
* **deps:** update dependency @types/node to v25.9.1 ([e2f6a0e](https://github.com/dachrisch/leaguesphere/commit/e2f6a0e925f7cd46d67626de0ff2e395709a0871))
* **deps:** update dependency @types/node to v25.9.1 ([e7f3b21](https://github.com/dachrisch/leaguesphere/commit/e7f3b2120a7917435fd88af9fa487acbeff623e3))
* **deps:** update dependency @types/node to v25.9.1 ([#1202](https://github.com/dachrisch/leaguesphere/issues/1202)) ([a12b20d](https://github.com/dachrisch/leaguesphere/commit/a12b20d0aaaf167a90e85a9f5bac8a8195b72f30))
* **deps:** update dependency @types/react to v19.2.15 ([#1204](https://github.com/dachrisch/leaguesphere/issues/1204)) ([1e86129](https://github.com/dachrisch/leaguesphere/commit/1e861291ea73c70fad22502f44f459c0c37d4844))
* **deps:** update dependency @types/react to v19.2.15 ([#1209](https://github.com/dachrisch/leaguesphere/issues/1209)) ([a94f86c](https://github.com/dachrisch/leaguesphere/commit/a94f86c992d1bb329ce64894e2b756acb4a546e1))
* **deps:** update dependency postcss to v8.5.15 ([#1200](https://github.com/dachrisch/leaguesphere/issues/1200)) ([34b8be4](https://github.com/dachrisch/leaguesphere/commit/34b8be414c4ff5561442616c2ccd90a804b90a10))
* explicitly pass release-please config file to action ([a83198f](https://github.com/dachrisch/leaguesphere/commit/a83198fb0c0cdc149108945defe952c539320dee))
* force release pipeline test ([cc7c99c](https://github.com/dachrisch/leaguesphere/commit/cc7c99cacb3e22ac73404346978a845c01a5dfa4))
* game progress missing counts trigger ([a7d92de](https://github.com/dachrisch/leaguesphere/commit/a7d92de0d052cf15183d36619cdc412ddb14ed9f))
* game progress view missing game counts in production ([#1210](https://github.com/dachrisch/leaguesphere/issues/1210)) ([8aa3e8a](https://github.com/dachrisch/leaguesphere/commit/8aa3e8a58a2de7817ecab025f0f23acf70ff7d5b))
* reset manifest to trigger release-please ([afba736](https://github.com/dachrisch/leaguesphere/commit/afba736ff740b8c6623eca189060178cc47dd005))
* synchronize manifest version with latest release tag ([126b9ce](https://github.com/dachrisch/leaguesphere/commit/126b9ceebb855d0f4e06f1da8c281f1a50f4b012))
* test release pipeline - trigger version bump and full CI workflow ([b0bdcef](https://github.com/dachrisch/leaguesphere/commit/b0bdcef15e4a6c512da4f3d14da7b6730d6b7fc4))
* test release pipeline - verify end-to-end workflow ([6ec0193](https://github.com/dachrisch/leaguesphere/commit/6ec0193e2e21e419ee35f474c6edec6b69dda1c1))
* test release pipeline detection ([11f6ec4](https://github.com/dachrisch/leaguesphere/commit/11f6ec47cb97efaac274f151c7fcd91c397c3847))
* test release pipeline detection ([a41fa73](https://github.com/dachrisch/leaguesphere/commit/a41fa73608380a771db855a61aba0ed5436727d7))
* update package-lock files after npm version updates ([339fd5c](https://github.com/dachrisch/leaguesphere/commit/339fd5c3c726d7d03e672a74448bd26b6c03507b))
* use packages format to properly map root path component ([7b42a1c](https://github.com/dachrisch/leaguesphere/commit/7b42a1ca30e0c06db574a62af70af4879d7d1aa1))

## [3.19.4](https://github.com/dachrisch/leaguesphere/compare/v3.19.3...v3.19.4) (2026-05-19)


### Bug Fixes

* improve finalize workflow trigger ([63d1776](https://github.com/dachrisch/leaguesphere/commit/63d1776daed8c4ef1eeacd851f710b5c827f2c43))
* manually sync all versions to 3.19.3 ([303e72b](https://github.com/dachrisch/leaguesphere/commit/303e72b53d2f8f7ecce80526c2d00b7ab3225ab8))

## [3.19.3](https://github.com/dachrisch/leaguesphere/compare/v3.19.2...v3.19.3) (2026-05-19)


### Bug Fixes

* separate release-please workflows for PR creation and finalization ([d59a406](https://github.com/dachrisch/leaguesphere/commit/d59a406ad71f001b1d9e2af40758145838d278c3))

## [3.19.2](https://github.com/dachrisch/leaguesphere/compare/v3.19.1...v3.19.2) (2026-05-19)


### Bug Fixes

* sync all version files to 3.19.1 ([98daed1](https://github.com/dachrisch/leaguesphere/commit/98daed1800670bd8559d822c83d402ba4296db45))
* update version files on both PR create and update ([81e9147](https://github.com/dachrisch/leaguesphere/commit/81e91475c61a93eaf16999d32cb8a8e67d1002af))

## [3.19.1](https://github.com/dachrisch/leaguesphere/compare/v3.19.0...v3.19.1) (2026-05-19)


### Bug Fixes

* **deps:** update dependency numpy to v2.4.6 ([#1195](https://github.com/dachrisch/leaguesphere/issues/1195)) ([035696d](https://github.com/dachrisch/leaguesphere/commit/035696db2afa7807fe482e4eff15af5aa3fb9860))

## [3.19.0](https://github.com/dachrisch/leaguesphere/compare/v3.18.10...v3.19.0) (2026-05-19)


### Features

* implement release-please auto release with renovate integration ([#1183](https://github.com/dachrisch/leaguesphere/issues/1183)) ([1612634](https://github.com/dachrisch/leaguesphere/commit/16126343375962e31554f480914c7d86c843f0a1))


### Bug Fixes

* add release-type to release-please workflow ([dc51b9a](https://github.com/dachrisch/leaguesphere/commit/dc51b9ac0687953899704d95061f346d9c77651c))
* **deps:** lock file maintenance ([#1190](https://github.com/dachrisch/leaguesphere/issues/1190)) ([588c537](https://github.com/dachrisch/leaguesphere/commit/588c53707f6078b43c16538a60a8e69640596e5e))
* **deps:** update dependency @types/node to v25.9.0 ([#1191](https://github.com/dachrisch/leaguesphere/issues/1191)) ([ea0dce6](https://github.com/dachrisch/leaguesphere/commit/ea0dce6e013711adf03b0545d678e6112d519ebd))
* **deps:** update dependency @types/node to v25.9.0 ([#1192](https://github.com/dachrisch/leaguesphere/issues/1192)) ([871235d](https://github.com/dachrisch/leaguesphere/commit/871235dceddfe3920f310c098363c77747450173))
* **deps:** update dependency black to v26.5.1 ([#1193](https://github.com/dachrisch/leaguesphere/issues/1193)) ([c65529c](https://github.com/dachrisch/leaguesphere/commit/c65529c11cd2fe144f3f3db606839dd01a821074))
* **deps:** update dependency typescript-eslint to v8.59.4 ([#1194](https://github.com/dachrisch/leaguesphere/issues/1194)) ([d1d168f](https://github.com/dachrisch/leaguesphere/commit/d1d168f5b00545c226281e325722bda0ec666276))
* quote if condition in release-please-automerge workflow YAML ([#1186](https://github.com/dachrisch/leaguesphere/issues/1186)) ([177f4bc](https://github.com/dachrisch/leaguesphere/commit/177f4bc347e2c6634fc3f0ad1d0506364c06f2d6))
