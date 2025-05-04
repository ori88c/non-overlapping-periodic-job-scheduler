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

import {
  IPreviousExecutionMetadata,
  ComputeNextDelay,
  NonOverlappingPeriodicJobScheduler,
  NO_PREVIOUS_EXECUTION,
} from './index';

type PromiseResolveCallbackType = (value?: unknown) => void;
type PromiseRejectCallbackType = (reason?: Error) => void;

class CustomJobError extends Error {
  public readonly jobID: number;

  constructor(message: string, jobID: number) {
    super(message);
    this.name = CustomJobError.name;
    this.jobID = jobID;
    Object.setPrototypeOf(this, CustomJobError.prototype);
  }
}

const createError = (jobID: number) => new CustomJobError(`Job no. ${jobID} has failed`, jobID);

/**
 * The one-and-only purpose of this function, is triggerring an event-loop iteration.
 * It is relevant whenever a test needs to simulate tasks from the Node.js' micro-tasks queue.
 */
const triggerEventLoopIteration = async (): Promise<void> => {
  expect(14).toBeGreaterThan(3);
};

const MOCK_FIRST_EXECUTION_MS_DELAY = 500;
const MOCK_MS_DELAY_AFTER_FAILED_JOB = 3 * 1000;
const MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS = 5 * 1000;

describe('NonOverlappingPeriodicJobScheduler tests', () => {
  let setTimeoutSpy: jest.SpyInstance;
  let computeNextDelaySpy: jest.MockedFunction<ComputeNextDelay>;
  let lastThrownError: CustomJobError;

  /**
   * This implementation is provided as an illustrative example for the context of these
   * tests. While a basic Jest mock function would suffice, this implementation demonstrates
   * a potential real-world scenario.
   * Since we use Jest's *mock* timers, the mock delay times do not affect the tests'
   * execution time.
   *
   * This function mimics a real-life scenario by maintaining a fixed interval between the
   * start times of consecutive executions, similar to `setInterval`.
   * If an execution lasts longer than expected, the next execution is scheduled according
   * to the originally planned start time.
   */
  const mockComputeNextDelay: ComputeNextDelay<CustomJobError> = (
    previousExecutionMetadata: Readonly<IPreviousExecutionMetadata<CustomJobError>>,
  ): number => {
    const { durationMs, error } = previousExecutionMetadata;

    if (error) {
      expect(error.jobID).toBe(lastThrownError.jobID);
      expect(error.message).toBe(lastThrownError.message);
      expect(error).toBe(lastThrownError);
    } else {
      expect(lastThrownError).toBeUndefined();
    }

    if (durationMs === NO_PREVIOUS_EXECUTION) {
      return MOCK_FIRST_EXECUTION_MS_DELAY;
    }

    if (error) {
      return MOCK_MS_DELAY_AFTER_FAILED_JOB;
    }

    // For example, if a just-finished execution took 1000ms, and the desired interval-between-starts
    // is 5000ms, the next execution should start within 4000ms.
    return (
      MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS -
      (durationMs % MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS)
    );
  };

  beforeEach(() => {
    jest.useFakeTimers();
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    lastThrownError = undefined;

    computeNextDelaySpy = jest.fn() as jest.MockedFunction<ComputeNextDelay>;
    computeNextDelaySpy.mockImplementation(mockComputeNextDelay);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Happy path tests', () => {
    test('should trigger executions as expected when all jobs succeed', async () => {
      // We create unresolved promises, simulating an async work in progress.
      // They will be resolved later, once we want to simulate a successful completion
      // of the async work.
      let completeCurrentJob: PromiseResolveCallbackType;
      const job = () => new Promise<void>((res) => (completeCurrentJob = res));
      const jobSpy = (jest.fn() as jest.MockedFunction<() => Promise<void>>).mockImplementation(
        job,
      );
      const scheduler = new NonOverlappingPeriodicJobScheduler(jobSpy, computeNextDelaySpy);

      // Not started yet.
      expect(scheduler.status).toBe('inactive');
      expect(scheduler.isCurrentlyExecuting).toBe(false);

      await scheduler.start();
      const numberOfExecutions = 14;
      for (let ithExecution = 1; ithExecution <= numberOfExecutions; ++ithExecution) {
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(false);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(ithExecution);
        expect(computeNextDelaySpy).toHaveBeenCalledTimes(ithExecution);

        // The next-execution's `setTimeout` callback will be invoked now.
        jest.runOnlyPendingTimers();
        await triggerEventLoopIteration();
        expect(jobSpy).toHaveBeenCalledTimes(ithExecution);
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we resolve, the promise is in a pending state.

        completeCurrentJob();
        await scheduler.waitUntilCurrentExecutionCompletes();
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(false);
      }

      await scheduler.stop();
      expect(scheduler.status).toBe('inactive');
      expect(scheduler.isCurrentlyExecuting).toBe(false);
    });

    test('should handle job rejections and trigger executions as expected', async () => {
      // We create unresolved promises, simulating an async work in progress.
      // They will be rejected later, once we want to simulate a failed-completion of the async work.
      let failCurrentJob: PromiseRejectCallbackType;
      const job = () => new Promise<void>((_, rej) => (failCurrentJob = rej));
      const jobSpy = (jest.fn() as jest.MockedFunction<() => Promise<void>>).mockImplementation(
        job,
      );

      const scheduler = new NonOverlappingPeriodicJobScheduler<CustomJobError>(
        jobSpy,
        computeNextDelaySpy,
      );

      // Not started yet.
      expect(scheduler.status).toBe('inactive');
      expect(scheduler.isCurrentlyExecuting).toBe(false);

      await scheduler.start();
      const numberOfExecutions = 15;
      for (let ithExecution = 1; ithExecution <= numberOfExecutions; ++ithExecution) {
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(false);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(ithExecution);
        expect(computeNextDelaySpy).toHaveBeenCalledTimes(ithExecution);

        // The next-execution's `setTimeout` callback will be invoked now.
        jest.runOnlyPendingTimers();
        await triggerEventLoopIteration();
        expect(jobSpy).toHaveBeenCalledTimes(ithExecution);
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we reject, the promise is in a pending state.

        lastThrownError = createError(ithExecution);
        failCurrentJob(lastThrownError);
        await scheduler.waitUntilCurrentExecutionCompletes();
      }

      await scheduler.stop();
      expect(scheduler.status).toBe('inactive');
      expect(scheduler.isCurrentlyExecuting).toBe(false);
    });

    test('should handle mixed job outcomes (success or failure) and trigger executions as expected', async () => {
      let ithJobExecution = 1;
      let completeCurrentJob: () => void; // Either resolves or rejects.
      const job = () =>
        new Promise<void>((res, rej) => {
          lastThrownError = undefined;
          const shouldSucceed = ithJobExecution % 2 === 0;

          completeCurrentJob = (): void => {
            if (shouldSucceed) {
              res();
            } else {
              lastThrownError = createError(ithJobExecution);
              rej(lastThrownError);
            }
          };

          ++ithJobExecution;
        });
      const jobSpy = (jest.fn() as jest.MockedFunction<() => Promise<void>>).mockImplementation(
        job,
      );

      const scheduler = new NonOverlappingPeriodicJobScheduler<CustomJobError>(
        jobSpy,
        computeNextDelaySpy,
      );

      // Not started yet.
      expect(scheduler.status).toBe('inactive');
      expect(scheduler.isCurrentlyExecuting).toBe(false);

      await scheduler.start();
      const numberOfExecutions = 14;
      for (let ithExecution = 1; ithExecution <= numberOfExecutions; ++ithExecution) {
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(false);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(ithExecution);
        expect(computeNextDelaySpy).toHaveBeenCalledTimes(ithExecution);

        // The next-execution's `setTimeout` callback will be invoked now.
        jest.runOnlyPendingTimers();
        await triggerEventLoopIteration();
        expect(jobSpy).toHaveBeenCalledTimes(ithExecution);
        expect(scheduler.status).toBe('active');
        expect(scheduler.isCurrentlyExecuting).toBe(true);

        completeCurrentJob();
        await scheduler.waitUntilCurrentExecutionCompletes();
      }

      await scheduler.stop();
      expect(scheduler.status).toBe('inactive');
      expect(scheduler.isCurrentlyExecuting).toBe(false);
    });
  });

  describe('Negative path tests', () => {
    test('should not alter state when starting an already started instance', async () => {
      let wasExcetued = false;
      const job = () =>
        new Promise<void>(() => {
          wasExcetued = true; // The flow should not reach this point.
        });
      const jobSpy = (jest.fn() as jest.MockedFunction<() => Promise<void>>).mockImplementation(
        job,
      );

      const scheduler = new NonOverlappingPeriodicJobScheduler(jobSpy, computeNextDelaySpy);

      await scheduler.start();
      expect(scheduler.status).toBe('active');
      expect(scheduler.isCurrentlyExecuting).toBe(false);
      expect(jobSpy).toHaveBeenCalledTimes(0);

      // Trigger a redundant start attempt.
      await scheduler.start();
      expect(wasExcetued).toBe(false);
      expect(scheduler.status).toBe('active');
      expect(scheduler.isCurrentlyExecuting).toBe(false);
      expect(jobSpy).toHaveBeenCalledTimes(0);

      await scheduler.stop();
      expect(scheduler.status).toBe('inactive');
      expect(jobSpy).toHaveBeenCalledTimes(0);
    });
  });
});
