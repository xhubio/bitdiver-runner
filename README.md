# @xhubio/bitdiver-runner

Test execution framework for automated end-to-end tests. Runs tests as suites with steps, compares results and provides structured reporting.

## Quickstart

```bash
npm install
npm run build     # biome check + tsc
npm run test      # build + vitest
npm run test:only # tests only (no build)
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Suite-Config (YAML/JSON)              │
│    setup: [Step1, Step2]                                │
│    timed: auto (scans test data files)                  │
│    teardown: [CheckStep, ReportStep]                    │
└──────────────────────┬──────────────────────────────────┘
                       │
              createSuiteFromConfig()
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   suite.json                            │
│  steps: ["Step1", "Step2", "SendData 120", "CheckStep"] │
│  stepDefinitions: { "Step1": {id, name, desc}, ... }    │
│  testcases: [{ name: "TC1", data: { "Step1": {...} } }] │
└──────────────────────┬──────────────────────────────────┘
                       │
                    Runner
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      StepNormal   StepSingle   StepTimed
      (1x per TC)  (1x for      (waits for
                    all TCs)     timestamp)
```

## Modules

### config — Configuration Management

Loads configuration from JSON files with environment variable overrides and Zod validation.

```typescript
import { z } from 'zod'
import { loadConfig } from '@bitdiver/core'

const schema = z.object({
  database: z.object({
    url: z.string(),
    password: z.string(),
    maxConnections: z.number().default(10)
  }),
  debug: z.boolean().default(false)
})

const { config, toString } = await loadConfig({
  schema,
  file: './config.json',
  envPrefix: 'MYAPP',       // MYAPP_DATABASE_URL, MYAPP_DEBUG etc.
  secrets: ['database.password']
})

console.log(toString())     // password masked as ***
console.log(config.debug)   // boolean, typed
```

**Priority (highest wins):**
1. Environment variables (`MYAPP_DATABASE_URL`)
2. Inline values
3. JSON file
4. Schema defaults

**Env variable naming convention:**
`<prefix>_<PATH_IN_UPPER_SNAKE_CASE>` — e.g. `database.maxConnections` becomes `MYAPP_DATABASE_MAX_CONNECTIONS`.

---

### suite-builder — Declarative Suite Creation

Creates suites from a YAML/JSON configuration instead of code.

#### Suite Config Format

```yaml
timedStepMapping:
  ri-fahrt-v1: SendRiFahrtV1Time
  playwright: SendPlaywrightTestTime
  bi-basis-fahrt-v3: SendBiBasisFahrtTimeV3

suiteTypes:
  TEST_FIX:
    setup:
      - SetupEnvironmentRun
      - ClearDatabase
      - SetStartTime
    timed: auto
    teardown:
      - ExportResults
      - CheckResults
      - StoreArtifacts

  ONLY_RIDES:
    setup:
      - SetupEnvironmentRun
      - SetStartTime
    timed: auto
    teardown:
      - StoreArtifacts
```

#### Three Phases

| Phase | Description |
|-------|-------------|
| **setup** | Preparatory steps, executed sequentially |
| **timed** | Auto-generated from test data files. Filename pattern: `<time>_<type>_<rest>.json`. Steps sorted by time. |
| **teardown** | Post-processing steps (export, verification, reporting) |

#### Timed Steps

Files in test data directories are scanned:

```
TC_01/
  1_ri-fahrt-v1_23711.json      → SendRiFahrtV1Time 1
  120_playwright_soll.json       → SendPlaywrightTestTime 120
  240_ri-fahrt-v1_update.json    → SendRiFahrtV1Time 240
```

The `timedStepMapping` maps the file type (`ri-fahrt-v1`) to the step ID (`SendRiFahrtV1Time`). Step data contains `{ offsetTime: 120, files: [...] }`.

#### Usage

```typescript
import { createSuiteFromConfig } from '@bitdiver/core'

const suite = await createSuiteFromConfig({
  config: suiteConfigYaml,  // parsed YAML/JSON
  suiteType: 'TEST_FIX',
  testDataDir: './testdata',
  suiteName: 'regression-package1'
})

// suite is a SuiteDefinitionInterface — can be saved as JSON
// or passed directly to the Runner
```

---

### definition — Suite Format

The compact suite format with sparse data maps.

```json
{
  "executionMode": "batch",
  "name": "regression-package1",
  "steps": ["SetupStep", "SendData 120", "CheckStep"],
  "stepDefinitions": {
    "SetupStep": { "id": "SetupStep", "name": "SetupStep", "description": "..." },
    "SendData 120": { "id": "SendDataTime", "name": "SendData 120", "description": "" },
    "CheckStep": { "id": "CheckStep", "name": "CheckStep", "description": "..." }
  },
  "testcases": [
    {
      "name": "TC_01_Relief",
      "data": {
        "SendData 120": { "offsetTime": 120, "files": ["TC_01/120_data.json"] }
      }
    }
  ]
}
```

**Advantages over the old format:**
- `steps` is an array (once for all TCs, not repeated per TC)
- `data` is a map (`stepName → data`), not positional arrays with 93% nulls
- `stepDefinitions` are separate from the ordering

---

### model — Steps and Environments

#### StepNormal

A step that is executed **once per test case**. Each instance has exactly one test case context.

```typescript
import { StepNormal } from '@bitdiver/core'

class SendData extends StepNormal {
  async run(): Promise<void> {
    const env = this.tc              // typed: EnvironmentTestcase
    const payload = this.data        // step data from the suite
    const config = this.environmentRun?.map.get('kafka')

    await sendToKafka(config, payload)
    await this.logInfo(`Sent data for ${env.name}`)
  }
}
```

#### StepSingle

A step that is executed **once for all test cases**. Has access to all TC environments.

```typescript
import { StepSingle } from '@bitdiver/core'

class ClearDatabase extends StepSingle {
  async run(): Promise<void> {
    // Execute once, not per TC
    await db.clear()

    // Access all TCs:
    for (const { environment, data } of this.testcases) {
      environment.map.set('dbCleared', true)
    }
  }
}
```

#### StepTimed

A step that waits until a specific point in time before executing.

```typescript
import { StepTimed } from '@bitdiver/core'

class SendAtTime extends StepTimed {
  getReferenceTime(): string {
    return this.tc.map.get('START_TIME')
  }

  getOffsetSeconds(): number {
    return this.data.offsetTime  // e.g. 120
  }

  async doRun(): Promise<void> {
    // Executes only after 120 seconds from reference time
    await sendData(this.data.files)
  }
}
```

In `testMode` the delay is skipped.

#### StepSetupConfig

Generic step that loads configuration into the run environment.

```typescript
import { z } from 'zod'
import { StepSetupConfig } from '@bitdiver/core'

const mySchema = z.object({
  kafka: z.object({
    brokers: z.string(),
    password: z.string()
  }),
  targetEnvironment: z.string().default('tu2')
})

class SetupMyEnv extends StepSetupConfig<typeof mySchema.shape> {
  getConfigSchema() { return mySchema }
  getSecrets() { return ['kafka.password'] }
}
```

Step data: `{ "configFile": "./config.json", "envPrefix": "CUSTOM" }`

#### Environment Persistence

Steps can exchange data between steps via `environmentTestcase.map`. For large data there is disk persistence:

```typescript
class ExportStep extends StepNormal {
  async run(): Promise<void> {
    this.tc.map.set('results', largeData)

    // Write to disk + remove from memory
    await this.exportVars(['results'], './results/TC_01')

    // Load again later
    await this.loadVars(['results'], './results/TC_01')
  }
}

class StepWithTempData extends StepNormal {
  async run(): Promise<void> {
    // Automatically cleaned up after afterRun()
    await this.loadTempVars(['cached'], './cache')
    const data = this.tc.map.get('cached')
  }
}
```

#### Step Lifecycle

```
start()      → Initialization (all instances of a step)
beforeRun()  → Preparation (load config, set paths)
run()        → Main work
afterRun()   → Cleanup (delete temp variables)
end()        → Finalization (all instances of a step)
```

#### StepRegistry

Registers step classes under a name. The Runner uses the registry to instantiate steps.

```typescript
import { StepRegistry } from '@bitdiver/core'

const registry = new StepRegistry()
registry.registerStep({ stepName: 'SendData', step: SendData })
registry.registerStep({ stepName: 'ClearDB', step: ClearDatabase })

const step = registry.getStep('SendData')  // new instance
```

---

### runner-server — Test Execution

#### Runner

Executes a suite. Supports two modes:
- **batch** (default): Iterates steps, then test cases per step
- **normal**: Iterates test cases, then steps per test case

```typescript
import { Runner, ProgressBarConsoleLogBatchJson, LogAdapterFile } from '@bitdiver/core'

const runner = new Runner({
  id: 'run-001',
  dataDirectory: './data',
  suite: suiteJson,
  stepRegistry: registry,
  logAdapter: new LogAdapterFile({ targetDir: './logs' }),
  progressMeterBatch: new ProgressBarConsoleLogBatchJson({ name: 'my-run' }),
  parallelExecution: true,
  maxParallelSteps: 20,
  testMode: false
})

await runner.run()
```

#### ProgressMeter

Hooks for live progress. Base classes with empty `update()` methods for subclassing:

| Hook | When |
|------|------|
| `init({ stepCount, testcaseCount, name })` | Run starts |
| `incStep(name)` | New step begins |
| `incTestcase(name)` | New test case in step |
| `setFail()` | Test case failed |
| `done()` | Run finished |

Built-in implementations: `ProgressBarConsoleBatch`, `ProgressBarConsoleLogBatch`, `ProgressBarConsoleLogBatchJson`.

---

### check — Result Comparison

Compares expected files with actual results.

```typescript
import { StepCheck } from '@bitdiver/core'

// Register as a step in the suite:
registry.registerStep({ stepName: 'CheckResults', step: StepCheck })
```

Step data:

```json
{
  "resultDir": "/path/to/results/TC_01",
  "dataDir": "/path/to/expected/TC_01",
  "checks": [{
    "name": "kafka-events",
    "actualDir": "events/kafka",
    "expectedDir": "expected/kafka",
    "dataPath": ["data"],
    "ignorePaths": [
      { "path": ["header", "messageId"], "doc": ["System-generated"] }
    ]
  }]
}
```

**Pipeline per check:**
1. **Mapping**: Actual files are matched to expected files by filename
2. **Comparison**: Each pair is compared with `@aikotools/datacompare` (deep compare with directives: Time, Number, Regex, Contains etc.)
3. **Reporting**: `summary.json` + `details.json` + `mapping.json` per check

**Result files:**

```json
// summary.json
{
  "name": "kafka-events",
  "total": 15,
  "passed": 13,
  "failed": 1,
  "missing": 1,
  "unexpected": 0
}
```

---

### logadapter — Logging

Pluggable log adapters with structured messages.

| Adapter | Description |
|---------|-------------|
| `LogAdapterConsole` | Output to stdout |
| `LogAdapterConsoleJson` | JSON-formatted output |
| `LogAdapterFile` | Writes to filesystem (organized by Run/TC/Step) |
| `LogAdapterMemory` | Stores in-memory (for tests) |

**Log levels:** `debug` (0), `info` (1), `warning` (2), `error` (3), `fatal` (4)

**Log message structure:**

```typescript
{
  meta: {
    run: { id, name, start },
    tc?: { id, name, tcCountCurrent, tcCountAll },
    step?: { id, name, stepCountCurrent, stepCountAll, type },
    source?: { testcases: string[], stepName?: string, isSingleStep?: boolean },
    logTime: number
  },
  data: any,
  logLevel: string
}
```

The `source` field in run-level error logs shows which test case and step caused the error.

---

## Project Structure

```
src/
  index.ts                     Barrel export
  config/
    loadConfig.ts              Zod-based config loading
  suite-builder/
    types.ts                   Suite config schema (Zod)
    scanTimedFiles.ts          Test data scanner
    buildTimedSteps.ts         Timed step generation
    createSuiteFromConfig.ts   Create suite from config
  definition/
    interfaceSuiteDefinition.ts
    interfaceTestcaseDefinition.ts
    interfaceStepDefinition.ts
    schema/validate.ts         Zod validation
  model/
    StepBase.ts                Base class (lifecycle, logging)
    StepNormal.ts              1 instance per TC + persistence
    StepSingle.ts              1 instance for all TCs
    StepTimed.ts               Time-controlled step
    StepSetupConfig.ts         Config loading step
    StepPersistence.ts         Disk persistence helpers
    StepRegistry.ts            Step class registry
    EnvironmentRun.ts          Run-wide environment
    EnvironmentTestcase.ts     TC-specific environment
    generateLogs.ts            Log message builder
  runner-server/
    Runner.ts                  Suite execution
    RunnerLogAdapter.ts        Log interceptor
    pAll.ts                    Concurrency helper
    progress/                  ProgressMeter implementations
  check/
    StepCheck.ts               Generic check step
    runCheck.ts                Check orchestration
    mapFiles.ts                File mapping (Expected↔Actual)
    types.ts                   Check interfaces
  logadapter/
    LogAdapterConsole.ts
    LogAdapterConsoleJson.ts
    LogAdapterFile.ts
    LogAdapterMemory.ts
tests/
  35 test suites, 208 tests
```

## Tooling

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner |
| **Biome** | Linting + formatting (replaces ESLint + Prettier) |
| **Zod** | Schema validation + TypeScript types |
| **TypeScript 6.0** | Type system |

## Dependencies

**Runtime:**
- `zod` — Schema validation
- `@aikotools/datacompare` — Deep object comparison engine
- `luxon` — Time calculation (for StepTimed)
- `uuid` — Unique IDs
- `md5` — Hashing

**No** additional runtime dependencies. Former dependencies (`clone`, `mkdirp`, `rimraf`, `sprintf-js`, `p-all`, `ajv`) have been replaced by native Node.js APIs.
