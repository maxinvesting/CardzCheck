// Popular sports card sets and brands
export const CARD_SETS = [
  // Basketball
  { name: "Panini Prizm", sport: "basketball", years: "2012-Present" },
  { name: "Panini Select", sport: "basketball", years: "2012-Present" },
  { name: "Panini Donruss", sport: "basketball", years: "1981-Present" },
  { name: "Panini Optic", sport: "basketball", years: "2017-Present" },
  { name: "Topps Chrome", sport: "basketball", years: "1996-2007" },
  { name: "Upper Deck", sport: "basketball", years: "1989-2010" },
  { name: "Fleer", sport: "basketball", years: "1986-2007" },
  { name: "Skybox", sport: "basketball", years: "1990-2004" },
  { name: "SP Authentic", sport: "basketball", years: "1995-2010" },
  { name: "Bowman Chrome", sport: "basketball", years: "1998-2004" },

  // Football
  { name: "Panini Prizm Football", sport: "football", years: "2012-Present" },
  { name: "Panini Select Football", sport: "football", years: "2013-Present" },
  { name: "Donruss Football", sport: "football", years: "1999-Present" },
  { name: "Donruss Optic Football", sport: "football", years: "2016-Present" },
  { name: "Mosaic Football", sport: "football", years: "2019-Present" },
  { name: "Contenders Football", sport: "football", years: "1998-Present" },
  { name: "National Treasures Football", sport: "football", years: "2006-Present" },
  { name: "Topps Chrome Football", sport: "football", years: "1996-2013" },
  { name: "Bowman Chrome Football", sport: "football", years: "1999-2013" },
  { name: "Upper Deck Football", sport: "football", years: "1991-2010" },
  { name: "Score Football", sport: "football", years: "1988-Present" },

  // Baseball
  { name: "Topps Chrome Baseball", sport: "baseball", years: "1996-Present" },
  { name: "Bowman Chrome Baseball", sport: "baseball", years: "1997-Present" },
  { name: "Topps Series 1", sport: "baseball", years: "1951-Present" },
  { name: "Topps Series 2", sport: "baseball", years: "1951-Present" },
  { name: "Topps Update", sport: "baseball", years: "1987-Present" },
  { name: "Bowman Draft", sport: "baseball", years: "2011-Present" },
  { name: "Topps Finest", sport: "baseball", years: "1993-Present" },
  { name: "Upper Deck Baseball", sport: "baseball", years: "1989-2010" },
  { name: "Donruss Baseball", sport: "baseball", years: "1981-2005" },

  // Hockey
  { name: "Upper Deck Hockey", sport: "hockey", years: "1990-Present" },
  { name: "O-Pee-Chee", sport: "hockey", years: "1968-Present" },
  { name: "SP Authentic Hockey", sport: "hockey", years: "1995-Present" },
  { name: "Upper Deck Series 1", sport: "hockey", years: "1990-Present" },
  { name: "Upper Deck Series 2", sport: "hockey", years: "1990-Present" },

  // Soccer
  { name: "Panini Prizm Premier League", sport: "soccer", years: "2019-Present" },
  { name: "Topps Chrome UEFA", sport: "soccer", years: "2015-Present" },
  { name: "Panini Select FIFA", sport: "soccer", years: "2015-Present" },
];

// Card grading companies and grades
export const GRADING_OPTIONS = [
  // PSA
  { label: "PSA 10 - Gem Mint", value: "PSA 10" },
  { label: "PSA 9 - Mint", value: "PSA 9" },
  { label: "PSA 8 - Near Mint-Mint", value: "PSA 8" },
  { label: "PSA 7 - Near Mint", value: "PSA 7" },
  { label: "PSA 6 - Excellent-Mint", value: "PSA 6" },
  { label: "PSA 5 - Excellent", value: "PSA 5" },

  // BGS/Beckett
  { label: "BGS 10 - Black Label", value: "BGS 10" },
  { label: "BGS 9.5 - Gem Mint", value: "BGS 9.5" },
  { label: "BGS 9 - Mint", value: "BGS 9" },
  { label: "BGS 8.5 - Near Mint-Mint+", value: "BGS 8.5" },
  { label: "BGS 8 - Near Mint-Mint", value: "BGS 8" },
  { label: "BGS 7.5 - Near Mint+", value: "BGS 7.5" },

  // SGC
  { label: "SGC 10 - Gem Mint", value: "SGC 10" },
  { label: "SGC 9.5 - Mint+", value: "SGC 9.5" },
  { label: "SGC 9 - Mint", value: "SGC 9" },
  { label: "SGC 8.5 - Near Mint-Mint+", value: "SGC 8.5" },
  { label: "SGC 8 - Near Mint-Mint", value: "SGC 8" },

  // CGC
  { label: "CGC 10 - Pristine", value: "CGC 10" },
  { label: "CGC 9.5 - Gem Mint", value: "CGC 9.5" },
  { label: "CGC 9 - Mint", value: "CGC 9" },
  { label: "CGC 8.5 - Near Mint-Mint+", value: "CGC 8.5" },
  { label: "CGC 8 - Near Mint-Mint", value: "CGC 8" },

  // Raw/Ungraded
  { label: "Raw/Ungraded", value: "Raw" },
];

// Card variants/parallels and inserts
export const CARD_VARIANTS = [
  "Base",
  "Refractor",
  "Silver Prizm",
  "Gold Prizm",
  "Red Prizm",
  "Green Prizm",
  "Blue Prizm",
  "Orange Prizm",
  "Purple Prizm",
  "Black Prizm",
  "Shimmer",
  "Cracked Ice",
  "Mojo",
  "Sepia",
  "Camo",
  "Tiger Stripe",
  "Hyper",
  "Fast Break",
  "Choice",
  "Ruby Wave",
  "Silver Wave",
  "Rookie Card",
  "Autograph",
  "Auto Patch",
  "Jersey",
  "Patch",
  "Numbered",
  "/99",
  "/49",
  "/25",
  "/10",
  "/5",
  "/1",
  "1/1",
  // Popular inserts
  "Downtown",
  "Kaboom",
  "Color Blast",
  "Case Hit",
  "SSP",
  "SP",
  "Rated Rookie",
  "Silver",
  "Gold",
  "Red",
  "Blue",
  "Green",
  "Orange",
  "Purple",
  "Pink",
  "Neon Green",
  "Disco",
  "Lazer",
  "Wave",
  "Holo",
  "Stained Glass",
];

// Popular players (you can expand this list or fetch from an API)
export const POPULAR_PLAYERS = [
  // Basketball
  { name: "Michael Jordan", sport: "basketball", active: false },
  { name: "LeBron James", sport: "basketball", active: true },
  { name: "Kobe Bryant", sport: "basketball", active: false },
  { name: "Stephen Curry", sport: "basketball", active: true },
  { name: "Kevin Durant", sport: "basketball", active: true },
  { name: "Giannis Antetokounmpo", sport: "basketball", active: true },
  { name: "Luka Doncic", sport: "basketball", active: true },
  { name: "Victor Wembanyama", sport: "basketball", active: true },
  { name: "Jayson Tatum", sport: "basketball", active: true },
  { name: "Anthony Edwards", sport: "basketball", active: true },
  { name: "Magic Johnson", sport: "basketball", active: false },
  { name: "Larry Bird", sport: "basketball", active: false },
  { name: "Shaquille O'Neal", sport: "basketball", active: false },
  { name: "Tim Duncan", sport: "basketball", active: false },
  { name: "Allen Iverson", sport: "basketball", active: false },

  // Football
  { name: "Tom Brady", sport: "football", active: false },
  { name: "Patrick Mahomes", sport: "football", active: true },
  { name: "Joe Burrow", sport: "football", active: true },
  { name: "Justin Herbert", sport: "football", active: true },
  { name: "Josh Allen", sport: "football", active: true },
  { name: "C.J. Stroud", sport: "football", active: true },
  { name: "Brock Purdy", sport: "football", active: true },
  { name: "Travis Kelce", sport: "football", active: true },
  { name: "Jayden Daniels", sport: "football", active: true },
  { name: "Bo Nix", sport: "football", active: true },
  { name: "Caleb Williams", sport: "football", active: true },
  { name: "Marvin Harrison Jr.", sport: "football", active: true },
  { name: "Malik Nabers", sport: "football", active: true },
  { name: "Drake Maye", sport: "football", active: true },
  { name: "Rome Odunze", sport: "football", active: true },
  { name: "Jalen Hurts", sport: "football", active: true },
  { name: "Lamar Jackson", sport: "football", active: true },
  { name: "Ja'Marr Chase", sport: "football", active: true },
  { name: "Justin Jefferson", sport: "football", active: true },
  { name: "Tyreek Hill", sport: "football", active: true },
  { name: "Micah Parsons", sport: "football", active: true },
  { name: "Jerry Rice", sport: "football", active: false },
  { name: "Joe Montana", sport: "football", active: false },
  { name: "Peyton Manning", sport: "football", active: false },
  { name: "Dan Marino", sport: "football", active: false },

  // Baseball
  { name: "Mike Trout", sport: "baseball", active: true },
  { name: "Shohei Ohtani", sport: "baseball", active: true },
  { name: "Aaron Judge", sport: "baseball", active: true },
  { name: "Ronald Acuña Jr.", sport: "baseball", active: true },
  { name: "Mookie Betts", sport: "baseball", active: true },
  { name: "Vladimir Guerrero Jr.", sport: "baseball", active: true },
  { name: "Juan Soto", sport: "baseball", active: true },
  { name: "Derek Jeter", sport: "baseball", active: false },
  { name: "Ken Griffey Jr.", sport: "baseball", active: false },
  { name: "Mickey Mantle", sport: "baseball", active: false },
  { name: "Babe Ruth", sport: "baseball", active: false },

  // Hockey
  { name: "Connor McDavid", sport: "hockey", active: true },
  { name: "Sidney Crosby", sport: "hockey", active: true },
  { name: "Alex Ovechkin", sport: "hockey", active: true },
  { name: "Wayne Gretzky", sport: "hockey", active: false },
  { name: "Mario Lemieux", sport: "hockey", active: false },
  { name: "Bobby Orr", sport: "hockey", active: false },

  // Soccer
  { name: "Lionel Messi", sport: "soccer", active: true },
  { name: "Cristiano Ronaldo", sport: "soccer", active: true },
  { name: "Kylian Mbappé", sport: "soccer", active: true },
  { name: "Erling Haaland", sport: "soccer", active: true },
];

// Helper function to search players
export function searchPlayers(query: string): typeof POPULAR_PLAYERS {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  return POPULAR_PLAYERS.filter(player =>
    player.name.toLowerCase().includes(lowerQuery)
  ).slice(0, 10);
}

// Helper function to search card sets
export function searchCardSets(query: string): typeof CARD_SETS {
  if (!query || query.length < 2) return CARD_SETS.slice(0, 10);

  const lowerQuery = query.toLowerCase();
  return CARD_SETS.filter(set =>
    set.name.toLowerCase().includes(lowerQuery)
  ).slice(0, 10);
}
