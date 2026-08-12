// Global attribution credit for the two licensed data sources the food
// database is pre-warmed from — required by both licenses, but per-item
// attribution isn't: ODbL/OGL v3.0 both permit crediting the database as a
// whole rather than tagging every single food record. This is deliberately
// just data (no UI yet, per issue #44's scope) — the eventual about/settings
// screen (a later ticket) renders it; nothing here does.
export const FOOD_DATA_ATTRIBUTION = [
  {
    source: "off",
    name: "Open Food Facts",
    text: "Some food data is provided by Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL) v1.0. Individual database contents are available under the Database Contents License.",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  },
  {
    source: "cofid",
    name: "Composition of Foods Integrated Dataset (CoFID)",
    text: "Some food data is derived from the Composition of Foods Integrated Dataset (CoFID), published by the Office for Health Improvement and Disparities / Public Health England, under the Open Government Licence v3.0.",
    licenseUrl:
      "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  },
] as const;
