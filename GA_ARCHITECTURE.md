# GA Medical Record Recommendation - System Architecture

## 🏗️ Overall System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Dashboard UI                       │
│                  (views/admin/dashboard.ejs)                 │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  "Fetch Similar Records (GA)" Tab                     │  │
│  │                                                         │  │
│  │  Search Form:                                          │  │
│  │  • File Type         • Patient ID                     │  │
│  │  • Conditions        • Doctor ID                      │  │
│  │  • Blood Group       • Gender                         │  │
│  │  • Result Limit                                       │  │
│  │                                                         │  │
│  │  [Search with GA] [Clear] [View Statistics]          │  │
│  └────────────────┬──────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────┘
                    │ HTTP POST /api/ga/recommend
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Express Server                          │
│                        (server.js)                           │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            GA Routes (routes/ga.js)                   │  │
│  │                                                         │  │
│  │  POST /api/ga/recommend                               │  │
│  │  • Authenticate user (admin only)                     │  │
│  │  • Parse search criteria                              │  │
│  │  • Call recommendRecordsGA()                          │  │
│  │  • Return JSON results                                │  │
│  │                                                         │  │
│  │  GET /api/ga/statistics                               │  │
│  │  • Fetch database stats                               │  │
│  │  • Return GA configuration                            │  │
│  └────────────────┬──────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────┘
                    │ Call gaHelper functions
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  GA Algorithm Module                         │
│                   (utils/gaHelper.js)                        │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │       recommendRecordsGA(searchCriteria, limit)       │  │
│  │                                                         │  │
│  │  1. Fetch all records from database                   │  │
│  │  2. Initialize population                             │  │
│  │  3. For each generation (20 times):                   │  │
│  │     • Calculate fitness for all records               │  │
│  │     • Select best (elitism)                           │  │
│  │     • Tournament selection                            │  │
│  │     • Crossover & Mutation                            │  │
│  │  4. Return top N results                              │  │
│  └────────────────┬──────────────────────────────────────┘  │
│                   │                                          │
│  ┌────────────────▼──────────────────────────────────────┐  │
│  │        calculateFitness(record, criteria)             │  │
│  │                                                         │  │
│  │  Score based on:                                      │  │
│  │  • Exact keyword matches      (weight: 10.0)          │  │
│  │  • Condition similarity       (weight: 9.0)           │  │
│  │  • File type match            (weight: 8.0)           │  │
│  │  • Doctor match               (weight: 6.0)           │  │
│  │  • Partial matches            (weight: 5.0)           │  │
│  │  • Temporal relevance         (weight: 3.0)           │  │
│  │                                                         │  │
│  │  Returns: {normalizedFitness, rawScore, percentage}   │  │
│  └────────────────┬──────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────┘
                    │ SQL queries
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                        │
│                      (dbHelper.js)                           │
│                                                               │
│  Tables:                                                     │
│  • blockchain_metadata   (medical records)                  │
│  • patients              (patient info)                     │
│  • doctors               (doctor info)                      │
│  • consent_records       (access permissions)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 GA Algorithm Flow

```
┌──────────────────────────────────────────────────────────┐
│                  START: User clicks "Search"              │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 1: Fetch All Records from Database                 │
│                                                            │
│  Query: SELECT * FROM blockchain_metadata                │
│         JOIN patients JOIN doctors                        │
│                                                            │
│  Result: Population of N records                          │
│  Example: 150 medical records                             │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 2: Initialize GA                                    │
│                                                            │
│  • Population = all records                               │
│  • Generation = 0                                         │
│  • Best solutions = []                                    │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  FOR each generation  │
         │     (20 times)        │
         └───────┬───────────────┘
                 │
    ┌────────────▼────────────┐
    │                          │
    │  GENERATION LOOP         │
    │                          │
    │  ┌────────────────────┐ │
    │  │ Calculate Fitness   │ │
    │  │ for Each Record    │ │
    │  │                     │ │
    │  │ For record in pop: │ │
    │  │   fitness = calc   │ │
    │  └──────────┬──────────┘ │
    │             │             │
    │  ┌──────────▼──────────┐ │
    │  │ Sort by Fitness      │ │
    │  │                      │ │
    │  │ Best → Worst        │ │
    │  │ [85%, 72%, 61%...]  │ │
    │  └──────────┬──────────┘ │
    │             │             │
    │  ┌──────────▼──────────┐ │
    │  │ Elitism              │ │
    │  │                      │ │
    │  │ Keep top 2 records  │ │
    │  │ (best solutions)    │ │
    │  └──────────┬──────────┘ │
    │             │             │
    │  ┌──────────▼──────────┐ │
    │  │ Tournament Selection │ │
    │  │                      │ │
    │  │ Pick 5 random       │ │
    │  │ Choose best         │ │
    │  │ Repeat for parents  │ │
    │  └──────────┬──────────┘ │
    │             │             │
    │  ┌──────────▼──────────┐ │
    │  │ Crossover            │ │
    │  │                      │ │
    │  │ Combine parents     │ │
    │  │ (80% chance)        │ │
    │  └──────────┬──────────┘ │
    │             │             │
    │  ┌──────────▼──────────┐ │
    │  │ Mutation             │ │
    │  │                      │ │
    │  │ Random changes      │ │
    │  │ (10% chance)        │ │
    │  └──────────┬──────────┘ │
    │             │             │
    │  ┌──────────▼──────────┐ │
    │  │ New Population       │ │
    │  │                      │ │
    │  │ Replace old with    │ │
    │  │ new generation      │ │
    │  └──────────────────────┘ │
    │                          │
    └──────────────────────────┘
                 │
                 │ (Loop 20 times)
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 3: Final Selection                                  │
│                                                            │
│  • Collect all best solutions from generations           │
│  • Sort by fitness score                                 │
│  • Take top N (limit, default 10)                        │
│  • Filter out 0% matches                                 │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 4: Format Results                                   │
│                                                            │
│  For each result:                                         │
│  • Calculate match percentage                             │
│  • Format record details                                 │
│  • Include fitness scores                                │
│  • Add metadata                                           │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 5: Return JSON Response                             │
│                                                            │
│  {                                                        │
│    success: true,                                         │
│    recommendations: [...],                                │
│    totalRecordsAnalyzed: 150,                            │
│    algorithm: "Genetic Algorithm",                        │
│    config: {...}                                          │
│  }                                                        │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  END: Display Results in UI                               │
│                                                            │
│  • Color-coded cards (green/blue/yellow/red)             │
│  • Match percentage badges                                │
│  • Record details                                         │
│  • "View Full Record" buttons                            │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 Fitness Calculation Deep Dive

```
Input: Record + Search Criteria
Output: Fitness Score (0-100%)

┌─────────────────────────────────────────────────────┐
│         calculateFitness(record, criteria)          │
└─────────────────┬───────────────────────────────────┘
                  │
    ┏━━━━━━━━━━━━━▼━━━━━━━━━━━━━┓
    ┃  Scoring Components       ┃
    ┗━━━━━━━━━━━━━┬━━━━━━━━━━━━━┛
                  │
    ┌─────────────▼──────────────┐
    │ 1. File Type Match         │
    │    Weight: 8.0             │
    │                            │
    │ IF exact match:            │
    │   score += 8.0             │
    │ ELSE IF partial:           │
    │   score += 4.0             │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ 2. Condition Similarity    │
    │    Weight: 9.0             │
    │                            │
    │ Jaccard Index:             │
    │ similarity = |A∩B| / |A∪B| │
    │ score += similarity * 9.0  │
    │                            │
    │ Example:                   │
    │ A = {chest, pain}          │
    │ B = {chest, pain, cardiac} │
    │ Similarity = 2/3 = 0.67    │
    │ Score = 0.67 * 9.0 = 6.0   │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ 3. Exact Keyword Matches   │
    │    Weight: 10.0 each       │
    │                            │
    │ Count matching words:      │
    │ "diabetes" in criteria     │
    │ "diabetes" in record       │
    │ score += 10.0              │
    │                            │
    │ Multiple matches:          │
    │ 2 matches = +20.0          │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ 4. Doctor Match            │
    │    Weight: 6.0             │
    │                            │
    │ IF doctor_id matches:      │
    │   score += 6.0             │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ 5. Partial Matches         │
    │    Weight: 5.0 each        │
    │                            │
    │ Patient ID match: +5.0     │
    │ Blood group match: +5.0    │
    │ Gender match: +5.0         │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ 6. Temporal Relevance      │
    │    Weight: 3.0             │
    │                            │
    │ Age = now - timestamp      │
    │ < 30 days:   factor = 1.0  │
    │ 30-180 days: factor = 0.9  │
    │ 6-12 months: factor = 0.7  │
    │ 1-2 years:   factor = 0.5  │
    │ 2+ years:    factor = 0.25 │
    │                            │
    │ score += factor * 3.0      │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ CALCULATE FINAL SCORE      │
    │                            │
    │ Total Raw Score: 45.7      │
    │ Max Possible: 58.0         │
    │                            │
    │ Normalized = 45.7 / 58.0   │
    │            = 0.788          │
    │                            │
    │ Percentage = 78.8%         │
    │            ≈ 79%           │
    └────────────┬───────────────┘
                 │
                 ▼
           ┌──────────┐
           │ Return:  │
           │ 79%      │
           └──────────┘
```

---

## 🔀 Tournament Selection Process

```
Goal: Select parent records for next generation

┌───────────────────────────────────────┐
│   Population (N records)              │
│   Sorted by fitness                   │
│                                       │
│   [85%] Record A                      │
│   [78%] Record B                      │
│   [72%] Record C                      │
│   [65%] Record D                      │
│   [61%] Record E                      │
│   [58%] Record F                      │
│   ...                                 │
└─────────────┬─────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Tournament Selection (size = 5)        │
│                                         │
│  Step 1: Randomly pick 5 records       │
│  ┌─────────────────────────────────┐   │
│  │ Candidate 1: Record E (61%)     │   │
│  │ Candidate 2: Record B (78%) ← ★ │   │
│  │ Candidate 3: Record H (45%)     │   │
│  │ Candidate 4: Record C (72%)     │   │
│  │ Candidate 5: Record F (58%)     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Step 2: Select best                   │
│  Winner: Record B (78%)                │
└─────────────┬───────────────────────────┘
              │
              ▼
         Selected Parent 1
              │
              │ (Repeat for Parent 2)
              │
              ▼
┌─────────────────────────────────────────┐
│  Crossover (80% probability)            │
│                                         │
│  IF random() < 0.8:                     │
│    Offspring = combine(Parent1, Parent2)│
│  ELSE:                                  │
│    Offspring = Parent1 or Parent2       │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Mutation (10% probability)             │
│                                         │
│  IF random() < 0.1:                     │
│    Offspring = mutate(Offspring)        │
│                                         │
│  Note: For medical records, mutation    │
│        doesn't modify the actual data   │
│        (records are immutable)          │
└─────────────┬───────────────────────────┘
              │
              ▼
     Add to New Population
```

---

## 📊 Data Flow Diagram

```
User Interface                API Layer              Algorithm              Database
     │                           │                       │                     │
     │  Fill Search Form         │                       │                     │
     │  [File Type: X-Ray]       │                       │                     │
     │  [Conditions: chest pain] │                       │                     │
     │                           │                       │                     │
     │  Click "Search"           │                       │                     │
     ├──────────────────────────>│                       │                     │
     │  POST /api/ga/recommend   │                       │                     │
     │                           │                       │                     │
     │                           │  Validate Auth        │                     │
     │                           │  (Admin check)        │                     │
     │                           │                       │                     │
     │                           │  Parse Criteria       │                     │
     │                           ├──────────────────────>│                     │
     │                           │  recommendRecordsGA() │                     │
     │                           │                       │                     │
     │                           │                       │  Fetch Records      │
     │                           │                       ├────────────────────>│
     │                           │                       │  SELECT * FROM ...  │
     │                           │                       │                     │
     │                           │                       │  Return 150 records │
     │                           │                       │<────────────────────┤
     │                           │                       │                     │
     │                           │                       │  Run GA (20 gens)   │
     │                           │                       │  • Calculate fitness│
     │                           │                       │  • Select parents   │
     │                           │                       │  • Evolve           │
     │                           │                       │  ...                │
     │                           │                       │  (2-5 seconds)      │
     │                           │                       │                     │
     │                           │  Results with %       │                     │
     │                           │<──────────────────────┤                     │
     │                           │  [                    │                     │
     │                           │    {match: 85%, ...}, │                     │
     │                           │    {match: 78%, ...}, │                     │
     │                           │    {match: 72%, ...}  │                     │
     │                           │  ]                    │                     │
     │                           │                       │                     │
     │  JSON Response            │                       │                     │
     │<──────────────────────────┤                       │                     │
     │  {success: true, ...}     │                       │                     │
     │                           │                       │                     │
     │  Display Results          │                       │                     │
     │  • Color-coded cards      │                       │                     │
     │  • Match percentages      │                       │                     │
     │  • Record details         │                       │                     │
     │                           │                       │                     │
```

---

## 🎨 UI Component Structure

```
┌──────────────────────────────────────────────────────────────────┐
│                    Admin Dashboard                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Tab Navigation Bar                                        │  │
│  │  [Blockchain] [Records] [Edit] [Doctor-Patient] [GA Viz]  │  │
│  │  [Fetch Similar Records (GA)] ← NEW TAB                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  GA Search Tab Content (id="ga-search-tab")                │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Info Banner                                         │  │  │
│  │  │  "This system uses Genetic Algorithm..."            │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Search Form (id="gaSearchForm")                     │  │  │
│  │  │                                                       │  │  │
│  │  │  Row 1:                                              │  │  │
│  │  │  [File Type input]    [Patient ID input]            │  │  │
│  │  │                                                       │  │  │
│  │  │  Row 2:                                              │  │  │
│  │  │  [Conditions textarea - 3 rows]                     │  │  │
│  │  │                                                       │  │  │
│  │  │  Row 3:                                              │  │  │
│  │  │  [Blood Group]  [Gender select]  [Doctor ID]        │  │  │
│  │  │                                                       │  │  │
│  │  │  Row 4:                                              │  │  │
│  │  │  [Result Limit: 10]                                 │  │  │
│  │  │                                                       │  │  │
│  │  │  Buttons:                                            │  │  │
│  │  │  [Search with GA] [Clear] [View Statistics]         │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Statistics Section (id="gaStatistics", hidden)      │  │  │
│  │  │                                                       │  │  │
│  │  │  [Total Records] [Generations] [Population] [Mutation]│  │
│  │  │  File Types Table                                    │  │  │
│  │  │  Fitness Weights Display                             │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Results Section (id="gaResults", hidden)            │  │  │
│  │  │                                                       │  │  │
│  │  │  ┌────────────────┐  ┌────────────────┐             │  │  │
│  │  │  │ Result Card 1  │  │ Result Card 2  │             │  │  │
│  │  │  │ ┌────────────┐ │  │ ┌────────────┐ │             │  │  │
│  │  │  │ │ 85% Match  │ │  │ │ 78% Match  │ │             │  │  │
│  │  │  │ └────────────┘ │  │ └────────────┘ │             │  │  │
│  │  │  │ • Block Index  │  │ • Block Index  │             │  │  │
│  │  │  │ • Patient Info │  │ • Patient Info │             │  │  │
│  │  │  │ • File Type    │  │ • File Type    │             │  │  │
│  │  │  │ • Conditions   │  │ • Conditions   │             │  │  │
│  │  │  │ • Fitness Info │  │ • Fitness Info │             │  │  │
│  │  │  │ [View Record]  │  │ [View Record]  │             │  │  │
│  │  │  └────────────────┘  └────────────────┘             │  │  │
│  │  │  ...more cards...                                    │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 State Management

```
Application States
│
├─ Initial State
│  • Form empty
│  • Results hidden
│  • Statistics hidden
│
├─ Searching State
│  • Button shows "Running GA..." with spinner
│  • Button disabled
│  • Form inputs disabled (optional)
│
├─ Results State
│  • Results section visible
│  • Cards displayed with color coding
│  • Statistics can be toggled
│
└─ Error State
   • Alert message shown
   • Form re-enabled
   • Button restored
```

---

## 📝 Code Organization

```
Project Root
│
├── server.js                          [Import & register GA routes]
│
├── routes/
│   └── ga.js                          [GA API endpoints]
│       ├── POST /recommend
│       └── GET /statistics
│
├── utils/
│   ├── gaHelper.js                    [GA algorithm implementation]
│   │   ├── GA_CONFIG
│   │   ├── FITNESS_WEIGHTS
│   │   ├── normalizeString()
│   │   ├── calculateSimilarity()
│   │   ├── calculateTemporalRelevance()
│   │   ├── calculateFitness()
│   │   ├── tournamentSelection()
│   │   ├── crossover()
│   │   ├── mutate()
│   │   ├── recommendRecordsGA()      [Main function]
│   │   └── getGAStatistics()
│   │
│   └── dbHelper.js                    [Database pool (imported by gaHelper)]
│
├── views/
│   └── admin/
│       └── dashboard.ejs              [UI integration]
│           ├── Tab button
│           ├── Tab content
│           │   ├── Search form
│           │   ├── Statistics section
│           │   └── Results section
│           └── JavaScript functions
│               ├── performGASearch()
│               ├── displayGAResults()
│               ├── clearGASearch()
│               └── loadGAStatistics()
│
└── Documentation/
    ├── GA_RECOMMENDATION_DOCS.md      [Complete technical docs]
    ├── GA_QUICK_START.md              [Quick reference guide]
    ├── GA_IMPLEMENTATION_SUMMARY.md   [Implementation summary]
    └── GA_ARCHITECTURE.md             [This file - visual diagrams]
```

---

## 🔌 Integration Points

```
┌──────────────────────────────────────────────────────────┐
│  Existing System                                          │
│                                                            │
│  • PostgreSQL Database (blockchain_metadata, patients)    │
│  • Express Server with session management                │
│  • Admin authentication & authorization                   │
│  • EJS templating for views                              │
│  • Bootstrap UI framework                                │
│  • Modal for record viewing                              │
└─────────────┬────────────────────────────────────────────┘
              │
              │ Integration
              ▼
┌──────────────────────────────────────────────────────────┐
│  GA System (NEW)                                          │
│                                                            │
│  • GA Algorithm Module (utils/gaHelper.js)                │
│  • GA API Routes (routes/ga.js)                          │
│  • UI Tab in Admin Dashboard                             │
│  • JavaScript functions for interaction                  │
└──────────────────────────────────────────────────────────┘

Integration Requirements Met:
✅ Uses existing database connection pool
✅ Follows existing authentication pattern
✅ Matches existing UI design system
✅ Compatible with current routing structure
✅ No modifications to existing features
✅ Isolated in separate files
```

---

**Created**: January 2, 2026  
**System**: Medical Records Management - Blockchain + IPFS  
**Component**: GA Medical Record Recommendation  
**Document**: System Architecture & Visual Diagrams
