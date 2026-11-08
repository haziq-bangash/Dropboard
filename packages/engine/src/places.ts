/**
 * Finding places in a table: a latitude and longitude pair, or a column of country or US state names.
 * Pure functions on column names and a few sample values, so the profiler can run them without reading every row.
 */

import { zipState } from "./zip3";

export type PlaceKind = "country" | "us-state";

export interface PlaceMatch {
  column: string;
  kind: PlaceKind;
  /** Share of the sampled values that matched, 0 to 1 */
  confidence: number;
}

export interface CoordinateMatch {
  lat: string;
  lon: string;
  confidence: number;
}

// ISO 3166-1 alpha-2, alpha-3 and the common English name
const COUNTRY_ROWS = `AF AFG Afghanistan|AL ALB Albania|DZ DZA Algeria|AD AND Andorra|AO AGO Angola|AG ATG Antigua and Barbuda|AR ARG Argentina|AM ARM Armenia|AU AUS Australia|AT AUT Austria|AZ AZE Azerbaijan|BS BHS Bahamas|BH BHR Bahrain|BD BGD Bangladesh|BB BRB Barbados|BY BLR Belarus|BE BEL Belgium|BZ BLZ Belize|BJ BEN Benin|BT BTN Bhutan|BO BOL Bolivia|BA BIH Bosnia and Herzegovina|BW BWA Botswana|BR BRA Brazil|BN BRN Brunei|BG BGR Bulgaria|BF BFA Burkina Faso|BI BDI Burundi|KH KHM Cambodia|CM CMR Cameroon|CA CAN Canada|CV CPV Cape Verde|CF CAF Central African Republic|TD TCD Chad|CL CHL Chile|CN CHN China|CO COL Colombia|KM COM Comoros|CG COG Congo|CD COD Democratic Republic of the Congo|CR CRI Costa Rica|CI CIV Ivory Coast|HR HRV Croatia|CU CUB Cuba|CY CYP Cyprus|CZ CZE Czechia|DK DNK Denmark|DJ DJI Djibouti|DM DMA Dominica|DO DOM Dominican Republic|EC ECU Ecuador|EG EGY Egypt|SV SLV El Salvador|GQ GNQ Equatorial Guinea|ER ERI Eritrea|EE EST Estonia|SZ SWZ Eswatini|ET ETH Ethiopia|FJ FJI Fiji|FI FIN Finland|FR FRA France|GA GAB Gabon|GM GMB Gambia|GE GEO Georgia|DE DEU Germany|GH GHA Ghana|GR GRC Greece|GD GRD Grenada|GT GTM Guatemala|GN GIN Guinea|GW GNB Guinea-Bissau|GY GUY Guyana|HT HTI Haiti|HN HND Honduras|HU HUN Hungary|IS ISL Iceland|IN IND India|ID IDN Indonesia|IR IRN Iran|IQ IRQ Iraq|IE IRL Ireland|IL ISR Israel|IT ITA Italy|JM JAM Jamaica|JP JPN Japan|JO JOR Jordan|KZ KAZ Kazakhstan|KE KEN Kenya|KI KIR Kiribati|KW KWT Kuwait|KG KGZ Kyrgyzstan|LA LAO Laos|LV LVA Latvia|LB LBN Lebanon|LS LSO Lesotho|LR LBR Liberia|LY LBY Libya|LI LIE Liechtenstein|LT LTU Lithuania|LU LUX Luxembourg|MG MDG Madagascar|MW MWI Malawi|MY MYS Malaysia|MV MDV Maldives|ML MLI Mali|MT MLT Malta|MH MHL Marshall Islands|MR MRT Mauritania|MU MUS Mauritius|MX MEX Mexico|FM FSM Micronesia|MD MDA Moldova|MC MCO Monaco|MN MNG Mongolia|ME MNE Montenegro|MA MAR Morocco|MZ MOZ Mozambique|MM MMR Myanmar|NA NAM Namibia|NR NRU Nauru|NP NPL Nepal|NL NLD Netherlands|NZ NZL New Zealand|NI NIC Nicaragua|NE NER Niger|NG NGA Nigeria|KP PRK North Korea|MK MKD North Macedonia|NO NOR Norway|OM OMN Oman|PK PAK Pakistan|PW PLW Palau|PS PSE Palestine|PA PAN Panama|PG PNG Papua New Guinea|PY PRY Paraguay|PE PER Peru|PH PHL Philippines|PL POL Poland|PT PRT Portugal|QA QAT Qatar|RO ROU Romania|RU RUS Russia|RW RWA Rwanda|KN KNA Saint Kitts and Nevis|LC LCA Saint Lucia|VC VCT Saint Vincent and the Grenadines|WS WSM Samoa|SM SMR San Marino|ST STP Sao Tome and Principe|SA SAU Saudi Arabia|SN SEN Senegal|RS SRB Serbia|SC SYC Seychelles|SL SLE Sierra Leone|SG SGP Singapore|SK SVK Slovakia|SI SVN Slovenia|SB SLB Solomon Islands|SO SOM Somalia|ZA ZAF South Africa|KR KOR South Korea|SS SSD South Sudan|ES ESP Spain|LK LKA Sri Lanka|SD SDN Sudan|SR SUR Suriname|SE SWE Sweden|CH CHE Switzerland|SY SYR Syria|TW TWN Taiwan|TJ TJK Tajikistan|TZ TZA Tanzania|TH THA Thailand|TL TLS Timor-Leste|TG TGO Togo|TO TON Tonga|TT TTO Trinidad and Tobago|TN TUN Tunisia|TR TUR Turkey|TM TKM Turkmenistan|TV TUV Tuvalu|UG UGA Uganda|UA UKR Ukraine|AE ARE United Arab Emirates|GB GBR United Kingdom|US USA United States|UY URY Uruguay|UZ UZB Uzbekistan|VU VUT Vanuatu|VA VAT Vatican City|VE VEN Venezuela|VN VNM Vietnam|YE YEM Yemen|ZM ZMB Zambia|ZW ZWE Zimbabwe`;

// Other spellings people use for the same country
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  "united states of america": "US",
  america: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "czech republic": "CZ",
  "cote d'ivoire": "CI",
  burma: "MM",
  "republic of korea": "KR",
  "russian federation": "RU",
  "viet nam": "VN",
  "cabo verde": "CV",
  holland: "NL",
  "the netherlands": "NL",
  "the bahamas": "BS",
  "the gambia": "GM",
  uae: "AE",
  macedonia: "MK",
  swaziland: "SZ",
  "east timor": "TL",
  turkiye: "TR",
  "dr congo": "CD",
  drc: "CD",
  "republic of the congo": "CG",
  "state of palestine": "PS",
};

const US_STATE_ROWS = `AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|DC District of Columbia|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming`;

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function lookup(rows: string, threeLetter: boolean): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows.split("|")) {
    const parts = row.split(" ");
    const code = parts[0];
    const iso3 = threeLetter ? parts[1] : undefined;
    const name = parts.slice(threeLetter ? 2 : 1).join(" ");
    map.set(clean(code), code);
    if (iso3) map.set(clean(iso3), code);
    map.set(clean(name), code);
  }
  return map;
}

const COUNTRIES = lookup(COUNTRY_ROWS, true);
for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) COUNTRIES.set(alias, code);
const US_STATES = lookup(US_STATE_ROWS, false);

/** The ISO 3166-1 alpha-2 code for a country name or code, or null. */
export const countryCode = (value: unknown): string | null => (typeof value === "string" ? (COUNTRIES.get(clean(value)) ?? null) : null);

/** The two-letter code for a US state name or abbreviation, or null. */
export const usStateCode = (value: unknown): string | null => (typeof value === "string" ? (US_STATES.get(clean(value)) ?? null) : null);

const STATE_NAMES = new Map(US_STATE_ROWS.split("|").map((row) => [row.slice(0, 2), row.slice(3)]));

/** The name of a state from its two-letter code, or null. */
export const usStateName = (code: string): string | null => STATE_NAMES.get(code) ?? null;

/** The state for a value in a US map column: a state's name or code, or a ZIP code (or its first three digits). */
export const usRegionCode = (value: unknown): string | null => usStateCode(value) ?? zipState(value);

/** Column names that say a column holds postal codes. */
export const ZIP_NAME = /(^|[^a-z])(zip|zipcode|zip code|postal|postcode|post code)([^a-z]|$)/i;

/**
 * Is this a column of US ZIP codes? It has to be named like one, and nearly every value has to be five digits (or ZIP+4) whose first three
 * digits are a real prefix: a column of five-digit product codes does not get a map.
 */
export function detectZipColumn(column: string, samples: unknown[]): boolean {
  if (!ZIP_NAME.test(column)) return false;
  const present = samples.filter((v) => (typeof v === "string" && v.trim() !== "") || typeof v === "number");
  if (present.length < 2) return false;
  const full = present.filter((v) => /^\d{3,5}(-\d{4})?$/.test(String(v).trim()) && zipState(v) !== null);
  return full.length / present.length >= PLACE_MIN_SHARE;
}

const share = (values: unknown[], find: (v: unknown) => string | null) => {
  const present = values.filter((v) => typeof v === "string" && v.trim() !== "");
  if (present.length === 0) return 0;
  return present.filter((v) => find(v) !== null).length / present.length;
};

/** Smallest share of values that must match before a column is called a place column. */
export const PLACE_MIN_SHARE = 0.8;
/** A place column has few distinct values per row: free-text columns that happen to match are not places. */
const MAX_DISTINCT = 300;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Is this text column made of countries or US states? Two-letter codes are ambiguous (CA is a state and Canada),
 * so states win only when at least as many values read as states as read as countries.
 */
export function detectPlaceColumn(column: string, samples: unknown[], distinct: number): PlaceMatch | null {
  if (distinct > MAX_DISTINCT || distinct < 2) return null;
  const countries = share(samples, countryCode);
  const states = share(samples, usStateCode);
  if (states >= PLACE_MIN_SHARE && states >= countries) return { column, kind: "us-state", confidence: round(states) };
  if (countries >= PLACE_MIN_SHARE) return { column, kind: "country", confidence: round(countries) };
  return null;
}

const LAT_NAME = /^(lat|latitude|y_?coord|lat_?deg)$/i;
const LON_NAME = /^(lon|lng|long|longitude|x_?coord|lon_?deg)$/i;

export interface Range {
  min: number;
  max: number;
}

const fits = (r: Range | undefined, limit: number) =>
  !!r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.min >= -limit && r.max <= limit;

/**
 * Find a latitude and longitude pair by column name and by value range: latitude within -90 to 90, longitude
 * within -180 to 180. Two unnamed columns that both fit the ranges are never guessed at, since any two small
 * number columns would match.
 */
export function detectCoordinates(ranges: Record<string, Range>): CoordinateMatch | null {
  const names = Object.keys(ranges);
  const key = (n: string) => n.trim().replace(/[ -]+/g, "_");
  const lat = names.find((n) => LAT_NAME.test(key(n)) && fits(ranges[n], 90));
  const lon = names.find((n) => LON_NAME.test(key(n)) && fits(ranges[n], 180));
  if (!lat || !lon || lat === lon) return null;
  // a pair that never varies is a column that was never filled in
  if (ranges[lat].min === ranges[lat].max && ranges[lon].min === ranges[lon].max) return null;
  return { lat, lon, confidence: 0.95 };
}
