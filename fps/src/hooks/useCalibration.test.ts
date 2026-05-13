import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PoseKeypoint } from '@shared/protocol';
import { useCalibration } from './useCalibration';

// All 8 T-pose landmarks at visibility 1.0, stable positions (same coords each frame)
function makeStableTposeFrame(): PoseKeypoint[] {
  const kps = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  [11, 12, 13, 14, 15, 16, 23, 24].forEach((i) => {
    kps[i] = { x: i * 0.01, y: 0, z: 0, visibility: 1.0 };
  });
  return kps as PoseKeypoint[];
}

// Make a frame with a specific left wrist x position (for punch simulation)
function makePunchFrame(leftWristX: number): PoseKeypoint[] {
  const kps = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  kps[15] = { x: leftWristX, y: 0, z: 0, visibility: 1 };
  kps[16] = { x: 0, y: 0, z: 0, visibility: 1 };
  return kps as PoseKeypoint[];
}

// Feed n stable tpose frames to advance to punches stage.
// Each rerender must use act() to flush state updates.
async function feedStableTposeFrames(
  rerender: (props: { kps: PoseKeypoint[] | null; active: boolean }) => void,
  n: number,
) {
  const frame = makeStableTposeFrame();
  for (let i = 0; i < n; i++) {
    await act(async () => {
      rerender({ kps: frame, active: true });
    });
  }
}

describe('useCalibration', () => {
  it('Test 1: starts in idle when active=false', () => {
    const { result } = renderHook(() =>
      useCalibration({ keypoints: null, active: false, onComplete: vi.fn() }),
    );
    expect(result.current.stage).toBe('idle');
  });

  it('Test 2: transitions to tpose when active=true', async () => {
    const { result } = renderHook(() =>
      useCalibration({ keypoints: null, active: true, onComplete: vi.fn() }),
    );
    await act(async () => {});
    expect(result.current.stage).toBe('tpose');
  });

  it('Test 3: advances tpose→punches after 30 stable frames', async () => {
    const { result, rerender } = renderHook(
      ({ kps, active }: { kps: PoseKeypoint[] | null; active: boolean }) =>
        useCalibration({ keypoints: kps, active, onComplete: vi.fn() }),
      { initialProps: { kps: null, active: true } },
    );

    await feedStableTposeFrames(rerender, 35);

    expect(result.current.stage).toBe('punches');
  });

  it('Test 4: tposeProgress increments per stable frame (≈0.5 after 15 frames)', async () => {
    const { result, rerender } = renderHook(
      ({ kps, active }: { kps: PoseKeypoint[] | null; active: boolean }) =>
        useCalibration({ keypoints: kps, active, onComplete: vi.fn() }),
      { initialProps: { kps: null, active: true } },
    );

    await feedStableTposeFrames(rerender, 15);

    // After 15 stable frames out of 30 needed, progress should be ~0.5
    expect(result.current.tposeProgress).toBeCloseTo(0.5, 1);
  });

  it('Test 5: punches→neutral after 3 peaks', async () => {
    const { result, rerender } = renderHook(
      ({ kps, active }: { kps: PoseKeypoint[] | null; active: boolean }) =>
        useCalibration({ keypoints: kps, active, onComplete: vi.fn() }),
      { initialProps: { kps: null, active: true } },
    );

    // Advance to punches stage first
    await feedStableTposeFrames(rerender, 35);
    expect(result.current.stage).toBe('punches');

    // Simulate 3 punch cycles.
    // A punch is: frames with wrist velocity > 1.2 m/s, then drops below 0.8 m/s.
    // velocity = distance / time. With 3-frame window at 50ms apart:
    //   For ~3 m/s: need 0.15m movement in 50ms between frames.
    // We feed rest→fast→fast→rest repeatedly to trigger armed/peak/reset.
    for (let punch = 0; punch < 3; punch++) {
      // Rest frames (wrist still, velocity < 0.8)
      for (let r = 0; r < 3; r++) {
        await act(async () => {
          rerender({ kps: makePunchFrame(0.0), active: true });
        });
      }
      // Fast frames — wrist x moves 0.3m over 3 frames at 50ms apart → 3 m/s
      // computeWristVelocity: oldest→newest in window of 3 = 0.3m/100ms = 3 m/s
      // computeWristPeakSpeed: consecutive pairs → max(0.15/50ms, 0.15/50ms) = 3 m/s
      for (let f = 0; f < 4; f++) {
        await act(async () => {
          rerender({ kps: makePunchFrame(f * 0.15), active: true });
        });
      }
      // Return to rest
      for (let r = 0; r < 4; r++) {
        await act(async () => {
          rerender({ kps: makePunchFrame(0.6), active: true });
        });
      }
    }

    expect(result.current.punchesRecorded).toBe(3);
    expect(result.current.stage).toBe('neutral');
  });

  it('Test 6: onComplete called with average of 3 peak velocities', async () => {
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ kps, active }: { kps: PoseKeypoint[] | null; active: boolean }) =>
        useCalibration({ keypoints: kps, active, onComplete }),
      { initialProps: { kps: null, active: true } },
    );

    // Advance to punches
    await feedStableTposeFrames(rerender, 35);

    // Simulate 3 punches
    for (let punch = 0; punch < 3; punch++) {
      for (let r = 0; r < 3; r++) {
        await act(async () => rerender({ kps: makePunchFrame(0.0), active: true }));
      }
      for (let f = 0; f < 4; f++) {
        await act(async () => rerender({ kps: makePunchFrame(f * 0.15), active: true }));
      }
      for (let r = 0; r < 4; r++) {
        await act(async () => rerender({ kps: makePunchFrame(0.6), active: true }));
      }
    }

    expect(result.current.stage).toBe('neutral');

    // Feed 60 still frames to complete neutral stage
    const stillFrame = makePunchFrame(0.0);
    for (let i = 0; i < 65; i++) {
      await act(async () => rerender({ kps: stillFrame, active: true }));
    }

    expect(result.current.stage).toBe('done');
    expect(onComplete).toHaveBeenCalledTimes(1);
    // referenceVelocity should be a positive number (average of 3 peaks)
    const rv = onComplete.mock.calls[0][0] as number;
    expect(rv).toBeGreaterThan(0);
  });

  it('Test 7: reset on active toggle', async () => {
    const { result, rerender } = renderHook(
      ({ kps, active }: { kps: PoseKeypoint[] | null; active: boolean }) =>
        useCalibration({ keypoints: kps, active, onComplete: vi.fn() }),
      { initialProps: { kps: null, active: true } },
    );

    // Advance a few frames
    await feedStableTposeFrames(rerender, 10);
    expect(result.current.tposeProgress).toBeGreaterThan(0);

    // Toggle active off
    await act(async () => rerender({ kps: null, active: false }));
    expect(result.current.stage).toBe('idle');

    // Toggle back on
    await act(async () => rerender({ kps: null, active: true }));
    expect(result.current.stage).toBe('tpose');
    expect(result.current.tposeProgress).toBe(0);
    expect(result.current.punchesRecorded).toBe(0);
  });
});
