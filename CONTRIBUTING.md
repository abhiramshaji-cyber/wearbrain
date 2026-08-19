# Contributing

Issues and pull requests are welcome. This is a small project, so the bar is
simple: keep each change focused on one thing, and say why in the description.

## Getting set up

```sh
bun install
bun run db:migrate:local
bun test
```

No Cloudflare account is needed to work on this. Workers AI and Vectorize are
exercised through test doubles, and D1 runs locally.

## Before opening a pull request

- Run `bun test` and `bun run typecheck`.
- Keep the suite runnable without a Cloudflare account. New code should be
  testable locally through the same seams.
- All D1 access goes through parameterised `.bind()` calls. Never interpolate a
  value into SQL.
- The Worker fails closed when `DEVICE_TOKEN` is unset. Any new route must sit
  behind the same `authorize` check.

Please open an issue first for anything that changes behaviour or widens scope,
so the approach can be agreed before you spend time on it. Issues labelled
`good first issue` are self contained and a good place to start.
