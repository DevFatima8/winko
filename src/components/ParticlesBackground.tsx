"use client";

import { useEffect } from "react";

const layers = [
    {
        id: "wx-particles-circles",
        color: [0, 229, 160],
        hex: "#00e5a0",
        shape: "circle",
        size: 2.2,
        count: 28,
        speed: 0.25,
        opacity: 0.35,
        links: false,
    },
] as const;

function configFor(layer: (typeof layers)[number], reducedMotion: boolean) {
    return {
        particles: {
            number: { value: layer.count, density: { enable: true, value_area: 1100 } },
            color: { value: layer.hex },
            shape: { type: layer.shape, polygon: { nb_sides: 5 }, stroke: { width: 0, color: "#000000" } },
            opacity: { value: layer.opacity, random: true, anim: { enable: true, speed: 0.7, opacity_min: 0.08, sync: false } },
            size: { value: layer.size, random: true, anim: { enable: false } },
            line_linked: { enable: layer.links, distance: 145, color: layer.hex, opacity: 0.2, width: 1 },
            move: { enable: !reducedMotion, speed: layer.speed, direction: "none", random: true, straight: false, out_mode: "out", bounce: false },
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: false, mode: "grab" }, onclick: { enable: false }, resize: true },
            modes: { grab: { distance: 130, line_linked: { opacity: 0.35 } } },
        },
        retina_detect: true,
    };
}

export function ParticlesBackground() {
    useEffect(() => {
        // The animated canvas costs a full-screen composite every frame; skip it on touch/small screens for smooth scrolling.
        return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let active = true;
        void import("particles.js").then(() => {
            if (!active) return;
            layers.forEach((layer) => window.particlesJS(layer.id, configFor(layer, reducedMotion)));
            requestAnimationFrame(() => {
                document.querySelectorAll<HTMLCanvasElement>(".wx-particles-layer canvas").forEach((canvas) => {
                    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
                });
            });
        });

        return () => {
            active = false;
            document.querySelectorAll(".wx-particles-layer canvas").forEach((canvas) => canvas.remove());
        };
    }, []);

    return (
        <div className="wx-particles" aria-hidden="true">
            {layers.map((layer) => <div className="wx-particles-layer" id={layer.id} key={layer.id} />)}
        </div>
    );
}
