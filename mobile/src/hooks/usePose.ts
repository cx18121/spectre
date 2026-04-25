import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { PoseKeypoint } from '../protocol';
import { smoothKeypoints } from '../lib/velocity';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UsePoseResult {
  keypoints: PoseKeypoint[] | null;
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
  const [fps, setFps] = useState(0);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const prevKeypointsRef = useRef<PoseKeypoint[] | null>(null);

  useEffect(() => {
    if (!cameraReady) return;

    let landmarker: PoseLandmarker | null = null;
    let rafId = 0;
    let cancelled = false;
    let frameCount = 0;
    let fpsWindowStart = performance.now();

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
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) {
          lm.close();
          return;
        }
        landmarker = lm;
        setModelStatus('ready');
        rafId = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        setModelStatus('error');
        setModelError(err instanceof Error ? err.message : String(err));
      }
    }

    function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && landmarker && video.readyState >= 2) {
        let result: PoseLandmarkerResult | null = null;
        try {
          result = landmarker.detectForVideo(video, performance.now());
        } catch {
          /* MediaPipe occasionally throws on video tear-down; ignore one frame */
        }

        if (result?.worldLandmarks?.[0]) {
          const raw: PoseKeypoint[] = result.worldLandmarks[0].map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0,
          }));
          const smoothed = smoothKeypoints(prevKeypointsRef.current, raw, 0.5);
          prevKeypointsRef.current = smoothed;
          setKeypoints(smoothed);
        }

        frameCount += 1;
        const now = performance.now();
        const elapsed = now - fpsWindowStart;
        if (elapsed >= 1000) {
          setFps(Math.round((frameCount * 1000) / elapsed));
          frameCount = 0;
          fpsWindowStart = now;
        }
      }
      rafId = requestAnimationFrame(loop);
    }

    void init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (landmarker) landmarker.close();
      prevKeypointsRef.current = null;
    };
  }, [cameraReady, videoRef]);

  return { keypoints, fps, modelStatus, modelError };
}
