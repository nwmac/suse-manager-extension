# Rancher SUSE Multi-Linux Manager Extension

A Rancher UI extension that integrates [SUSE Multi-Linux Manager](https://www.suse.com/products/suse-manager/) with Rancher, allowing cluster admins to view linked SUSE Multi-Linux Manager servers, see available patches per cluster/node, and schedule patch application from within the Rancher UI.

The repository contains two components: a UI extension and a backend proxy.

## `pkg/` — UI extension

A Rancher UI extension (Vue 3 + TypeScript) built on top of `@rancher/shell`. It registers a `manager`-product view, panels and table actions on cluster and node detail pages, a dashboard store for SUSE Multi-Linux Manager state, and a CRD-backed resource (`susemanager.cattle.io.manager`) that defines a connection to a SUSE Multi-Linux Manager server.

### Local development

Run from the repo root:

- `yarn install` — install dependencies
- `yarn dev` — serve the extension against a local Rancher in dev mode
- `yarn build-pkg` — build the extension package for publishing
- `yarn lint` — run eslint

### Publishing a release

Extension releases are cut from `main`. The `.github/workflows/build-extension.yml` workflow runs on every push to `main`, builds the extension and publishes the resulting Helm chart / assets to the `gh-pages` branch, from which Rancher installs it. A matching git tag anchors each release to a specific commit.

The full flow is:

1. Bump the `version` field in `package.json`.
2. Commit the bump and push to `main`.
3. Push a tag matching the version (`vMAJOR.MINOR.PATCH`).
4. `build-extension.yml` runs on the push, publishes the extension, and the chart-releaser step creates a GitHub release attached to the tag.
5. The `build-container.yml` workflow additionally publishes the extension as an OCI image to `ghcr.io/<owner>/<repo>`.

Steps 1–3 are automated by [`scripts/release-extension.sh`](scripts/release-extension.sh) (also available as `yarn release`). It refuses to run unless the tree is clean, you are on `main`, and `main` is in sync with `origin/main`. It bumps the version, commits, pushes, tags, pushes the tag, and — if the `gh` CLI is installed — tails the resulting workflow run:

```sh
yarn release 0.2.0             # bump, commit, push, tag, watch CI
yarn release 0.2.0 --no-push   # produce the commit and tag locally only
yarn release 0.2.0 --yes       # skip the confirmation prompt before push
```

## `proxy/` — backend proxy

A small Go HTTP service that brokers requests from the UI extension to a SUSE Multi-Linux Manager instance. It reads the target server's connection details (URL, username, password secret) from the `susemanager.cattle.io.manager` CRD in the cluster, handles login/session caching, and forwards API calls. This avoids exposing SUSE Multi-Linux Manager credentials to the browser and works around CORS.

The directory contains:

- `proxy/src/` — Go source for the proxy service
- `proxy/helm/suse-manager-proxy/` — Helm chart used to deploy the proxy into a Rancher-managed cluster
- `proxy/Dockerfile`, `proxy/build.sh` — container build for the proxy image

### Local development

From `proxy/`:

- `go run ./src` — run the proxy against your current kubeconfig
- `./watch.sh` — rebuild-and-reload loop for local iteration
- `./ns.sh` — helper to point kubectl at the `suse-manager` namespace

### Building and publishing the proxy image

The proxy container image is still built and pushed manually — there is no GitHub Actions workflow for it. The proxy Helm **chart** is published automatically alongside the UI extension (see below).

From `proxy/`:

```sh
# Build locally and tag for a docker org (Docker Hub, ghcr.io, ...)
./build.sh <org>

# Push the tagged image
docker push <org>/suse-manager-rancher-proxy:latest
```

To cut a versioned image release:

1. Bump `version` (and typically `appVersion`) in `proxy/helm/suse-manager-proxy/Chart.yaml`.
2. Build the image with a versioned tag and push both `latest` and the version tag:

    ```sh
    cd proxy
    docker build -f Dockerfile -t <org>/suse-manager-rancher-proxy:<version> .
    docker tag <org>/suse-manager-rancher-proxy:<version> <org>/suse-manager-rancher-proxy:latest
    docker push <org>/suse-manager-rancher-proxy:<version>
    docker push <org>/suse-manager-rancher-proxy:latest
    ```

3. Update the `image` field in `proxy/helm/suse-manager-proxy/templates/deployment.yaml` if the tag or org changed.
4. Commit and push the chart / deployment changes.

### Publishing the proxy Helm chart

`build-extension.yml` also packages the proxy Helm chart at `proxy/helm/suse-manager-proxy/` and publishes it into the same `gh-pages` Helm repo as the UI extension — so both `suse-manager` and `suse-manager-proxy` appear in a single `index.yaml`. The workflow only re-publishes when the chart's `version` isn't already present in the published index, so you only need to bump `proxy/helm/suse-manager-proxy/Chart.yaml` when you actually want a new chart release, then push to `main` (typically via `yarn release`). No manual `helm repo index` step is required.
