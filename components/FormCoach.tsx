"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker as PoseLandmarkerType } from "@mediapipe/tasks-vision";

type Landmark = { x: number; y: number; visibility?: number };

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

function angle(a: Landmark, b: Landmark, c: Landmark) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return Math.acos(Math.min(1, Math.max(-1, dot / (magnitude || 1)))) * (180 / Math.PI);
}

export default function FormCoach({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarkerType | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const phaseRef = useRef<"up" | "down">("up");
  const [status, setStatus] = useState("Starting camera…");
  const [reps, setReps] = useState(0);
  const [form, setForm] = useState("Position yourself side-on to the camera");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const [{ FilesetResolver, PoseLandmarker }, stream] = await Promise.all([
          import("@mediapipe/tasks-vision"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false }),
        ]);
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("Camera live • squat tracking on");
        setIsReady(true);

        const detect = () => {
          const activeVideo = videoRef.current;
          const canvas = canvasRef.current;
          const activeLandmarker = landmarkerRef.current;
          if (!activeVideo || !canvas || !activeLandmarker || cancelled) return;
          const result = activeLandmarker.detectForVideo(activeVideo, performance.now());
          const ctx = canvas.getContext("2d");
          if (ctx) {
            canvas.width = activeVideo.videoWidth || 720;
            canvas.height = activeVideo.videoHeight || 960;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const points = result.landmarks?.[0] as Landmark[] | undefined;
            if (points) {
              ctx.fillStyle = "#b9ff38";
              points.forEach(point => { ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); ctx.fill(); });
              // MediaPipe: left hip/knee/ankle = 23/25/27, right = 24/26/28.
              const left = angle(points[23], points[25], points[27]);
              const right = angle(points[24], points[26], points[28]);
              const kneeAngle = Math.min(left, right);
              if (kneeAngle < 115) {
                phaseRef.current = "down";
                setForm(kneeAngle < 75 ? "Great depth — keep your chest lifted" : "Go a little lower if comfortable");
              } else if (kneeAngle > 155 && phaseRef.current === "down") {
                phaseRef.current = "up";
                setReps(value => value + 1);
                setForm("Good rep! Keep knees tracking over your feet");
              } else if (kneeAngle > 155) {
                setForm("Ready — bend your knees to start a squat");
              }
            } else setForm("Step back so your full body is visible");
          }
          frameRef.current = requestAnimationFrame(detect);
        };
        detect();
      } catch (error) {
        console.error("Form coach failed to start", error);
        setStatus("Camera access is needed for form tracking");
        setForm("Allow camera access, then open AI Form Coach again.");
      }
    };
    start();
    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  return <div className="overlay form-overlay" role="dialog" aria-modal="true" aria-label="AI squat form coach">
    <section className="form-coach">
      <button className="close" onClick={onClose} aria-label="Close form coach">×</button>
      <div className="form-head"><div><span>✦ AI FORM COACH</span><h2>Squat tracker</h2></div><small className={isReady ? "live" : ""}>● {status}</small></div>
      <div className="camera-stage">
        <video ref={videoRef} muted playsInline className="camera-video" />
        <canvas ref={canvasRef} className="pose-canvas" />
        <div className="camera-guide" aria-hidden="true" />
      </div>
      <div className="form-results"><div><small>REPS</small><b>{reps} <i>/ 10</i></b></div><div><small>FORM</small><b className={isReady ? "good" : ""}>{isReady ? "Tracking" : "Waiting"}</b></div></div>
      <p className="form-feedback">🎯 {form}</p>
      <p className="form-disclaimer">Basic visual feedback only—not medical or injury assessment. Stop if you feel pain, dizziness, or unwell.</p>
    </section>
  </div>;
}
