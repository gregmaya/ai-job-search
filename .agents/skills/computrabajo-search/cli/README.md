# computrabajo-cli

CLI for [co.computrabajo.com](https://co.computrabajo.com), a Colombian job portal. It reads public pages, needs no login and has zero runtime dependencies.

**Personal use only.** Computrabajo's terms prohibit scripts and crawlers. Keep volume low, and do not use this commercially or for bulk collection. You run it on your own responsibility.

```bash
bun install   # dev types only
bun run src/cli.ts search -q "arcgis" --format table
bun run src/cli.ts search -q "analista de datos" -l "Bogotá" --jobage 14 --format table
bun run src/cli.ts detail <32-character-id> --format plain
bun run test
```

See `../SKILL.md` for the flags and `../url-reference.md` for the parsing anchors.
