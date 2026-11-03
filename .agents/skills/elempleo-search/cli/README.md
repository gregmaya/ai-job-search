# elempleo-cli

CLI for [elempleo.com](https://www.elempleo.com), a Colombian job portal. It reads public pages, needs no login and has zero runtime dependencies.

Personal, non-commercial use only, per elempleo's terms. Keep volume low.

```bash
bun install   # dev types only
bun run src/cli.ts search -q "geoespacial" --format table
bun run src/cli.ts search -q "analista de datos" -l "Bogotá" --jobage 14 --format table
bun run src/cli.ts detail 1886773463 --format plain
bun run test
```

See `../SKILL.md` for the flags and `../url-reference.md` for the parsing anchors.
