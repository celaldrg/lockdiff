import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNpm, parseYarn, parsePnpm, parseTomlPackages, parseGoSum, parsePipenv, parseComposer, parseBundler, kindFor, type Locked,
} from "../src/parsers.js";

const flat = (m: Locked) => Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort()]));

test("package-lock.json v3 with nested and scoped packages", () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "app", version: "1.0.0" },
      "node_modules/lodash": { version: "4.17.21" },
      "node_modules/@types/node": { version: "22.1.0", dev: true },
      "node_modules/a/node_modules/lodash": { version: "3.10.1" },
      "packages/web": { name: "web", version: "0.0.0" },
      "node_modules/web": { resolved: "packages/web", link: true },
    },
  };
  assert.deepEqual(flat(parseNpm(JSON.stringify(lock))), {
    lodash: ["3.10.1", "4.17.21"],
    "@types/node": ["22.1.0"],
  });
});

test("package-lock.json v1", () => {
  const lock = { lockfileVersion: 1, dependencies: { a: { version: "1.0.0", dependencies: { b: { version: "2.0.0" } } } } };
  assert.deepEqual(flat(parseNpm(JSON.stringify(lock))), { a: ["1.0.0"], b: ["2.0.0"] });
});

test("yarn.lock classic and berry", () => {
  const classic = `# yarn lockfile v1


"@babel/code-frame@^7.0.0", "@babel/code-frame@^7.22.13":
  version "7.22.13"
  resolved "https://registry.yarnpkg.com/@babel/code-frame/-/code-frame-7.22.13.tgz"

lodash@^4.17.21:
  version "4.17.21"
`;
  assert.deepEqual(flat(parseYarn(classic)), { "@babel/code-frame": ["7.22.13"], lodash: ["4.17.21"] });
  const berry = `__metadata:
  version: 8
  cacheKey: 10

"lodash@npm:^4.17.21":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"

"@scope/pkg@npm:1.2.3, @scope/pkg@npm:^1.2.0":
  version: 1.2.3
`;
  assert.deepEqual(flat(parseYarn(berry)), { lodash: ["4.17.21"], "@scope/pkg": ["1.2.3"] });
});

test("pnpm-lock.yaml v5, v6 and v9 keys", () => {
  const v9 = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      lodash:
        specifier: ^4.17.21
        version: 4.17.21

packages:

  '@babel/core@7.24.0':
    resolution: {integrity: sha512-x}

  lodash@4.17.21:
    resolution: {integrity: sha512-y}

snapshots:

  lodash@4.17.21: {}
`;
  assert.deepEqual(flat(parsePnpm(v9)), { "@babel/core": ["7.24.0"], lodash: ["4.17.21"] });
  const v6 = `lockfileVersion: '6.0'
packages:
  /react-dom@18.2.0(react@18.2.0):
    resolution: {integrity: sha512-z}
  /@types/node@20.1.0:
    dev: true
`;
  assert.deepEqual(flat(parsePnpm(v6)), { "react-dom": ["18.2.0"], "@types/node": ["20.1.0"] });
  const v5 = `lockfileVersion: 5.4
packages:
  /react-dom/18.2.0_react@18.2.0:
    resolution: {integrity: sha512-z}
  /@babel/core/7.20.0:
    dev: true
`;
  assert.deepEqual(flat(parsePnpm(v5)), { "react-dom": ["18.2.0"], "@babel/core": ["7.20.0"] });
});

test("Cargo.lock, poetry.lock and uv.lock", () => {
  const cargo = `version = 3

[[package]]
name = "aho-corasick"
version = "1.1.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = [
 "memchr",
]

[[package]]
name = "memchr"
version = "2.7.4"
`;
  assert.deepEqual(flat(parseTomlPackages(cargo)), { "aho-corasick": ["1.1.3"], memchr: ["2.7.4"] });
  const poetry = `[[package]]
name = "requests"
version = "2.32.3"
description = "Python HTTP for Humans."

[package.dependencies]
certifi = ">=2017.4.17"

[package.extras]
socks = ["PySocks (>=1.5.6,!=1.5.7)"]

[[package]]
name = "certifi"
version = "2024.8.30"

[metadata]
lock-version = "2.0"
content-hash = "abc"
`;
  assert.deepEqual(flat(parseTomlPackages(poetry)), { requests: ["2.32.3"], certifi: ["2024.8.30"] });
});

test("go.sum keeps modules that only have go.mod hashes", () => {
  const sum = `github.com/pkg/errors v0.9.1 h1:abc=
github.com/pkg/errors v0.9.1/go.mod h1:def=
golang.org/x/text v0.3.0/go.mod h1:ghi=
`;
  assert.deepEqual(flat(parseGoSum(sum)), { "github.com/pkg/errors": ["v0.9.1"], "golang.org/x/text": ["v0.3.0"] });
});

test("Pipfile.lock, composer.lock and Gemfile.lock", () => {
  const pip = { default: { Requests: { version: "==2.32.3" } }, develop: { pytest: { version: "==8.3.3" } } };
  assert.deepEqual(flat(parsePipenv(JSON.stringify(pip))), { requests: ["2.32.3"], pytest: ["8.3.3"] });
  const composer = { packages: [{ name: "monolog/monolog", version: "3.7.0" }], "packages-dev": [{ name: "phpunit/phpunit", version: "v11.3.6" }] };
  assert.deepEqual(flat(parseComposer(JSON.stringify(composer))), { "monolog/monolog": ["3.7.0"], "phpunit/phpunit": ["11.3.6"] });
  const gem = `GEM
  remote: https://rubygems.org/
  specs:
    actionpack (7.1.3)
      rack (>= 2.2.4)
    nokogiri (1.16.2-x86_64-linux)
    rack (3.0.9)

PLATFORMS
  x86_64-linux
`;
  assert.deepEqual(flat(parseBundler(gem)), { actionpack: ["7.1.3"], nokogiri: ["1.16.2"], rack: ["3.0.9"] });
});

test("kindFor matches by file name in any directory", () => {
  assert.equal(kindFor("web/package-lock.json")?.ecosystem, "npm");
  assert.equal(kindFor("C:\\repo\\Cargo.lock")?.ecosystem, "cargo");
  assert.equal(kindFor("go.mod"), undefined);
});
