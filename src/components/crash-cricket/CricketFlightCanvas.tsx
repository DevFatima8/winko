"use client";

import React, { useEffect, useRef } from "react";
import { GamePhase } from "./lib/crashEngine";
import { Flame, ShieldCheck, Sparkles, Trophy, Zap } from "lucide-react";
import { useDailyPoolMode } from "@/lib/walletSync";
import { visibleAnimationFrame } from "@/lib/visibleAnimationFrame";

export interface CashoutToast {
  id: string;
  panelId: 1 | 2;
  multiplier: number;
  winAmount: number;
}

interface CricketFlightCanvasProps {
  phase: GamePhase;
  multiplier: number;
  countdown: number;
  dismissalText: string;
  cashoutToasts: CashoutToast[];
  roundId: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  decay: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleSpeed: number;
  phase: number;
}

/**
 * Draws a photorealistic 3D Cricket Ball with:
 * - Glossy White & Crimson two-tone 4-piece leather panels
 * - Micro leather dimple texture
 * - Raised 3D equatorial seam with dual-row white & red angled thread stitches
 * - Fixed-angle stadium floodlight 3D specular highlight & bottom-right ambient shadow
 */
function drawRealisticCricketBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  spinAngle: number,
  tangentAngle: number,
  multiplier: number,
  isCrashed: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  // 1. AERODYNAMIC SLIPSTREAM & PLASMA HALO (Behind the ball along flight tangent)
  if (!isCrashed) {
    ctx.save();
    ctx.rotate(tangentAngle);

    // High-velocity white & fiery comet tail cone behind the ball
    const tailLength = radius * (3.4 + Math.min(2.5, Math.log10(Math.max(1, multiplier)) * 1.8));
    const tailGrad = ctx.createLinearGradient(0, 0, -tailLength, 0);
    if (multiplier >= 10) {
      tailGrad.addColorStop(0, "rgba(255, 255, 255, 0.92)");
      tailGrad.addColorStop(0.25, "rgba(255, 184, 0, 0.65)");
      tailGrad.addColorStop(0.65, "rgba(220, 38, 38, 0.28)");
      tailGrad.addColorStop(1, "rgba(255, 184, 0, 0)");
    } else if (multiplier >= 2) {
      tailGrad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      tailGrad.addColorStop(0.3, "rgba(56, 189, 248, 0.55)");
      tailGrad.addColorStop(0.7, "rgba(0, 231, 1, 0.22)");
      tailGrad.addColorStop(1, "rgba(0, 231, 1, 0)");
    } else {
      tailGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
      tailGrad.addColorStop(0.35, "rgba(226, 232, 240, 0.45)");
      tailGrad.addColorStop(0.75, "rgba(56, 189, 248, 0.18)");
      tailGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
    }

    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.78);
    ctx.quadraticCurveTo(-tailLength * 0.5, -radius * 0.35, -tailLength, 0);
    ctx.quadraticCurveTo(-tailLength * 0.5, radius * 0.35, 0, radius * 0.78);
    ctx.closePath();
    ctx.fill();

    // Crisp white aerodynamic wind-shear lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.4, -radius * 0.92);
    ctx.lineTo(-radius * 2.4, -radius * 0.55);
    ctx.moveTo(-radius * 0.4, radius * 0.92);
    ctx.lineTo(-radius * 2.4, radius * 0.55);
    ctx.stroke();

    ctx.restore();

    // Soft outer floodlight bloom around ball
    const auraGrad = ctx.createRadialGradient(0, 0, radius * 0.7, 0, 0, radius * 2.1);
    auraGrad.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    auraGrad.addColorStop(
      0.5,
      multiplier >= 10
        ? "rgba(255, 184, 0, 0.35)"
        : multiplier >= 2
        ? "rgba(0, 231, 1, 0.28)"
        : "rgba(56, 189, 248, 0.28)"
    );
    auraGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Crashed shockwave rings
    const ringGrad = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius * 2.4);
    ringGrad.addColorStop(0, "rgba(255, 42, 75, 0.65)");
    ringGrad.addColorStop(0.6, "rgba(255, 184, 0, 0.25)");
    ringGrad.addColorStop(1, "rgba(255, 42, 75, 0)");
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. CLIP TO 3D SPHERE BOUNDARY
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();

  // 3. BASE GLOSSY WHITE LEATHER SPHERE (Fixed light direction for 3D realism)
  const sphereGrad = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.35,
    radius * 0.08,
    0,
    0,
    radius * 1.05
  );
  sphereGrad.addColorStop(0, "#FFFFFF"); // Pure bright white highlight core
  sphereGrad.addColorStop(0.38, "#F8FAFC"); // Polished white Kookaburra leather
  sphereGrad.addColorStop(0.7, "#CBD5E1"); // Cool 3D mid-tone curve
  sphereGrad.addColorStop(0.9, "#64748B"); // Deep spherical shadow edge
  sphereGrad.addColorStop(1, "#1E293B"); // Ambient occlusion rim

  ctx.fillStyle = sphereGrad;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // 4. ROTATING LEATHER PANELS, TEXTURE & EMBOSSED STITCHED SEAM
  ctx.save();
  ctx.rotate(spinAngle);

  // Classic crimson-red swing-panel accent on one hemisphere edge for authentic contrast with white leather
  const crimsonPanelGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
  crimsonPanelGrad.addColorStop(0, "rgba(185, 28, 28, 0.88)");
  crimsonPanelGrad.addColorStop(0.42, "rgba(220, 38, 38, 0.78)");
  crimsonPanelGrad.addColorStop(0.48, "rgba(255, 255, 255, 0)");
  crimsonPanelGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = crimsonPanelGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Subtle 4-piece quarter leather join line (perpendicular to main seam)
  ctx.strokeStyle = "rgba(71, 85, 105, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.28, radius * 0.98, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Micro leather grain dimples (gives real cowhide texture during spin)
  ctx.fillStyle = "rgba(100, 116, 139, 0.25)";
  const dimpleCoords = [
    [-0.45, -0.35],
    [-0.25, -0.55],
    [0.35, -0.4],
    [0.5, -0.15],
    [-0.5, 0.25],
    [-0.2, 0.55],
    [0.3, 0.45],
    [0.55, 0.25],
    [0.15, -0.25],
    [-0.18, 0.28],
  ];
  for (const [dx, dy] of dimpleCoords) {
    ctx.beginPath();
    ctx.arc(dx * radius, dy * radius, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. PRIMARY 3D EMBOSSED EQUATORIAL SEAM BAND
  // Seam shadow groove
  ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
  ctx.lineWidth = radius * 0.26;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.96, radius * 0.36, 0.22, 0, Math.PI * 2);
  ctx.stroke();

  // Crimson leather seam welt core
  ctx.strokeStyle = "#B91C1C";
  ctx.lineWidth = radius * 0.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.96, radius * 0.36, 0.22, 0, Math.PI * 2);
  ctx.stroke();

  // Center seam split line
  ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.96, radius * 0.36, 0.22, 0, Math.PI * 2);
  ctx.stroke();

  // Dual-Row Raised White Hand-Stitched Threads along the 3D seam
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2.4, 2.2]);

  // Upper stitch row
  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.055, radius * 0.95, radius * 0.35, 0.22, 0, Math.PI * 2);
  ctx.stroke();

  // Lower stitch row
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.055, radius * 0.95, radius * 0.35, 0.22, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);

  // Gold/Silver Manufacturer Crest Stamp on white panel
  ctx.strokeStyle = "rgba(217, 119, 6, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(radius * 0.36, radius * 0.32, radius * 0.18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore(); // End rotating leather & seam layer

  // 6. FIXED 3D LIGHTING OVERLAY (Specular Gloss & Rim Shadow stay locked to Stadium Lights)
  // Top-left glossy lacquer reflection on the white/crimson leather
  const glossGrad = ctx.createRadialGradient(
    -radius * 0.38,
    -radius * 0.4,
    radius * 0.02,
    -radius * 0.32,
    -radius * 0.34,
    radius * 0.52
  );
  glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  glossGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.38)");
  glossGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = glossGrad;
  ctx.beginPath();
  ctx.arc(-radius * 0.32, -radius * 0.34, radius * 0.52, 0, Math.PI * 2);
  ctx.fill();

  // Bottom-right 3D spherical shadow shading
  const shadowGrad = ctx.createRadialGradient(
    -radius * 0.25,
    -radius * 0.25,
    radius * 0.45,
    0,
    0,
    radius
  );
  shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  shadowGrad.addColorStop(0.72, "rgba(15, 23, 42, 0.18)");
  shadowGrad.addColorStop(1, "rgba(2, 6, 23, 0.68)");

  ctx.fillStyle = shadowGrad;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // If crashed, draw impact scuff & seam crack across the ball
  if (isCrashed) {
    ctx.strokeStyle = "#FF2A4B";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.6, -radius * 0.4);
    ctx.lineTo(0, radius * 0.1);
    ctx.lineTo(radius * 0.55, -radius * 0.2);
    ctx.stroke();
  }

  ctx.restore(); // End sphere clip

  // Crisp outer 3D rim contour
  ctx.strokeStyle = isCrashed
    ? "rgba(255, 42, 75, 0.9)"
    : "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export default function CricketFlightCanvas({
  phase,
  multiplier,
  countdown,
  dismissalText,
  cashoutToasts,
  roundId,
}: CricketFlightCanvasProps) {
  const poolEnabled = useDailyPoolMode();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const crashExplosionTriggeredRef = useRef<boolean>(false);
  const starsRef = useRef<Star[]>([]);

  // Keep latest props in refs so 60fps requestAnimationFrame loop reads fresh values without re-binding
  const stateRef = useRef({
    phase,
    multiplier,
    countdown,
    dismissalText,
  });

  useEffect(() => {
    stateRef.current = {
      phase,
      multiplier,
      countdown,
      dismissalText,
    };
  }, [phase, multiplier, countdown, dismissalText]);

  // Initialize stars once
  useEffect(() => {
    const stars: Star[] = [];
    for (let i = 0; i < 85; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.75,
        size: 0.8 + Math.random() * 1.8,
        twinkleSpeed: 1.5 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
      });
    }
    starsRef.current = stars;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const startTime = performance.now();

    const handleResize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const spawnTrailParticles = (
      bx: number,
      by: number,
      mult: number,
      isCrash: boolean
    ) => {
      if (isCrash) {
        const crashColors = ["#FFFFFF", "#FF2A4B", "#FFB800", "#F8FAFC", "#EF4444"];
        for (let i = 0; i < 60; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 7.5;
          particlesRef.current.push({
            x: bx,
            y: by,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2.2 + Math.random() * 5.0,
            alpha: 1,
            color: crashColors[Math.floor(Math.random() * crashColors.length)],
            decay: 0.014 + Math.random() * 0.018,
          });
        }
        return;
      }

      const trailColors =
        mult >= 10
          ? ["#FFFFFF", "#FFB800", "#F8FAFC", "#F59E0B"]
          : mult >= 2
          ? ["#FFFFFF", "#00E701", "#E2E8F0", "#38BDF8"]
          : ["#FFFFFF", "#F8FAFC", "#38BDF8", "#EF4444"];

      for (let i = 0; i < 3; i++) {
        particlesRef.current.push({
          x: bx + (Math.random() - 0.5) * 10,
          y: by + (Math.random() - 0.5) * 10,
          vx: -2.4 - Math.random() * 2.6,
          vy: 0.8 + Math.random() * 2.0,
          size: 1.8 + Math.random() * 3.6,
          alpha: 0.9,
          color: trailColors[Math.floor(Math.random() * trailColors.length)],
          decay: 0.026 + Math.random() * 0.02,
        });
      }
    };

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const {
        phase: curPhase,
        multiplier: curMult,
        countdown: curCountdown,
      } = stateRef.current;

      const width = canvas.width / Math.min(window.devicePixelRatio || 1, 2);
      const height = canvas.height / Math.min(window.devicePixelRatio || 1, 2);

      ctx.clearRect(0, 0, width, height);

      // Calculate altitude progress (0 at 1.00x, smoothly approaches 1 as multiplier rises)
      const altitudeProgress =
        curPhase === "BETTING"
          ? 0
          : Math.min(1, Math.log10(Math.max(1, curMult)) / 1.65);

      // 1. SKY BACKGROUND GRADIENT
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      if (curPhase === "CRASHED") {
        skyGrad.addColorStop(0, "#190610");
        skyGrad.addColorStop(0.55, "#12091A");
        skyGrad.addColorStop(1, "#0B111E");
      } else if (curMult >= 10) {
        skyGrad.addColorStop(0, "#090418");
        skyGrad.addColorStop(0.5, "#120B2E");
        skyGrad.addColorStop(1, "#091526");
      } else {
        skyGrad.addColorStop(0, "#040812");
        skyGrad.addColorStop(0.55, "#091326");
        skyGrad.addColorStop(1, "#0D1E38");
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. TWINKLING STARS (Parallax shift downward as ball climbs)
      const starOffsetY = altitudeProgress * 120;
      const starOffsetX =
        curPhase === "IN_FLIGHT" ? (elapsed * 18) % width : 0;

      starsRef.current.forEach((star) => {
        const sx = ((star.x * width - starOffsetX) % width + width) % width;
        const sy = (star.y * height + starOffsetY) % (height * 0.85);
        const alpha =
          0.3 +
          0.7 * Math.abs(Math.sin(elapsed * star.twinkleSpeed + star.phase));
        ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. STADIUM FLOODLIGHT BEAMS (Sink slightly as altitude increases)
      const groundShiftY = altitudeProgress * (height * 0.36);

      ctx.save();
      const leftBeamGrad = ctx.createLinearGradient(
        width * 0.08,
        height * 0.18 + groundShiftY,
        width * 0.55,
        height * 0.85 + groundShiftY
      );
      leftBeamGrad.addColorStop(0, "rgba(56, 189, 248, 0.16)");
      leftBeamGrad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
      ctx.fillStyle = leftBeamGrad;
      ctx.beginPath();
      ctx.moveTo(width * 0.06, height * 0.18 + groundShiftY);
      ctx.lineTo(width * 0.65, height * 0.45 + groundShiftY);
      ctx.lineTo(width * 0.55, height * 0.95 + groundShiftY);
      ctx.closePath();
      ctx.fill();

      const rightBeamGrad = ctx.createLinearGradient(
        width * 0.92,
        height * 0.16 + groundShiftY,
        width * 0.35,
        height * 0.85 + groundShiftY
      );
      rightBeamGrad.addColorStop(0, "rgba(0, 231, 1, 0.12)");
      rightBeamGrad.addColorStop(1, "rgba(0, 231, 1, 0.0)");
      ctx.fillStyle = rightBeamGrad;
      ctx.beginPath();
      ctx.moveTo(width * 0.94, height * 0.16 + groundShiftY);
      ctx.lineTo(width * 0.28, height * 0.5 + groundShiftY);
      ctx.lineTo(width * 0.42, height * 0.95 + groundShiftY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 4. TELEMETRY GRID LINES (Dynamic radar grid for distance & altitude)
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
      ctx.lineWidth = 1;
      const gridSize = 60;
      const gridShiftX =
        curPhase === "IN_FLIGHT" ? (elapsed * 55) % gridSize : 0;
      const gridShiftY =
        curPhase === "IN_FLIGHT" ? (elapsed * 35) % gridSize : 0;

      for (let x = -gridShiftX; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = gridShiftY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // 5. STADIUM BOWL, CROWD SILHOUETTE & GREEN TURF OUTFIELD
      const horizonY = height * 0.78 + groundShiftY;

      if (horizonY < height + 80) {
        // Distant stadium upper tier silhouette
        ctx.fillStyle = "#0B1528";
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.quadraticCurveTo(
          width * 0.5,
          horizonY - 55,
          width,
          horizonY
        );
        ctx.lineTo(width, height + 100);
        ctx.lineTo(0, height + 100);
        ctx.closePath();
        ctx.fill();

        // LED perimeter advertising ribbon (Glowing green/cyan strip)
        const ledGrad = ctx.createLinearGradient(0, horizonY - 4, width, horizonY - 4);
        ledGrad.addColorStop(0, "#00E701");
        ledGrad.addColorStop(0.25, "#38BDF8");
        ledGrad.addColorStop(0.5, "#FFB800");
        ledGrad.addColorStop(0.75, "#00E701");
        ledGrad.addColorStop(1, "#38BDF8");
        ctx.fillStyle = ledGrad;
        ctx.fillRect(0, horizonY - 3, width, 3);

        // Lush Cricket Outfield Turf
        const turfGrad = ctx.createLinearGradient(0, horizonY, 0, height + 50);
        turfGrad.addColorStop(0, "#073B22");
        turfGrad.addColorStop(0.45, "#052B18");
        turfGrad.addColorStop(1, "#03180D");
        ctx.fillStyle = turfGrad;
        ctx.fillRect(0, horizonY, width, height - horizonY + 60);

        // Turf mowing stripes
        ctx.fillStyle = "rgba(0, 231, 1, 0.04)";
        for (let i = 0; i < 8; i += 2) {
          ctx.beginPath();
          ctx.moveTo(width * (i / 8), horizonY);
          ctx.lineTo(width * ((i + 1) / 8), horizonY);
          ctx.lineTo(width * ((i + 1.5) / 8), height + 40);
          ctx.lineTo(width * ((i - 0.5) / 8), height + 40);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 6. LAUNCH ORIGIN (BATSMAN & GOLDEN STUMPS AT BOTTOM-LEFT CREASE)
      const originX = Math.max(58, width * 0.09);
      const originY = Math.min(height - 38, horizonY + 14);

      if (originY < height + 40) {
        ctx.save();
        // Pitch strip rectangle under crease
        ctx.fillStyle = "#8C7355";
        ctx.beginPath();
        ctx.roundRect(originX - 32, originY - 4, 88, 12, 4);
        ctx.fill();

        // White popping crease line
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(originX - 10, originY - 4);
        ctx.lineTo(originX - 10, originY + 8);
        ctx.stroke();

        // 3 Golden Wickets (Stumps)
        const stumpsBroken = curPhase === "CRASHED" && curMult < 1.35;
        ctx.strokeStyle = "#FFB800";
        ctx.lineWidth = 2.5;
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          const sx = originX - 22 + s * 5;
          ctx.moveTo(sx, originY);
          if (stumpsBroken && s === 1) {
            ctx.lineTo(sx - 8, originY - 18);
          } else if (stumpsBroken && s === 2) {
            ctx.lineTo(sx + 10, originY - 15);
          } else {
            ctx.lineTo(sx, originY - 22);
          }
          ctx.stroke();
        }

        // Batsman Silhouette & Willow Bat Swing
        ctx.fillStyle = "#F8FAFC";
        // Legs/Pads
        ctx.fillRect(originX - 3, originY - 14, 4, 14);
        ctx.fillRect(originX + 3, originY - 14, 4, 14);
        // Torso
        ctx.fillStyle = "#00E701";
        ctx.fillRect(originX - 4, originY - 27, 10, 14);
        // Helmet
        ctx.fillStyle = "#38BDF8";
        ctx.beginPath();
        ctx.arc(originX + 2, originY - 32, 6, 0, Math.PI * 2);
        ctx.fill();

        // Bat angle (Ready stance during BETTING, high follow-through during IN_FLIGHT)
        ctx.save();
        ctx.translate(originX + 4, originY - 22);
        const batAngle =
          curPhase === "BETTING"
            ? curCountdown < 0.35
              ? 0.85 // Backlift right before hitting
              : Math.sin(elapsed * 5) * 0.18 + 0.4
            : -0.95; // Lofted sixer follow-through
        ctx.rotate(batAngle);
        ctx.fillStyle = "#F59E0B";
        ctx.fillRect(0, 0, 4, 22);
        ctx.restore();

        ctx.restore();

        // Incoming bowled ball during final 1.4s of BETTING countdown
        if (curPhase === "BETTING" && curCountdown <= 1.4) {
          const deliveryProgress = 1 - curCountdown / 1.4; // 0 -> 1
          const bowlerX = originX + 190;
          const bowlerY = originY - 26;
          const bounceX = originX + 68;
          const bounceY = originY + 2;
          const batContactX = originX + 12;
          const batContactY = originY - 16;

          let incomingX = bowlerX;
          let incomingY = bowlerY;
          if (deliveryProgress < 0.65) {
            const p = deliveryProgress / 0.65;
            incomingX = bowlerX + (bounceX - bowlerX) * p;
            incomingY = bowlerY + (bounceY - bowlerY) * p;
          } else {
            const p = (deliveryProgress - 0.65) / 0.35;
            incomingX = bounceX + (batContactX - bounceX) * p;
            incomingY = bounceY + (batContactY - bounceY) * p;
          }

          drawRealisticCricketBall(
            ctx,
            incomingX,
            incomingY,
            12,
            -elapsed * 18,
            Math.PI,
            1.0,
            false
          );
        }
      }

      // 7. TRAJECTORY CURVE & REALISTIC 3D CRICKET BALL (When IN_FLIGHT or CRASHED)
      if (curPhase === "IN_FLIGHT" || curPhase === "CRASHED") {
        // Calculate normalized flight progress t in [0.05, 1.0]
        const flightNorm = Math.min(
          1,
          Math.pow(Math.log10(Math.max(1.001, curMult)) / 1.5, 0.45)
        );

        const startX = originX + 12;
        const startY = Math.min(height - 36, originY - 18);

        // Target ball coordinates with gentle hover oscillation at high multipliers
        const hoverX =
          curPhase === "IN_FLIGHT" && flightNorm > 0.65
            ? Math.sin(elapsed * 3.2) * 12
            : 0;
        const hoverY =
          curPhase === "IN_FLIGHT" && flightNorm > 0.65
            ? Math.cos(elapsed * 2.6) * 10
            : 0;

        const ballX =
          startX +
          (width * 0.78 - startX) * Math.min(1, flightNorm * 1.15) +
          hoverX;
        const ballY =
          startY -
          (startY - height * 0.2) * Math.min(1, flightNorm * 1.1) +
          hoverY;

        // Control point for parabolic cricket shot curve
        const cpX = startX + (ballX - startX) * 0.52;
        const cpY = startY - (startY - ballY) * 0.15;

        // Tangent angle at the end of the quadratic Bezier curve (for slipstream orientation)
        const tangentAngle = Math.atan2(ballY - cpY, ballX - cpX);

        // Primary theme color based on multiplier tier
        const primaryColor =
          curPhase === "CRASHED"
            ? "#FF2A4B"
            : curMult >= 10
            ? "#FFB800"
            : curMult >= 2
            ? "#00E701"
            : "#38BDF8";

        // Area fill under trajectory curve
        ctx.save();
        const areaGrad = ctx.createLinearGradient(0, ballY, 0, startY);
        if (curPhase === "CRASHED") {
          areaGrad.addColorStop(0, "rgba(255, 42, 75, 0.28)");
          areaGrad.addColorStop(1, "rgba(255, 42, 75, 0.0)");
        } else if (curMult >= 10) {
          areaGrad.addColorStop(0, "rgba(255, 184, 0, 0.32)");
          areaGrad.addColorStop(1, "rgba(168, 85, 247, 0.02)");
        } else if (curMult >= 2) {
          areaGrad.addColorStop(0, "rgba(0, 231, 1, 0.28)");
          areaGrad.addColorStop(1, "rgba(0, 231, 1, 0.0)");
        } else {
          areaGrad.addColorStop(0, "rgba(56, 189, 248, 0.26)");
          areaGrad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, ballX, ballY);
        ctx.lineTo(ballX, startY);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Glowing trajectory curve stroke
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, ballX, ballY);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 4;
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();

        // Spawn and update particles
        if (curPhase === "IN_FLIGHT") {
          crashExplosionTriggeredRef.current = false;
          spawnTrailParticles(ballX, ballY, curMult, false);
        } else if (
          curPhase === "CRASHED" &&
          !crashExplosionTriggeredRef.current
        ) {
          crashExplosionTriggeredRef.current = true;
          spawnTrailParticles(ballX, ballY, curMult, true);
        }

        // Render particles
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;

          if (p.alpha <= 0) {
            particlesRef.current.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 8. RENDER PHOTOREALISTIC 3D WHITE & CRIMSON CRICKET BALL
        const ballRadius = width < 500 ? 16 : 19;
        const spinAngle = curPhase === "IN_FLIGHT" ? elapsed * 15 : 0.8;

        drawRealisticCricketBall(
          ctx,
          ballX,
          ballY,
          ballRadius,
          spinAngle,
          tangentAngle,
          curMult,
          curPhase === "CRASHED"
        );

        // Launch marker so the start of the flight is always visible
        ctx.save();
        ctx.fillStyle = "rgba(248,250,252,0.9)";
        ctx.beginPath();
        ctx.arc(startX, startY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Impact marker + final multiplier where the ball crashed
        if (curPhase === "CRASHED") {
          const pulse = 1 + 0.15 * Math.sin(elapsed * 8);
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = "rgba(255,42,75,0.55)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ballX, ballY + ballRadius);
          ctx.lineTo(ballX, Math.max(ballY + ballRadius, startY));
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.strokeStyle = "#FF2A4B";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(ballX, ballY, (ballRadius + 8) * pulse, 0, Math.PI * 2);
          ctx.stroke();

          const label = `${curMult.toFixed(2)}x`;
          ctx.font = "bold 13px ui-monospace, monospace";
          const lw = ctx.measureText(label).width + 16;
          const lx = Math.min(width - lw - 6, Math.max(6, ballX - lw / 2));
          const ly = ballY - ballRadius - 34 < 6 ? ballY + ballRadius + 14 : ballY - ballRadius - 34;
          ctx.fillStyle = "rgba(11,17,30,0.85)";
          ctx.strokeStyle = "#FF2A4B";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(lx, ly, lw, 22, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#FF2A4B";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, lx + lw / 2, ly + 11);
        }
        ctx.restore();
      }
    };

    const stopLoop = visibleAnimationFrame(render);

    return () => {
      stopLoop();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Derived telemetry values for broadcast realism
  const ballSpeedKmh =
    phase === "IN_FLIGHT"
      ? Math.min(340, Math.round(118 + Math.log2(Math.max(1, multiplier)) * 42))
      : 0;
  const distanceMeters =
    phase === "IN_FLIGHT"
      ? Math.round(12 + Math.pow(multiplier - 1, 0.85) * 36)
      : 0;

  return (
    <div
      className={`relative w-full flex-1 min-h-[160px] sm:min-h-[220px] max-h-[380px] rounded-xl overflow-hidden bg-[#070B14] border select-none transition-colors duration-300 ${
        phase === "CRASHED"
          ? "border-[#FF2A4B]/70 animate-crash-shake"
          : multiplier >= 10 && phase === "IN_FLIGHT"
          ? "border-[#FFB800]/60"
          : multiplier >= 2 && phase === "IN_FLIGHT"
          ? "border-[#00E701]/50"
          : "border-[#1E2D4A]"
      }`}
      style={{
        boxShadow:
          phase === "CRASHED"
            ? "inset 0 0 65px rgba(255, 42, 75, 0.22)"
            : "inset 0 0 60px rgba(0, 231, 1, 0.06)",
      }}
    >
      {/* 60FPS HTML5 Stadium Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Top-Left Live Stadium Broadcast Telemetry Badges */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0B111E]/85 border border-[#1E2D4A] backdrop-blur-md text-[11px] font-mono-tabular text-[#94A3B8]">
          <span className="w-2 h-2 rounded-full bg-[#00E701] animate-pulse" />
          <span className="text-[#F8FAFC] font-semibold">OVER #{roundId}</span>
        </div>

        {phase === "IN_FLIGHT" && (
          <>
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B111E]/85 border border-[#1E2D4A] backdrop-blur-md text-[11px] font-mono-tabular text-[#38BDF8]">
              <Zap className="w-3 h-3 text-[#FFB800]" />
              <span>{ballSpeedKmh} km/h</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B111E]/85 border border-[#1E2D4A] backdrop-blur-md text-[11px] font-mono-tabular text-[#00E701]">
              <Flame className="w-3 h-3 text-[#00E701]" />
              <span>{distanceMeters}m SIXER</span>
            </div>
          </>
        )}
      </div>

      {/* Top-Right Provably Fair & Multiplier Tier Indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
        {phase === "IN_FLIGHT" && multiplier >= 2 && (
          <div
            className={`px-2.5 py-1 rounded-md text-[11px] font-display font-bold uppercase tracking-wider flex items-center gap-1 border backdrop-blur-md ${
              multiplier >= 10
                ? "bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800]"
                : "bg-[#00E701]/20 border-[#00E701] text-[#00E701]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {multiplier >= 10 ? "SUPER OVER JACKPOT!" : "BOUNDARY ZONE!"}
          </div>
        )}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#0B111E]/80 border border-[#1E2D4A] text-[10px] text-[#94A3B8]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#00E701]" />
          <span className="hidden sm:inline">TURBO 60FPS</span>
        </div>
      </div>

      {/* Floating Cashout Celebration Toasts */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none">
        {cashoutToasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00E701]/95 text-[#070B14] font-display font-bold text-xs sm:text-sm shadow-[0_0_25px_rgba(0,231,1,0.7)] animate-bounce"
          >
            <Trophy className="w-4 h-4 fill-current" />
            <span>
              BET #{toast.panelId} CASHED OUT @ {toast.multiplier.toFixed(2)}x — {poolEnabled ? "DAILY PAYOUT PENDING · PROVISIONAL CLAIM" : "WON"}
              Rs. {toast.winAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!
            </span>
          </div>
        ))}
      </div>

      {/* CENTER MULTIPLIER / PHASE BROADCAST OVERLAY */}
      <div
        className={`absolute inset-0 flex flex-col pointer-events-none px-4 text-center ${
          phase === "BETTING"
            ? "items-center justify-center"
            : "items-start justify-start pt-14 sm:pt-16 sm:pl-6"
        }`}
      >
        {phase === "BETTING" && (
          <div className="flex flex-col items-center bg-[#0B111E]/85 border border-[#1E2D4A] backdrop-blur-md px-7 py-4 rounded-2xl shadow-2xl max-w-xs w-full">
            {/* Realistic 3D White & Crimson Stitched Cricket Ball SVG */}
            <div className="relative w-11 h-11 mb-1.5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-white/20 blur-md animate-pulse" />
              <svg
                viewBox="0 0 64 64"
                className="w-11 h-11 animate-spin drop-shadow-[0_4px_12px_rgba(255,255,255,0.35)]"
                style={{ animationDuration: "2.2s" }}
              >
                <defs>
                  <radialGradient id="whiteBall3D" cx="32%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="42%" stopColor="#F8FAFC" />
                    <stop offset="75%" stopColor="#CBD5E1" />
                    <stop offset="100%" stopColor="#334155" />
                  </radialGradient>
                  <linearGradient id="crimsonWing" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#DC2626" stopOpacity="0.9" />
                    <stop offset="46%" stopColor="#B91C1C" stopOpacity="0.75" />
                    <stop offset="52%" stopColor="#FFFFFF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* 3D White Leather Sphere */}
                <circle cx="32" cy="32" r="28" fill="url(#whiteBall3D)" stroke="#E2E8F0" strokeWidth="1" />
                {/* Crimson Leather Swing Panel */}
                <circle cx="32" cy="32" r="28" fill="url(#crimsonWing)" />
                {/* 3D Equatorial Crimson Seam Welt */}
                <ellipse
                  cx="32"
                  cy="32"
                  rx="27"
                  ry="11"
                  transform="rotate(-18 32 32)"
                  fill="none"
                  stroke="#991B1B"
                  strokeWidth="5.5"
                />
                {/* Dual White Stitched Seam Threads */}
                <ellipse
                  cx="32"
                  cy="30.5"
                  rx="26.5"
                  ry="10.5"
                  transform="rotate(-18 32 32)"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  strokeDasharray="3 2.5"
                />
                <ellipse
                  cx="32"
                  cy="33.5"
                  rx="26.5"
                  ry="10.5"
                  transform="rotate(-18 32 32)"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  strokeDasharray="3 2.5"
                />
                {/* Specular Gloss Highlight */}
                <ellipse
                  cx="22"
                  cy="20"
                  rx="8"
                  ry="4.5"
                  transform="rotate(-30 22 20)"
                  fill="#FFFFFF"
                  fillOpacity="0.75"
                />
              </svg>
            </div>
            <div className="flex items-center gap-2 text-[#38BDF8] text-xs font-display font-bold tracking-widest uppercase mb-0.5">
              <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-ping" />
              BOWLER RUNNING IN
            </div>
            <div className="font-mono-tabular font-extrabold text-3xl sm:text-4xl text-[#F8FAFC] tracking-tight my-1">
              {Math.ceil(countdown)}s
            </div>
            <div className="w-full h-2 bg-[#131C2E] rounded-full overflow-hidden mt-2 border border-[#1E2D4A]">
              <div
                className="h-full bg-gradient-to-r from-[#00E701] via-[#38BDF8] to-[#00E701] transition-all duration-100"
                style={{ width: `${Math.max(0, Math.min(1, countdown / 10)) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-2 font-medium">
              Place your bets before the next ball is bowled!
            </p>
          </div>
        )}

        {phase === "IN_FLIGHT" && (
          <div className="flex flex-col items-center">
            <div
              className={`font-mono-tabular font-extrabold tracking-tight leading-none transition-colors duration-150 ${
                multiplier >= 10
                  ? "text-[#FFB800] drop-shadow-[0_0_35px_rgba(255,184,0,0.65)]"
                  : multiplier >= 2
                  ? "text-[#00E701] drop-shadow-[0_0_30px_rgba(0,231,1,0.55)]"
                  : "text-[#F8FAFC] drop-shadow-[0_0_24px_rgba(56,189,248,0.45)]"
              }`}
              style={{
                fontSize: "clamp(2.25rem, 5vw, 4rem)",
              }}
            >
              {multiplier.toFixed(2)}x
            </div>
            <div className="mt-1.5 px-3 py-0.5 rounded-full bg-[#0B111E]/75 border border-[#1E2D4A] text-[11px] font-display font-bold uppercase tracking-wider text-[#94A3B8]">
              {multiplier >= 10
                ? "🔥 STADIUM ORBIT SIXER!"
                : multiplier >= 2
                ? "🏏 HUGE BOUNDARY IN FLIGHT!"
                : "⚡ BALL IN THE AIR — CASH OUT ANYTIME"}
            </div>
          </div>
        )}

        {phase === "CRASHED" && (
          <div className="flex flex-col items-center bg-[#0B111E]/55 border border-[#FF2A4B]/70 px-3 py-2 rounded-xl shadow-[0_0_20px_rgba(255,42,75,0.3)]">
            <div className="px-2 py-0.5 rounded-full bg-[#FF2A4B]/20 border border-[#FF2A4B]/50 text-[#FF2A4B] font-display font-bold text-[10px] uppercase tracking-widest">
              🏏 WICKET! • FLEW AWAY
            </div>
            <div
              className="font-mono-tabular font-extrabold text-[#FF2A4B] tracking-tight leading-none my-1 drop-shadow-[0_0_18px_rgba(255,42,75,0.75)]"
              style={{
                fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
              }}
            >
              {multiplier.toFixed(2)}x
            </div>
            <div className="text-[10px] sm:text-xs font-display font-semibold text-[#F8FAFC]">
              {dismissalText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
