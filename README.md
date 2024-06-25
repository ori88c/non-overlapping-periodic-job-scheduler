# non-overlapping-periodic-job-scheduler

The `NonOverlappingPeriodicJobScheduler` class implements a slim yet highly flexible periodic-job scheduler for Node.js projects, ensuring non-overlapping job executions.

The delay between executions is determined by a user-defined calculator function, allowing scheduling to be either interval-based or time-based, while also considering runtime factors known to the user.

## Key Features

* __Non-Overlapping Executions__.
* __Deterministic Termination__: If the `stop` method is called during a job-execution, it will resolve only once the execution completes.
* __Dynamic Interval between Executions__: This design allows users to consider various runtime factors if required, while the scheduler remains agnostic to the user-defined scheduling policy.
* Non-durable scheduling: If the app crashes or goes down, scheduling stops.
* No external runtime dependencies: Only development dependencies are used.
* ES6 Compatibility.
* TypeScript support.
* Fully covered by unit tests.

## Non-Overlapping Executions

Executions do not overlap because the (i+1)th execution is scheduled immediately after the ith execution completes. This is suitable for scenarios where overlapping executions may cause race conditions, or negatively impact performance.

## Deterministic / Graceful Termination

This topic is **often overlooked** in the context of schedulers.  
When stopping periodic executions, it is crucial to ensure that any potentially ongoing execution is completed before termination. This deterministic termination approach ensures that no unfinished executions leave objects in memory, which could otherwise lead to unexpected behavior.

Without deterministic termination, leftover references from incomplete executions can cause issues, such as unexpected behavior during unit tests. A clean state is necessary for each test, and ongoing jobs from a previous test can interfere with subsequent tests.

## Dynamic Execution Interval

User provides a custom calculator function, to determine the delay until the next execution, based on the runtime metadata of the just-finished execution (duration, error if thrown).

This calculator is invoked at the **end** of each execution, enabling flexible interval policies based on user-defined criteria. This approach ensures that the scheduler remains agnostic of scheduling-policy preferences, focusing solely on the scheduling process. In this way, we adhere to the following principles:
* __Information Expert Principle__: The interval policy is defined by the user.
* __Single Responsibility Principle__: The scheduler's sole responsibility is to manage the scheduling process.

## Zero Over-Engineering, No External Dependencies

This component offers a lightweight, dependency-free solution. It can also serve as a building block for
more advanced implementations, if necessary.

## Non-Persistent Scheduling

This component features non-durable scheduling, which means that if the app crashes or goes down, scheduling stops.

If you need to guarantee durability over a multi-node deployment, consider using this scheduler as a building block or use other custom-made solutions for that purpose. Generally, maintaining a timestamp of the last successful execution in a persistent database is usually sufficient to introduce durability.

## Error Handling

If a periodic job throws an error, the error will be passed to the calculator function. The scheduler does not perform any logging, as it is designed to be agnostic of user preferences, such as specific loggers or logging styles.

## Use-case Example

```ts
import { 
  NonOverlappingPeriodicJobScheduler,
  PeriodicJob,
  CalculateDelayTillNextExecution,
  NO_PREVIOUS_EXECUTION
} from 'non-overlapping-periodic-job-scheduler';

const MS_DELAY_AFTER_COMPLETION = 5000;
const calculateDelayTillNextFetch: CalculateDelayTillNextExecution =
  (_: number): number => {
    // Simplest possible implementation:
    // After each execution, the scheduler waits a fixed duration (5000 ms),
    // before triggering the next one.
    // First execution starts 5000ms after `start()` is called.
    return MS_DELAY_AFTER_COMPLETION;
  };

class ThreatIntelligenceAggregator {
  private readonly _threatFeedsScheduler = 
    new NonOverlappingPeriodicJobScheduler(
      this.fetchLatestThreatFeeds.bind(this),
      calculateDelayTillNextFetch
    );

  public start(): void {
    this._threatFeedsScheduler.start();
    // Additional start operations.
  }

  public async stop(): Promise<void> {
    // Stop may not be immediate, as given a job-execution is currently ongoing,
    // `stop` resolves only once that execution completes.
    await this._threatFeedsScheduler.stop();
    // Additional stop operations.
  }

  private async fetchLatestThreatFeeds(): Promise<void> {
    // Do your magic here.
  }
}
```

## Time-Based Scheduling Policy

Consider a scenario where executions should occur at fixed times of the day, for example, three times per hour at XX:00:00, XX:20:00, and XX:40:00. In other words, every 20 minutes on the clock. This scheduling policy can be implemented using the following calculator:
```ts
const MS_DELAY_BETWEEN_STARTS = 20 * 60 * 1000; // 20 minutes in milliseconds.
const calculateDelayTillNextExecution: CalculateDelayTillNextExecution = 
  (_: number): number => {
    return MS_DELAY_BETWEEN_STARTS - Date.now() % MS_DELAY_BETWEEN_STARTS;
  };
```
Please note that due to the non-overlapping nature of this scheduler, if an execution exceeds 20 minutes, its subsequent scheduled start time (e.g., 00:40:00) will be skipped.

## Interval-Based Scheduling Policies

### Basic example

Let's start with the simplest example, which involves having a fixed interval. Formally, the determined interval is the delay between the **end** of the i-th execution and the **start** of the (i+1)-th execution.
```ts
const FIXED_MS_DELAY_BETWEEN_EXECUTIONS = 5000;
const calculateDelayTillNextExecution: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number,
  justFinishedExecutionError?: Error
): number => {
  return FIXED_MS_DELAY_BETWEEN_EXECUTIONS;
};
```

### Considering the error argument

A slightly more advanced example might consider the error argument if the user prefers a more frequent interval until success.
```ts
import { NO_PREVIOUS_EXECUTION } from 'non-overlapping-periodic-job-scheduler';

const FIRST_EXECUTION_MS_DELAY = 10 * 1000;
const MS_DELAY_AFTER_SUCCESS = 20 * 1000;
const MS_DELAY_AFTER_FAILURE = 4000;
const calculateDelayTillNextExecution: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number,
  justFinishedExecutionError?: Error
): number => {
  if (justFinishedExecutionDurationMs === NO_PREVIOUS_EXECUTION) {
    return FIRST_EXECUTION_MS_DELAY;
  }

  if (justFinishedExecutionError) {
    return MS_DELAY_AFTER_FAILURE;
  }

  return MS_DELAY_AFTER_SUCCESS;
};
```

### Mimicking 'setInterval'

If you want to mimic the behavior of `setInterval`, which maintains a fixed interval between **start** times, you should be aware that the duration of a job execution might exceed the interval. A simple scheduling policy might decide that, under such circumstances, the next execution should occur immediately.
```ts
import { NO_PREVIOUS_EXECUTION } from 'non-overlapping-periodic-job-scheduler';

const FIXED_MS_DELAY = 5000;
const calculateDelayTillNextExecution: CalculateDelayTillNextExecution = (
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

### Alternative 'setInterval' mimicking

Another approach to mimicking the `setInterval` policy, while dealing with potential overlapping executions, is to schedule only according to the originally planned start time. Overlapped start times will be skipped.

Formally, start times will correspond to the formula START_TIMESTAMP + N * FIXED_MS_DELAY, where N is a natural number. For example, the following ascending start times sequence implies that the first execution took more than FIXED_MS_DELAY, but less than 2 * FIXED_MS_DELAY. This can be deduced by the missing start timestamp:
* START_TIMESTAMP + FIXED_MS_DELAY
* START_TIMESTAMP + 3 * FIXED_MS_DELAY
* START_TIMESTAMP + 4 * FIXED_MS_DELAY
* START_TIMESTAMP + 5 * FIXED_MS_DELAY

Such a scheduling policy can be useful for aggregation jobs, where a recently executed job implies that the data is still fresh.
```ts
import { NO_PREVIOUS_EXECUTION } from 'non-overlapping-periodic-job-scheduler';

const FIXED_MS_DELAY = 5000;
const calculateDelayTillNextExecution: CalculateDelayTillNextExecution = (
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
