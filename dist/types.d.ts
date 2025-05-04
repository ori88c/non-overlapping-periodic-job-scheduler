/**
 * Copyright 2025 Ori Cohen https://github.com/ori88c
 * https://github.com/ori88c/non-overlapping-periodic-job-scheduler
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export declare const NO_PREVIOUS_EXECUTION = -1;
export interface IPreviousExecutionMetadata<JobError> {
    durationMs: number;
    error?: JobError;
}
/**
 * Determines the delay between consecutive executions, in **milliseconds**.
 * This function is invoked immediately *after* each execution *completes* and is responsible for
 * calculating the delay before the next execution *begins*.
 *
 * The delay is measured from the *end* of the previous execution to the *start* of the next one.
 * The scheduler provides a single argument containing metadata about the execution that just finished:
 * - `durationMs`: The duration of the completed execution, in milliseconds.
 * - `error`: The error thrown during execution, if any.
 *
 * ### Base Case
 * For the initial execution (triggered via the `start` method), the scheduler passes
 * `durationMs: NO_PREVIOUS_EXECUTION`, since no prior job has run. In this case, the delay determines
 * when the first job should execute. For example, a value of `0` starts immediately.
 *
 * ### Stability Notice
 * This function must never throw. If it does, the scheduler halts all future executions.
 *
 * ### Example Use Case
 * A user may configure longer delays after successful executions and shorter intervals following
 * failures (indicated by a non-undefined `error` property). The scheduler itself remains agnostic
 * to custom logic such as peak hours or adaptive backoff strategies, giving users full control over
 * delay policies.
 *
 * ### Mimicking `setInterval` Behavior
 * To maintain a fixed interval between *start* timestamps (e.g., every 5000ms), the user can subtract
 * the latest `durationMs` from the interval. For example, if the last execution took 1000ms, the
 * function can return `5000 - 1000 = 4000`. If execution time exceeds the fixed interval, users may
 * return `0` or align the delay to the *next* available interval bucket, such as
 * `5000 - (durationMs % 5000)`.
 * This flexibility makes the scheduler suitable for a wide range of periodic task strategies.
 *
 * ### Ignoring the Previous Execution Result
 * If the metadata from the previous execution is not needed, you may implement the function
 * without referencing the argument. For example:
 * ```ts
 * const computeNextDelay: ComputeNextDelay = () => 5000; // Fixed delay of 5000ms.
 * ```
 */
export type ComputeNextDelay<JobError = Error> = (previousExecutionMetadata: Readonly<IPreviousExecutionMetadata<JobError>>) => number;
export type ActivityStatus = 'active' | 'inactive' | 'terminating';
