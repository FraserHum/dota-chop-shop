# Dota 2 Item Cost Efficiency Analyzer

A command-line tool for analyzing Dota 2 item builds with multi-stage progression support, inventory/backpack constraints, and Gyrocopter-specific mechanics.

## Features

- **Multi-Stage Build Analysis**: Plan item progression across multiple cost thresholds or target items
- **Inventory/Backpack System**: Model Dota 2's 6-slot inventory and 3-slot backpack with automatic item selling when space runs out
- **Gyrocopter Innate Support**: 100% gold recovery on disassembled items and recipes
- **Component Reuse Tracking**: Analyze how components carry forward between stages
- **Flexible Stage Definitions**: Cost-based, target-based, or fully custom JSON stage definitions
- **Item Filtering**: Exclude items, require specific items, or filter by role
- **Stat Valuations**: Calculate efficiency based on hero stat valuations

## Installation

### Prerequisites
- [Bun](https://bun.sh) runtime (v1.0+)
- Node.js 18+ (if not using Bun)

### Setup

```bash
# Clone the repository
git clone git@github.com:FraserHum/dota-chop-shop.git
cd dota-chop-shop

# Install dependencies
bun install

# Run tests (optional)
bun test
```

### Making the `chop-shop` Command Available

After installation, you can use the CLI in two ways:

**Option 1: Using `bun run` (recommended for development)**
```bash
bun run src/cli/index.ts progression -t 1500,2500,4000
# or use the start script
bun run start
```

**Option 2: Creating a Global Command**

To make `chop-shop` available as a command anywhere:

```bash
# From the project directory, link the package
bun link

# Now you can use chop-shop from anywhere
chop-shop progression -t 1500,2500,4000
chop-shop --help
```

To unlink:
```bash
bun unlink dota-chop-shop
```


### Interactive Mode (`run` command)

For users who prefer guided prompts rather than command-line flags, use the interactive `run` command:

```bash
chop-shop run
```

This launches an interactive wizard that guides you through:
1. **General Configuration**: Aura multiplier, item limits, search parameters
2. **Stage Definition Method**: Choose how to define progression stages
3. **Stage Configuration**: Enter details for each stage (costs, required/excluded items)

The interactive mode displays helpful defaults in grey text and validates all inputs as you go.

**Example interactive session:**
```bash
$ chop-shop run
Welcome to chop-shop interactive mode!

✔ Aura Multiplier?
  default: 1.0
  > 2.5

✔ Max items per loadout? (1-6)
  default: 3
  > 

✔ How would you like to define stages?
  > Cost thresholds (e.g., 2000g, 4000g, 7000g)

✔ How many stages do you want to analyze?
  default: 3
  > 

[... continues with stage-by-stage prompts ...]

Analysis complete!
```

**Interactive command also accepts pre-filled options:**
```bash
chop-shop run --aura 2.5
```

This pre-fills the aura multiplier and asks for remaining options interactively.

## Quick Start

All examples below use `chop-shop`. If you're using `bun run`, replace `chop-shop` with `bun run src/cli/index.ts`.

### Basic Cost-Based Progression

Analyze item builds at multiple cost thresholds:

```bash
chop-shop progression -t 1500,2500,4000
```

This finds optimal items to buy at 1500g, 2500g, and 4000g.

### Find Path to Target Items

Plan a path to acquire specific items:

```bash
chop-shop progression --targets "Force Staff,Skadi"
```

### Incremental Target Acquisition

Acquire different items at each stage:

```bash
chop-shop progression \
  --targets "Force Staff,Skadi" \
  -t 3000,6000,10000
```

Acquires Force Staff by 3000g, Skadi by 6000g, and optimizes remaining build by 10000g.

### Custom Stage Definitions

Full control over stage constraints:

```bash
chop-shop progression --stages \
  '[
    {"maxCost":2000},
    {"maxCost":5000,"requiredItems":["Force Staff"]},
    {"maxCost":10000,"requiredItems":["Skadi"]}
  ]'
```

### With Inventory/Backpack Constraints

Simulate realistic inventory limits:

```bash
chop-shop progression \
  -t 2000,4000,7000 \
  --inventory-slots 5 \
  --backpack-slots 2
```

With these constraints, items that don't fit in inventory (5) or backpack (2) are automatically sold for 50% of their cost.

## Command Reference

### Main Command: `progression`

Unified build progression analysis with cost thresholds and/or target items.

#### Options

**Cost and Stage Definition:**
- `-t, --thresholds <costs>` - Cost thresholds (comma-separated): `-t 2000,4000,7000`
- `--targets <items>` - Target items (comma-separated): `--targets "Force Staff,Skadi"`
- `--stages <json>` - Stage definitions as JSON (see below)

**Item Selection:**
- `-i, --items <number>` - Maximum items per loadout (default: 3)
- `-x, --exclude <items>` - Items to exclude (comma-separated)
- `--require-boots <stage>` - Inject Boots of Speed at specified stage (0-indexed)
- `--no-component-items` - Exclude component items (like Boots, Blades) from pool

**Inventory/Backpack:**
- `--inventory-slots <number>` - Active inventory slots (default: 6)
- `--backpack-slots <number>` - Backpack slots (default: 3)

**Analysis Tuning:**
- `-r, --results <number>` - Maximum results to show (default: 20)
- `-b, --beam <number>` - Beam width for search (default: results × 10)
- `--min-reuse <number>` - Minimum component reuse between stages (0-1, default: 0.3)
- `--coverage <number>` - Target coverage weight in scoring (0-1, default: 0.4)

**Output:**
- `--summary` - Show summary only (no detailed results)
- `-d, --details <number>` - Number of detailed results to show (default: 5)
- `-v, --verbose` - Show verbose transition details
- `--quiet` - Suppress progress output

### Stage Definition Format (JSON)

Each stage is a JSON object with the following fields:

```json
{
  "maxCost": 3000,                    // REQUIRED: Maximum gold for this stage
  "minCost": 2000,                    // Optional: Minimum gold (default: prev stage cost + 1)
  "requiredItems": ["Force Staff"],   // Optional: Items that MUST appear
  "excludedItems": ["Divine Rapier"], // Optional: Items that MUST NOT appear
  "itemCount": 3,                     // Optional: Number of items to assemble (default: 3)
  "requireBoots": 0                   // Optional: Stage index to inject Boots (0-indexed)
}
```

**Example multi-stage definition:**

```bash
chop-shop progression --stages \
  '[
    {"maxCost": 1500},
    {"maxCost": 3500, "requiredItems": ["Force Staff"]},
    {"maxCost": 7000, "requiredItems": ["Skadi"], "excludedItems": ["Divine Rapier"]}
  ]'
```

## Understanding the Output

### Summary Statistics

```
Total Evaluated: 3,092        # Total item combinations checked
Valid Sequences: 3            # Combinations that passed all constraints
Average Score: 0.879          # Average efficiency of valid builds
Best Score: 0.885             # Best efficiency found
Search Time: 30ms             # Time taken for analysis
```

### Per-Stage Statistics

Shows for each stage:
- `evaluated` - Combinations checked at this stage
- `valid` - Combinations that met constraints
- `avg score` - Average efficiency at this stage

### Build Progression Output

Each progression shows:
- **Items**: What to buy (items in inventory/backpack)
- **Cost**: Total gold invested
- **Score**: Efficiency metric (higher = better value)
- **Reuse**: Percentage of components carried from previous stage
- **Target**: Marker if required items are included

**Example:**
```
Stage 1 (≤1500g): Pavise + Iron Branch (1450g) [score: 0.88]
    ↓ +825g, 88% reuse
Stage 2 (≤2500g): Urn of Shadows + Pavise (2225g) [score: 0.85]
```

Explanation:
- Buy Pavise + Iron Branch at 1500g
- 88% of components are reused in stage 2
- Spend 825g more to reach stage 2 (2225g total)
- New items include Urn of Shadows while keeping Pavise

## Key Concepts

### Inventory vs Backpack vs Sold

- **Inventory** (6 slots default): Active items that provide stats
- **Backpack** (3 slots default): Inactive items that don't provide stats
- **Sold**: Excess items automatically converted to gold (50% recovery)

Items are allocated by priority:
1. Upgraded items (Pavise, Force Staff, etc.)
2. Component items with stats (Boots of Speed, Blades of Attack)
3. Other components

### Component Reuse

When transitioning between stages:
- All items from previous stage are disassembled into components
- 100% of recipe costs are recovered (Gyro innate)
- Components are reused if they fit in new items
- Excess components become "leftovers" carried to next stage

The "reuse %" shows how much of your previous investment is reused.

### Efficiency Score

Higher scores indicate better value:
- **Stat Value**: Total gold value of all stats
- **Invested Cost**: Total gold spent (including sold items at 50% recovery)
- **Efficiency**: Stat Value / Invested Cost

## Examples

### Support Hero (Limited Budget)

```bash
chop-shop progression \
  -t 2000,4000,6000 \
  -i 2 \
  --exclude "Radiance,Divine Rapier"
```

### Core Hero (Flex Items)

```bash
chop-shop progression \
  -t 3000,6000,10000 \
  -i 3 \
  --targets "Black King Bar,Butterfly"
```

### Tight Inventory Slots

```bash
chop-shop progression \
  -t 2000,4000,7000 \
  --inventory-slots 2 \
  --backpack-slots 1
```

This forces most items to be sold due to space constraints, showing which items are most valuable to keep.

## Development

### Run Tests

```bash
bun test
```

### Type Checking

```bash
bun x tsc --noEmit
```

### Project Structure

```
src/
├── cli/                    # Command-line interface
│   ├── index.ts           # Main CLI entry point
│   └── commands/          # Command implementations
├── calculators/           # Core analysis algorithms
│   ├── buildProgression.ts    # Multi-stage analysis
│   ├── loadout.ts             # Item loadout construction
│   ├── constraints.ts         # Stage constraints
│   └── scorers.ts             # Build scoring
├── data/                  # Data sources
│   └── ItemRepository.ts  # Item data management
├── models/                # TypeScript interfaces
│   ├── types.ts           # Item and stat types
│   └── buildTypes.ts      # Build analysis types
└── __tests__/             # Test suite
```

## Known Limitations

- Analysis is Dota 2 patch-specific (uses OpenDota API data)
- Does not account for hero-specific interactions or buffs
- Doesn't model active item cooldowns or usage patterns
- Efficiency scoring is purely mathematical, not game-practical

## Contributing

Contributions welcome! Areas for improvement:
- Support for additional hero-specific mechanics
- Advanced constraint modeling (e.g., mana requirements)
- Performance optimizations for large searches
- Additional analysis modes

## License

MIT

## References

- [OpenDota API](https://docs.opendota.com/)
- Dota 2 item costs and stats from official game data
