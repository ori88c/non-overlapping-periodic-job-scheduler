export type PeriodicJob = () => Promise<void>;
export declare const NO_PREVIOUS_EXECUTION = -1;
/**
 * CalculateDelayTillNextExecution
 *
 * Dynamically sets the delay between consecutive executions. This function is invoked immediately
 * after the ith execution finishes, determining the delay until the (i+1)th execution starts.
 *
 * The determined delay is the interval between the end of the ith execution and the start of the
 * (i+1)th execution. The user is provided with two parameters to aid in this decision:
 * - `justFinishedExecutionDurationMs`: The duration of the just-finished execution in milliseconds.
 * - `justFinishedExecutionError`: The error thrown by the just-finished execution, if any.
 *
 * ## Base Case
 * The first invocation is triggered by the `start` method, using `NO_PREVIOUS_EXECUTION` as the
 * pseudo previous-execution-duration. In this scenario, the user determines the first delay without
 * prior execution data.
 * For example, the user may want the first execution to occur immediately after `start` (0ms delay).
 *
 * ## With Great Power comes Great Responsibility
 * This function should never throw. If it does, scheduling will stop.
 *
 * ## Example Interval Policy
 * For example, the user may prefer a longer interval between successful executions and a shorter
 * interval after a failed attempt (indicated by an error). The scheduler does not consider other
 * complex factors, which the user may choose to include (e.g., time of day, peak hours).
 * The calculation callback can capture any data structures or information to help the user make
 * an informed decision.
 *
 * ## Mimicking the `setInterval` Policy
 * It is possible to mimic the `setInterval` behavior, ensuring a fixed interval between start timestamps.
 * For example, if a 5000ms interval between consecutive starts is desired and the current execution took
 * 1000ms, the next execution delay would be 5000ms - 1000ms = 4000ms.
 * However, be aware that actual execution time might exceed the fixed interval. In such cases, you need to
 * choose a suitable delay that makes sense for your use case. A plausible approach is to set the next
 * execution delay to 0ms. Another approach could be scheduling the next execution to the next 5000ms
 * interval from the start, i.e., 5000 - (justFinishedExecutionDurationMs % 5000).
 * This flexibility in delegating the decision-making to users makes this component well-suited for a
 * variety of use cases.
 *
 */
export type CalculateDelayTillNextExecution = (justFinishedExecutionDurationMs: number, justFinishedExecutionError?: Error) => number;
