import { PeriodicJob, CalculateDelayTillNextExecution } from './types';
/**
 * NonOverlappingPeriodicJobScheduler
 *
 * This class implements a slim periodic-job scheduler, focusing on three aspects often overlooked:
 * 1. **Non-overlapping executions**.
 * 2. **Deterministic termination**.
 * 3. **Dynamic delay between executions**.
 *
 * ## Non-Overlapping Executions
 * Ensures that executions do not overlap. This is suitable for scenarios where overlapping executions
 * may cause race conditions or negatively impact performance.
 *
 * ## Deterministic / Graceful Termination
 * When stopping periodic executions, it is crucial to ensure that any ongoing execution is completed
 * before termination. This deterministic termination approach ensures that no unfinished executions
 * leave objects in memory, which could otherwise lead to unexpected behavior.
 * Without deterministic termination, leftover references from incomplete executions can cause
 * issues, such as unexpected behavior during unit tests. A clean state is necessary for each test,
 * and ongoing jobs from a previous test can interfere with subsequent tests.
 *
 * ## Dynamic Execution Interval
 * User provides a custom calculator function, to determine the delay until the next execution, based on
 * the runtime metadata of the just-finished execution (duration, error if thrown).
 * This calculator is invoked at the **end** of each execution, enabling flexible interval policies based
 * on user-defined criteria. This approach ensures the scheduler remains simple, and focused solely on
 * scheduling. This approach adheres to two principles:
 * 1. **Information Expert Principle**: The interval policy is defined by the user.
 * 2. **Single Responsibility Principle**: The scheduler's sole responsibility is to manage the scheduling
 *    process.
 *
 * ## Zero Over-Engineering, No External Dependencies
 * `setInterval` often falls short with fixed intervals, overlapping executions, and non-deterministic
 * termination of the last execution. Custom solutions or external libraries usually come with numerous
 * runtime dependencies, which can unnecessarily increase the project's size.
 * This class offers a lightweight, dependency-free solution. It can also serve as a building block for
 * more advanced implementations, if necessary.
 *
 * ## Error Handling
 * If a periodic job throws an error, the error will be passed to the calculator function. The scheduler
 * does not perform any logging, as it is designed to be agnostic of user preferences, such as specific
 * loggers or logging styles.
 *
 * ## Fully Coverged
 * This class is fully covered by unit tests.
 *
 */
export declare class NonOverlappingPeriodicJobScheduler {
    private readonly _periodicJob;
    private readonly _calculateDelayTillNextExecution;
    private _isStopped;
    private _nextExecutionTimer;
    private _currentExecutionPromise;
    private readonly _triggerExecution;
    constructor(_periodicJob: PeriodicJob, _calculateDelayTillNextExecution: CalculateDelayTillNextExecution);
    get isCurrentlyExecuting(): boolean;
    get isStopped(): boolean;
    start(): void;
    waitTillCurrentExecutionSettles(): Promise<void>;
    stop(): Promise<void>;
    private _triggerCurrentExecutionAndScheduleNext;
}
