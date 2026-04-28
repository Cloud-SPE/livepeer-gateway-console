# Changelog

All notable changes to `livepeer-gateway-console` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial bootstrap from livepeer-modules-project plan 0013: Fastify+Lit/Vite
  scaffold, six-rule ESLint plugin, SQLite-via-Drizzle schema with
  `audit_events` + `routing_observations`, viem-based chain provider stubs
  (BondingManager pool walk, TicketBroker reserve, ServiceRegistry serviceURI),
  buf-generated TS stubs from the payment-daemon AND service-registry-daemon
  protos (sender + resolver clients), bridge-ui admin SPA with login + routing
  dashboard placeholder.
