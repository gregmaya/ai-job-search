# co.computrabajo.com URL reference

Researched 2026-10-30. Update this file first if the markup changes.

## Access

- `robots.txt` allows `/trabajo-de-*` and plain offer pages for `*`. It disallows `/ofertas-de-trabajo/*` with `dis=`, `cont=`, `pubdate=`, `sal=`, `by=` or `emp=`, plus `/Ajax/*`, `/_services/*`, `/go/*`, `/hojas-de-vida/*` and `/curriculums/*`. The CLI uses none of these.
- **The legal terms at `/avisolegal/` prohibit this kind of access:** "No utilizar mecanismos, software o scripts en relación con la utilización del Sitio Web", and copying by "Robot/Crawler" is "prohibido expresamente". The candidate chose to build this for personal use, knowing that, on 2026-10-30.
- The honest `computrabajo-cli` User-Agent gets a normal 200 on GET. No login or credential is needed.

## Search

`GET https://co.computrabajo.com/trabajo-de-<query-slug>[-en-<place-slug>][?p=<page>]`

| Part | Notes |
|------|-------|
| `<query-slug>` | Accent-free kebab-case keywords. |
| `<place-slug>` | City or department: `bogota-dc`, `medellin`, `cali`, `antioquia`. Bogotá needs the `-dc`. |
| `?p=` | 1-indexed. About 20 cards per page. A page past the end returns 200 with no cards. |

Results are ordered by relevance, not date. `--jobage` is client-side, because `pubdate=` is disallowed on offer paths.

## Result cards

| Field | Anchor |
|-------|--------|
| Card and ID | `<article class="box_offer ..." data-id='<32 hex>'>` |
| Title and URL | `a.js-o-link`, with a `#lc=` tracking fragment to strip |
| Company | `a[offer-grid-article-company-url]`, else the text of `p.dFlex.vm_fx.fs16.fc_base.mt5` (often "Importante empresa del sector") |
| Location | first `span.mr10`; Bogotá repeats as `Bogotá, D.C., Bogotá, D.C.` |
| Salary | text after `span.i_salary`, when published |
| Posted | `p.fs13.fc_aux.mt15`: `Hace 58 minutos`, `Ayer`, `Hace 4 días`, `Más de 30 días`, or `14 de octubre` with no year |

## Detail

`GET https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-<slug>-<32 hex>`

The slug is not checked, so `oferta-de-trabajo-de-x-<id>` resolves. The JSON-LD has no `JobPosting`, so the page markup is the source.

| Field | Anchor |
|-------|--------|
| Title | `h1.box_detail` |
| Company and location | next `p.fs16`, as `Company - Location` |
| Offer block | everything after `div-link="oferta"` |
| Salary, contract, schedule | `span.tag.base` |
| Description | first `p.mbB` |
| Requirements | `ul` after the `Requerimientos` heading |
| Posted | `p.fc_aux.fs13`, relative text; there is no public deadline field |
