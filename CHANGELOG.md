# Changelog

## 0.4.0 - 2026-09-06

- Added deterministic read-only search flows for Xiaohongshu, Douban, Bilibili, and Weibo.
- Added exact site/query validation, observable sort checks, stable result polling, source-bound item verification, and page highlighting for content results.
- Added site-specific parsers and URL builders through the shared `brizo/runtime/adapters` entry point.
- Added Brizo Browse host integration so dedicated Use sessions enter each public site root, use visible search controls, and finish only after independently verifying the requested results.

## 0.3.0 - 2026-09-06

- Opened the Brizo Use execution runtime, isolated Electron sandbox, policy engine, evidence ledger, result audit, usage tracking, and Ctrip/Taobao adapters.
- Added stable package subpath exports while keeping Electron optional for CLI users.
- Split the local IPC bridge into a pure Node core and Electron assembly layer, with authentication and capability-isolation tests.
- Added a shared versioned protocol contract and explicit `PROTOCOL_MISMATCH` errors.
- Added cross-platform `--json` and `--input` command payloads for PowerShell and POSIX shells.
- Added one-way, hash-verified synchronization into private Brizo-Browse.
- Added Runtime, architecture, security, contribution, English, and harness documentation plus cross-platform CI.

## 0.2.0 - 2026-09-06

- Expanded installation to 22 mainstream Agent Skills and slash-command adapters, with aliases and targeted installs.
- Added a generic prompt entry and WorkBuddy import archive.
- Preserved conflicting user files and migrated the earlier Brizo skill marker safely.

## 0.1.0 - 2026-09-06

- Published the standalone Brizo CLI, local bridge client, Agent skill, and initial installer.
