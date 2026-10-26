# Contributing to lockdiff

Thanks for taking the time to help. Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

- **Bugs:** open an [issue](https://github.com/celaldrg/lockdiff/issues/new/choose) with steps to reproduce.
- **Bigger changes:** open an issue first so we can agree on the approach before you spend time on it.
- **First contribution?** Look for issues labeled [`good first issue`](https://github.com/celaldrg/lockdiff/labels/good%20first%20issue).

## Development setup

You need Node.js 20 or newer and git.

```sh
git clone https://github.com/celaldrg/lockdiff
cd lockdiff
npm ci
npm test   # builds, then runs the node:test suites
```

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep the change focused: one fix or feature per pull request.
3. Add or update tests for any behavior change. CI must pass.
4. Update the README if you change flags, output or behavior users can see.
5. Describe what changed and why in the pull request.

Commit messages: short imperative summary (`Add --quiet flag`, `Fix parsing of quoted values`).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking part you agree to follow it.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
