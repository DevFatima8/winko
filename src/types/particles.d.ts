declare module "particles.js" {
    const particlesJS: unknown;
    export default particlesJS;
}

interface Window {
    particlesJS: (tagId: string, params: Record<string, unknown>) => void;
}