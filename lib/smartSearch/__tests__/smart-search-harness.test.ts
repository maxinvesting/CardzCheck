import { describe, it, expect } from "vitest";
import { smartSearch, type SmartSearchMode, type SmartSearchCandidate } from "@/lib/smartSearch";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type Token = string | RegExp;

type TokenGroup = {
  name: string;
  tokens: string[];
};

type HarnessCase = {
  query: string;
  mustIncludeTokens?: Token[];
  mustIncludeTopN?: number;
  mustNotIncludeTokens?: Token[];
  mustNotIncludeTopN?: number;
  minResults?: number;
  allowZeroResults?: boolean;
  notes?: string;
  mode?: SmartSearchMode;
  brandLock?: boolean;
  setLock?: boolean;
  parallelLock?: boolean;
};

type DriftDetail = {
  expected: string[];
  matchCount: number;
  conflictCount: number;
  drifted: boolean;
  hardFail: boolean;
};

type DriftSummary = {
  brand: DriftDetail;
  set: DriftDetail;
  parallel: DriftDetail;
};

type CaseResult = {
  query: string;
  mode: SmartSearchMode;
  latencyMs: number;
  resultsCount: number;
  minResults: number;
  allowZeroResults: boolean;
  mustIncludeTokens: string[];
  mustIncludeTopN: number;
  mustIncludeOk: boolean;
  top1MustIncludeMatch?: boolean;
  mustNotIncludeTokens: string[];
  mustNotIncludeTopN: number;
  mustNotIncludeOk: boolean;
  forbiddenHits: Array<{ keyword: string; title: string }>;
  failures: string[];
  topResults: SmartSearchCandidate[];
  drift: DriftSummary;
  status: "passed" | "failed" | "skipped";
  skipReason?: string;
  timedOut?: boolean;
  errorMessage?: string;
};

const HARNESS_ENABLED = process.env.SMART_SEARCH_HARNESS === "1";

const DEFAULT_INCLUDE_TOP_N = 5;
const DEFAULT_FORBIDDEN_TOP_N = 5;
const DEFAULT_LIMIT = 25;
const DEFAULT_CANDIDATE_LIMIT = 200;
const TEST_TIMEOUT_MS = 1000 * 60 * 5;
const CASE_TIMEOUT_MS = 12_000;

const KNOWN_BRAND_GROUPS: TokenGroup[] = [
  { name: "panini", tokens: ["panini"] },
  { name: "topps", tokens: ["topps"] },
  { name: "upper deck", tokens: ["upper deck"] },
  { name: "bowman", tokens: ["bowman"] },
  { name: "leaf", tokens: ["leaf"] },
  { name: "onyx", tokens: ["onyx"] },
  { name: "wild card", tokens: ["wild card"] },
];

const KNOWN_SET_GROUPS: TokenGroup[] = [
  // Panini football
  { name: "prizm draft picks", tokens: ["prizm", "draft", "picks"] },
  { name: "contenders optic", tokens: ["contenders", "optic"] },
  { name: "donruss optic", tokens: ["donruss", "optic"] },
  { name: "donruss", tokens: ["donruss"] },
  { name: "prizm", tokens: ["prizm"] },
  { name: "select", tokens: ["select"] },
  { name: "mosaic", tokens: ["mosaic"] },
  { name: "phoenix", tokens: ["phoenix"] },
  { name: "illusions", tokens: ["illusions"] },
  { name: "xr", tokens: ["xr"] },
  { name: "origins", tokens: ["origins"] },
  { name: "absolute", tokens: ["absolute"] },
  { name: "chronicles", tokens: ["chronicles"] },
  { name: "contenders", tokens: ["contenders"] },
  { name: "elite", tokens: ["elite"] },
  { name: "luminance", tokens: ["luminance"] },
  { name: "prestige", tokens: ["prestige"] },
  { name: "certified", tokens: ["certified"] },
  { name: "spectra", tokens: ["spectra"] },
  { name: "playbook", tokens: ["playbook"] },

  // Panini basketball
  { name: "court kings", tokens: ["court kings"] },
  { name: "revolution", tokens: ["revolution"] },
  { name: "obsidian", tokens: ["obsidian"] },
  { name: "noir", tokens: ["noir"] },
  { name: "immaculate", tokens: ["immaculate"] },
  { name: "national treasures", tokens: ["national treasures"] },
  { name: "threads", tokens: ["threads"] },
  { name: "crown royale", tokens: ["crown royale"] },
  { name: "donruss elite", tokens: ["donruss", "elite"] },

  // Topps/Bowman baseball
  { name: "topps finest", tokens: ["topps", "finest"] },
  { name: "topps heritage", tokens: ["topps", "heritage"] },
  { name: "topps archives", tokens: ["topps", "archives"] },
  { name: "stadium club", tokens: ["stadium club"] },
  { name: "bowman chrome", tokens: ["bowman", "chrome"] },
  { name: "bowman draft", tokens: ["bowman", "draft"] },
  { name: "bowman sterling", tokens: ["bowman", "sterling"] },
  {
    name: "topps chrome platinum anniversary",
    tokens: ["topps", "chrome", "platinum", "anniversary"],
  },
  { name: "topps tribute", tokens: ["topps", "tribute"] },
  { name: "allen & ginter", tokens: ["allen", "ginter"] },
  { name: "topps chrome", tokens: ["topps", "chrome"] },

  // Hockey Upper Deck
  { name: "series 1", tokens: ["series 1"] },
  { name: "series 2", tokens: ["series 2"] },
  { name: "extended", tokens: ["extended"] },
  { name: "sp authentic", tokens: ["sp authentic"] },
  { name: "the cup", tokens: ["the cup"] },
  { name: "artifacts", tokens: ["artifacts"] },
  { name: "young guns", tokens: ["young guns"] },

  // Soccer
  { name: "merlin", tokens: ["merlin"] },
  { name: "topps chrome ucc", tokens: ["topps", "chrome", "ucc"] },
  { name: "prizm epl", tokens: ["prizm", "epl"] },
  { name: "prizm laliga", tokens: ["prizm", "laliga"] },
  { name: "donruss soccer", tokens: ["donruss", "soccer"] },
  { name: "select la liga", tokens: ["select", "la liga"] },

  // UFC
  { name: "ufc prizm", tokens: ["ufc", "prizm"] },
  { name: "ufc select", tokens: ["ufc", "select"] },
  { name: "ufc chronicles", tokens: ["ufc", "chronicles"] },

  // Unlicensed
  { name: "leaf", tokens: ["leaf"] },
  { name: "onyx", tokens: ["onyx"] },
  { name: "wild card", tokens: ["wild card"] },
];

const KNOWN_PARALLEL_TOKENS = [
  "silver",
  "gold",
  "holo",
  "refractor",
  "xfractor",
  "x-fractor",
  "mojo",
  "shimmer",
  "pulsar",
  "genesis",
  "cracked ice",
  "scope",
  "disco",
  "no huddle",
  "fast break",
  "wave",
  "lava",
  "snakeskin",
  "cosmic",
  "atomic",
  "laser",
  "hyper",
  "tiger",
  "zebra",
  "velocity",
  "flash",
  "galactic",
];

const FOOTBALL_CASES: HarnessCase[] = [
  {
    query: "2023 panini mosaic cj stroud genesis",
    mustIncludeTokens: ["stroud", "mosaic", "genesis"],
    mustNotIncludeTokens: ["prizm", "select", "optic", "phoenix"],
  },
  {
    query: "2023 panini phoenix anthony richardson fire burst",
    mustIncludeTokens: ["richardson", "phoenix", "fire"],
  },
  {
    query: "2023 panini illusions anthony richardson mystique",
    mustIncludeTokens: ["illusions", "richardson", "mystique"],
  },
  {
    query: "2023 panini xr will levis rookie",
    mustIncludeTokens: ["xr", "levis", "rookie"],
  },
  {
    query: "2022 panini origins kenneth walker rookie",
    mustIncludeTokens: ["origins", "walker", "rookie"],
  },
  {
    query: "2023 panini absolute bijan robinson explosive",
    mustIncludeTokens: ["absolute", "bijan", "explosive"],
  },
  {
    query: "2023 panini chronicles cj stroud",
    mustIncludeTokens: ["chronicles", "stroud"],
  },
  {
    query: "2022 panini contenders optic brock purdy rookie ticket",
    mustIncludeTokens: ["contenders", "optic", "purdy", "ticket"],
  },
  {
    query: "2020 panini elite joe burrow rookie",
    mustIncludeTokens: ["elite", "burrow", "rookie"],
  },
  {
    query: "2023 panini luminance anthony richardson daylight",
    mustIncludeTokens: ["luminance", "richardson", "daylight"],
  },
  {
    query: "2023 panini prestige bijan robinson rookie",
    mustIncludeTokens: ["prestige", "bijan", "rookie"],
  },
  {
    query: "2021 panini certified trevor lawrence mirror",
    mustIncludeTokens: ["certified", "lawrence", "mirror"],
  },
  {
    query: "2022 panini spectra kenny pickett neon orange",
    mustIncludeTokens: ["spectra", "pickett", "neon"],
  },
  {
    query: "2023 panini select anthony richardson concourse",
    mustIncludeTokens: ["select", "richardson", "concourse"],
  },
  {
    query: "2024 panini prizm draft picks caleb williams",
    mustIncludeTokens: ["prizm", "draft", "picks", "williams"],
  },
  {
    query: "2023 panini donruss cj stroud rated rookie",
    mustIncludeTokens: ["donruss", "stroud", "rated", "rookie"],
  },
  {
    query: "2023 panini donruss optic cj stroud rated rookie holo",
    mustIncludeTokens: ["donruss", "optic", "stroud", "rated", "rookie", "holo"],
  },
  {
    query: "2021 panini playbook trey lance rookie",
    mustIncludeTokens: ["playbook", "lance", "rookie"],
  },
  {
    query: "2020 panini prizm justin herbert silver",
    mustIncludeTokens: ["prizm", "herbert", "silver"],
  },
  {
    query: "2021 panini select mac jones field level",
    mustIncludeTokens: ["select", "mac", "field", "level"],
  },
  {
    query: "2022 panini mosaic garrett wilson genesis",
    mustIncludeTokens: ["mosaic", "wilson", "genesis"],
  },
  {
    query: "2020 panini phoenix joe burrow color burst",
    mustIncludeTokens: ["phoenix", "burrow", "burst"],
  },
  {
    query: "2021 panini illusions mac jones clear shots",
    mustIncludeTokens: ["illusions", "mac", "shots"],
  },
  {
    query: "2022 panini xr breece hall rookie",
    mustIncludeTokens: ["xr", "breece", "hall", "rookie"],
  },
  {
    query: "2021 panini origins mac jones rookie auto",
    mustIncludeTokens: ["origins", "mac", "auto"],
  },
  {
    query: "2022 panini absolute kenneth walker kaboom",
    mustIncludeTokens: ["absolute", "walker", "kaboom"],
  },
  {
    query: "2021 panini chronicles trey lance rookies",
    mustIncludeTokens: ["chronicles", "trey", "lance"],
  },
  {
    query: "2020 panini contenders joe burrow rookie ticket",
    mustIncludeTokens: ["contenders", "burrow", "ticket"],
  },
  {
    query: "2022 panini elite garrett wilson rookie",
    mustIncludeTokens: ["elite", "wilson", "rookie"],
  },
  {
    query: "2022 panini luminance garrett wilson rookie",
    mustIncludeTokens: ["luminance", "wilson", "rookie"],
  },
  {
    query: "2022 panini prestige kenny pickett rookie",
    mustIncludeTokens: ["prestige", "pickett", "rookie"],
  },
  {
    query: "2021 panini certified jamarr chase rookie",
    mustIncludeTokens: ["certified", "chase", "rookie"],
  },
  {
    query: "2021 panini spectra jamarr chase rookie",
    mustIncludeTokens: ["spectra", "chase", "rookie"],
  },
  {
    query: "2021 panini select jamarr chase concourse silver",
    mustIncludeTokens: ["select", "chase", "concourse", "silver"],
  },
  {
    query: "2021 panini prizm draft picks trevor lawrence",
    mustIncludeTokens: ["prizm", "draft", "picks", "lawrence"],
  },
  {
    query: "2020 panini donruss optic justin herbert rated rookie holo",
    mustIncludeTokens: ["donruss", "optic", "herbert", "rated", "rookie", "holo"],
  },
  {
    query: "2020 panini donruss joe burrow rated rookie",
    mustIncludeTokens: ["donruss", "burrow", "rated", "rookie"],
  },
  {
    query: "2021 panini playbook najee harris",
    mustIncludeTokens: ["playbook", "najee", "harris"],
  },
  {
    query: "2023 panini select cj stroud club level",
    mustIncludeTokens: ["select", "stroud", "club", "level"],
  },
  {
    query: "2023 panini prizm cj stroud silver psa 10",
    mustIncludeTokens: ["prizm", "stroud", "silver", "psa 10"],
    mustNotIncludeTokens: ["select", "mosaic", "optic", "phoenix"],
  },
];

const BASKETBALL_CASES: HarnessCase[] = [
  {
    query: "2023-24 panini court kings paolo banchero rookie",
    mustIncludeTokens: ["court kings", "banchero", "rookie"],
  },
  {
    query: "2023-24 panini revolution victor wembanyama cosmic",
    mustIncludeTokens: ["revolution", "wembanyama", "cosmic"],
  },
  {
    query: "2022-23 panini obsidian paolo banchero rookie",
    mustIncludeTokens: ["obsidian", "banchero", "rookie"],
  },
  {
    query: "2019-20 panini noir zion williamson rookie",
    mustIncludeTokens: ["noir", "zion", "rookie"],
  },
  {
    query: "2020-21 panini immaculate luka doncic patch auto",
    mustIncludeTokens: ["immaculate", "luka", "auto"],
  },
  {
    query: "2021-22 panini national treasures lamelo ball rpa",
    mustIncludeTokens: ["national treasures", "lamelo", "rpa"],
  },
  {
    query: "2023-24 panini threads scoot henderson rookie",
    mustIncludeTokens: ["threads", "scoot", "rookie"],
  },
  {
    query: "2022-23 panini crown royale jalen green rookie",
    mustIncludeTokens: ["crown royale", "jalen", "green", "rookie"],
  },
  {
    query: "2020-21 panini donruss elite lamelo ball",
    mustIncludeTokens: ["donruss", "elite", "lamelo"],
  },
  {
    query: "2024 panini prizm draft picks bronny james",
    mustIncludeTokens: ["prizm", "draft", "picks", "bronny"],
  },
  {
    query: "2023 panini select brandon miller concourse",
    mustIncludeTokens: ["select", "brandon", "miller", "concourse"],
  },
  {
    query: "2023 panini prizm paolo banchero silver",
    mustIncludeTokens: ["prizm", "banchero", "silver"],
  },
  {
    query: "2021 panini select jalen green field level",
    mustIncludeTokens: ["select", "jalen", "field", "level"],
  },
  {
    query: "2020 panini prizm anthony edwards silver",
    mustIncludeTokens: ["prizm", "edwards", "silver"],
  },
  {
    query: "2022 panini obsidian chet holmgren electric etch",
    mustIncludeTokens: ["obsidian", "chet", "etch"],
  },
  {
    query: "2021 panini court kings cade cunningham rookie",
    mustIncludeTokens: ["court kings", "cade", "rookie"],
  },
  {
    query: "2022 panini revolution jalen duren rookie",
    mustIncludeTokens: ["revolution", "duren", "rookie"],
  },
  {
    query: "2022 panini noir jabari smith rookie",
    mustIncludeTokens: ["noir", "jabari", "rookie"],
  },
  {
    query: "2021 panini immaculate stephen curry auto",
    mustIncludeTokens: ["immaculate", "curry", "auto"],
  },
  {
    query: "2022 panini national treasures ja morant patch",
    mustIncludeTokens: ["national treasures", "morant", "patch"],
  },
  {
    query: "2020 panini threads zion williamson rookie",
    mustIncludeTokens: ["threads", "zion", "rookie"],
  },
  {
    query: "2021 panini crown royale luka doncic",
    mustIncludeTokens: ["crown royale", "luka"],
  },
  {
    query: "2021 panini donruss elite trae young",
    mustIncludeTokens: ["donruss", "elite", "trae", "young"],
  },
  {
    query: "2023 panini prizm draft picks wembanyama",
    mustIncludeTokens: ["prizm", "draft", "picks", "wembanyama"],
  },
  {
    query: "2023 panini select wembanyama premier level",
    mustIncludeTokens: ["select", "wembanyama", "premier", "level"],
  },
  {
    query: "2018 panini obsidian luka doncic rookie",
    mustIncludeTokens: ["obsidian", "luka", "rookie"],
  },
  {
    query: "2018 panini noir luka doncic rookie",
    mustIncludeTokens: ["noir", "luka", "rookie"],
  },
  {
    query: "2018 panini immaculate luka doncic rookie",
    mustIncludeTokens: ["immaculate", "luka", "rookie"],
  },
];

const BASEBALL_CASES: HarnessCase[] = [
  {
    query: "2023 topps finest corbin carroll rookie",
    mustIncludeTokens: ["topps", "finest", "carroll", "rookie"],
  },
  {
    query: "2022 topps heritage julio rodriguez rookie",
    mustIncludeTokens: ["topps", "heritage", "julio", "rodriguez", "rookie"],
  },
  {
    query: "2021 topps archives vladimir guerrero jr",
    mustIncludeTokens: ["topps", "archives", "vladimir", "guerrero"],
  },
  {
    query: "2023 topps stadium club adley rutschman rookie",
    mustIncludeTokens: ["stadium club", "adley", "rookie"],
  },
  {
    query: "2023 bowman chrome elly de la cruz 1st",
    mustIncludeTokens: ["bowman", "chrome", "elly", "1st"],
  },
  {
    query: "2023 bowman draft dylan crews",
    mustIncludeTokens: ["bowman", "draft", "dylan", "crews"],
  },
  {
    query: "2022 bowman sterling bobby witt jr",
    mustIncludeTokens: ["bowman", "sterling", "witt"],
  },
  {
    query: "2022 topps chrome platinum anniversary shohei ohtani",
    mustIncludeTokens: ["topps", "chrome", "platinum", "anniversary", "ohtani"],
  },
  {
    query: "2021 topps tribute fernando tatis jr",
    mustIncludeTokens: ["topps", "tribute", "tatis"],
  },
  {
    query: "2023 allen ginter shohei ohtani mini",
    mustIncludeTokens: ["allen", "ginter", "ohtani", "mini"],
  },
  {
    query: "2023 topps chrome adley rutschman rookie",
    mustIncludeTokens: ["topps", "chrome", "adley", "rookie"],
  },
  {
    query: "2023 bowman chrome jackson holiday 1st",
    mustIncludeTokens: ["bowman", "chrome", "holiday", "1st"],
  },
  {
    query: "2022 bowman draft jackson holiday",
    mustIncludeTokens: ["bowman", "draft", "holiday"],
  },
  {
    query: "2023 bowman sterling elly de la cruz auto",
    mustIncludeTokens: ["bowman", "sterling", "elly", "auto"],
  },
  {
    query: "2023 topps finest gunnar henderson rookie",
    mustIncludeTokens: ["topps", "finest", "gunnar", "rookie"],
  },
  {
    query: "2022 topps heritage wander franco",
    mustIncludeTokens: ["topps", "heritage", "wander", "franco"],
  },
  {
    query: "2021 topps archives shohei ohtani",
    mustIncludeTokens: ["topps", "archives", "ohtani"],
  },
  {
    query: "2022 topps stadium club julio rodriguez",
    mustIncludeTokens: ["stadium club", "julio", "rodriguez"],
  },
  {
    query: "2023 bowman chrome junior caminero 1st",
    mustIncludeTokens: ["bowman", "chrome", "caminero", "1st"],
  },
  {
    query: "2023 bowman draft paul skenes",
    mustIncludeTokens: ["bowman", "draft", "skenes"],
  },
  {
    query: "2022 topps chrome platinum anniversary mike trout",
    mustIncludeTokens: ["topps", "chrome", "platinum", "anniversary", "trout"],
  },
  {
    query: "2020 topps tribute mike trout",
    mustIncludeTokens: ["topps", "tribute", "trout"],
  },
  {
    query: "2022 allen ginter mike trout",
    mustIncludeTokens: ["allen", "ginter", "trout"],
  },
  {
    query: "2023 topps finest shohei ohtani",
    mustIncludeTokens: ["topps", "finest", "ohtani"],
  },
  {
    query: "2021 bowman chrome adley rutschman",
    mustIncludeTokens: ["bowman", "chrome", "adley"],
  },
  {
    query: "2020 bowman draft spencer torkelson",
    mustIncludeTokens: ["bowman", "draft", "torkelson"],
  },
  {
    query: "2021 bowman sterling jasson dominguez",
    mustIncludeTokens: ["bowman", "sterling", "dominguez"],
  },
  {
    query: "2022 topps chrome platinum anniversary ken griffey jr",
    mustIncludeTokens: ["topps", "chrome", "platinum", "anniversary", "griffey"],
  },
  {
    query: "2023 topps tribute ronald acuna jr",
    mustIncludeTokens: ["topps", "tribute", "acuna"],
  },
  {
    query: "2023 allen ginter babe ruth mini",
    mustIncludeTokens: ["allen", "ginter", "babe", "ruth", "mini"],
  },
];

const HOCKEY_CASES: HarnessCase[] = [
  {
    query: "2023-24 upper deck series 2 connor bedard young guns",
    mustIncludeTokens: ["upper deck", "series 2", "bedard", "young guns"],
  },
  {
    query: "2023-24 upper deck series 1 luke hughes young guns",
    mustIncludeTokens: ["upper deck", "series 1", "luke", "hughes", "young guns"],
  },
  {
    query: "2022-23 upper deck extended matty beniers young guns",
    mustIncludeTokens: ["upper deck", "extended", "beniers", "young guns"],
  },
  {
    query: "2021-22 sp authentic cole caufield future watch",
    mustIncludeTokens: ["sp authentic", "caufield", "future watch"],
  },
  {
    query: "2020-21 the cup kirill kaprizov rookie patch auto",
    mustIncludeTokens: ["the cup", "kaprizov", "rookie", "patch", "auto"],
  },
  {
    query: "2022-23 upper deck artifacts moritz seider rookie",
    mustIncludeTokens: ["artifacts", "seider", "rookie"],
  },
  {
    query: "2015-16 upper deck series 1 connor mcdavid young guns",
    mustIncludeTokens: ["upper deck", "series 1", "mcdavid", "young guns"],
  },
  {
    query: "2016-17 upper deck series 2 auston matthews young guns",
    mustIncludeTokens: ["upper deck", "series 2", "matthews", "young guns"],
  },
  {
    query: "2019-20 sp authentic cale makar future watch",
    mustIncludeTokens: ["sp authentic", "makar", "future watch"],
  },
  {
    query: "2021-22 the cup trevor zegras rookie patch",
    mustIncludeTokens: ["the cup", "zegras", "rookie", "patch"],
  },
  {
    query: "2020-21 upper deck artifacts alexis lafreniere rookie",
    mustIncludeTokens: ["artifacts", "lafreniere", "rookie"],
  },
  {
    query: "2023-24 upper deck extended connor bedard young guns",
    mustIncludeTokens: ["upper deck", "extended", "bedard", "young guns"],
  },
];

const SOCCER_CASES: HarnessCase[] = [
  {
    query: "2022-23 topps merlin jude bellingham",
    mustIncludeTokens: ["topps", "merlin", "bellingham"],
  },
  {
    query: "2023-24 topps chrome ucc lamine yamal rookie",
    mustIncludeTokens: ["topps", "chrome", "ucc", "yamal", "rookie"],
  },
  {
    query: "2022-23 panini select erling haaland field level",
    mustIncludeTokens: ["select", "haaland", "field level"],
  },
  {
    query: "2022-23 panini prizm epl erling haaland",
    mustIncludeTokens: ["panini", "prizm", "epl", "haaland"],
  },
  {
    query: "2022-23 panini prizm laliga pedri",
    mustIncludeTokens: ["panini", "prizm", "laliga", "pedri"],
  },
  {
    query: "2022-23 panini donruss soccer bukayo saka",
    mustIncludeTokens: ["donruss", "soccer", "saka"],
  },
  {
    query: "2023-24 topps chrome ucc jude bellingham",
    mustIncludeTokens: ["topps", "chrome", "ucc", "bellingham"],
  },
  {
    query: "2023-24 topps merlin endrick rookie",
    mustIncludeTokens: ["topps", "merlin", "endrick", "rookie"],
  },
  {
    query: "2021-22 panini select la liga ansu fati",
    mustIncludeTokens: ["select", "la liga", "ansu", "fati"],
  },
  {
    query: "2021-22 panini prizm epl bukayo saka",
    mustIncludeTokens: ["prizm", "epl", "saka"],
  },
  {
    query: "2022-23 topps chrome ucc kylian mbappe",
    mustIncludeTokens: ["topps", "chrome", "ucc", "mbappe"],
  },
  {
    query: "2022-23 panini donruss soccer cristiano ronaldo",
    mustIncludeTokens: ["donruss", "soccer", "ronaldo"],
  },
];

const UFC_CASES: HarnessCase[] = [
  {
    query: "2023 panini prizm ufc alex pereira",
    mustIncludeTokens: ["prizm", "ufc", "pereira"],
  },
  {
    query: "2022 panini select ufc islam makhachev",
    mustIncludeTokens: ["select", "ufc", "makhachev"],
  },
  {
    query: "2021 panini chronicles ufc khamzat chimaev",
    mustIncludeTokens: ["chronicles", "ufc", "chimaev"],
  },
  {
    query: "2023 panini prizm ufc sean o'malley silver",
    mustIncludeTokens: ["prizm", "ufc", "omalley", "silver"],
  },
  {
    query: "2022 panini select ufc shavkat rakhmonov",
    mustIncludeTokens: ["select", "ufc", "rakhmonov"],
  },
  {
    query: "2021 panini chronicles ufc israel adesanya",
    mustIncludeTokens: ["chronicles", "ufc", "adesanya"],
  },
  {
    query: "2020 panini prizm ufc conor mcgregor",
    mustIncludeTokens: ["prizm", "ufc", "mcgregor"],
  },
  {
    query: "2023 panini select ufc alexander volkanovski",
    mustIncludeTokens: ["select", "ufc", "volkanovski"],
  },
];

const UNLICENSED_CASES: HarnessCase[] = [
  {
    query: "2023 leaf metal cj stroud auto",
    mustIncludeTokens: ["leaf", "stroud", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2024 leaf metal wembanyama auto",
    mustIncludeTokens: ["leaf", "wembanyama", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2023 onyx vintage elly de la cruz auto",
    mustIncludeTokens: ["onyx", "elly", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2023 onyx premium jasson dominguez auto",
    mustIncludeTokens: ["onyx", "dominguez", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2024 wild card cj stroud auto",
    mustIncludeTokens: ["wild card", "stroud", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2023 wild card bryce young auto",
    mustIncludeTokens: ["wild card", "bryce", "young", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2022 leaf trinity paolo banchero auto",
    mustIncludeTokens: ["leaf", "banchero", "auto"],
    allowZeroResults: true,
  },
  {
    query: "2023 onyx vintage scoot henderson auto",
    mustIncludeTokens: ["onyx", "scoot", "auto"],
    allowZeroResults: true,
  },
];

const NEGATIVE_CASES: HarnessCase[] = [
  {
    query: "2023 topps chrome cj stroud",
    mustIncludeTokens: ["stroud", "topps", "chrome"],
    allowZeroResults: true,
  },
  {
    query: "2023 panini prizm donruss optic cj stroud",
    mustIncludeTokens: ["stroud"],
    allowZeroResults: true,
    brandLock: false,
    setLock: false,
  },
  {
    query: "2022 panini prizm draft picks tom brady",
    mustIncludeTokens: ["prizm", "draft", "picks", "brady"],
    allowZeroResults: true,
  },
  {
    query: "2017 panini select patrick mahomes rated rookie",
    mustIncludeTokens: ["select", "mahomes", "rated", "rookie"],
    allowZeroResults: true,
    setLock: false,
  },
  {
    query: "2021 bowman chrome patrick mahomes",
    mustIncludeTokens: ["bowman", "chrome", "mahomes"],
    allowZeroResults: true,
  },
  {
    query: "2023 topps heritage cj stroud",
    mustIncludeTokens: ["topps", "heritage", "stroud"],
    allowZeroResults: true,
  },
  {
    query: "2024 panini prizm draft piks caleb williams",
    mustIncludeTokens: ["prizm", "draft", "piks", "williams"],
    allowZeroResults: true,
  },
  {
    query: "prizim silver mahomes",
    mustIncludeTokens: ["prizm", "silver", "mahomes"],
    allowZeroResults: true,
  },
  {
    query: "donrus optic herbert",
    mustIncludeTokens: ["optic", "herbert"],
    allowZeroResults: true,
  },
  {
    query: "2020 panini mosaic patrick mahomes xfractor",
    mustIncludeTokens: ["mosaic", "mahomes", "xfractor"],
    allowZeroResults: true,
  },
  {
    query: "2022 topps chrome platinum anniversary cj stroud",
    mustIncludeTokens: ["topps", "chrome", "platinum", "anniversary", "stroud"],
    allowZeroResults: true,
  },
  {
    query: "2021 panini select lebron james",
    mustIncludeTokens: ["select", "lebron", "james"],
    allowZeroResults: true,
  },
];

const WATCHLIST_CASES: HarnessCase[] = [
  {
    query: "2023 panini prizm cj stroud silver",
    mustIncludeTokens: ["prizm", "stroud", "silver"],
    mode: "watchlist",
  },
  {
    query: "2020 panini prizm justin herbert silver",
    mustIncludeTokens: ["prizm", "herbert", "silver"],
    mode: "watchlist",
  },
  {
    query: "2023 topps chrome corbin carroll rookie",
    mustIncludeTokens: ["topps", "chrome", "carroll", "rookie"],
    mode: "watchlist",
  },
  {
    query: "2023 bowman chrome elly de la cruz 1st",
    mustIncludeTokens: ["bowman", "chrome", "elly", "1st"],
    mode: "watchlist",
  },
  {
    query: "2023 panini mosaic bijan robinson genesis",
    mustIncludeTokens: ["mosaic", "bijan", "genesis"],
    mode: "watchlist",
  },
  {
    query: "2023-24 upper deck series 2 connor bedard young guns",
    mustIncludeTokens: ["upper deck", "series 2", "bedard", "young guns"],
    mode: "watchlist",
  },
];

const CASES: HarnessCase[] = [
  ...FOOTBALL_CASES,
  ...BASKETBALL_CASES,
  ...BASEBALL_CASES,
  ...HOCKEY_CASES,
  ...SOCCER_CASES,
  ...UFC_CASES,
  ...UNLICENSED_CASES,
  ...NEGATIVE_CASES,
  ...WATCHLIST_CASES,
];

const hasEbayBrowseCreds = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

if (!HARNESS_ENABLED) {
  console.warn(
    "Smart Search harness skipped. Set SMART_SEARCH_HARNESS=1 (npm run test:smart-search) to run."
  );
}

if (HARNESS_ENABLED && WATCHLIST_CASES.length > 0 && !hasEbayBrowseCreds) {
  console.warn(
    "Smart Search harness: watchlist cases will be skipped (missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET)."
  );
}

describe("smart search harness", () => {
  const itOrSkip = !HARNESS_ENABLED ? it.skip : it;

  itOrSkip(
    "runs query suite and prints a summary report",
    async () => {
      const supabase = createHarnessSupabaseClient();
      const concurrency = Math.max(1, Number(process.env.HARNESS_CONCURRENCY ?? "1") || 1);

      const results = await runWithConcurrency(CASES, concurrency, (testCase) =>
        executeCase(testCase, supabase, hasEbayBrowseCreds)
      );

      const summary = summarizeResults(results);
      printReport(results, summary);

      expect(results.length).toBe(CASES.length);
    },
    TEST_TIMEOUT_MS
  );
});

async function executeCase(
  testCase: HarnessCase,
  supabase: any,
  hasEbayBrowseCreds: boolean
): Promise<CaseResult> {
  const mode = testCase.mode ?? "collection";
  if (mode === "watchlist" && !hasEbayBrowseCreds) {
    return makeSkippedResult(testCase, "missing EBAY_CLIENT_ID/EBAY_CLIENT_SECRET");
  }

  const start = Date.now();
  let timedOut = false;
  let errorMessage: string | undefined;
  let response: Awaited<ReturnType<typeof smartSearch>> | null = null;

  try {
    response = await withTimeout(
      smartSearch(testCase.query, mode, {
        limit: DEFAULT_LIMIT,
        candidateLimit: DEFAULT_CANDIDATE_LIMIT,
        supabase,
      }),
      CASE_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      timedOut = true;
    } else {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const latencyMs = Math.min(Date.now() - start, CASE_TIMEOUT_MS);
  const ordered = response ? [...response.exact, ...response.close] : [];
  const resultsCount = ordered.length;
  const allowZeroResults = Boolean(testCase.allowZeroResults);
  const minResults = allowZeroResults ? 0 : testCase.minResults ?? 1;
  const minResultsOk = resultsCount >= minResults;

  const mustIncludeTokens = normalizeTokens(testCase.mustIncludeTokens ?? []);
  const mustIncludeTopN = testCase.mustIncludeTopN ?? DEFAULT_INCLUDE_TOP_N;
  const mustIncludeOk = mustIncludeTokens.length === 0
    ? true
    : allowZeroResults && resultsCount === 0
      ? true
      : hasAnyCandidateMatching(ordered, mustIncludeTokens, mustIncludeTopN);

  const top1MustIncludeMatch = mustIncludeTokens.length === 0
    ? undefined
    : ordered.length > 0
      ? hasCandidateMatching(ordered[0], mustIncludeTokens)
      : undefined;

  const mustNotIncludeTokens = normalizeTokens(testCase.mustNotIncludeTokens ?? []);
  const mustNotIncludeTopN = testCase.mustNotIncludeTopN ?? DEFAULT_FORBIDDEN_TOP_N;
  const forbiddenHits = mustNotIncludeTokens.length === 0
    ? []
    : allowZeroResults && resultsCount === 0
      ? []
      : findForbiddenHits(ordered, mustNotIncludeTokens, mustNotIncludeTopN);
  const mustNotIncludeOk = forbiddenHits.length === 0;

  const normalizedQuery = normalizeText(testCase.query);
  const brandLockEnabled = testCase.brandLock ?? true;
  const setLockEnabled = testCase.setLock ?? true;
  const parallelLockEnabled = testCase.parallelLock ?? true;

  const expectedBrandGroups = brandLockEnabled
    ? extractExpectedGroups(normalizedQuery, KNOWN_BRAND_GROUPS)
    : [];
  const expectedSetGroups = setLockEnabled
    ? extractExpectedGroups(normalizedQuery, KNOWN_SET_GROUPS)
    : [];
  const expectedParallelTokens = parallelLockEnabled
    ? extractExpectedParallelTokens(normalizedQuery)
    : [];

  const drift = resultsCount === 0 && allowZeroResults
    ? emptyDrift()
    : computeDrift(ordered.slice(0, 5), expectedBrandGroups, expectedSetGroups, expectedParallelTokens);

  const failures: string[] = [];
  if (!minResultsOk) failures.push(`minResults(${minResults})`);
  if (!mustIncludeOk) failures.push(`mustInclude(top${mustIncludeTopN})`);
  if (!mustNotIncludeOk) failures.push(`mustNotInclude(top${mustNotIncludeTopN})`);
  if (drift.brand.hardFail) failures.push("brandDrift");
  if (drift.set.hardFail) failures.push("setDrift");
  if (drift.parallel.hardFail) failures.push("parallelDrift");
  if (timedOut) failures.push(`timeout(${CASE_TIMEOUT_MS}ms)`);
  if (errorMessage) failures.push("searchError");

  const status: CaseResult["status"] = failures.length > 0 ? "failed" : "passed";

  return {
    query: testCase.query,
    mode,
    latencyMs,
    resultsCount,
    minResults,
    allowZeroResults,
    mustIncludeTokens: mustIncludeTokens.map(tokenLabel),
    mustIncludeTopN,
    mustIncludeOk,
    top1MustIncludeMatch,
    mustNotIncludeTokens: mustNotIncludeTokens.map(tokenLabel),
    mustNotIncludeTopN,
    mustNotIncludeOk,
    forbiddenHits,
    failures,
    topResults: ordered.slice(0, 5),
    drift,
    status,
    timedOut,
    errorMessage,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await handler(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}

function makeSkippedResult(testCase: HarnessCase, reason: string): CaseResult {
  return {
    query: testCase.query,
    mode: testCase.mode ?? "collection",
    latencyMs: 0,
    resultsCount: 0,
    minResults: 0,
    allowZeroResults: true,
    mustIncludeTokens: normalizeTokens(testCase.mustIncludeTokens ?? []).map(tokenLabel),
    mustIncludeTopN: testCase.mustIncludeTopN ?? DEFAULT_INCLUDE_TOP_N,
    mustIncludeOk: true,
    mustNotIncludeTokens: normalizeTokens(testCase.mustNotIncludeTokens ?? []).map(tokenLabel),
    mustNotIncludeTopN: testCase.mustNotIncludeTopN ?? DEFAULT_FORBIDDEN_TOP_N,
    mustNotIncludeOk: true,
    forbiddenHits: [],
    failures: [],
    topResults: [],
    drift: emptyDrift(),
    status: "skipped",
    skipReason: reason,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

function createHarnessSupabaseClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return {
      rpc: async () => ({
        data: [],
        error: { message: "SMART_SEARCH_HARNESS: missing SUPABASE env" },
      }),
    } as any;
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
  });
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTokens(tokens: Token[]): Token[] {
  return tokens.map((token) => (token instanceof RegExp ? token : normalizeText(token)));
}

function tokenLabel(token: Token): string {
  return token instanceof RegExp ? token.toString() : token;
}

function tokenPresent(text: string, token: Token): boolean {
  if (token instanceof RegExp) {
    const safe = new RegExp(token.source, token.flags.replace("g", ""));
    return safe.test(text);
  }
  return token.length > 0 && text.includes(token);
}

function candidateToText(candidate: SmartSearchCandidate): string {
  const combined = [
    candidate.title,
    candidate.searchText,
    candidate.playerName,
    candidate.setName,
    candidate.brand,
    candidate.line,
    candidate.year,
    candidate.parallel,
    candidate.variant,
    candidate.grader,
    candidate.grade,
    candidate.cardNumber,
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeText(combined);
}

function hasCandidateMatching(candidate: SmartSearchCandidate, keywords: Token[]): boolean {
  const haystack = candidateToText(candidate);
  return keywords.every((keyword) => keyword && tokenPresent(haystack, keyword));
}

function hasAnyCandidateMatching(
  candidates: SmartSearchCandidate[],
  keywords: Token[],
  topN: number
): boolean {
  const slice = candidates.slice(0, Math.max(1, topN));
  return slice.some((candidate) => hasCandidateMatching(candidate, keywords));
}

function findForbiddenHits(
  candidates: SmartSearchCandidate[],
  keywords: Token[],
  topN: number
): Array<{ keyword: string; title: string }> {
  const hits: Array<{ keyword: string; title: string }> = [];
  const slice = candidates.slice(0, Math.max(1, topN));
  for (const candidate of slice) {
    const haystack = candidateToText(candidate);
    for (const keyword of keywords) {
      if (keyword && tokenPresent(haystack, keyword)) {
        hits.push({ keyword: tokenLabel(keyword), title: candidate.title });
      }
    }
  }
  return hits;
}

function extractExpectedGroups(query: string, groups: TokenGroup[]): TokenGroup[] {
  const matching = groups.filter((group) => group.tokens.every((token) => tokenPresent(query, token)));
  if (matching.length <= 1) return matching;

  const sorted = [...matching].sort((a, b) => b.tokens.length - a.tokens.length);
  const selected: TokenGroup[] = [];
  for (const group of sorted) {
    const isSubset = selected.some((chosen) => isTokenSubset(group.tokens, chosen.tokens));
    if (!isSubset) selected.push(group);
  }
  return selected;
}

function isTokenSubset(candidate: string[], reference: string[]): boolean {
  return candidate.every((token) => reference.includes(token));
}

function extractExpectedParallelTokens(query: string): string[] {
  return KNOWN_PARALLEL_TOKENS.filter((token) => tokenPresent(query, token));
}

function computeDrift(
  topResults: SmartSearchCandidate[],
  expectedBrandGroups: TokenGroup[],
  expectedSetGroups: TokenGroup[],
  expectedParallelTokens: string[]
): DriftSummary {
  const topTexts = topResults.map(candidateToText);
  const topN = topTexts.length;

  const brandMatchCount = expectedBrandGroups.length === 0
    ? 0
    : topTexts.filter((text) => matchesAnyGroup(text, expectedBrandGroups)).length;
  const brandConflictCount = expectedBrandGroups.length === 0 ? 0 : Math.max(0, topN - brandMatchCount);
  const brandDrifted = expectedBrandGroups.length > 0 && topN > 0 && brandMatchCount < Math.ceil(topN / 2);
  const brandHardFail = expectedBrandGroups.length > 0 && topN > 0 && brandMatchCount === 0;

  const setMatchCount = expectedSetGroups.length === 0
    ? 0
    : topTexts.filter((text) => matchesAnyGroup(text, expectedSetGroups)).length;
  const setConflictCount = expectedSetGroups.length === 0 ? 0 : Math.max(0, topN - setMatchCount);
  const setDrifted = expectedSetGroups.length > 0 && topN > 0 && setMatchCount < Math.ceil(topN / 2);
  const setHardFail = expectedSetGroups.length > 0 && topN > 0 && setMatchCount <= 1;

  const expectedParallel = new Set(expectedParallelTokens);
  const parallelMatchCount = expectedParallelTokens.length === 0
    ? 0
    : topTexts.filter((text) => expectedParallelTokens.some((token) => tokenPresent(text, token))).length;
  const parallelConflictTokens = KNOWN_PARALLEL_TOKENS.filter((token) => !expectedParallel.has(token));
  const parallelConflictCount = topTexts.filter((text) =>
    parallelConflictTokens.some((token) => tokenPresent(text, token))
  ).length;

  const parallelDrifted = topN > 0
    ? expectedParallelTokens.length === 0
      ? parallelConflictCount >= Math.ceil(topN / 2)
      : parallelConflictCount >= Math.ceil(topN / 2)
    : false;
  const parallelHardFail = topN > 0
    ? expectedParallelTokens.length === 0
      ? parallelConflictCount === topN
      : parallelConflictCount > 0 && parallelMatchCount === 0
    : false;

  return {
    brand: {
      expected: expectedBrandGroups.map((group) => group.name),
      matchCount: brandMatchCount,
      conflictCount: brandConflictCount,
      drifted: brandDrifted,
      hardFail: brandHardFail,
    },
    set: {
      expected: expectedSetGroups.map((group) => group.name),
      matchCount: setMatchCount,
      conflictCount: setConflictCount,
      drifted: setDrifted,
      hardFail: setHardFail,
    },
    parallel: {
      expected: expectedParallelTokens,
      matchCount: parallelMatchCount,
      conflictCount: parallelConflictCount,
      drifted: parallelDrifted,
      hardFail: parallelHardFail,
    },
  };
}

function matchesAnyGroup(text: string, groups: TokenGroup[]): boolean {
  return groups.some((group) => group.tokens.every((token) => tokenPresent(text, token)));
}

function emptyDrift(): DriftSummary {
  return {
    brand: { expected: [], matchCount: 0, conflictCount: 0, drifted: false, hardFail: false },
    set: { expected: [], matchCount: 0, conflictCount: 0, drifted: false, hardFail: false },
    parallel: { expected: [], matchCount: 0, conflictCount: 0, drifted: false, hardFail: false },
  };
}

function formatCandidate(candidate: SmartSearchCandidate): string {
  const parts = [
    candidate.title,
    candidate.year ? `year:${candidate.year}` : undefined,
    candidate.setName ? `set:${candidate.setName}` : undefined,
    candidate.parallel ? `parallel:${candidate.parallel}` : undefined,
    candidate.grader && candidate.grade ? `grade:${candidate.grader} ${candidate.grade}` : undefined,
    candidate.source ? `source:${candidate.source}` : undefined,
  ].filter(Boolean);

  return parts.join(" | ");
}

function summarizeResults(results: CaseResult[]) {
  const executed = results.filter((r) => r.status !== "skipped");
  const latencies = executed.map((r) => r.latencyMs);
  const avgLatencyMs = average(latencies);
  const p95LatencyMs = percentile(latencies, 0.95);
  const p99LatencyMs = percentile(latencies, 0.99);

  const mustIncludeCases = executed.filter(
    (r) => r.mustIncludeTokens.length > 0 && r.top1MustIncludeMatch !== undefined
  );
  const top1MatchCount = mustIncludeCases.filter((r) => r.top1MustIncludeMatch).length;
  const mustIncludeTop1Pct = mustIncludeCases.length > 0
    ? round2((top1MatchCount / mustIncludeCases.length) * 100)
    : 0;

  const mustNotIncludeCases = executed.filter((r) => r.mustNotIncludeTokens.length > 0);
  const forbiddenHitCount = mustNotIncludeCases.filter((r) => !r.mustNotIncludeOk).length;
  const forbiddenTopNPct = mustNotIncludeCases.length > 0
    ? round2((forbiddenHitCount / mustNotIncludeCases.length) * 100)
    : 0;

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const zeroResults = executed.filter((r) => r.resultsCount === 0).length;

  const brandDriftCount = executed.filter((r) => r.drift.brand.drifted).length;
  const setDriftCount = executed.filter((r) => r.drift.set.drifted).length;
  const parallelDriftCount = executed.filter((r) => r.drift.parallel.drifted).length;

  return {
    total: results.length,
    passed,
    failed,
    skipped,
    avgLatencyMs: round2(avgLatencyMs),
    p95LatencyMs: round2(p95LatencyMs),
    p99LatencyMs: round2(p99LatencyMs),
    mustIncludeTop1Pct,
    forbiddenTopNPct,
    zeroResults,
    brandDriftCount,
    setDriftCount,
    parallelDriftCount,
  };
}

function printReport(results: CaseResult[], summary: ReturnType<typeof summarizeResults>): void {
  console.log("\nSmart Search Harness Report");
  console.table([
    {
      totalQueries: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      avgLatencyMs: summary.avgLatencyMs,
      p95LatencyMs: summary.p95LatencyMs,
      p99LatencyMs: summary.p99LatencyMs,
      mustIncludeTop1Pct: `${summary.mustIncludeTop1Pct}%`,
      forbiddenTopNPct: `${summary.forbiddenTopNPct}%`,
      zeroResults: summary.zeroResults,
    },
  ]);

  console.log("\nDrift metrics");
  console.table([
    {
      brandDrift: summary.brandDriftCount,
      setDrift: summary.setDriftCount,
      parallelDrift: summary.parallelDriftCount,
    },
  ]);

  const skippedCases = results.filter((r) => r.status === "skipped");
  if (skippedCases.length > 0) {
    console.log("\nSkipped cases:");
    console.table(
      skippedCases.slice(0, 10).map((r) => ({
        query: r.query,
        mode: r.mode,
        reason: r.skipReason ?? "skipped",
      }))
    );
  }

  const failedCases = results.filter((r) => r.failures.length > 0);
  if (failedCases.length > 0) {
    console.log("\nFailures (sample):");
    console.table(
      failedCases.slice(0, 10).map((r) => ({
        query: r.query,
        mode: r.mode,
        results: r.resultsCount,
        latencyMs: r.latencyMs,
        failures: r.failures.join(" | "),
      }))
    );
  }

  const worstFailures = [...failedCases]
    .sort((a, b) => failureSeverity(b) - failureSeverity(a))
    .slice(0, 5);

  if (worstFailures.length > 0) {
    console.log("\nWorst failures (top 5):");
    worstFailures.forEach((failure, index) => {
      console.log(`\n${index + 1}. ${failure.query}`);
      console.log(`   Reasons: ${failure.failures.join(", ")}`);
      if (failure.topResults.length === 0) {
        console.log("   Top results: <none>");
      } else {
        console.log("   Top results:");
        failure.topResults.forEach((candidate, idx) => {
          console.log(`   ${idx + 1}) ${formatCandidate(candidate)}`);
        });
      }
      if (failure.forbiddenHits.length > 0) {
        const hitSummary = failure.forbiddenHits
          .slice(0, 3)
          .map((hit) => `${hit.keyword} -> ${hit.title}`)
          .join(" | ");
        console.log(`   Forbidden hits: ${hitSummary}`);
      }
    });
  }
}

function failureSeverity(result: CaseResult): number {
  const base = result.failures.length;
  const emptyPenalty = result.resultsCount === 0 ? 1 : 0;
  return base * 2 + emptyPenalty;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(pct * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
