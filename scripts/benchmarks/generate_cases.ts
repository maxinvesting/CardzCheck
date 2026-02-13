#!/usr/bin/env tsx
/**
 * Generate 1000+ diverse test cases for CMV benchmarking
 * Emphasis on non-mainstream sets with realistic player/set combinations
 */

import * as fs from "fs";
import * as path from "path";

interface BenchmarkCase {
  case_id: string;
  sport: string;
  player: string;
  year: number | null;
  brand: string;
  set: string;
  parallel: string | null;
  grade: string | null;
  keywords_extra?: string[];
  notes?: string;
}

// ============================================================================
// PLAYER POOLS
// ============================================================================

const FOOTBALL_PLAYERS = {
  rookies_2023: ["CJ Stroud", "Bryce Young", "Anthony Richardson", "Will Levis", "Hendon Hooker", "Puka Nacua", "Jaxon Smith-Njigba", "Zay Flowers", "Jordan Addison", "Tank Dell", "Devon Achane", "Jahmyr Gibbs", "Bijan Robinson", "Sam LaPorta", "Dalton Kincaid", "Josh Downs", "Michael Mayer", "Darnell Washington", "Rashee Rice", "Kayshon Boutte"],
  rookies_2022: ["Garrett Wilson", "Drake London", "Chris Olave", "Treylon Burks", "Jameson Williams", "George Pickens", "Skyy Moore", "Christian Watson", "Kenneth Walker", "Breece Hall", "Dameon Pierce", "Trey McBride"],
  stars: ["Patrick Mahomes", "Josh Allen", "Justin Jefferson", "Tyreek Hill", "Travis Kelce", "Ja'Marr Chase", "Christian McCaffrey", "Derrick Henry", "George Kittle"],
  mid_tier: ["Jalen Hurts", "Lamar Jackson", "CeeDee Lamb", "AJ Brown", "DeVonta Smith", "DJ Moore", "Terry McLaurin", "Najee Harris", "Brian Robinson", "Kyle Pitts"]
};

const BASKETBALL_PLAYERS = {
  rookies_2023: ["Victor Wembanyama", "Brandon Miller", "Scoot Henderson", "Amen Thompson", "Ausar Thompson", "Gradey Dick", "Cam Whitmore", "Jarace Walker", "Cason Wallace", "Anthony Black", "Bilal Coulibaly", "Keyonte George", "GG Jackson", "Dereck Lively II", "Jordan Hawkins"],
  rookies_2022: ["Paolo Banchero", "Chet Holmgren", "Jabari Smith Jr", "Jaden Ivey", "Keegan Murray", "Bennedict Mathurin", "Shaedon Sharpe", "AJ Griffin"],
  stars: ["LeBron James", "Stephen Curry", "Luka Doncic", "Giannis Antetokounmpo", "Nikola Jokic", "Joel Embiid", "Kevin Durant", "Jayson Tatum", "Damian Lillard"],
  mid_tier: ["Ja Morant", "Anthony Edwards", "Tyrese Haliburton", "Donovan Mitchell", "Devin Booker", "Zion Williamson", "Lamelo Ball", "Trae Young"]
};

const BASEBALL_PLAYERS = {
  rookies_2024: ["Paul Skenes", "Jackson Holliday", "Wyatt Langford", "Junior Caminero", "Evan Carter", "James Wood", "Dylan Crews", "Jasson Dominguez", "Druw Jones", "Jackson Chourio", "Colton Cowser", "Curtis Mead"],
  rookies_2023: ["Gunnar Henderson", "Corbin Carroll", "Elly De La Cruz", "Masyn Winn", "Josh Jung", "Kodai Senga"],
  stars: ["Shohei Ohtani", "Ronald Acuna Jr", "Mike Trout", "Mookie Betts", "Fernando Tatis Jr", "Juan Soto", "Bryce Harper", "Aaron Judge"],
  mid_tier: ["Bobby Witt Jr", "Julio Rodriguez", "Riley Greene", "Adley Rutschman", "Spencer Torkelson", "CJ Abrams", "Yordan Alvarez", "Vladimir Guerrero Jr"]
};

const SOCCER_PLAYERS = {
  stars: ["Jude Bellingham", "Erling Haaland", "Kylian Mbappe", "Vinicius Junior", "Bukayo Saka", "Phil Foden", "Jamal Musiala", "Pedri", "Gavi", "Florian Wirtz"],
  mid_tier: ["Eduardo Camavinga", "Josko Gvardiol", "Alejandro Garnacho", "Rasmus Hojlund", "Cody Gakpo", "Darwin Nunez"]
};

const HOCKEY_PLAYERS = {
  rookies_2023: ["Connor Bedard", "Adam Fantilli", "Leo Carlsson", "Matvei Michkov", "Will Smith", "David Reinbacher", "Logan Cooley"],
  stars: ["Connor McDavid", "Auston Matthews", "Nathan MacKinnon", "Cale Makar", "Leon Draisaitl", "David Pastrnak"],
  mid_tier: ["Jack Hughes", "Kirill Kaprizov", "Matthew Tkachuk", "Elias Pettersson", "Tim Stutzle"]
};

// ============================================================================
// SET POOLS (NON-MAINSTREAM EMPHASIS)
// ============================================================================

const FOOTBALL_SETS = [
  { name: "Mosaic", parallels: ["Green Prizm", "Blue Prizm", "Silver Prizm", "Pink Camo", "Genesis"], weight: 3 },
  { name: "Phoenix", parallels: ["Fire Burst", "Neon Pulsar", "Red", "Green", "Purple"], weight: 3 },
  { name: "Illusions", parallels: ["Trophy Collection", "Purple", "Emerald", "Clear Shots"], weight: 3 },
  { name: "XR", parallels: ["Blue", "Green", "Red", "Orange"], weight: 2 },
  { name: "Origins", parallels: ["Red", "Orange", "Green", "Blue", "Purple"], weight: 2 },
  { name: "Absolute", parallels: ["Spectrum Silver", "Spectrum Blue", "Spectrum Red", "Retail Red"], weight: 2 },
  { name: "Chronicles", parallels: ["Flux", "Phoenix", "Luminance", "Illusions"], weight: 2 },
  { name: "Elite", parallels: ["Aspirations", "Status", "Orange", "Purple"], weight: 2 },
  { name: "Luminance", parallels: ["Gold", "Silver", "Bronze"], weight: 2 },
  { name: "Prestige", parallels: ["Xtra Points Green", "Xtra Points Red", "Xtra Points Blue"], weight: 2 },
  { name: "Certified", parallels: ["Mirror Gold", "Mirror Red", "Mirror Blue"], weight: 2 },
  { name: "Spectra", parallels: ["Neon Green", "Orange", "Blue", "Purple"], weight: 2 },
  { name: "Contenders", parallels: ["Cracked Ice", "Playoff Ticket", "Championship Ticket"], weight: 1 },
  { name: "Select", parallels: ["Silver Prizm", "Tie Dye", "Tri Color"], weight: 1 },
  { name: "Prizm Draft Picks", parallels: ["Silver", "Blue", "Green", "Orange"], weight: 2 },
  { name: "Donruss", parallels: [null, "Rated Rookie"], weight: 1 },
  { name: "Donruss Optic", parallels: ["Holo", "Purple", "Blue"], weight: 1 }
];

const BASKETBALL_SETS = [
  { name: "Court Kings", parallels: ["Ruby", "Sapphire", "Emerald"], weight: 3 },
  { name: "Revolution", parallels: ["Fractal", "Cosmic", "Groove", "Cubic"], weight: 3 },
  { name: "Obsidian", parallels: ["Electric Etch Purple", "Electric Etch Orange", "Orange", "Red"], weight: 3 },
  { name: "Noir", parallels: ["Color Blast", "Color", "Spotlight"], weight: 2 },
  { name: "Immaculate", parallels: [null, "Gold", "Platinum"], weight: 2 },
  { name: "National Treasures", parallels: ["Ruby", "Gold", "Emerald"], weight: 2 },
  { name: "Elite", parallels: ["Aspirations", "Status", "Orange"], weight: 2 },
  { name: "Threads", parallels: ["Century Red", "Century Blue", "Century Orange"], weight: 2 },
  { name: "Crown Royale", parallels: ["Silhouettes", "Crystal", "Royal"], weight: 2 },
  { name: "Select", parallels: ["Silver Prizm", "Tie Dye", "Tri Color"], weight: 1 },
  { name: "Prizm Draft Picks", parallels: ["Blue", "Green", "Silver", "Red"], weight: 2 },
  { name: "Prizm", parallels: ["Silver", "Green", "Blue"], weight: 1 }
];

const BASEBALL_SETS = [
  { name: "Finest", parallels: ["Refractor", "Gold Refractor", "Orange Refractor"], weight: 2 },
  { name: "Heritage", parallels: ["Chrome", "Chrome Refractor"], weight: 2 },
  { name: "Archives", parallels: [null, "Silver", "Gold"], weight: 2 },
  { name: "Stadium Club", parallels: ["Red Foil", "Sepia", "Chrome"], weight: 2 },
  { name: "Bowman Chrome", parallels: ["Refractor", "Orange Refractor", "Blue Refractor", "Orange Shimmer"], weight: 2 },
  { name: "Bowman Draft", parallels: ["Orange", "Purple", "Blue", "Green"], weight: 2 },
  { name: "Sterling", parallels: [null, "Gold", "Red"], weight: 2 },
  { name: "Chrome Platinum Anniversary", parallels: ["Sepia Refractor", "Gold Refractor", "Base"], weight: 2 },
  { name: "Tribute", parallels: [null, "Orange", "Blue"], weight: 2 },
  { name: "Allen & Ginter", parallels: [null, "Mini"], weight: 2 },
  { name: "Chrome", parallels: ["Refractor", "Sepia Refractor"], weight: 1 }
];

const SOCCER_SETS = [
  { name: "Merlin", parallels: ["Aqua", "Purple", "Red"], weight: 2 },
  { name: "Chrome UCC", parallels: ["Refractor", "Blue Refractor"], weight: 2 },
  { name: "Prizm EPL", parallels: ["Silver", "Green", "Blue"], weight: 2 },
  { name: "Prizm LaLiga", parallels: ["Blue", "Red", "Silver"], weight: 2 },
  { name: "Select", parallels: ["Tie Dye", "Tri Color"], weight: 1 }
];

const HOCKEY_SETS = [
  { name: "Series 1", parallels: [null, "Exclusives"], weight: 1 },
  { name: "Series 2", parallels: [null, "High Gloss"], weight: 1 },
  { name: "Extended", parallels: ["Blue", "Red", "Green"], weight: 2 },
  { name: "SP Authentic", parallels: [null, "Red"], weight: 2 },
  { name: "Artifacts", parallels: ["Ruby", "Sapphire", "Emerald"], weight: 2 }
];

const GRADES = [null, null, null, "PSA 10", "PSA 9", "BGS 9.5", "BGS 9", "PSA 8"];

// ============================================================================
// CASE GENERATOR
// ============================================================================

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(sets: { name: string; parallels: (string | null)[]; weight: number }[]) {
  const totalWeight = sets.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;
  for (const set of sets) {
    random -= set.weight;
    if (random <= 0) return set;
  }
  return sets[sets.length - 1];
}

function generateFootballCase(id: number, year: number, playerPool: string[]): BenchmarkCase {
  const player = randomChoice(playerPool);
  const setChoice = weightedChoice(FOOTBALL_SETS);
  const parallel = randomChoice(setChoice.parallels);
  const grade = randomChoice(GRADES);

  return {
    case_id: `fb_${String(id).padStart(4, "0")}`,
    sport: "football",
    player,
    year,
    brand: "Panini",
    set: setChoice.name,
    parallel,
    grade,
    notes: setChoice.weight >= 2 ? "non-mainstream set" : "mainstream set"
  };
}

function generateBasketballCase(id: number, year: number, playerPool: string[]): BenchmarkCase {
  const player = randomChoice(playerPool);
  const setChoice = weightedChoice(BASKETBALL_SETS);
  const parallel = randomChoice(setChoice.parallels);
  const grade = randomChoice(GRADES);

  return {
    case_id: `bb_${String(id).padStart(4, "0")}`,
    sport: "basketball",
    player,
    year,
    brand: "Panini",
    set: setChoice.name,
    parallel,
    grade,
    notes: setChoice.weight >= 2 ? "non-mainstream set" : "mainstream set"
  };
}

function generateBaseballCase(id: number, year: number, playerPool: string[]): BenchmarkCase {
  const player = randomChoice(playerPool);
  const setChoice = weightedChoice(BASEBALL_SETS);
  const parallel = randomChoice(setChoice.parallels);
  const grade = randomChoice(GRADES);

  return {
    case_id: `bsb_${String(id).padStart(4, "0")}`,
    sport: "baseball",
    player,
    year,
    brand: "Topps",
    set: setChoice.name,
    parallel,
    grade,
    notes: "topps product"
  };
}

function generateSoccerCase(id: number, year: number, playerPool: string[]): BenchmarkCase {
  const player = randomChoice(playerPool);
  const setChoice = weightedChoice(SOCCER_SETS);
  const parallel = randomChoice(setChoice.parallels);
  const grade = randomChoice(GRADES);

  return {
    case_id: `soc_${String(id).padStart(4, "0")}`,
    sport: "soccer",
    player,
    year,
    brand: setChoice.name.includes("Chrome") || setChoice.name.includes("Merlin") ? "Topps" : "Panini",
    set: setChoice.name,
    parallel,
    grade,
    notes: "soccer card"
  };
}

function generateHockeyCase(id: number, year: number, playerPool: string[]): BenchmarkCase {
  const player = randomChoice(playerPool);
  const setChoice = weightedChoice(HOCKEY_SETS);
  const parallel = randomChoice(setChoice.parallels);
  const grade = randomChoice(GRADES);

  return {
    case_id: `hky_${String(id).padStart(4, "0")}`,
    sport: "hockey",
    player,
    year,
    brand: "Upper Deck",
    set: setChoice.name,
    parallel,
    grade,
    notes: "hockey card"
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

function generateAllCases(): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  let fbId = 1, bbId = 1, bsbId = 1, socId = 1, hkyId = 1;

  // Football: 400 cases
  // 2023 rookies (150)
  for (let i = 0; i < 150; i++) {
    cases.push(generateFootballCase(fbId++, 2023, FOOTBALL_PLAYERS.rookies_2023));
  }
  // 2022 rookies (100)
  for (let i = 0; i < 100; i++) {
    cases.push(generateFootballCase(fbId++, 2022, FOOTBALL_PLAYERS.rookies_2022));
  }
  // Stars (100)
  for (let i = 0; i < 100; i++) {
    const year = 2015 + Math.floor(Math.random() * 8); // 2015-2022
    cases.push(generateFootballCase(fbId++, year, FOOTBALL_PLAYERS.stars));
  }
  // Mid-tier (50)
  for (let i = 0; i < 50; i++) {
    const year = 2018 + Math.floor(Math.random() * 5); // 2018-2022
    cases.push(generateFootballCase(fbId++, year, FOOTBALL_PLAYERS.mid_tier));
  }

  // Basketball: 300 cases
  // 2023 rookies (100)
  for (let i = 0; i < 100; i++) {
    cases.push(generateBasketballCase(bbId++, 2023, BASKETBALL_PLAYERS.rookies_2023));
  }
  // 2022 rookies (70)
  for (let i = 0; i < 70; i++) {
    cases.push(generateBasketballCase(bbId++, 2022, BASKETBALL_PLAYERS.rookies_2022));
  }
  // Stars (80)
  for (let i = 0; i < 80; i++) {
    const year = 2003 + Math.floor(Math.random() * 20); // 2003-2022
    cases.push(generateBasketballCase(bbId++, year, BASKETBALL_PLAYERS.stars));
  }
  // Mid-tier (50)
  for (let i = 0; i < 50; i++) {
    const year = 2017 + Math.floor(Math.random() * 6); // 2017-2022
    cases.push(generateBasketballCase(bbId++, year, BASKETBALL_PLAYERS.mid_tier));
  }

  // Baseball: 250 cases
  // 2024 rookies (80)
  for (let i = 0; i < 80; i++) {
    cases.push(generateBaseballCase(bsbId++, 2024, BASEBALL_PLAYERS.rookies_2024));
  }
  // 2023 rookies (50)
  for (let i = 0; i < 50; i++) {
    cases.push(generateBaseballCase(bsbId++, 2023, BASEBALL_PLAYERS.rookies_2023));
  }
  // Stars (70)
  for (let i = 0; i < 70; i++) {
    const year = 2011 + Math.floor(Math.random() * 12); // 2011-2022
    cases.push(generateBaseballCase(bsbId++, year, BASEBALL_PLAYERS.stars));
  }
  // Mid-tier (50)
  for (let i = 0; i < 50; i++) {
    const year = 2018 + Math.floor(Math.random() * 5); // 2018-2022
    cases.push(generateBaseballCase(bsbId++, year, BASEBALL_PLAYERS.mid_tier));
  }

  // Soccer: 40 cases
  for (let i = 0; i < 30; i++) {
    cases.push(generateSoccerCase(socId++, 2023, SOCCER_PLAYERS.stars));
  }
  for (let i = 0; i < 10; i++) {
    cases.push(generateSoccerCase(socId++, 2023, SOCCER_PLAYERS.mid_tier));
  }

  // Hockey: 30 cases
  for (let i = 0; i < 15; i++) {
    cases.push(generateHockeyCase(hkyId++, 2023, HOCKEY_PLAYERS.rookies_2023));
  }
  for (let i = 0; i < 10; i++) {
    const year = 2015 + Math.floor(Math.random() * 8); // 2015-2022
    cases.push(generateHockeyCase(hkyId++, year, HOCKEY_PLAYERS.stars));
  }
  for (let i = 0; i < 5; i++) {
    const year = 2019 + Math.floor(Math.random() * 4); // 2019-2022
    cases.push(generateHockeyCase(hkyId++, year, HOCKEY_PLAYERS.mid_tier));
  }

  // Add some "expected insufficient comps" cases (5%)
  const insufficientCount = Math.floor(cases.length * 0.05);
  for (let i = 0; i < insufficientCount; i++) {
    const obscureCase: BenchmarkCase = {
      case_id: `edge_${String(i).padStart(3, "0")}`,
      sport: "football",
      player: "Unknown Rookie",
      year: 2010,
      brand: "Panini",
      set: "Obscure Set",
      parallel: "1/1 Platinum",
      grade: "PSA 10",
      notes: "expected insufficient comps"
    };
    cases.push(obscureCase);
  }

  return cases;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const cases = generateAllCases();
  const outputPath = path.join(process.cwd(), "scripts", "benchmarks", "cases_1000.json");

  fs.writeFileSync(outputPath, JSON.stringify(cases, null, 2), "utf-8");

  console.log(`✅ Generated ${cases.length} test cases`);
  console.log(`   Output: ${outputPath}`);

  // Stats
  const stats = cases.reduce((acc, c) => {
    acc[c.sport] = (acc[c.sport] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("\n📊 Distribution:");
  Object.entries(stats).forEach(([sport, count]) => {
    console.log(`   ${sport}: ${count}`);
  });
}

main();
