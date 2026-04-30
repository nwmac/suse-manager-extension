# Rancher SUSE Multi-Linux Manager Extension

A Rancher UI extension that integrates [SUSE Multi-Linux Manager](https://www.suse.com/products/suse-manager/) with Rancher, allowing cluster admins to view linked SUSE Multi-Linux Manager servers, see available patches per cluster/node, and schedule patch application from within the Rancher UI.

The repository contains two components: a UI extension and a backend proxy.

## `pkg/` — UI extension

A Rancher UI extension (Vue 3 + TypeScript) built on top of `@rancher/shell`. It registers a `manager`-product view, panels and table actions on cluster and node detail pages, a dashboard store for SUSE Multi-Linux Manager state, and a CRD-backed resource (`susemanager.cattle.io.manager`) that defines a connection to a SUSE Multi-Linux Manager server.

Common scripts (run from the repo root):

- `yarn install` — install dependencies
- `yarn dev` — run the extension against a local Rancher in dev mode
- `yarn build-pkg` — build the extension package for publishing

## `proxy/` — backend proxy

A small Go HTTP service that brokers requests from the UI extension to a SUSE Multi-Linux Manager instance. It reads the target server's connection details (URL, username, password secret) from the `susemanager.cattle.io.manager` CRD in the cluster, handles login/session caching, and forwards API calls. This avoids exposing SUSE Multi-Linux Manager credentials to the browser and works around CORS.

The directory contains:

- `proxy/src/` — Go source for the proxy service
- `proxy/helm/suse-manager-proxy/` — Helm chart used to deploy the proxy into a Rancher-managed cluster
- `proxy/Dockerfile`, `proxy/build.sh` — container build for the proxy image
