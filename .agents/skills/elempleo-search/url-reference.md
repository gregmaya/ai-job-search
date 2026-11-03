# elempleo.com URL reference

Researched 2026-10-30. Update this file first if the markup changes.

## Access

- `robots.txt` allows `/co/ofertas-empleo/*` and `/co/ofertas-trabajo/*` for `*`. Do not use `/busqueda?`, `?as_q=`, `?icid=`, `?&trabajo=` or `/colombia/JobOffers/`, which are disallowed.
- `/co/terminos-condiciones` authorises use "únicamente para su uso personal y no comercial". It has no clause on automated access.
- The honest `elempleo-cli` User-Agent gets a normal 200. No login or credential is needed.
- `POST /co/api/joboffers/findbyfilter` and `/co/api/joboffers/getjoboffer` back the site, but they need a `__RequestVerificationToken` from a browser session, so they are deliberately unused.

## Search

`GET https://www.elempleo.com/co/ofertas-empleo/trabajo-<query-slug>[/<city-slug>][/<page>]`

| Part | Notes |
|------|-------|
| `trabajo-<query-slug>` | Accent-free kebab-case keywords. `?Search=` is ignored and returns the unfiltered feed. |
| `<city-slug>` | e.g. `bogota`, `medellin`, `cali`. The page's `data-request-params` shows the resolved city (`"cities":[34]` for Bogotá). |
| `<page>` | 1-indexed path segment, omitted for page 1. 20 results per page. |

Query-string filters such as `?pageIndex=2` and `?PublishDate=2` are ignored and change the reported total, so never add them. There is no public date filter, so `--jobage` is applied client-side.

## Result cards

Results are sorted newest first (`PublishDate_Desc`).

| Field | Anchor |
|-------|--------|
| Card boundary | `class="... js-area-bind ..."` |
| URL and ID | `data-url="/co/ofertas-trabajo/<slug>-<id>"` on the card |
| title, company, location, salary, tags | JSON in `data-ga4-offerdata`, HTML-entity encoded |
| Fallbacks | `.js-offer-title`, `.js-offer-company`, `.js-offer-city` |
| Posting age | `.js-offer-date`, relative text only (`Hace 2 semanas`) |
| Total hits | `totalRecords` in `data-pagination` |

Each card's title and date appear twice in the markup, and the page holds a `{{title}}` Handlebars template, which has no numeric offer URL. Ad slots are also `result-item`, but have no `js-area-bind`.

## Detail

`GET https://www.elempleo.com/co/ofertas-trabajo/<slug>-<id>`

The slug is not checked, so `/co/ofertas-trabajo/oferta-<id>` resolves too. The page holds a schema.org `JobPosting` in `<script type="application/ld+json">` with `title`, `description`, `datePosted`, `validThrough`, `employmentType`, `hiringOrganization.name`, `jobLocation.address.addressLocality` and sometimes `baseSalary`.

Dates are unpadded (`2026-9-28`) and confidential employers appear as `CONFIDENTIAL`.
