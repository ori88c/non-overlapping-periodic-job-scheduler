# non-overlapping-periodic-job-scheduler

The `NonOverlappingPeriodicJobScheduler` class implements a slim yet highly flexible periodic-job scheduler, which is agnostic of the user-defined scheduling policy. It focuses on three aspects:
* __Non-Overlapping Executions__
* __Deterministic Termination__
* __Dynamic Interval between Executions__

## Key Features

- ES6 Compatibility.
- TypeScript support.
- Graceful / deterministic termination: If the `stop` method is executed during a job-execution, it will resolve only once the execution completes.
- User-defined scheduling policy, injected from the c'tor.
- No external runtime dependencies: Only development dependencies are used.

## Non-Overlapping Executions

Ensures that executions do not overlap. This is suitable for scenarios where overlapping executions may cause race conditions, or negatively impact performance.

## Deterministic / Graceful Termination

When stopping periodic executions, it is crucial to ensure that any ongoing execution is completed before termination. This deterministic termination approach ensures that no unfinished executions leave objects in memory, which could otherwise lead to unexpected behavior.

Without deterministic termination, leftover references from incomplete executions can cause issues, such as unexpected behavior during unit tests. A clean state is necessary for each test, and ongoing jobs from a previous test can interfere with subsequent tests.

## Dynamic Execution Interval
User provides a custom calculator function, to determine the delay until the next execution, based on the runtime metadata of the just-finished execution (duration, error if thrown).  
This calculator is invoked at the **end** of each execution, enabling flexible interval policies based on user-defined criteria. This approach ensures that the scheduler remains agnostic of scheduling-policy preferences, focusing solely on the scheduling process. In this way, we adhere to the following principles:
* __Information Expert Principle__: The interval policy is defined by the user.
* __Single Responsibility Principle__: The scheduler's sole responsibility is to manage the scheduling process.

## Zero Over-Engineering, No External Dependencies
`setInterval` often falls short with fixed intervals, overlapping executions, and non-deterministic termination of the last execution. Custom solutions or external libraries usually come with numerous runtime dependencies, which can unnecessarily increase the project's size.

This class offers a lightweight, dependency-free solution. It can also serve as a building block for
more advanced implementations, if necessary.
 
## Error Handling

If a periodic job throws an error, the error will be passed to the calculator function. The scheduler does not perform any logging, as it is designed to be agnostic of user preferences, such as specific loggers or logging styles.

## Fully Covered

This class is fully covered by unit tests.

## Use-case Example

```ts
import { 
  NonOverlappingPeriodicJobScheduler,
  PeriodicJob,
  CalculateDelayTillNextExecution,
  NO_PREVIOUS_EXECUTION
} from 'non-overlapping-periodic-job-scheduler';

// More-advanced calculator examples will be given in the next section.
const calculateDelayTillNextFetch: CalculateDelayTillNextExecution = (_: number): number => {
  // Simplest possible implementation:
  // After each execution, we wait a fixed value (5000 ms), before triggering the next one.
  // First execution starts 5000ms after `start()` is invoked.
  return 5000;
};

class ThreatIntelligenceAggregator {
  private readonly _fetchLatestThreatsScheduler = new NonOverlappingPeriodicJobScheduler(
      this.fetchLatestThreatFeeds.bind(this),
      calculateDelayTillNextFetch
    );

  public start(): void {
    this._fetchLatestThreatFeedsScheduler.start();
    // Additional start operations...
  }

  public async stop(): Promise<void> {
    // Stop may not be immediate, as given a job-execution is currently ongoing, `stop` resolves
    // only once that execution completes.
    await this._fetchLatestThreatFeedsScheduler.stop();
    // Additional stop operations...
  }

  private async fetchLatestThreatFeeds(): Promise<void> {
    // Do your magic here
  }
}
```

## Advanced user-defined Scheduling Policies

### Basic example
Let's start with the simplest example, which involves having a fixed interval. Formally, the determined interval is the delay between the **end** of the i-th execution and the **start** of the (i+1)-th execution.
```ts
const FIXED_MS_DELAY_BETWEEN_EXECUTIONS = 5000;
const calculateDelayTillNextFetch: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number,
  justFinishedExecutionError?: Error
): number => {
  return FIXED_MS_DELAY_BETWEEN_EXECUTIONS;
};
```

### Considering both arguments
A slightly more advanced example may consider both arguments.
```ts
const FIRST_EXECUTION_MS_DELAY = 10 * 1000;
const RATIO_BETWEEN_DELAY_AND_FORMER_EXECUTION = 3;
const MS_DELAY_AFTER_FAILURE = 4000;
const calculateDelayTillNextFetch: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number,
  justFinishedExecutionError?: Error
): number => {
  if (justFinishedExecutionDurationMs === NO_PREVIOUS_EXECUTION) {
    return FIRST_EXECUTION_MS_DELAY;
  }

  if (justFinishedExecutionError) {
    return MS_DELAY_AFTER_FAILURE;
  }

  return justFinishedExecutionDurationMs * RATIO_BETWEEN_DELAY_AND_FORMER_EXECUTION;
};
```

### Mimicking `setInterval`
If you want to mimic the behavior of `setInterval`, which maintains a fixed interval between **start** times, you should be aware that the duration of a job execution might exceed the interval. A simple scheduling policy might decide that, under such circumstances, the next execution should occur immediately.
```ts
const FIXED_MS_DELAY = 5000;
const calculateDelayTillNextFetch: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number
): number => {
  if (justFinishedExecutionDurationMs === NO_PREVIOUS_EXECUTION) {
    return FIXED_MS_DELAY;
  }

  if (justFinishedExecutionDurationMs > FIXED_MS_DELAY) {
    return 0;
  }

  // For example, if a just-finished execution took 1000ms, and the desired interval-between-starts is
  // 5000ms, the next execution should start within 4000ms.
  return FIXED_MS_DELAY - justFinishedExecutionDurationMs;
};
```

### Alternative `setInterval` mimicking
Another approach to mimicking the `setInterval` policy, while dealing with potential overlapping executions, is to schedule only according to the originally planned start time. Overlapped start times will be skipped.

Formally, start times will correspond to the formula START_TIMESTAMP + N * FIXED_MS_DELAY, where N is a natural number. For example, the following ascending start times sequence implies that the first execution took more than FIXED_MS_DELAY, but less than 2 * FIXED_MS_DELAY. This can be deduced by the missing start timestamp:
* START_TIMESTAMP + FIXED_MS_DELAY
* START_TIMESTAMP + 3 * FIXED_MS_DELAY
* START_TIMESTAMP + 4 * FIXED_MS_DELAY
* START_TIMESTAMP + 5 * FIXED_MS_DELAY

Such a scheduling policy can be useful for aggregation jobs, where a recently executed job implies that the data is still fresh.
```ts
const FIXED_MS_DELAY = 5000;
const calculateDelayTillNextFetch: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number
): number => {
  if (justFinishedExecutionDurationMs === NO_PREVIOUS_EXECUTION) {
    return FIXED_MS_DELAY;
  }

  // For example, if a just-finished execution took 6000ms, and the desired interval-between-starts is
  // 5000ms, it means that next execution should start within 4000ms.
  return FIXED_MS_DELAY - justFinishedExecutionDurationMs % FIXED_MS_DELAY;
};
```

## Naming Convention

It is highly recommended to assign a use-case-specific name to your scheduler instances. This practice helps in clearly identifying the purpose of each scheduler in the codebase. Examples include:
- deleteExpiredDataScheduler
- syncAccessPermissionsScheduler
- updateFirewallRulesScheduler
- healthDiagnosticsScheduler
- archiveOldLogsScheduler

## License

[MIT](LICENSE)
