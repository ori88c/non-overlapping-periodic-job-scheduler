import { 
  NonOverlappingPeriodicJobScheduler,
  PeriodicJob,
  CalculateDelayTillNextExecution,
  NO_PREVIOUS_EXECUTION
} from './index';

type PromiseResolveCallbackType = (value?: unknown) => void;
type PromiseRejectCallbackType = (reason?: Error) => void;

/**
 * resolveFast
 * 
 * The one-and-only purpose of this function, is triggerring an event-loop iteration.
 * It is relevant whenever a test needs to simulate tasks from the Node.js' micro-tasks queue.
 */
const resolveFast = async () => {
  expect(14).toBeGreaterThan(3);
};

const MOCK_FIRST_EXECUTION_MS_DELAY = 500;
const MOCK_MS_DELAY_AFTER_FAILED_JOB = 3 * 1000;
const MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS = 5 * 1000;

/**
 * mockCalculateDelayTillNextExecution
 *
 * Note: This implementation is intended to be illustrative in the context of these tests,
 * as all timers are mocked (delay times do not impact execution time). A simple Jest mock
 * function would suffice.
 * 
 * This function mimics a real-life scenario by maintaining a fixed interval between the
 * start times of consecutive executions, similar to `setInterval`.
 * If an execution lasts longer than expected, the next execution is scheduled according
 * to the originally planned start time.
 */
const mockCalculateDelayTillNextExecution: CalculateDelayTillNextExecution = (
  justFinishedExecutionDurationMs: number,
  justFinishedExecutionError?: Error
): number => {
  if (justFinishedExecutionDurationMs === NO_PREVIOUS_EXECUTION) {
    return MOCK_FIRST_EXECUTION_MS_DELAY;
  }

  if (justFinishedExecutionError) {
    return MOCK_MS_DELAY_AFTER_FAILED_JOB;
  }

  // For example, if a just-finished execution took 1000ms, and the desired interval-between-starts is
  // 5000ms, the next execution should start within 4000ms.
  return MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS -
    (justFinishedExecutionDurationMs % MOCK_INTERVAL_BETWEEN_CONSECUTIVE_STARTS);
};

describe('NonOverlappingPeriodicJobScheduler tests', () => {
  let setTimeoutSpy: jest.SpyInstance;
  let nextDelayCalculatorSpy: jest.MockedFunction<CalculateDelayTillNextExecution>;

  beforeEach(() => {
    jest.useFakeTimers();
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    nextDelayCalculatorSpy = jest.fn() as jest.MockedFunction<CalculateDelayTillNextExecution>;
    nextDelayCalculatorSpy.mockImplementation(mockCalculateDelayTillNextExecution);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Happy path tests', () => {
    test('should trigger executions as expected, when all executions succeed', async () => {
      // Each job execution returns a pending promise, and we store its resolve callback,
      // which enables us to control the flow (resolve time).
      let resolveCurrentJobExecution: PromiseResolveCallbackType;
      const job: PeriodicJob = (): Promise<void> => 
        new Promise(res => resolveCurrentJobExecution = res);
      const jobSpy = (jest.fn() as jest.MockedFunction<PeriodicJob>)
        .mockImplementation(job);
      const scheduler = new NonOverlappingPeriodicJobScheduler(
        jobSpy,
        nextDelayCalculatorSpy
      );
        
      // Not started yet.
      expect(scheduler.isStopped).toBe(true);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
        
      scheduler.start();
      const numberOfExecutions = 14;
      for (let currentExecution = 1; currentExecution <= numberOfExecutions; ++currentExecution) {
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(false);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(currentExecution);
        expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(currentExecution);

        // The next-execution's `setTimeout` callback will be invoked now.
        jest.runOnlyPendingTimers();
        await resolveFast();
        expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we resolve, the promise is in a pending state.

        resolveCurrentJobExecution();
        await scheduler.waitTillCurrentExecutionSettles();
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(false);
      }

      await scheduler.stop();
      expect(scheduler.isStopped).toBe(true);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
    });

    test('should trigger executions as expected, when all executions fail (job promise rejects)', async () => {
      // Each job execution returns a pending promise, and we store its reject callback,
      // which enables us to control the flow (resolve time).
      let rejectCurrentJobExecution: PromiseRejectCallbackType;
      const job: PeriodicJob = (): Promise<void> => 
        new Promise((_, rej) => rejectCurrentJobExecution = rej);
      const jobSpy = (jest.fn() as jest.MockedFunction<PeriodicJob>)
        .mockImplementation(job);

      const scheduler = new NonOverlappingPeriodicJobScheduler(
        jobSpy,
        nextDelayCalculatorSpy
      );
        
      // Not started yet.
      expect(scheduler.isStopped).toBe(true);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
        
      scheduler.start();
      const numberOfExecutions = 15;
      for (let currentExecution = 1; currentExecution <= numberOfExecutions; ++currentExecution) {
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(false);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(currentExecution);
        expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(currentExecution);

        // The next-execution's `setTimeout` callback will be invoked now.
        jest.runOnlyPendingTimers();
        await resolveFast();
        expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(true); // Until we reject, the promise is in a pending state.

        rejectCurrentJobExecution(new Error('Why bad things happen to good jobs?'));
        await scheduler.waitTillCurrentExecutionSettles();
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(false);
      }

      await scheduler.stop();
      expect(scheduler.isStopped).toBe(true);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
    });

    test('should trigger executions as expected, when some succeed and some fail', async () => {
      let jobNumber = 1;
      let finishCurrentJobExecution: () => void; // Either resolve or reject.
      const job: PeriodicJob = (): Promise<void> => {
        return new Promise((res, rej) => {
          if (jobNumber % 2 == 0) {
            finishCurrentJobExecution = res;
          } else {
            finishCurrentJobExecution = rej;
          }
           ++jobNumber;
        });
      };
      const jobSpy = (jest.fn() as jest.MockedFunction<PeriodicJob>)
        .mockImplementation(job);

      const scheduler = new NonOverlappingPeriodicJobScheduler(
        jobSpy,
        nextDelayCalculatorSpy
      );
        
      // Not started yet.
      expect(scheduler.isStopped).toBe(true);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
        
      scheduler.start();
      const numberOfExecutions = 14;
      for (let currentExecution = 1; currentExecution <= numberOfExecutions; ++currentExecution) {
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(false);
        expect(setTimeoutSpy).toHaveBeenCalledTimes(currentExecution);
        expect(nextDelayCalculatorSpy).toHaveBeenCalledTimes(currentExecution);

        // The next-execution's `setTimeout` callback will be invoked now.
        jest.runOnlyPendingTimers();
        await resolveFast();
        expect(jobSpy).toHaveBeenCalledTimes(currentExecution);
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(true);

        finishCurrentJobExecution();
        await scheduler.waitTillCurrentExecutionSettles();
        expect(scheduler.isStopped).toBe(false);
        expect(scheduler.isCurrentlyExecuting).toBe(false);
      }

      await scheduler.stop();
      expect(scheduler.isStopped).toBe(true);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
    });
  });

  describe('Negative path tests', () => {
    test('should throw when starting an already started instance', () => {
      let wasExcetued = false;
      const job: PeriodicJob = (): Promise<void> => new Promise(_ => {
        wasExcetued = true; // The flow should not reach this point.
      });
      const jobSpy = (jest.fn() as jest.MockedFunction<PeriodicJob>)
        .mockImplementation(job);

      const scheduler = new NonOverlappingPeriodicJobScheduler(
        jobSpy,
        nextDelayCalculatorSpy
      );
        
      scheduler.start();
      expect(scheduler.isStopped).toBe(false);
      expect(scheduler.isCurrentlyExecuting).toBe(false);
      expect(jobSpy).toHaveBeenCalledTimes(0);

      expect(() => scheduler.start()).toThrow();
      expect(wasExcetued).toBe(false);
    });
  });
});
