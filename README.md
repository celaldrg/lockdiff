# lockdiff

[![CI](https://github.com/celaldrg/lockdiff/actions/workflows/ci.yml/badge.svg)](https://github.com/celaldrg/lockdiff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/celaldrg/lockdiff?sort=semver)](https://github.com/celaldrg/lockdiff/releases)
![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-339933)
![Zero dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)

**Readable diffs for lockfiles.** A dependency update PR changes 3,000 lines of `package-lock.json` and nobody reviews it.
`lockdiff` turns that into the list a reviewer actually needs: what was **upgraded, downgraded, added and removed**,
with **major bumps flagged first**.

One tool for ten lockfile formats: `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock` (classic and Berry),
`Cargo.lock`, `go.sum`, `poetry.lock`, `uv.lock`, `Pipfile.lock`, `composer.lock` and `Gemfile.lock`.

## Example

Real output for [ripgrep](https://github.com/BurntSushi/ripgrep) between tags `14.0.0` and `14.1.1`
(the full list has 53 rows; some are cut here for space):

```text
$ lockdiff 14.0.0 14.1.1
Cargo.lock (cargo)  41 upgraded · 11 added · 9 removed · 2 major
  ↑ upgraded   grep                          0.2.13 → 0.3.2  major
  ↑ upgraded   grep-printer                  0.1.7 → 0.2.2  major
  ↑ upgraded   aho-corasick                  1.1.2 → 1.1.3  patch
  ↑ upgraded   anyhow                        1.0.75 → 1.0.87  patch
  ↑ upgraded   bstr                          1.8.0 → 1.10.0  minor
  ↑ upgraded   cc                            1.0.83 → 1.1.18  minor
  ...
  ↑ upgraded   walkdir                       2.4.0 → 2.5.0  minor
  ↑ upgraded   winapi-util                   0.1.6 → 0.1.9  patch
  + added      shlex                         1.3.0
  + added      windows_* (8)                 0.52.6
  + added      windows-sys                   0.59.0
  + added      windows-targets               0.52.6
  - removed    autocfg                       1.1.0
  - removed    libm                          0.2.8
  ...
  - removed    winapi                        0.3.9
```

Packages from one family that moved together are collapsed into one row, so 23 `@esbuild/<platform>`
builds show up as `@esbuild/* (23)`. Pass `--no-group` to list each one.
For `0.x` versions a minor bump counts as **major**, the same rule Cargo and npm use for compatibility.

A bigger one: TypeScript's own `package-lock.json` between `v5.5.4` and `v5.6.3`:

```text
$ lockdiff v5.5.4 v5.6.3
package-lock.json (npm)  99 upgraded · 44 added · 13 removed · 11 changed · 64 major
  ↑ upgraded   @dprint/* (7)                          0.46.1 → 0.47.2  major
  ↑ upgraded   @dprint/formatter                      0.3.0 → 0.4.1  major
  ↑ upgraded   @esbuild/* (23)                        0.21.4 → 0.23.0  major
  ↑ upgraded   @eslint/eslintrc                       2.1.4 → 3.1.0  major
  ↑ upgraded   @eslint/js                             8.57.0 → 9.9.0  major
  ...
```

### Markdown for pull request comments

```text
$ lockdiff 14.0.0 14.1.1 --format markdown
```

renders as:

> ### `Cargo.lock`
>
> 41 upgraded · 11 added · 9 removed · 2 major
>
> | | Package | Change | Versions |
> | --- | --- | --- | --- |
> | ↑ | `grep` | upgraded **major** | 0.2.13 → 0.3.2 |
> | ↑ | `grep-printer` | upgraded **major** | 0.1.7 → 0.2.2 |
> | ↑ | `aho-corasick` | upgraded patch | 1.1.2 → 1.1.3 |

### CI gate

```text
$ lockdiff 14.0.0 14.1.1 --fail-on major > /dev/null; echo $?
1
```

## Install

```sh
npx github:celaldrg/lockdiff --help
# or
npm install -g github:celaldrg/lockdiff
```

Node.js 20 or newer. No runtime dependencies. `git` is needed for the ref modes.

## Usage

```text
lockdiff                        lockfile changes in the working tree vs HEAD
lockdiff <ref>                  working tree vs a git ref (branch, tag, commit)
lockdiff <ref1> <ref2>          between two git refs, e.g. lockdiff main HEAD
lockdiff <old-file> <new-file>  compare two lockfiles directly

  -f, --format <fmt>    text (default), markdown, json
  --fail-on <level>     exit 1 if there is any 'major' bump, or 'any' change
  --no-group            list every package instead of collapsing families
  -C <dir>              run in this directory
  --no-color            disable colors
```

In ref modes paths are shown relative to the repository root. lockdiff asks git which files changed, so it finds every lockfile in a monorepo (`apps/web/pnpm-lock.yaml`,
`services/api/go.sum`, ...) without configuration.

Exit codes: `0` ok, `1` the `--fail-on` gate was hit, `2` usage or parse error.

### In GitHub Actions

Add a summary of dependency changes to every pull request:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y github:celaldrg/lockdiff origin/${{ github.base_ref }} HEAD -f md >> "$GITHUB_STEP_SUMMARY"
```

### As a library

```js
import { kindFor, diffLocked } from "lockdiff";
const kind = kindFor("Cargo.lock");
const { changes, counts } = diffLocked(kind.parse(oldText), kind.parse(newText));
```

## How it works

- Every format is read by a small parser written for that format. There is no YAML or TOML library: lockfiles are
  machine-written and regular, and line-based readers are fast and have no dependencies to audit.
- A lockfile becomes a map of `package -> set of versions`. Packages with several copies (common in npm) are compared as sets,
  and show up as `changed` with the versions that came and went.
- Versions are compared numerically, prereleases sort before releases, and Go pseudo-versions and `v` prefixes are understood.

## Development

```sh
npm ci
npm test   # builds, then runs node:test suites (parsers, diff, CLI against throwaway git repos)
```

## License

[MIT](LICENSE) © Celalettin Durğaç
