import { PeriodicJob, CalculateDelayTillNextExecution, NO_PREVIOUS_EXECUTION } from './types';

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
export class NonOverlappingPeriodicJobScheduler {
    private _isStopped: boolean = true;
    private _nextExecutionTimer: NodeJS.Timeout | null = null;
    private _currentExecutionPromise: Promise<void> | null = null;

    // The `setTimeout` callback is deliberately non-async, to prevent dangling promises.
    // Such are undesired, as they cannot be awaited, which is crucial for a deterministic
    // (graceful) `stop` operation.
    private readonly _triggerExecution = (): void => {
        this._currentExecutionPromise = this._triggerCurrentExecutionAndScheduleNext();
    };

    constructor(
        private readonly _periodicJob: PeriodicJob,
        private readonly _calculateDelayTillNextExecution: CalculateDelayTillNextExecution,
    ) { }

    public get isCurrentlyExecuting(): boolean {
        return this._currentExecutionPromise !== null;
    }

    public get isStopped(): boolean {
        return this._isStopped;
    }

    public start(): void {
        if (!this._isStopped) {
            throw new Error('Cannot start an already started NonOverlappingPeriodicJobScheduler instance');
        }

        this._isStopped = false;
        const firstExecutionDelay = this._calculateDelayTillNextExecution(NO_PREVIOUS_EXECUTION);
        this._nextExecutionTimer = setTimeout(this._triggerExecution, firstExecutionDelay);   
    }

    public waitTillCurrentExecutionSettles(): Promise<void> {
        return this._currentExecutionPromise ?? Promise.resolve();
    }

    public stop(): Promise<void> {
        this._isStopped = true;

        if (this._nextExecutionTimer) {
            clearTimeout(this._nextExecutionTimer);
            this._nextExecutionTimer = null;
        }

        return this.waitTillCurrentExecutionSettles();
    }

    private async _triggerCurrentExecutionAndScheduleNext(): Promise<void> {
        this._nextExecutionTimer = null;
        let thrownError: Error | undefined = undefined;

        const startTime = Date.now();
        try {
            await this._periodicJob();
        } catch (err) {
            thrownError = err;
        }

        this._currentExecutionPromise = null;
        if (this._isStopped) {
            return;
        }

        const justFinishedExecutionDurationMs = Date.now() - startTime;
        const delayTillNextExecution = this._calculateDelayTillNextExecution(justFinishedExecutionDurationMs, thrownError);
        this._nextExecutionTimer = setTimeout(this._triggerExecution, delayTillNextExecution);        
    }
}
