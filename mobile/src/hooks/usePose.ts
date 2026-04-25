import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { PoseKeypoint } from '../protocol';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UsePoseResult {
  keypoints: PoseKeypoint[] | null;
  imageKeypoints: PoseKeypoint[] | null;
  fps: number;
  modelStatus: ModelStatus;
  modelError: string | null;
}

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export function usePose(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraReady: boolean,
): UsePoseResult {
  const [keypoints, setKeypoints] = useState<PoseKeypoint[] | null>(null);
  const [imageKeypoints, setImageKeypoints] = useState<PoseKeypoint[] | null>(null);
  const [fps, setFps] = useState(0);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraReady) return;

    let landmarker: PoseLandmarker | null = null;
    let rafId = 0;
    let rvfcId = 0;
    let cancelled = false;
    let frameCount = 0;
    let fpsWindowStart = performance.now();
    let lastTimestampMs = 0;

    const useRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    async function init() {
      setModelStatus('loading');
      setModelError(null);
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'LIVE_STREAM',
          numPoses: 1,
          resultListener: (result: PoseLandmarkerResult) => {
            if (cancelled) return;

            if (result?.worldLandmarks?.[0]) {
              const raw: PoseKeypoint[] = result.worldLandmarks[0].map((lm) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: lm.visibility ?? 0,
              }));
              setKeypoints(raw);
            }
            if (result?.landmarks?.[0]) {
              const imgKps: PoseKeypoint[] = result.landmarks[0].map((lm) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z ?? 0,
                visibility: lm.visibility ?? 0,
              }));
              setImageKeypoints(imgKps);
            }

            frameCount += 1;
            const now = performance.now();
            const elapsed = now - fpsWindowStart;
            if (elapsed >= 1000) {
              setFps(Math.round((frameCount * 1000) / elapsed));
              frameCount = 0;
              fpsWindowStart = now;
            }
          },
        });
        if (cancelled) {
          lm.close();
          return;
        }
        landmarker = lm;
        setModelStatus('ready');

        const video = videoRef.current;
        if (useRvfc && video) {
          rvfcId = (video as unknown as {
            requestVideoFrameCallback: (cb: (now: number) => void) => number;
          }).requestVideoFrameCallback(loop);
        } else {
          rafId = requestAnimationFrame(loop);
        }
      } catch (err) {
        if (cancelled) return;
        setModelStatus('error');
        setModelError(err instanceof Error ? err.message : String(err));
      }
    }

    function loop(now: DOMHighResTimeStamp) {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && landmarker && video.readyState >= 2) {
        // detectAsync requires monotonically increasing timestamps.
        let timestampMs = Math.floor(now);
        if (timestampMs <= lastTimestampMs) timestampMs = lastTimestampMs + 1;
        lastTimestampMs = timestampMs;
        try {
          landmarker.detectAsync(video, timestampMs);
        } catch {
          /* MediaPipe occasionally throws on video tear-down; ignore one frame */
        }
      }
      if (cancelled) return;
      if (useRvfc && video) {
        rvfcId = (video as unknown as {
          requestVideoFrameCallback: (cb: (now: number) => void) => number;
        }).requestVideoFrameCallback(loop);
      } else {
        rafId = requestAnimationFrame(loop as FrameRequestCallback);
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (rvfcId) {
        const video = videoRef.current;
        const cancelFn = (video as unknown as {
          cancelVideoFrameCallback?: (id: number) => void;
        } | null)?.cancelVideoFrameCallback;
        if (video && typeof cancelFn === 'function') {
          cancelFn.call(video, rvfcId);
        }
      }
      if (landmarker) landmarker.close();
    };
  }, [cameraReady, videoRef]);

  return { keypoints, imageKeypoints, fps, modelStatus, modelError };
}
