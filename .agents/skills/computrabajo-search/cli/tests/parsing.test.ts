import { describe, expect, test } from "bun:test"
import { buildSearchUrl, parseJobCards, parseJobDetail, postedAgeDays, slugify } from "../src/helpers.js"

const now = new Date("2026-10-30T12:00:00Z")
const ID = "5C2E4117F602F1F261373E686DCF3405"

const card = (id: string, company: string) => `<article class="box_offer" data-id='${id}'>
  <h2><a class="js-o-link fc_base" href="/ofertas-de-trabajo/oferta-de-trabajo-de-analista-${id}#lc=x"> Analista de datos </a></h2>
  <p class="dFlex vm_fx fs16 fc_base mt5">${company}</p>
  <p class="fs16 fc_base mt5"><span class="mr10"> Bogot&#xE1;, D.C., Bogot&#xE1;, D.C. </span></p>
  <div><span class="dIB mr10"><span class="icon i_salary"></span> $ 2.500.000,00 (Mensual) </span></div>
  <p class="fs13 fc_aux mt15"> Hace 2 d&#xED;as </p></article>`

describe("parseJobCards", () => {
  test("reads a card and strips the tracking fragment", () => {
    const named = `<a class="fc_base t_ellipsis" href="/acme" offer-grid-article-company-url> ACME S.A.S. </a>`
    expect(parseJobCards(card(ID, named), now)).toEqual([
      {
        id: ID,
        title: "Analista de datos",
        company: "ACME S.A.S.",
        location: "Bogotá, D.C.",
        date: "2026-10-28",
        dateText: "Hace 2 días",
        salary: "$ 2.500.000,00 (Mensual)",
        url: `https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-analista-${ID}`,
      },
    ])
  })

  test("keeps unnamed employers, skips broken cards and duplicates", () => {
    const broken = `<article class="box_offer" data-id='nothex'></article>`
    const cards = parseJobCards(broken + card(ID, "Importante empresa del sector") + card(ID, "x"), now)
    expect(cards).toHaveLength(1)
    expect(cards[0].company).toBe("Importante empresa del sector")
  })
})

describe("postedAgeDays", () => {
  test.each([
    ["Hace 58 minutos", 0],
    ["Hace 5 horas", 0],
    ["Ayer", 1],
    ["Ayer (actualizada)", 1],
    ["Hace 4 días", 4],
    ["Más de 30 días", 30],
    ["14 de octubre", 16],
    ["sin fecha", null],
  ] as const)("%s", (text, expected) => {
    expect(postedAgeDays(text, now)).toBe(expected)
  })

  test("a date later in the year belongs to last year", () => {
    expect(postedAgeDays("5 de diciembre", now)).toBe(329)
  })
})

describe("URLs", () => {
  test("slugify strips accents", () => {
    expect(slugify("Científico de Datos")).toBe("cientifico-de-datos")
  })

  test("buildSearchUrl handles city, the Bogotá slug and paging", () => {
    expect(buildSearchUrl("analista de datos", "Bogotá", 2)).toBe(
      "https://co.computrabajo.com/trabajo-de-analista-de-datos-en-bogota-dc?p=2",
    )
    expect(buildSearchUrl("arcgis", "Medellín", 1)).toBe("https://co.computrabajo.com/trabajo-de-arcgis-en-medellin")
    expect(buildSearchUrl("arcgis", undefined, 1)).toBe("https://co.computrabajo.com/trabajo-de-arcgis")
  })
})

describe("parseJobDetail", () => {
  const url = `https://co.computrabajo.com/ofertas-de-trabajo/oferta-${ID}`
  const page = `<h1 class="fwB fs24 mb5 box_detail w100_m">Analista SIG</h1><p class="fs16">ACME - Bogot&#xE1;, D.C., Bogot&#xE1;, D.C.</p>
  <div div-link="oferta"><div class="mbB"><span class="tag base mb10">$ 2.500.000,00 (Mensual)</span>
  <span class="tag base mb10">Contrato a t&#xE9;rmino fijo</span><span class="tag base mb10">Tiempo Completo</span></div>
  <p class="mbB">Primera l&#xED;nea<br />Segunda l&#xED;nea</p>
  <p class="fwB fs18 mtB mb10">Requerimientos</p>
  <ul class="disc mbB"><li class='mb10'>2 a&#xF1;os de experiencia</li></ul>
  <p class="fc_aux fs13">Ayer (actualizada)</p></div>`

  test("reads the offer block", () => {
    expect(parseJobDetail(page, url, now)).toEqual({
      id: ID,
      title: "Analista SIG",
      company: "ACME",
      location: "Bogotá, D.C.",
      date: "2026-10-29",
      dateText: "Ayer (actualizada)",
      salary: "$ 2.500.000,00 (Mensual)",
      employmentType: "Contrato a término fijo",
      schedule: "Tiempo Completo",
      requirements: ["2 años de experiencia"],
      description: "Primera línea\nSegunda línea",
      url,
    })
  })

  test("returns null for a page with no offer", () => {
    expect(parseJobDetail("<html></html>", url)).toBeNull()
  })
})
