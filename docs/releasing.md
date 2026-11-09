# Releasing

For maintainers. Releases are cut by `.github/workflows/release.yml` with [Changesets](https://github.com/changesets/changesets). Nobody publishes from a laptop.

## How a release goes out

1. Every pull request that changes the package adds a changeset (`npx changeset`): a file in `.changeset/` that names the bump and says what changed for users.
2. On each push to `master`, the release workflow opens or updates a **"Version packages"** pull request. That pull request bumps `package.json` and writes `CHANGELOG.md` from the pending changesets.
3. Merging that pull request publishes to npm, with signed provenance. Nothing is published until it is merged.

## Prereleases

While `.changeset/pre.json` exists, Changesets is in pre mode. Versions get the pre tag (`2.0.0-alpha.2`) and go on that dist-tag. The workflow then also puts them on `next`. A plain `npm install sf-agent-qa` keeps giving `latest`.

To move from alpha to a release candidate, commit this in a pull request:

```bash
npx changeset pre exit
npx changeset pre enter rc
```

The next "Version packages" pull request then shows the rc version. Check its number there before merging: Changesets numbers each new pre tag itself.

## The stable release

```bash
npx changeset pre exit
```

Commit that in a pull request. The next "Version packages" pull request bumps to the stable version, and merging it publishes on `latest`. The workflow then:

- points `next` at the same version, so `@next` is never older than `latest`;
- deprecates the old `0.0.0` placeholder.

## Before merging a "Version packages" pull request

- CI is green, including the `install` jobs. Those jobs pack the package and check its files and size (`npm run pack:check`). They then install it into an empty project on Ubuntu and Windows and run `--version`, `init`, `doctor --offline` and the offline harness.
- The changelog reads well for users. Edit the changesets, not `CHANGELOG.md`.
- For a stable release: the release live check has passed.

After publishing, check the dist-tags with `curl -s https://registry.npmjs.org/-/package/sf-agent-qa/dist-tags`. The registry's cached `npm view` can lag by about ten minutes.
